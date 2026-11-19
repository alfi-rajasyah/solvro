#!/usr/bin/env bash
# Solvro quality gates — deterministic replacement for the retired solvro-qa agent.
# Full runs are orchestrator-owned and serial: once per lane-D or lane-S change, and per wave
# integration plus at close for a phase (lanes: root CLAUDE.md roster). Spine touches
# require an instant opus review in any lane (enforced here, not by model judgment).
# Design: docs/archive/plans/pipeline-v2-design.md, docs/archive/plans/pipeline-v3-simplify.md
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
e2e_preflight() {
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
}
smoke_gate() {
  e2e_preflight || return 1
  (cd e2e && BASE_URL="${BASE_URL:-http://localhost:5173}" npx playwright test tests/smoke.spec.ts)
}
# Specs touched by the diff (desktop only), independent of which areas changed, so a
# new or edited suite is exercised mechanically. smoke.spec.ts has its own gate.
TOUCHED_SPECS=()
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$f" ] && [ "$f" != "e2e/tests/smoke.spec.ts" ] && TOUCHED_SPECS+=("${f#e2e/}")
done < <(echo "$DIFF_FILES" | grep -E '^e2e/tests/[^/]+\.spec\.ts$' | sort -u)
touched_specs_gate() {
  e2e_preflight || return 1
  echo "touched e2e specs (desktop): ${TOUCHED_SPECS[*]}"
  (cd e2e && BASE_URL="${BASE_URL:-http://localhost:5173}" npx playwright test --project=desktop "${TOUCHED_SPECS[@]}")
}

if [ "$F_BACK" -eq 1 ]; then
  # tsconfig.check.json widens the build config to scripts/ and test/ (ISS-146).
  run_gate backend-typecheck docker compose exec -T backend npx tsc -p tsconfig.check.json
  run_gate backend-vitest backend_vitest
fi
if [ "$F_FRONT" -eq 1 ]; then
  run_gate frontend-typecheck docker compose exec -T frontend npm run typecheck
  run_gate frontend-lint docker compose exec -T frontend npm run lint
  run_gate frontend-vitest docker compose exec -T frontend npm test
  # East-of-UTC run: pins the date-contract invariant (dateField.ts) — a reintroduced
  # local-midnight serialization is invisible under the container's default UTC clock.
  run_gate frontend-vitest-tz docker compose exec -T -e TZ=Asia/Jakarta frontend npm test
  # A frontend diff of test files only renders nothing new, so smoke has nothing
  # to prove; typecheck and both vitest runs above still cover it.
  FRONT_NON_TEST="$(echo "$DIFF_FILES" | grep -E '^frontend/' | grep -vE '\.test\.tsx?$' | sed '/^$/d')"
  if [ "$SKIP_SMOKE" -eq 1 ]; then echo "SKIP playwright-smoke (--skip-smoke)"
  elif touches '^frontend/' && [ -z "$FRONT_NON_TEST" ]; then echo "SKIP playwright-smoke (test-only frontend diff)"
  elif ! command -v npx >/dev/null 2>&1; then echo "SKIP playwright-smoke (npx not on PATH: the smoke gate runs Playwright from the host, install Node or run it where Node exists)"
  else run_gate playwright-smoke smoke_gate; fi
fi

if [ "${#TOUCHED_SPECS[@]}" -gt 0 ]; then
  if [ "$SKIP_SMOKE" -eq 1 ]; then echo "SKIP e2e-touched-specs (--skip-smoke)"
  elif ! command -v npx >/dev/null 2>&1; then echo "SKIP e2e-touched-specs (npx not on PATH: Playwright runs from the host, install Node or run it where Node exists)"
  else run_gate e2e-touched-specs touched_specs_gate; fi
fi

# ---------- changelog presence (always) ----------
# Any non-doc change requires CHANGELOG.md in the same diff. Entry *quality* is a
# reviewer concern; this gate only guarantees presence.
NON_DOC="$(echo "$DIFF_FILES" | grep -vE '^(docs/|\.claude/|\.git/)|(^|/)CLAUDE\.md$|^CHANGELOG\.md$|^README\.md$' | sed '/^$/d')"
if [ -n "$NON_DOC" ]; then
  if echo "$DIFF_FILES" | grep -qx 'CHANGELOG.md'; then pass changelog-presence
  else fail changelog-presence "code/config changed without a CHANGELOG.md entry"; fi
else pass "changelog-presence (no code changes in diff)"; fi

# ---------- plan-doc hygiene (always) ----------
# Plans are cited by their archive path from the start (root CLAUDE.md, Map), so a
# cited docs/archive/plans/<x> must exist there or still be live in docs/plans/.
# Code never cites a live docs/plans|docs/prompts path: it goes stale at archive time.
CITE_BAD=""
for p in $(git grep --untracked -ohE 'docs/archive/plans/[A-Za-z0-9._/-]+\.md' | sort -u); do
  [ -e "$p" ] || [ -e "docs/plans/${p#docs/archive/plans/}" ] || CITE_BAD="$CITE_BAD $p"
done
CODE_LIVE="$(git grep --untracked -nE 'docs/(plans|prompts)/' -- backend frontend e2e ':!*CLAUDE.md' | head -3)"
if [ -n "$CITE_BAD" ]; then fail docs-plan-citations "cited plan exists neither in docs/archive/plans/ nor docs/plans/:$CITE_BAD"
elif [ -n "$CODE_LIVE" ]; then fail docs-plan-citations "code cites a live docs/plans or docs/prompts path (cite docs/archive/...): $(echo "$CODE_LIVE" | cut -c1-120 | tr '\n' ' ')"
else pass docs-plan-citations; fi
# Every live plan states its status; a shipped one belongs in docs/archive/plans/.
STATUS_BAD=""
for f in docs/plans/*.md; do
  [ -f "$f" ] || continue
  s="$(grep -m1 -iE '^\**status:?\**' "$f")"
  if [ -z "$s" ]; then STATUS_BAD="$STATUS_BAD $f(no Status line)"
  elif echo "$s" | grep -qiE '^\**status:?\**:?\s*\**shipped'; then STATUS_BAD="$STATUS_BAD $f(shipped: git mv it to docs/archive/plans/)"; fi
done
if [ -n "$STATUS_BAD" ]; then fail docs-plans-status "$STATUS_BAD"; else pass docs-plans-status; fi

# ---------- standing guardrail checks (always) ----------
if [ -f frontend/src/pages/Tasks.tsx ] && grep -q 'path="tasks"' frontend/src/App.tsx; then
  pass guardrail-tasks-page
else fail guardrail-tasks-page "Tasks.tsx or its /tasks route is missing (Guardrail: must never be deleted)"; fi

if grep -q gantt-task-react backend/package.json frontend/package.json 2>/dev/null; then
  fail guardrail-no-gantt-lib "gantt-task-react found in a package.json (Guardrail: never install)"
else pass guardrail-no-gantt-lib; fi

# Notes-never-exported guardrail. The Reports export packet was removed
# 2026-08-03 and the note visibility column was dropped 2026-11-12, so no note
# is ever safe to export. If frontend/src/lib/export/ comes back, it must not
# read notes at all (re-arm branch). Without it, the gate pins the
# note-consuming file set to an allowlist: a new consumer must be hand-verified
# to never surface a note in customer-facing output, then added here. (2026-08-29: DailyReview.tsx
# reads notes through GET /daily-review now; ProjectOverview.tsx shows a read-only,
# in-app 14-day note feed — verified: no export/customer-facing path.
# 2026-08-31: Overview.tsx shows the read-only 7-day "Recent notes" feed via
# useRecentNotes (GET /notes/recent) — verified: in-app only, no export path.)
NOTE_ALLOWLIST="frontend/src/lib/queries.ts
frontend/src/pages/Overview.tsx
frontend/src/pages/views/ProjectOverview.tsx"
NOTE_CONSUMERS="$(grep -rl 'useProjectNotes\|useRecentNotes' frontend/src --include='*.ts' --include='*.tsx' 2>/dev/null | sort)"
if [ -d frontend/src/lib/export ]; then
  if grep -rq 'useProjectNotes\|useRecentNotes\|ProjectNote\|/notes' frontend/src/lib/export/; then
    fail guardrail-internal-notes "frontend/src/lib/export/ reads notes (Guardrail: notes never in exports)"
  else pass guardrail-internal-notes; fi
elif [ "$NOTE_CONSUMERS" = "$NOTE_ALLOWLIST" ]; then pass "guardrail-internal-notes (note consumers match allowlist)"
else fail guardrail-internal-notes "note-consuming files drifted from the allowlist (Guardrail: notes never in customer-facing output) — got: $(echo "$NOTE_CONSUMERS" | tr '\n' ' ')"; fi

# Inverted 2026-10-01: .claude/, the CLAUDE.md files and docs/ are TRACKED by user
# decision (they were local-only before). The check guards the inverse mistake —
# re-adding the old ignore block would silently drop the agent workflow from a
# fresh clone. .superpowers stays untracked either way.
if [ -n "$(git ls-files -- .claude CLAUDE.md backend/CLAUDE.md frontend/CLAUDE.md e2e/CLAUDE.md docs)" ] \
   && [ -z "$(git ls-files -- .superpowers)" ]; then
  pass guardrail-local-only-tracked
else fail guardrail-local-only-tracked "the agent workflow files (.claude/, CLAUDE.md, docs/) must stay tracked in this repository, and .superpowers must not be"; fi

# Update EXPECTED_KANBAN_PATCHES together with the CHANGELOG when a sanctioned patch lands.
EXPECTED_KANBAN_PATCHES=5
if [ -f frontend/src/components/reui/kanban.tsx ]; then
  N="$(grep -c 'SOLVRO PATCH' frontend/src/components/reui/kanban.tsx)"
  if [ "$N" -eq "$EXPECTED_KANBAN_PATCHES" ]; then pass guardrail-kanban-vendor
  else fail guardrail-kanban-vendor "SOLVRO PATCH count $N != recorded $EXPECTED_KANBAN_PATCHES"; fi
else fail guardrail-kanban-vendor "frontend/src/components/reui/kanban.tsx missing"; fi

# Same drift guard for the vendored Sortable (vendored 2026-07-30).
EXPECTED_SORTABLE_PATCHES=6
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
    fail guardrail-guest-links-no-notes "the guest-link modules reference notes (Guardrail: notes never in customer-facing output): $(echo "$GUEST_HITS" | head -3 | tr '\n' ' ')"
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

# ---------- design guard checks (always) ----------
# DESIGN.md drift guards (2026-11-02, docs/archive/plans/design-drift-fixes-spec.md
# §8). App code only: vendored shadcn/ReUI (components/ui, components/reui) and
# tests are excluded. Each prints the first offending lines on failure.
design_grep() { # design_grep <ERE> [extra path-exclude ERE, relative to frontend/src/]
  # Excludes are anchored to the path prefix of grep's "path:line:content"
  # output, so a code line that merely mentions components/ui/ is still checked.
  local ex='^frontend/src/(components/(ui|reui)/|[^:]*\.test\.tsx?:)'
  [ -n "${2:-}" ] && ex="$ex|^frontend/src/$2"
  local out rc
  out="$(grep -rnE "$1" frontend/src --include='*.ts' --include='*.tsx')"; rc=$?
  # grep exits 2 on a bad pattern or unreadable tree: report it, never pass silently.
  if [ "$rc" -gt 1 ]; then echo "GREP-ERROR: grep exited $rc for pattern $1"; return; fi
  echo "$out" | grep -vE "$ex" | sed '/^$/d' || true
}
design_check() { # design_check <gate> <reason> <hits>
  if [ -n "$3" ]; then fail "$1" "$2: $(echo "$3" | head -3 | cut -c1-160 | tr '\n' ' ')"
  else pass "$1"; fi
}
# 1. Colours come from tokens — no raw Tailwind palette classes (DESIGN.md §1).
design_check design-no-palette-colours "raw Tailwind palette colour class (use a token: chip-*, success, warning, primary, on-surface…)" \
  "$(design_grep '\b(bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder|accent|caret|decoration|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b')"
# 2. No text under 12px — arbitrary classes and inline fontSize (DESIGN.md §2).
#    lib/gantt/exportPdf.ts sizes PDF text in print points, not screen pixels.
design_check design-min-text-size "text below 12px (use text-meta / text-label-caps)" \
  "$(design_grep 'text-\[([0-9]|1[01])(\.[0-9]+)?px\]|fontSize:\s*([0-9]|1[01])(\.[0-9]+)?\b' 'lib/gantt/exportPdf\.ts:')"
# 3. One focus treatment — no border-primary on focus (DESIGN.md §4; use FIELD_FOCUS).
design_check design-focus-ring "border-primary focus style (use FIELD_FOCUS / FIELD_FOCUS_WITHIN from lib/utils.ts)" \
  "$(design_grep '(focus|focus-visible|focus-within):border-primary')"
# 4. Caps labels use the named role — no hand-rolled uppercase + tracking-wider (DESIGN.md §2).
design_check design-caps-role "hand-rolled caps label (use text-label-caps uppercase)" \
  "$(design_grep "uppercase[^\"'\`]*tracking-wider|tracking-wider[^\"'\`]*uppercase")"

# antislop guards (2026-11-10, docs/archive/plans/antislop-audit-001-2026-11-10.md,
# items 2, 5 and 8). Same scope as the design guards: app code, no vendored
# ui/reui, no tests.
# 5. Text on a solid primary fill uses its token pair — white on dark-theme
#    green is 2.86:1.
design_check design-on-primary "text-white on bg-primary (use text-on-primary)" \
  "$(design_grep "bg-primary([^/-]|\$)[^\"'\`]*text-white|text-white[^\"'\`]*bg-primary([^/-]|\$)")"
# 6 and 7 read whole files (a tag or a comment can span lines), so they use
# perl rather than the line grep above.
design_perl() { # design_perl <perl -ne body run once per file, file in $_>
  find frontend/src -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -path 'frontend/src/components/ui/*' ! -path 'frontend/src/components/reui/*' \
    ! -name '*.test.ts' ! -name '*.test.tsx' -print0 \
    | xargs -0 perl -CSD -Mutf8 -0777 -ne "$1" 2>&1
}
# 6. No em dash in text a user reads. Comments are blanked first, so prose in
#    comments is free; the "no value" mark is EMPTY_VALUE (lib/emptyValue.ts).
design_check design-no-em-dash "em dash in user-facing text (rewrite the sentence; an empty value is EMPTY_VALUE)" \
  "$(design_perl 's{/\*.*?\*/}{ (my $c = $&) =~ s/[^\n]//g; $c }gse; s{(^|[^:"\x27`])//[^\n]*}{$1}gm; my $n = 0; for my $l (split /\n/) { $n++; print "$ARGV:$n: $l\n" if $l =~ /\x{2014}/ }')"
# 7. Icon ligatures are text: a material-symbols element is hidden from
#    assistive tech, or is itself a labelled control. Never both: aria-hidden
#    on an element that is a control (or carries the only name) hides it from
#    the people who need the name. The tag matcher steps over the ">" of "=>".
design_check design-icon-hidden "material-symbols-outlined element without aria-hidden (aria-label when it is the control), or aria-hidden on a control" \
  "$(design_perl 'while (/<(?:span|button|i)\b((?:[^>]|(?<==)>)*?material-symbols-outlined(?:[^>]|(?<==)>)*?)>/gs) { my $a = $1; my $n = (substr($_, 0, $-[0]) =~ tr/\n//) + 1; if ($a !~ /aria-hidden|aria-label/) { print "$ARGV:$n: icon element is neither hidden nor labelled\n" } elsif ($a =~ /aria-hidden/ && $a =~ /aria-label|\brole=|tabIndex|\{\.\.\.attributes\}|onClick/) { print "$ARGV:$n: aria-hidden on a control or a named icon\n" } }')"

# ---------- spine check (always) ----------
# Shared spine of the projects page + app-wide hot surfaces. Touching any of these
# requires an instant opus review of the task (--performed-review=opus).
# Extended 2026-10-04 (customer-edition port) with the secrets box, the two
# unauthenticated surfaces (iTop webhook, guest links), personal iTop tokens,
# the outbound iTop client and the redacting request logger.
# Standing decision (CLAUDE.md): the SA user role, `Project.saId`, and SA
# visibility matching (`backend/src/lib/visibility.ts`) stay; the Pipeline
# module is a native port and is never removed — see guardrail-pipeline-intact.
SPINE='^backend/src/lib/taskOrdering\.ts$|^backend/src/routes/tasks\.ts$|^backend/src/routes/projects\.ts$|^backend/src/http/auth\.ts$|^backend/src/routes/admin\.ts$|^backend/src/lib/visibility\.ts$|^backend/prisma/schema\.prisma$|^backend/prisma/migrations/|^frontend/src/lib/dateField\.ts$|^frontend/src/components/DateField\.tsx$|^frontend/src/components/DateRangeField\.tsx$|^frontend/src/components/InlineDateRangeEditor\.tsx$|^frontend/src/lib/queries\.ts$|^frontend/src/components/kanban-v2/(adapter|commitMapper)\.ts$|^frontend/src/components/gantt-v2/|^frontend/src/components/reui/|^frontend/src/lib/gantt/export|^docker-compose\.yml$|^\.env|^setup\.sh$|^frontend/nginx\.conf$|^backend/src/lib/secretBox\.ts$|^backend/src/routes/webhook\.ts$|^backend/src/routes/itopUser\.ts$|^backend/src/lib/itop/client\.ts$|^backend/src/http/requestLogger\.ts$|^backend/src/routes/publicShare\.ts$|^backend/src/lib/shareLinks\.ts$'
# ---------- spine-list agreement (always) ----------
# The spine exists twice: prose in CLAUDE.md (user-owned wording, never edited
# from here) and the SPINE regex above. This check keeps them from drifting:
#   1. every prose item in the CLAUDE.md paragraph is covered by a row below;
#   2. every row's key still appears in that paragraph;
#   3. every row's sample path matches SPINE;
#   4. every SPINE alternative matches at least one sample path.
# A new spine item therefore needs a table row here, which is the point.
SPINE_MAP=(
  "task ordering::backend/src/lib/taskOrdering.ts"
  "task ordering::backend/src/routes/tasks.ts"
  "routes/projects.ts::backend/src/routes/projects.ts"
  "auth/admin/visibility::backend/src/http/auth.ts"
  "auth/admin/visibility::backend/src/routes/admin.ts"
  "auth/admin/visibility::backend/src/lib/visibility.ts"
  "schema.prisma::backend/prisma/schema.prisma"
  "schema.prisma::backend/prisma/migrations/20260101000000_x/migration.sql"
  "date contract::frontend/src/lib/dateField.ts"
  "date contract::frontend/src/components/DateField.tsx"
  "date contract::frontend/src/components/DateRangeField.tsx"
  "date contract::frontend/src/components/InlineDateRangeEditor.tsx"
  "lib/queries.ts::frontend/src/lib/queries.ts"
  "Kanban adapters::frontend/src/components/kanban-v2/adapter.ts"
  "Kanban adapters::frontend/src/components/kanban-v2/commitMapper.ts"
  "gantt-v2/::frontend/src/components/gantt-v2/GanttView.tsx"
  "reui/::frontend/src/components/reui/gantt.tsx"
  "Gantt exports::frontend/src/lib/gantt/exportPng.ts"
  "docker/env::docker-compose.yml"
  "docker/env::.env.example"
  "docker/env::setup.sh"
  "docker/env::frontend/nginx.conf"
  "secrets and unauthenticated surfaces::backend/src/lib/secretBox.ts"
  "secrets and unauthenticated surfaces::backend/src/routes/webhook.ts"
  "secrets and unauthenticated surfaces::backend/src/routes/itopUser.ts"
  "secrets and unauthenticated surfaces::backend/src/lib/itop/client.ts"
  "secrets and unauthenticated surfaces::backend/src/http/requestLogger.ts"
  "secrets and unauthenticated surfaces::backend/src/routes/publicShare.ts"
  "secrets and unauthenticated surfaces::backend/src/lib/shareLinks.ts"
)
spine_agreement() {
  local para items item row key path alt bad=""
  # Whole paragraph (up to the next blank line), joined, so a re-wrapped paragraph
  # is still parsed in full rather than silently truncated to its first line.
  para="$(awk '/^\*\*Spine \(instant opus review/{f=1} f&&/^[[:space:]]*$/{exit} f{printf "%s ", $0}' CLAUDE.md)"
  [ -n "$para" ] || { echo "CLAUDE.md has no '**Spine (instant opus review' paragraph"; return 1; }
  # Item list = text between the label's "**:" and the sentence naming the regex;
  # parenthetical asides are dropped so their commas do not split an item.
  items="$(printf '%s' "$para" | perl -0pe 's/^.*?\)\*\*:\s*//; s/\.\s*The `SPINE`.*$//s; 1 while s/\([^()]*\)//g; s/,\s*(?:and\s+)?/\n/g')"
  [ -n "$items" ] || { echo "could not parse the spine item list from CLAUDE.md"; return 1; }
  while IFS= read -r item; do
    [ -n "$item" ] || continue
    local covered=0
    for row in "${SPINE_MAP[@]}"; do
      key="${row%%::*}"
      case "$item" in *"$key"*) covered=1; break ;; esac
    done
    [ "$covered" -eq 1 ] || bad="$bad\n  CLAUDE.md lists \"$item\" but SPINE_MAP in gates.sh has no row for it"
  done <<< "$items"
  for row in "${SPINE_MAP[@]}"; do
    key="${row%%::*}"; path="${row#*::}"
    printf '%s' "$para" | grep -qF -- "$key" || bad="$bad\n  SPINE_MAP key \"$key\" no longer appears in the CLAUDE.md spine paragraph"
    echo "$path" | grep -qE "$SPINE" || bad="$bad\n  SPINE regex does not match $path (listed under \"$key\")"
  done
  while IFS= read -r alt; do
    [ -n "$alt" ] || continue
    local hit=0
    for row in "${SPINE_MAP[@]}"; do
      echo "${row#*::}" | grep -qE "$alt" && { hit=1; break; }
    done
    [ "$hit" -eq 1 ] || bad="$bad\n  SPINE alternative $alt matches no SPINE_MAP sample path (add a row, or drop the alternative)"
  done < <(printf '%s' "$SPINE" | perl -ne 'my ($d,$cur)=(0,""); for my $c (split //) { if ($c eq "(") {$d++} elsif ($c eq ")") {$d--} if ($c eq "|" && $d==0) { print "$cur\n"; $cur="" } else { $cur .= $c } } print "$cur\n"')
  if [ -n "$bad" ]; then printf '%b\n' "$bad" | sed '/^$/d'; return 1; fi
}
run_gate spine-list-agreement spine_agreement
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
