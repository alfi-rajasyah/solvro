# Known Issues & Pending Work

Tracking doc for Solvro, compiled from **CLAUDE.md** canonical decisions,
**CHANGELOG.md**, and working-session history (as of 2026-06-03). Scope: known
bugs, doc/reality drift, deferred decisions, and follow-ups — not the full
product backlog. Update or prune items as they're resolved.

---

## Known bugs / inconsistencies

### Documentation vs. reality drift
- **DESIGN.md is gitignored and untracked.** CLAUDE.md lists DESIGN.md as a
  canonical source-of-truth, yet it's in `.gitignore`, so spec edits (radius
  scale, body weight 450, body-sm 15px, label-caps 12px, the Elitery-green /
  charcoal palette) live only on disk and never get committed. The
  `tailwind.config.ts` mirror **is** tracked, so the two can silently diverge.
  Decide: un-ignore DESIGN.md (recommended) or stop treating it as canonical.
- **DESIGN.md typo:** the light-mode `surface-container` value is written
  `#ebebе7` with a stray **Cyrillic** `е`. Implemented as `#ebebe7` → fix in
  DESIGN.md.

### Dev environment
- **Tailwind config changes need a frontend container restart.** Tailwind caches
  its config inside the running Vite process, so `tailwind.config.ts` edits
  silently no-op in dev until `docker compose restart frontend` (+ browser
  hard-refresh). The worse variant — a generated `tailwind.config.js` shadowing
  the `.ts` — was fixed (CHANGELOG 2026-06-03, `tsconfig.node.json` `outDir`).

---

## Pending features (not yet built)

- **Secure Ingestion Port** (`POST /webhook/blueprint`) — top-priority SA→TAM
  handoff. The `Blueprint` model exists, but there is **no** webhook route, no
  API-key auth, and no `blueprintId` FK on `Task` to tag AI-Breakdown cards.
  (Spec in CLAUDE.md.)
- **Reports screen revamp** — an export layer exists
  (`frontend/src/lib/export/projectExport.ts`); verify it produces the full
  CLAUDE.md export packet (identity / health / phase breakdown / task signals /
  open risks / customer-facing notes from the last 14 days) and offers both
  copy-to-clipboard and `.md` download.
- **Work Logs / Utilization** (`WorkLogs.tsx`) — placeholder only, now hidden
  from the sidebar; awaits the iTop API spec. Rename to "Utilization" when
  implemented.
- **Task attachments** — `TaskFormModal.tsx` has an "Attachments placeholder"
  block with no implementation.

---

## Deferred (explicit, by decision)

- **Critical-path highlighting** — deferred. (Diagram CSS already has `data-cp`
  hooks and `--cp-stroke`, but the feature is off.)
- **Network Diagram tab** — per CLAUDE.md, "never built / do not implement,"
  although dependency-diagram primitives exist for the dependency view
  (`@xyflow/react`, the `dependencies` routes, `.diagram-*` CSS).
- **Native AI summarisation inside Solvro** — deferred indefinitely; the export
  packet is designed for external AI tools.

---

## Tech debt / follow-ups from recent work

- **Service-mapping mutations lack the optimistic-update pattern** (2026-07-15
  code review, deferred as inherited debt): `useUpdateProjectServices` and the
  pre-existing `useUpdateCustomerServices` (`frontend/src/lib/queries.ts`) use
  plain `onSuccess` + invalidate. The `ServiceMappingList` checkbox toggles and
  tool chips disable while saving, so it's correct but not instant. Follow-up:
  add `onMutate` snapshot → optimistic `services[]` patch → `onError` rollback →
  `onSettled` invalidate, for both hooks together.
- **Inactive services can still be assigned** — the mapping picker shows
  deactivated services dimmed but toggleable (pre-existing), and the project
  tab's "Add all subscribed" carries inactive legacy subscriptions over without
  filtering. Consistent behavior, but a product call is pending on whether
  `active: false` should block *new* assignments.
- **`ensureTaskVisible` does 2 DB round-trips** per task mutation (visibility
  check, then the write). Folding the filter into the `where` isn't possible
  with Prisma `update` (unique `where` only). Watch against the sub-200ms NFR;
  revisit with an `updateMany` + returned-row approach if profiling flags it.
- **Sidebar nav text still uses cool `slate-*` greys** instead of DESIGN.md's
  warm `#888780` for inactive items. Deferred — needs a small set of *fixed*
  always-dark text tokens (the theme-flipping `secondary` token renders too dark
  on the always-dark rail). Contrast is fine; it's a tint nit.
- **Admin active-status pill lost its `hover:bg-emerald-200`** during the
  emerald → chip-token migration (no chip hover token exists). Minor; status
  pills arguably shouldn't have a hover state.
- **Caps-label variants not migrated to the token:** 4× `text-[11px] uppercase`
  (no bold) and 1× `text-[11px] font-semibold uppercase` were left as-is
  (adopting the 700-weight `text-label-caps` token would change their weight).
  Decide whether to align them.
- **`ProjectOverview` KPI value uses `font-body`**, not the reviewer-suggested
  `text-data-mono` (that token's fixed 13px would shrink the `text-3xl` stat and
  its weight 500 would fight `font-bold`). Working as intended — noted in case a
  future review re-flags it.
- **Favicon** is the flat on-light mark (no green tile); may read weakly on dark
  browser tab strips. Could add a `prefers-color-scheme` SVG favicon later.

---

## Verification debt

- **Visual sign-off pending.** This session's brand/design changes — Elitery
  palette migration, the Elitery logo + theme-adaptive `BrandMark`, login
  two-tone split + always-dark pin + 40px hero, sidebar charcoal + dark pin,
  app-wide card drop-shadow removal, body-sm 15px, and the label-caps 12px token
  migration — are CSS- and type-verified but **not yet eyeballed** in the running
  app. Recommend a pass across Overview, Projects, Customers, Admin, Daily
  Review, and Login (both light and dark themes) before release.
