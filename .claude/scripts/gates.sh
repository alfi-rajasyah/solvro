#!/usr/bin/env bash
# Solvro quality gates — deterministic replacement for the retired solvro-qa agent.
# Pipeline v2 (approved 2026-07-28): gates run per task; review runs per phase,
# except spine touches which require an instant opus review (enforced here, not by
# model judgment). Design: docs/archive/plans/pipeline-v2-design.md
#
# Usage: .claude/scripts/gates.sh [options]
#   --base=<ref>                diff base, merge-base semantics (default: origin/develop)
#   --backend | --frontend      force area gates regardless of diff
#   --all                       force both areas
#   --skip-smoke                skip the Playwright smoke gate
#   --performed-review=<none|opus>  review already performed for spine touches (default: none)
#
# Test hook: GATES_DIFF_OVERRIDE (newline-separated paths) stands in for the real diff.
# Output: one "PASS <gate>" / "FAIL <gate> — reason" line per gate; failing command
# output echoed indented. Exit 0 iff every gate passed.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 2

# Single-writer lock (2026-07-30): concurrent gates runs contend for the shared
# Docker stack and cross-contaminate results (the diff spans the whole working
# tree, so parallel agents see each other's files). One run at a time; full runs
# are orchestrator-owned. Stale-lock recovery: rmdir the directory below.
LOCKDIR="${TMPDIR:-/tmp}/solvro-gates.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "FAIL gates-lock — another gates.sh run is active ($LOCKDIR). Gates are single-writer: wait for it, or rmdir a stale lock." >&2
  exit 2
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

BASE="origin/develop"; F_BACK=0; F_FRONT=0; SKIP_SMOKE=0; REVIEW="none"
for a in "$@"; do case "$a" in
  --base=*) BASE="${a#*=}" ;;
  --backend) F_BACK=1 ;;
  --frontend) F_FRONT=1 ;;
  --all) F_BACK=1; F_FRONT=1 ;;
  --skip-smoke) SKIP_SMOKE=1 ;;
  --performed-review=*) REVIEW="${a#*=}" ;;
  *) echo "unknown option: $a" >&2; exit 2 ;;
esac; done

# Diff = committed changes since merge-base with $BASE + working tree + untracked.
if [ -n "${GATES_DIFF_OVERRIDE:-}" ]; then
  DIFF_FILES="$GATES_DIFF_OVERRIDE"
else
  DIFF_FILES="$( { git diff --name-only "$BASE"...HEAD 2>/dev/null; \
                   git diff --name-only HEAD 2>/dev/null; \
                   git status --porcelain | awk '{print $NF}'; } | sort -u | sed '/^$/d')"
fi

FAILS=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1 — $2"; FAILS=$((FAILS+1)); }
run_gate() { # run_gate <name> <cmd...>: PASS/FAIL by exit code, show output on failure
  local name="$1"; shift
  local out
  if out="$("$@" 2>&1)"; then pass "$name"; else
    fail "$name" "command failed"
    echo "$out" | tail -n 25 | sed 's/^/    | /'
  fi
}
touches() { echo "$DIFF_FILES" | grep -qE "$1"; }

# ---------- area gates (conditional on diff, forceable) ----------
touches '^backend/'  && F_BACK=1
touches '^frontend/' && F_FRONT=1

backend_vitest() { # isolated test DB — see backend/CLAUDE.md traps
  local url
  url="$(docker compose exec -T backend printenv DATABASE_URL | tr -d '\r\n' | sed 's|/solvro?|/solvro_test?|')" || return 1
  [ -n "$url" ] || { echo "could not derive test DATABASE_URL"; return 1; }
  docker compose exec -T -e DATABASE_URL="$url" backend npm test
}
smoke_gate() {
  # Pre-flight: the e2e fixture admin (e2e/fixtures/test.ts) must be able to
  # log in, or every smoke test fails opaquely inside the seed fixture. Agents
  # have twice reset this user's password via create-admin.ts for their own
  # verification — fail here with a one-line diagnosis instead.
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL:-qa@solvro.test}\",\"password\":\"${ADMIN_PASSWORD:-QaTest1234!}\"}")
  if [ "$code" = "000" ]; then
    echo "backend unreachable on :3000 — the stack isn't up (docker compose up -d), not a fixture problem"
    return 1
  fi
  if [ "$code" != "200" ]; then
    echo "e2e fixture admin login failed (HTTP $code) — restore it with:"
    echo "  docker compose exec -e ADMIN_EMAIL=qa@solvro.test -e ADMIN_PASSWORD='QaTest1234!' backend npx tsx scripts/create-admin.ts"
    return 1
  fi
  (cd e2e && BASE_URL="${BASE_URL:-http://localhost:5173}" npx playwright test tests/smoke.spec.ts)
}

if [ "$F_BACK" -eq 1 ]; then
  run_gate backend-typecheck docker compose exec -T backend npx tsc --noEmit
  run_gate backend-vitest backend_vitest
fi
if [ "$F_FRONT" -eq 1 ]; then
  run_gate frontend-typecheck docker compose exec -T frontend npm run typecheck
  run_gate frontend-vitest docker compose exec -T frontend npm test
  # East-of-UTC run: pins the date-contract invariant (dateField.ts) — a reintroduced
  # local-midnight serialization is invisible under the container's default UTC clock.
  run_gate frontend-vitest-tz docker compose exec -T -e TZ=Asia/Jakarta frontend npm test
  if [ "$SKIP_SMOKE" -eq 0 ]; then run_gate playwright-smoke smoke_gate; else echo "SKIP playwright-smoke (--skip-smoke)"; fi
fi

# ---------- changelog presence (always) ----------
# Any non-doc change requires CHANGELOG.md in the same diff. Entry *quality* is a
# reviewer concern; this gate only guarantees presence.
NON_DOC="$(echo "$DIFF_FILES" | grep -vE '^(docs/|\.claude/|\.git/)|(^|/)CLAUDE\.md$|^CHANGELOG\.md$|^README\.md$' | sed '/^$/d')"
if [ -n "$NON_DOC" ]; then
  if echo "$DIFF_FILES" | grep -qx 'CHANGELOG.md'; then pass changelog-presence
  else fail changelog-presence "code/config changed without a CHANGELOG.md entry"; fi
else pass "changelog-presence (no code changes in diff)"; fi

# ---------- standing guardrail checks (always) ----------
if [ -f frontend/src/pages/Tasks.tsx ] && grep -q 'path="tasks"' frontend/src/App.tsx; then
  pass guardrail-tasks-page
else fail guardrail-tasks-page "Tasks.tsx or its /tasks route is missing (Guardrail: must never be deleted)"; fi

if grep -q gantt-task-react backend/package.json frontend/package.json 2>/dev/null; then
  fail guardrail-no-gantt-lib "gantt-task-react found in a package.json (Guardrail: never install)"
else pass guardrail-no-gantt-lib; fi

# INTERNAL-notes guardrail. The Reports export packet was removed 2026-08-03.
# While frontend/src/lib/export/ exists, it must filter CUSTOMER_FACING (re-arm
# branch). Without it, the gate instead pins the note-consuming file set to an
# allowlist: a new consumer must be hand-verified to never surface INTERNAL
# notes in customer-facing output, then added here. (2026-08-29: DailyReview.tsx
# reads notes through GET /daily-review now; ProjectOverview.tsx shows a read-only,
# in-app 14-day note feed — verified: no export/customer-facing path.
# 2026-08-31: Overview.tsx shows the read-only 7-day "Recent notes" feed via
# useRecentNotes (GET /notes/recent) — verified: in-app only, no export path.)
NOTE_ALLOWLIST="frontend/src/lib/queries.ts
frontend/src/pages/Overview.tsx
frontend/src/pages/views/ProjectOverview.tsx"
NOTE_CONSUMERS="$(grep -rl 'useProjectNotes\|useRecentNotes\|NoteVisibility' frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null | sort)"
if [ -d frontend/src/lib/export ]; then
  if grep -rq CUSTOMER_FACING frontend/src/lib/export/; then pass guardrail-internal-notes
  else fail guardrail-internal-notes "no CUSTOMER_FACING visibility filter found in frontend/src/lib/export/ (Guardrail: INTERNAL notes never in exports)"; fi
elif [ "$NOTE_CONSUMERS" = "$NOTE_ALLOWLIST" ]; then pass "guardrail-internal-notes (note consumers match allowlist)"
else fail guardrail-internal-notes "note-consuming files drifted from the allowlist (Guardrail: INTERNAL notes never in customer-facing output) — got: $(echo "$NOTE_CONSUMERS" | tr '\n' ' ')"; fi

# Inverted 2026-10-01: .claude/, the CLAUDE.md files and docs/ are TRACKED by user
# decision (they were local-only before). The check guards the inverse mistake —
# re-adding the old ignore block would silently drop the agent workflow from a
# fresh clone. .superpowers stays untracked either way.
if [ -n "$(git ls-files -- .claude CLAUDE.md backend/CLAUDE.md frontend/CLAUDE.md e2e/CLAUDE.md docs)" ] \
   && [ -z "$(git ls-files -- .superpowers)" ]; then
  pass guardrail-local-only-tracked
else fail guardrail-local-only-tracked "the agent workflow files (.claude/, CLAUDE.md, docs/) must stay tracked in this repository, and .superpowers must not be"; fi

# Update EXPECTED_KANBAN_PATCHES together with the CHANGELOG when a sanctioned patch lands.
EXPECTED_KANBAN_PATCHES=0
if [ -f frontend/src/components/reui/kanban.tsx ]; then
  N="$(grep -c 'SOLVRO PATCH' frontend/src/components/reui/kanban.tsx)"
  if [ "$N" -eq "$EXPECTED_KANBAN_PATCHES" ]; then pass guardrail-kanban-vendor
  else fail guardrail-kanban-vendor "SOLVRO PATCH count $N != recorded $EXPECTED_KANBAN_PATCHES"; fi
else fail guardrail-kanban-vendor "frontend/src/components/reui/kanban.tsx missing"; fi

# Same drift guard for the vendored Sortable (vendored 2026-07-30, zero sanctioned patches).
EXPECTED_SORTABLE_PATCHES=0
if [ -f frontend/src/components/reui/sortable.tsx ]; then
  N="$(grep -c 'SOLVRO PATCH' frontend/src/components/reui/sortable.tsx)"
  if [ "$N" -eq "$EXPECTED_SORTABLE_PATCHES" ]; then pass guardrail-sortable-vendor
  else fail guardrail-sortable-vendor "SOLVRO PATCH count $N != recorded $EXPECTED_SORTABLE_PATCHES"; fi
else fail guardrail-sortable-vendor "frontend/src/components/reui/sortable.tsx missing"; fi

# Same drift guard for the vendored Filters (vendored 2026-07-31; 18 sanctioned
# SOLVRO PATCH markers incl. comment-only ones — provenance header in the file;
# bumped from 13 for the duplicate-chip idempotence guard, 2026-08-02: a shared
# `findMatchingFilter` check (wrapping the module-level, unit-tested pure
# `findFilterMatch`) applied at all four unconditional chip-append call sites
# — the plain field add, the single-remaining-field direct list, and both
# branches of the field-then-value submenu flow (multiselect + single-select)
# — since only the last three are reachable for this app's actual filter
# fields (all `type: "select"` with populated options, so `addFilter` itself
# is a fallback path, not the one users hit in practice)).
EXPECTED_FILTERS_PATCHES=18
if [ -f frontend/src/components/reui/filters.tsx ]; then
  N="$(grep -c 'SOLVRO PATCH' frontend/src/components/reui/filters.tsx)"
  if [ "$N" -eq "$EXPECTED_FILTERS_PATCHES" ]; then pass guardrail-filters-vendor
  else fail guardrail-filters-vendor "SOLVRO PATCH count $N != recorded $EXPECTED_FILTERS_PATCHES"; fi
else fail guardrail-filters-vendor "frontend/src/components/reui/filters.tsx missing"; fi

# Same drift guards for the vendored Data Grid family (dir-total) and Badge
# (vendored 2026-08-01; counts include comment-only markers).
EXPECTED_DATAGRID_PATCHES=40
if [ -d frontend/src/components/reui/data-grid ]; then
  N="$(grep -rc 'SOLVRO PATCH' frontend/src/components/reui/data-grid/ | awk -F: '{s+=$2} END {print s}')"
  if [ "$N" -eq "$EXPECTED_DATAGRID_PATCHES" ]; then pass guardrail-datagrid-vendor
  else fail guardrail-datagrid-vendor "SOLVRO PATCH count $N != recorded $EXPECTED_DATAGRID_PATCHES"; fi
else fail guardrail-datagrid-vendor "frontend/src/components/reui/data-grid/ missing"; fi

EXPECTED_BADGE_PATCHES=5
if [ -f frontend/src/components/reui/badge.tsx ]; then
  N="$(grep -c 'SOLVRO PATCH' frontend/src/components/reui/badge.tsx)"
  if [ "$N" -eq "$EXPECTED_BADGE_PATCHES" ]; then pass guardrail-badge-vendor
  else fail guardrail-badge-vendor "SOLVRO PATCH count $N != recorded $EXPECTED_BADGE_PATCHES"; fi
else fail guardrail-badge-vendor "frontend/src/components/reui/badge.tsx missing"; fi

# Pipeline + SA intact (customer-edition port, 2026-10-04). The customer edition
# removed the Pipeline module and `Project.saId`; Internal keeps both (CLAUDE.md
# Guardrails + Standing decisions). Fails if the opportunities router is gone, if
# any migration drops the opportunities table or the sa_id column, or if the
# project visibility filter no longer matches on saId.
if [ ! -f backend/src/routes/opportunities.ts ]; then
  fail guardrail-pipeline-intact "backend/src/routes/opportunities.ts is missing (Guardrail: the Pipeline module is a native port, never removed)"
elif grep -rliE 'DROP TABLE "?opportunities"?|DROP COLUMN "?sa_id"?' backend/prisma/migrations/ >/dev/null 2>&1; then
  fail guardrail-pipeline-intact "a migration drops the opportunities table or projects.sa_id (never copy the customer edition's remove_pipeline_module migration)"
elif ! awk '/^export function projectVisibilityFilter/,/^}/' backend/src/lib/visibility.ts | grep -q 'saId'; then
  fail guardrail-pipeline-intact "projectVisibilityFilter no longer contains the saId arm (Standing decision: SA visibility stays)"
else pass guardrail-pipeline-intact; fi

# Guest links never carry notes (INTERNAL-notes guardrail, public surface). The
# guest payload builder and the public route must never touch a note model or
# select a `notes` relation. Comment lines are stripped first: the modules may
# (and do) state this very invariant in prose.
GUEST_FILES="$(ls backend/src/lib/shareLinks.ts backend/src/routes/publicShare.ts 2>/dev/null)"
if [ -n "$GUEST_FILES" ]; then
  GUEST_HITS="$(cat $GUEST_FILES | grep -vE '^\s*(//|/?\*)' | grep -nE 'projectNote|customerNote|ProjectNote|CustomerNote|\bnotes\s*:' || true)"
  if [ -n "$GUEST_HITS" ]; then
    fail guardrail-guest-links-no-notes "the guest-link modules reference notes (Guardrail: INTERNAL notes never in customer-facing output): $(echo "$GUEST_HITS" | head -3 | tr '\n' ' ')"
  else pass guardrail-guest-links-no-notes; fi
else pass "guardrail-guest-links-no-notes (no guest-link module yet)"; fi

# iTop writes never use the application token (Guardrail, 2026-10-04). Every
# iTop write call (applyStimulus / create<Itop…> / update) in the iTop routes
# and libs must run on a client built from the user's personal token. The app
# client (getItopAppClient) only reads — so a write receiver may never be a
# variable bound from getItopAppClient. Convention that makes this checkable:
# bind the app client to `appClient`, never to the name a write uses.
ITOP_WRITE_RE='\b([A-Za-z_][A-Za-z0-9_]*)\.(applyStimulus\(|create<Itop|update\()'
ITOP_BAD=""
for f in backend/src/routes/itop.ts backend/src/lib/itop/*.ts; do
  [ -f "$f" ] || continue
  case "$f" in */client.ts) continue ;; esac
  RECEIVERS="$(grep -vE 'prisma\.|\btx\.' "$f" | grep -oE "$ITOP_WRITE_RE" | sed -E 's/\.(applyStimulus\(|create<Itop|update\()$//' | sort -u)"
  for r in $RECEIVERS; do
    # A write receiver is bad when it is the app client by name, is bound from
    # getItopAppClient(), or is built from an expression that opens the stored
    # application token (appTokenEnc) — the literal guardrail wording.
    if [ "$r" = "appClient" ] \
       || grep -qE "\b$r\b[^=]*=\s*await getItopAppClient\(|\[$r\b[^]]*\]\s*=\s*await Promise\.all\(\[getItopAppClient" "$f" \
       || grep -qE "\b(const|let|var)\s+$r\b[^=]*=[^;]*appTokenEnc" "$f"; then
      ITOP_BAD="$ITOP_BAD $f:$r"
    fi
  done
done
if [ -n "$ITOP_BAD" ]; then
  fail guardrail-itop-no-app-token-writes "an iTop write runs on the application-token client:$ITOP_BAD (Guardrail: writes use the user's personal token only)"
else pass guardrail-itop-no-app-token-writes; fi

# ---------- spine check (always) ----------
# Shared spine of the projects page + app-wide hot surfaces. Touching any of these
# requires an instant opus review of the task (--performed-review=opus).
# Extended 2026-10-04 (customer-edition port) with the secrets box, the two
# unauthenticated surfaces (iTop webhook, guest links), personal iTop tokens,
# the outbound iTop client and the redacting request logger.
# Standing decision (CLAUDE.md): the SA user role, `Project.saId`, and SA
# visibility matching (`backend/src/lib/visibility.ts`) stay; the Pipeline
# module is a native port and is never removed — see guardrail-pipeline-intact.
SPINE='^backend/src/lib/taskOrdering\.ts$|^backend/src/routes/tasks\.ts$|^backend/src/routes/projects\.ts$|^backend/src/http/auth\.ts$|^backend/src/routes/admin\.ts$|^backend/src/lib/visibility\.ts$|^backend/prisma/schema\.prisma$|^backend/prisma/migrations/|^frontend/src/lib/dateField\.ts$|^frontend/src/components/DateField\.tsx$|^frontend/src/components/DateRangeField\.tsx$|^frontend/src/components/InlineDateRangeEditor\.tsx$|^frontend/src/lib/queries\.ts$|^frontend/src/components/kanban-v2/(adapter|commitMapper)\.ts$|^frontend/src/components/gantt-v2/|^frontend/src/components/reui/|^frontend/src/lib/export/|^docker-compose\.yml$|^\.env|^setup\.sh$|^frontend/nginx\.conf$|^backend/src/lib/secretBox\.ts$|^backend/src/routes/webhook\.ts$|^backend/src/routes/itopUser\.ts$|^backend/src/lib/itop/client\.ts$|^backend/src/http/requestLogger\.ts$|^backend/src/routes/publicShare\.ts$|^backend/src/lib/shareLinks\.ts$'
SPINE_HITS="$(echo "$DIFF_FILES" | grep -E "$SPINE" | sed '/^$/d' || true)"
if [ -n "$SPINE_HITS" ]; then
  echo "SPINE TOUCHED — instant review required:"
  echo "$SPINE_HITS" | sed 's/^/    /'
  if [ "$REVIEW" = "opus" ]; then pass spine-review
  else fail spine-review "spine files touched but no opus review recorded (pass --performed-review=opus after the review)"; fi
else pass "spine-review (no spine files touched)"; fi

echo "----------------------------------------"
if [ "$FAILS" -eq 0 ]; then echo "ALL GATES PASSED"; exit 0
else echo "$FAILS GATE(S) FAILED"; exit 1; fi
