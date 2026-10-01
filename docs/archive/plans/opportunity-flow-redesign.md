# Implementation Plan: Opportunity Flow Redesign

**Branch:** `feat/opportunity-flow-redesign` — cut from `origin/develop` @ `9f5fc20` (`git fetch origin` first; local `develop` was level with origin on 2026-09-25).
**Phase = branch = one PR into `develop`.** Tasks = commits. No commit or PR without explicit user approval.
**Source:** VP spec `opportunity-pipeline-flow-spec (1).md` (2026-09-25, Indonesian, 10 sections). It replaces the Pipeline's single 9-value stage column with four independent attributes: `stage` (6 values, new order), `sub_status`, `status_tag`, `outcome` (+ reason), plus `last_activity_at` and an SLA-driven idle alert. Won, Drop and Hold stop being stages; a closed or held deal keeps the stage it stalled in.
**Review surfaces (approved 2026-09-25, "Use Option A" + "Ok"):** proposal page https://claude.ai/artifact/VYpHQCqJbMWwKz3kphj9tC · mockup canvas https://claude.ai/artifact/BCPLoPVxWhoY69C9RduujA (8 artboards: board today / after, card menu, skip reason, Close deal dialog, detail header open / closed, Closed view).

---

## 1. Decisions (settled — do not re-ask)

| # | Decision | Detail |
|---|---|---|
| D1 | **Idle alert is computed on read, never by a job** (user: "Use Option A", 2026-09-25) | The serializer derives `idle` from `lastActivityAt`, `waitingInputSince` and the SLA table (§3.6). No scheduler, no stored `idle_alert` tag, no run log. The 2026-08-14 no-background-jobs decision stands. |
| D2 | Stage enum rebuilt: 6 values, the spec's order | `ASSESSMENT → TECHNICAL_CLARIFICATION → POC → RFP → DELIVER_PROPOSAL → WAITING_RESPONSE`. `WON`, `DROP`, `HOLD` leave the enum. Declaration order stays load-bearing (list sort = board order). DB labels stay Velora's lowercase literals (`deliver_proposal` keeps its label; display "Delivered Proposal"). Postgres cannot drop or reorder enum values in place, so the migration creates a new type and casts (§2.3). |
| D3 | `owner` is derived, not stored | `client` when `stage === WAITING_RESPONSE`, else `sa`. Returned by the API, never a column. |
| D4 | Any stage may move to any stage; the Technical Clarification → RFP jump requires a reason | `POST /:id/move` gains an optional `reason`; 400 without it on that one transition. Stored in the activity note. No forward-only enforcement. |
| D5 | One Close deal action for Won / Lost / Cancelled; the stage is locked, never reset | New `POST /:id/close` and `POST /:id/reopen`. Category required for Lost and Cancelled from the spec's lists; optional note (≤ 500). `closedAt` added for every outcome; `wonAt` stays (KPI "Won this month", trend chart, DealCard). Reopen keeps the stage and is refused on a deal already handed off to a project. Won keeps the confirm + the "Create project" offer. |
| D6 | Backfill inside the migration | Won → `outcome = won`; Drop → `outcome = cancelled`, category `other`, note "Backfilled from Drop" (pending the VP's answer, §10 Q1); Hold → `statusTag = hold`. The stage is recovered from the latest "Moved from X to Y" activity note, else `preHoldStage` (Hold), else the spec default (Won → Delivered Proposal, Drop/Hold → Assessment). Every open deal on an SA stage gets `subStatus = progress`. `lastActivityAt` = newest of `updatedAt` and the latest note. |
| D7 | Seeded `SALES` role = `pipeline:view` only | Sales reads the pipeline and posts notes (the spec's reply channel). The SA clears "Waiting for Sales input" by hand ("Input received"). No automatic reset in this phase. |
| D8 | SLA values are constants; working days = Mon–Fri minus Indonesian public holidays | `backend/src/lib/pipelineSla.ts` holds spec §7's 6 rows. `date-holidays` (already a dependency, used by `routes/holidays.ts`) supplies the holidays. No Admin editor in this phase. |
| D9 | Import accepts the 6 funnel stages only | A "Won" / "Drop" / "Hold" row is rejected with the reason, like "Hold" today. |
| D10 | Owner badge only on Waiting Response cards ("Client") | The SA owner is implied by the column on the other 5. The detail header shows "Owner · SA / Client" always. |
| D11 | Closed deals leave the default board | Kanban and List honor an Active / Closed switch (`?deals=`). Swimlane and Quarter show active deals only. Analytics keep reading the full list. |
| D12 | Chips stay bespoke | New `OwnerChip`, `SubStatusChip`, `TagChip`, `IdleChip`, `OutcomeChip` sit beside `StageChip` on `Chip` from `StatusChip.tsx`. Never `reui/badge` (guardrail). Tones per `docs/DESIGN.md`; PoC column header carries the amber tone (spec §3, hand-off risk point). |
| D13 | Unchanged | PIC / assign rules and `assertCanWriteOpportunity`, links, activity timeline, the 3-step import dialog, permissions strings, deal visibility, `stageOrder` semantics, the date contract, the handoff form and its request schema, the Reports standing decision (new charts land on the Executive page). |
| D15 | A same-stage reorder is not activity (orchestrator call at phase review, 2026-09-25 — the user may override) | Dragging a card within its column writes no note and does not bump `lastActivityAt`; only a real stage change, a close / reopen, a flag change, a note or a link does. Otherwise the cheapest way to clear an idle alert would be to nudge the card. |
| D16 | Edit stays available on a closed deal | The backend accepts a plain-field PATCH on a closed deal (only `subStatus` / `statusTag` are refused), so the detail page's Edit button is gated on ownership alone (`canEditDealFields`), not on `outcome`. Hold and Delayed are one exclusive tag: the UI shows the setter for the other tag only when no tag is set; a swap through the API logs both transitions. |
| D14 | Out of scope | A scheduled job of any kind · notifications · an Admin SLA editor · automatic sub-status reset on a Sales note · forward-only transitions · re-importing from the old Velora tracker (`backend/scripts/import-velora.ts` only gets the minimal edit that keeps it compiling and correct). |

## 2. Data model — `backend/prisma/schema.prisma` (**spine**) + one migration (**spine**)

### 2.1 Enums

```prisma
enum PipelineStage {            // order = board order (list route sorts stage asc)
  ASSESSMENT              @map("assessment")
  TECHNICAL_CLARIFICATION @map("technical_clarification")
  POC                     @map("poc")
  RFP                     @map("rfp")
  DELIVER_PROPOSAL        @map("deliver_proposal")
  WAITING_RESPONSE        @map("waiting_response")
}
enum PipelineSubStatus   { PROGRESS @map("progress")  WAITING_SALES_INPUT @map("waiting_sales_input") }
enum PipelineStatusTag   { HOLD @map("hold")  DELAYED @map("delayed") }
enum PipelineOutcome     { WON @map("won")  LOST @map("lost")  CANCELLED @map("cancelled") }
enum PipelineOutcomeReason {
  PRICE @map("price")  COMPETITOR @map("competitor")  TECHNICAL @map("technical")
  BUDGET_WITHDRAWN @map("budget_withdrawn")  PROJECT_CANCELLED @map("project_cancelled")  LOST_CONTACT @map("lost_contact")
  OTHER @map("other")
}
```

Update the enum's header comment: it no longer mirrors "all 9 stages of the reference app"; it mirrors the 2026-09-25 flow spec, and the 3 terminal / parked states moved to `outcome` and `statusTag`.

### 2.2 `Opportunity` fields

Add: `subStatus PipelineSubStatus? @map("sub_status")` · `waitingInputSince DateTime? @map("waiting_input_since")` · `statusTag PipelineStatusTag? @map("status_tag")` · `outcome PipelineOutcome?` · `outcomeReasonCategory PipelineOutcomeReason? @map("outcome_reason_category")` · `outcomeReason String? @map("outcome_reason")` · `closedAt DateTime? @map("closed_at")` · `lastActivityAt DateTime @default(now()) @map("last_activity_at")`. Add `@@index([outcome])`.
Remove: `preHoldStage`. Keep: `wonAt` (comment: set only by `/close` with `WON`, cleared by `/reopen`), `stageOrder`, `projectId`, everything else.
Field comments state the writer of each (route-owned, never client-writable): `waitingInputSince` ← PATCH sub-status; `closedAt`/`wonAt`/`outcome*` ← `/close` + `/reopen`; `lastActivityAt` ← every writer (§3.7).

### 2.3 Migration `backend/prisma/migrations/<ts>_opportunity_flow_redesign/migration.sql` — hand-written

`npx prisma migrate dev --create-only --name opportunity_flow_redesign` (with `-it`), then replace the generated SQL. Prisma's generated SQL would fail on rows holding `won`/`drop`/`hold`. Order:

1. `CREATE TYPE "PipelineSubStatus"`, `"PipelineStatusTag"`, `"PipelineOutcome"`, `"PipelineOutcomeReason"`; `ALTER TABLE opportunities ADD COLUMN` the 8 columns of §2.2 (`last_activity_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`).
2. Backfill (plain SQL, one `UPDATE … FROM (SELECT …)` per group; a helper CTE `last_move` = for each opportunity the newest `opportunity_activities.note` matching `^Moved from (.+) to (Won|Drop|Hold)$`, its source label mapped by `CASE` — `Assessment→assessment`, `RFP→rfp`, `PoC→poc`, `Technical Clarification→technical_clarification`, `Delivered Proposal→deliver_proposal`, `Waiting Response→waiting_response`; any other label → NULL):
   - `stage = 'won'`: `outcome='won'`, `closed_at = COALESCE(won_at, updated_at)`, `stage_next = COALESCE(last_move, 'deliver_proposal')`.
   - `stage = 'drop'`: `outcome='cancelled'`, `outcome_reason_category='other'`, `outcome_reason='Backfilled from Drop'`, `closed_at = updated_at`, `stage_next = COALESCE(last_move, 'assessment')`.
   - `stage = 'hold'`: `status_tag='hold'`, `stage_next = COALESCE(pre_hold_stage, last_move, 'assessment')`.
   - other rows: `stage_next = stage`.
   - `sub_status = 'progress'` where `outcome IS NULL AND stage_next <> 'waiting_response'`.
   - `last_activity_at = GREATEST(updated_at, (SELECT MAX(created_at) FROM opportunity_activities a WHERE a.opportunity_id = o.id))` (NULL-safe: `COALESCE` the subquery to `updated_at`).
   Implement `stage_next` as a temporary `TEXT` column `stage_next`, filled by the steps above.
3. Enum swap: `CREATE TYPE "PipelineStage_new" AS ENUM (6 labels in D2 order)`; `ALTER TABLE opportunities ALTER COLUMN stage DROP DEFAULT`; `ALTER COLUMN stage TYPE "PipelineStage_new" USING (stage_next::"PipelineStage_new")`; `SET DEFAULT 'assessment'`; `DROP TYPE "PipelineStage"`; `ALTER TYPE "PipelineStage_new" RENAME TO "PipelineStage"`; `DROP COLUMN stage_next`; `DROP COLUMN pre_hold_stage`.
4. `stage_order` repack per stage after the swap (Won/Drop/Hold rows join their recovered stage at the end): `UPDATE … SET stage_order = rn - 1 FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY stage ORDER BY (outcome IS NOT NULL), stage_order, id) rn …)` — closed deals sort after open ones inside a stage, dense `0..n-1`.
5. `CREATE INDEX "opportunities_outcome_idx" ON opportunities(outcome)`.

Verification the implementor runs and reports: on a scratch DB seeded with one deal per old stage (incl. a Hold with `pre_hold_stage`, a Won with a "Moved from RFP to Won" note, a Drop without any note), `prisma migrate deploy` then a `SELECT stage, outcome, status_tag, sub_status, closed_at FROM opportunities` that matches D6. `backend/test`'s globalSetup applies migrations to the `_test` DB, so the whole suite also proves the file applies cleanly on an empty DB.

### 2.4 Other backend files that name the removed values (must compile after §2.1)

`backend/prisma/seed.ts` (add `SALES: ["pipeline:view"]` to `ROLE_PERMISSIONS`; if it seeds opportunities in `WON`/`DROP`/`HOLD`, move them to `outcome` / `statusTag`), `backend/test/testAuth.ts` (mirror the `SALES` role), `backend/scripts/import-velora.ts` (map `won` → `outcome: WON` + `wonAt`, `drop` → `outcome: CANCELLED` + `other`, `hold` → `statusTag: HOLD` with the stage from `pre_hold_stage`; keep the script otherwise untouched — D14).

## 3. API — `backend/src/routes/opportunities.ts`, `opportunityItems.ts`, `lib/pipelineSla.ts` (new), `lib/workingDays.ts` (new)

Not on the spine list; permission and state logic, so the phase review reads them with care. Every route keeps its current gate (`assertCanWriteOpportunity(req.user, "edit", current)` for writes; `pipeline:view` for reads).

### 3.1 Serializer (`serializeOpportunity`)

Adds `owner: "sa" | "client"` (D3), `idle: { level: "none" | "warning" | "critical", days: number, basis: "waiting" | "activity" | null }` (§3.6, `now` computed once per request), and the ISO instants `waitingInputSince`, `closedAt`, `lastActivityAt`. `outcome`, `outcomeReasonCategory`, `outcomeReason`, `subStatus`, `statusTag` pass through. `preHoldStage` is gone.

### 3.2 `POST /` (create) and `POST /import`

`stage` optional among the 6. New rows: `subStatus = PROGRESS` unless `stage === WAITING_RESPONSE` (then `null`); `lastActivityAt = now`. Create keeps `.strict()` and rejects `outcome`, `statusTag`, `subStatus`, `closedAt`, `wonAt`. The `stage === WON → wonAt` branches go. `IMPORT_STAGE_MAP` shrinks to the 6 labels; its comment and the error text list exactly those 6 (D9).

### 3.3 `PATCH /:id`

Schema gains `subStatus: z.enum(["PROGRESS","WAITING_SALES_INPUT"]).nullable().optional()` and `statusTag: z.enum(["HOLD","DELAYED"]).nullable().optional()`. Still `.strict()`, still rejects `stage`, `stageOrder`, `outcome*`, `closedAt`, `wonAt`, `waitingInputSince`, `lastActivityAt`.
Rules, in order, after the ownership gate:
- `subStatus` or `statusTag` present and `current.outcome !== null` → 400 `deal_closed` ("Reopen the deal first").
- `subStatus` non-null and `current.stage === WAITING_RESPONSE` → 400 `sub_status_not_allowed`.
- Real transition to `WAITING_SALES_INPUT` → `waitingInputSince = now`; to `PROGRESS` or `null` → `waitingInputSince = null`. Same value again → no change, no note.
- Activity notes on real changes only: "Waiting for Sales input", "Input received", "Put on hold", "Hold released", "Marked as delayed", "Delay cleared". One transaction with the update. Plain field edits (title, value…) write no note, as today.

### 3.4 `POST /:id/move`

Body `{ stage, stageOrder, reason?: string(1..500) }`. `current.outcome !== null` → 409 `closed`. `current.stage === TECHNICAL_CLARIFICATION && body.stage === RFP && !reason` → 400 `skip_reason_required`. Entering `WAITING_RESPONSE` sets `subStatus = null`, `waitingInputSince = null`; leaving it sets `subStatus = PROGRESS`. Note: `Moved from X to Y`, or `Moved from Technical Clarification to RFP, PoC skipped: <reason>` for the jump. The `wonAt` / `preHoldStage` bookkeeping is removed. Same-stage reorders keep writing no note.

### 3.5 `POST /:id/close` (new) and `POST /:id/reopen` (new)

`close` body `.strict()`: `{ outcome: "WON"|"LOST"|"CANCELLED", reasonCategory?: PipelineOutcomeReason, reason?: string(≤500) }`.
1. `findOpportunityOr404`; ownership gate (edit).
2. `current.outcome !== null` → 409 `already_closed`.
3. `WON`: `reasonCategory`/`reason` present → 400 `reason_not_allowed`. `LOST`: category required (400 `reason_required`) and ∈ {PRICE, COMPETITOR, TECHNICAL, OTHER} (400 `reason_category_invalid`). `CANCELLED`: category required and ∈ {BUDGET_WITHDRAWN, PROJECT_CANCELLED, LOST_CONTACT, OTHER}. Export the two lists as `REASONS_BY_OUTCOME` for the tests and mirror them in the frontend.
4. One transaction: set `outcome`, `outcomeReasonCategory`, `outcomeReason`, `closedAt = now`, `wonAt = outcome === WON ? now : null`, `subStatus = null`, `waitingInputSince = null`, `statusTag = null`, `lastActivityAt = now`; note `Closed as Won` / `Closed as Lost (Competitor)` / `Closed as Cancelled (Budget withdrawn): <reason>` (label maps shared with the frontend; the note suffix only when a note was given).
5. 200 `serializeOpportunity`. The stage and `stageOrder` do not change (D5).

`reopen`, no body: 404 → gate → `current.outcome === null` → 409 `not_closed`; `current.projectId !== null` → 409 `handed_off` ("This deal already became a project"). Clears `outcome`, both reason fields, `closedAt`, `wonAt`; `subStatus = stage === WAITING_RESPONSE ? null : PROGRESS`; note `Reopened`; `lastActivityAt = now`.

`POST /:id/handoff`: both `not_won` checks read `outcome !== PipelineOutcome.WON` (message: "Only a deal closed as Won can be handed off to a project"). Nothing else changes; the request schema stays the exported project-create schema.

### 3.6 `backend/src/lib/pipelineSla.ts` (new)

```ts
export const PIPELINE_SLA: Record<PipelineStage, { waitingDays: number | null; idleWarningDays: number; idleCriticalDays: number | null }> = {
  ASSESSMENT: { waitingDays: 2, idleWarningDays: 5, idleCriticalDays: null },
  TECHNICAL_CLARIFICATION: { waitingDays: 2, idleWarningDays: 5, idleCriticalDays: null },
  POC: { waitingDays: 3, idleWarningDays: 7, idleCriticalDays: null },
  RFP: { waitingDays: 2, idleWarningDays: 5, idleCriticalDays: null },
  DELIVER_PROPOSAL: { waitingDays: 3, idleWarningDays: 7, idleCriticalDays: null },
  WAITING_RESPONSE: { waitingDays: null, idleWarningDays: 7, idleCriticalDays: 14 },
};
export function computeIdle(deal: Pick<Opportunity, "stage"|"outcome"|"subStatus"|"waitingInputSince"|"lastActivityAt">, now: Date): IdleState
```
Rules: closed → `none`, days 0, basis null. `subStatus === WAITING_SALES_INPUT && waitingInputSince` → basis `waiting`, `days = workingDaysBetween(waitingInputSince, now)`, `warning` when `days > waitingDays`, `critical` when `days > 2 × waitingDays`. Else basis `activity`, `days = workingDaysBetween(lastActivityAt, now)`, `warning` when `days > idleWarningDays`, `critical` when `idleCriticalDays !== null && days > idleCriticalDays`. Header comment cites spec §7 and D1 ("computed on every read; the numbers are placeholders the team validates").

### 3.7 `backend/src/lib/workingDays.ts` (new) + `lastActivityAt` bumps

`workingDaysBetween(from: Date, to: Date): number` — count of Monday–Friday calendar days (UTC) strictly after `from`'s day up to and including `to`'s day, minus Indonesian public holidays. Move `getHolidaysForYear` (the `date-holidays("ID")` + per-year cache) out of `routes/holidays.ts` into `lib/holidays.ts`; both the route and `workingDays.ts` import it. `to < from` → 0. Comment the UTC-day choice (the app's plain-day contract; WIB is UTC+7, so a boundary can differ by a day — accepted, same as the rest of the date contract).

Every writer bumps `lastActivityAt = now` in its own transaction: `/move`, `/close`, `/reopen`, `PATCH /:id` (any accepted field), `/assign` (when the PIC changes), and in `opportunityItems.ts` the activity-note create and the link create / patch / delete. Import sets it on insert (§3.2). `DELETE` needs nothing.

## 4. Frontend

### 4.1 Types and labels — `frontend/src/lib/pipelineFormat.ts`

`PipelineStage` = the 6 literals; `STAGE_LABELS` / `STAGE_ORDER` follow D2 (`DELIVER_PROPOSAL: "Delivered Proposal"`). Delete `TERMINAL_STAGES`. `STAGE_ALPHA` shrinks to 6 real steps (the DROP/HOLD `0` placeholders and their comment go). Add `PipelineSubStatus`, `PipelineStatusTag`, `PipelineOutcome`, `PipelineOutcomeReason`, `IdleLevel`; label maps `SUB_STATUS_LABELS`, `TAG_LABELS`, `OUTCOME_LABELS` (Won / Lost / Cancelled), `OUTCOME_REASON_LABELS` (Price, Competitor, Technical, Budget withdrawn, Project cancelled, Lost contact, Other), `REASONS_BY_OUTCOME` (mirror of §3.5), `isClosed(deal)`, `isSkipJump(from, to)` (TC → RFP), `ownerOf(stage)`.

### 4.2 Data layer — `frontend/src/lib/queries.ts` (**spine**, instant review after T3)

`Opportunity` gains `subStatus`, `waitingInputSince`, `statusTag`, `outcome`, `outcomeReasonCategory`, `outcomeReason`, `closedAt`, `lastActivityAt`, `owner`, `idle` and loses `preHoldStage`. `useMoveOpportunity` payload gains `reason?`; its optimistic write keeps the same shape. `useUpdateOpportunity` accepts the two new fields and now also invalidates `pipelineKeys.activities(id)` (PATCH can write notes). New `useCloseOpportunity()` (`POST /opportunities/:id/close`, body `{ outcome, reasonCategory?, reason? }`) and `useReopenOpportunity()` (`POST …/reopen`), both invalidating list, detail and activities — not optimistic (dialog submits). Placed next to `useAssignOpportunity`.

### 4.3 Gates and shared components

- `frontend/src/components/pipeline/boardLogic.ts`: delete `needsTerminalConfirm`. `canDragDeal` returns false when `deal.outcome !== null`. Add `canCloseDeal(user, deal)` = the edit gate and `outcome === null`; `canReopenDeal(user, deal)` = the edit gate, `outcome !== null`, `projectId === null`.
- `frontend/src/components/pipeline/adapter.ts`: `PIPELINE_STAGES` = the 6; `projectToColumns` keeps its contract over whatever list it is given (the container passes active deals only).
- `frontend/src/components/StageChip.tsx`: 6 tones — ASSESSMENT gray, TECHNICAL_CLARIFICATION / POC / RFP blue, DELIVER_PROPOSAL amber, WAITING_RESPONSE violet. The `pause_circle` branch goes.
- `frontend/src/components/PipelineFlagChips.tsx` (new, bespoke on `Chip`): `OwnerChip` (renders only for `client`: outlined chip "Client"; `showSa` prop for the detail header), `SubStatusChip` (renders only for WAITING_SALES_INPUT: amber, `schedule` glyph, "Waiting Sales input · N wd" with `N` from `idle.days` when `idle.basis === "waiting"`), `TagChip` (HOLD gray + `pause_circle`; DELAYED violet + `event`), `IdleChip` (warning amber, critical rose, `warning` glyph, "Idle · N wd"; renders only for level ≠ none), `OutcomeChip` (WON emerald + `check_circle`, LOST rose + `cancel`, CANCELLED gray + `block`; label "Lost · Competitor" when a category exists).
- `frontend/src/components/CloseDealDialog.tsx` (new, on `Modal`, `max-w-lg`): title "Close deal"; subtitle `{title} · {customer} · {value} · stays in {StageChip}`; three radio cards Won / Lost / Cancelled (native `<input type="radio">` + `<label>`, per the mockup); "Reason category" `<select>` filtered by `REASONS_BY_OUTCOME` (hidden for Won); "Note (optional)" textarea, 500 max; footer Cancel · **Close as {outcome}** (primary tone for Won, destructive for the others); inline `ApiError`. Props: `deal`, `open`, `onClose`, `onClosed(updated)`. Uses `useCloseOpportunity`.
- `frontend/src/components/MoveReasonModal.tsx` (new, on `Modal`, `max-w-md`): title "Move to RFP and skip PoC?"; subtitle `{title} · Technical Clarification → RFP`; one required text input "Reason for the skip" (500 max); caption "Saved in the activity log"; footer Cancel · **Move to RFP**. Returns the reason to the caller; the caller performs the move.

### 4.4 Board — `SolvroPipelineKanban.tsx`, `OpportunityCard.tsx`, `Pipeline.tsx`, views

- `Pipeline.tsx`: a second segmented control after the view switcher, "Active · N" / "Closed · N", persisted as `?deals=active|closed` (default active) with the same functional `setSearchParams` pattern as `?view=`. Kanban and List receive `deals`; Swimlane and Quarter always receive the active list and show a one-line caption "Active deals" (D11). The Closed board is `frontend/src/pages/views/PipelineClosed.tsx` (new): three columns Won / Lost / Cancelled (count chips in their tones), cards = title link, customer, value, `StageChip` (the locked stage), "Won 12 Sep 2026 · PIC", `OutcomeChip` reason, and for a Won deal without a project the "Create project" offer (reuses `HandoffProjectModal`) or "View project" link. Four summary tiles above (Win rate = won ÷ closed this year, Won value, Lost value + top reason, Cancelled value + top reason) from `analytics.ts` §4.6.
- `SolvroPipelineKanban.tsx`: receives active deals only. Drag: a TC → RFP drop opens `MoveReasonModal`, then commits the move with the reason; every other drop commits directly. The WON/DROP `ConfirmModal` branch and `needsTerminalConfirm` import go. `justWonDeal` / `handoffDeal` now come from the card menu's Close (Won) result, not from a drag. Mounts `CloseDealDialog` once for the card that requested it.
- `OpportunityCard.tsx`: badges row after the product line — `OwnerChip`, `SubStatusChip`, `TagChip`, `IdleChip` (only the ones that render). The "Held from" cue goes. A ⋯ `DropdownMenu` (the `ui/dropdown-menu` the detail page already uses) at the title row's end, shown when the caller passes `canEdit`: **Open deal**; separator; **Waiting for Sales input** / **Input received** (toggle; hidden on Waiting Response); **Hold** / **Release hold**; **Mark delayed** / **Clear delayed**; separator; **Close deal…** (error tone). The toggles call `useUpdateOpportunity` with the one field; Close opens `CloseDealDialog`. `aria-label="More actions"` on the trigger.
- `PipelineList.tsx`: stage accessor over the new `STAGE_ORDER`; new sortable columns **Outcome** (`OutcomeChip`), **Tag** (`TagChip`), **Sub-status** (`SubStatusChip`), **Idle** (`IdleChip`, sorted by `idle.days`). With `deals=closed` the grid lists closed rows and adds **Closed** (date). Skeleton metas as the existing columns.
- `PipelineSwimlane.tsx` / `swimlaneLogic.ts`: `SWIMLANE_STAGES` = the 6; the `DROP` filters and their comments go; lane summaries count active deals (all of them, by D11). `PipelineQuarter.tsx`: unchanged logic over the active list.
- KPI bar (`PipelineKpiBar.tsx`, `kpi.ts`): `isActiveDeal(deal: Pick<Deal,"outcome">)` = `outcome === null`; `computePipelineKpis` adds `idleWarning`, `idleCritical`; the bar gains a fifth tile **Idle alerts** (`warning` icon, rose when critical > 0, hint "N critical · M warning"); `md:grid-cols-5`. Funnel strip over the 6 stages of active deals; the DROP/HOLD literal-class entries and their comments go. "Won this month" keeps reading `wonAt` among `outcome === WON`.

### 4.5 Detail page — `OpportunityDetail.tsx`

Header per the mockups. Chips row: stage chip as a menu over the 6 stages (a TC → RFP pick opens `MoveReasonModal`); `OwnerChip showSa`; `SubStatusChip`; `TagChip`; `IdleChip`; caption "Last activity {date} · SLA for this stage: {waiting} wd waiting, {idle} wd idle" (SLA table mirrored as `PIPELINE_SLA_HINT` in `pipelineFormat.ts`, one source with the backend's numbers — the backend is authoritative; the hint is display only). Actions (edit-gated): **Waiting for Sales input** / **Input received**, **Hold** / **Release hold**, **Mark delayed** / **Clear delayed**, **Close deal** (outline error tone), then the existing Assign PIC / Edit / Delete. `APPEND_TO_STAGE` and the stage-menu move path stay.
Closed deal: `OutcomeChip`, the stage chip read-only with a `lock` glyph, "Closed {date} by {user} · {note}" caption, **Reopen** (outline primary, shown by `canReopenDeal`), no flag toggles, no Close. "Create project" / "View project" key on `outcome === "WON"` instead of `stage === "WON"`; the `justWonOffer` state is set by a successful `CloseDealDialog` result with `outcome === WON`. Meta grid adds **Waiting on Sales since** (open, waiting) or **Stage at close** / **Outcome** / **Closed** (closed).

### 4.6 Import, analytics, Overview, project side

- `importParse.ts`: `IMPORTABLE_STAGES = STAGE_ORDER` (the `HOLD` filter and comment go); `TEMPLATE_HEADERS` unchanged; the template's example row uses "Technical Clarification". `PipelineImportDialog.tsx`: help text lists the 6 stages.
- `analytics.ts`: `computeStageFunnel` over active deals per stage (6); `computePicLeaderboard` — `won` = `outcome === "WON"`, `dropped` → renamed `lostOrCancelled` = `outcome !== null && outcome !== "WON"` (table column "Lost / Cancelled"); `HEATMAP_STAGES` = the 6, heatmap counts active deals; `dealsForPic` sorts by the new `STAGE_ORDER`; new `computeCloseReasons(deals, year)` → `{ stage, category, count, value }[]` for LOST and CANCELLED, plus `computeWinRate(deals, year)` = won ÷ closed by `closedAt` year. `PipelineAnalyticsSection.tsx`: stage color map = 6 entries (the WON/DROP/HOLD entries and the comment go); new **Close reasons by stage** table on `reui/data-grid` dense (Stage, Outcome, Reason, Count, Value) and a **Win rate** tile.
- `PipelineOverviewPanel.tsx`: On Hold = `statusTag === "HOLD"`; the distribution over the 6 stages of active deals; the WON/DROP/HOLD class entries go.
- `DealCard.tsx` (project Overview tab): shows `OutcomeChip` (Won) and `StageChip` (stage at close); `formatWonAt` unchanged. `PicDrillDownModal.tsx`: `StageChip` + `OutcomeChip` when closed; sort by `STAGE_ORDER`.
- `OpportunityFormModal.tsx`: the create-mode stage select lists the 6; nothing else.
- `frontend/src/lib/auth.tsx`: no permission change. The seeded `SALES` role appears in Admin › Roles from the DB.

## 5. Tests

### Backend (`backend/test/`) — `opportunities.test.ts` (rewrite the WON/DROP/HOLD cases), `opportunityHandoff.test.ts`, `opportunityImport.test.ts`, `opportunityItems.test.ts`, new `opportunityClose.test.ts`, `pipelineSla.test.ts`, `workingDays.test.ts`

1. Move: 6 stages any-to-any; TC → RFP without reason → 400 `skip_reason_required`, with reason → 200 and the note text; moving into / out of Waiting Response clears / sets `subStatus`; a closed deal → 409 `closed`; the order-dependent `stageOrder` assertion flagged in `docs/ISSUES.md` (line 196) is rewritten to assert relative order among the test's own rows.
2. PATCH: `subStatus` transitions set / clear `waitingInputSince` and write the 2 notes once; `statusTag` HOLD / DELAYED / null write their notes; on Waiting Response `subStatus` → 400; on a closed deal → 400 `deal_closed`; `stage` in the body still → 400.
3. Close: Won (no reason) → `outcome`, `closedAt`, `wonAt` set, flags cleared, note "Closed as Won"; Won with a category → 400; Lost without category → 400 `reason_required`; Lost with a Cancelled category → 400 `reason_category_invalid`; Cancelled with category + note → note text; twice → 409; `edit_own` on a foreign deal → 403; the stage and `stageOrder` unchanged.
4. Reopen: clears everything, `subStatus` back to progress (or null on WR), note "Reopened"; open deal → 409 `not_closed`; handed-off deal → 409 `handed_off`.
5. Handoff: a deal in Waiting Response with `outcome = WON` hands off; a deal in the same stage without an outcome → 409 `not_won`.
6. Import: "Won" / "Drop" / "Hold" rows rejected with the 6-stage message; "Technical Clarification" imports with `subStatus = progress`, "Waiting Response" with null.
7. `lastActivityAt`: bumped by move, close, PATCH, a new note, a link create / delete; unchanged by a same-PIC assign.
8. `computeIdle`: table-driven over the 6 rows of §3.6 (none / warning / critical, waiting vs activity basis, closed → none). `workingDaysBetween`: a weekend span, a span over 17 August (Hari Kemerdekaan), `to < from` → 0, same day → 0.
9. Serializer: `owner` per stage; `idle` present on list and detail.

### Frontend unit — `pipelineFormat`, `boardLogic.test.ts`, `adapter.test.ts`, `kpi.test.ts`, `analytics.test.ts`, `swimlaneLogic.test.ts`, `importParse.test.ts`, `commitMapper.test.ts`

Update every case that names WON / DROP / HOLD or 9 columns. New: `canCloseDeal` / `canReopenDeal` matrix; `isSkipJump`; `isActiveDeal` by outcome; KPI idle counts; `computeCloseReasons` + `computeWinRate`; funnel and heatmap over 6; `IMPORTABLE_STAGES` = 6; `dealsForPic` order.

### Playwright — `e2e/tests/pipeline-board.spec.ts`, `pipeline-form.spec.ts` (desktop + mobile where the existing tests run both)

Rewrite "all 9 columns" → 6 columns in D2 order with the PoC header tinted; replace "drag into WON" with: (a) card menu → Close deal → Lost → Competitor → the card leaves the Active board, the Closed switch shows it under Lost with its stage chip, the detail page shows Reopen; (b) card menu → Hold → the card stays in its column with the Hold chip; (c) drag TC → RFP → the reason dialog, cancel restores, confirm lands and the activity note carries the reason. Keep the view switcher, keyboard, create / edit / notes / links, import, view-only and Assign PIC flows; update the import template assertion to the 6 stages. Extend `afterAll` cleanups for the new deals.

## 6. Task list

7 tasks. `solvro-implementor` each; scoped checks only; report CHANGELOG entry text, never write `CHANGELOG.md` (one writer at integration). Backend implementors use one `_test` DB each (T1 `solvro_t1_test`, T2 `solvro_t2_test`) — `backend/CLAUDE.md`'s `TEST_URL` recipe with the DB name swapped. Frontend implementors in the same wave serialize their `tsc` runs (trap: one frontend typecheck at a time).

### T1 — Schema, migration with backfill, seed role, compile fixes  (**spine → instant review**)
**Files:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/<ts>_opportunity_flow_redesign/migration.sql`, `backend/prisma/seed.ts`, `backend/test/testAuth.ts`, `backend/scripts/import-velora.ts`.
1. §2.1–§2.4 exactly. Hand-written SQL; verification run reported with the SELECT output.
2. Scoped checks: `npx prisma migrate dev` on the dev DB (`-it`), `npx prisma generate`, backend `npx tsc --noEmit` (routes will fail to compile until T2 — report, do not fix routes; T2 owns them. Where a compile break blocks the check, stub-free: T1's tsc is expected red on `routes/opportunities.ts` only, and green elsewhere).
3. CHANGELOG (Changed / Added / Removed): the enum, the 8 columns, the backfill mapping, the `SALES` role, why (the VP's flow spec).

### T2 — API: close / reopen, move with reason, PATCH flags, serializer, SLA, working days, activity bumps, backend tests
**Files:** `backend/src/routes/opportunities.ts`, `backend/src/routes/opportunityItems.ts`, `backend/src/routes/holidays.ts`, `backend/src/lib/holidays.ts` (new), `backend/src/lib/pipelineSla.ts` (new), `backend/src/lib/workingDays.ts` (new), `backend/test/*` per §5.
1. §3 exactly. Keep route order and header comments; rewrite the `/move` header comment (the cron-mirroring paragraph is obsolete).
2. §5 backend tests, on `solvro_t2_test`.
3. Scoped checks: backend `npx tsc --noEmit` + the touched test files.
4. CHANGELOG (Added / Changed).

### T3 — Frontend data layer, gates, chips, dialogs, pure logic + unit tests  (**spine → instant review**)
**Files:** `frontend/src/lib/pipelineFormat.ts`, `frontend/src/lib/queries.ts`, `frontend/src/components/pipeline/{boardLogic,adapter,kpi,analytics,swimlaneLogic,importParse}.ts` + their tests, `frontend/src/components/StageChip.tsx`, `frontend/src/components/PipelineFlagChips.tsx` (new), `frontend/src/components/CloseDealDialog.tsx` (new), `frontend/src/components/MoveReasonModal.tsx` (new).
1. §4.1–§4.3 plus the pure-logic parts of §4.4 (`kpi.ts`, `swimlaneLogic.ts`) and §4.6 (`analytics.ts`, `importParse.ts`). Components compile against the new `Opportunity` type; the pages that consume them are T4–T6.
2. Unit tests per §5.
3. Scoped checks: frontend `npm run typecheck` (expected red only in the page files T4–T6 own — report the list), the touched unit tests.
4. CHANGELOG (Added / Changed / Removed).

### T4 — Board, card menu, Pipeline page switch, List / Closed / Swimlane / Quarter views
**Files:** `frontend/src/pages/Pipeline.tsx`, `frontend/src/components/pipeline/{SolvroPipelineKanban,OpportunityCard,PipelineKpiBar}.tsx`, `frontend/src/pages/views/{PipelineList,PipelineSwimlane,PipelineQuarter}.tsx`, `frontend/src/pages/views/PipelineClosed.tsx` (new).
1. §4.4 to the mockups. Reuse `DropdownMenu`, `Modal`, `HandoffProjectModal`, the T3 chips and dialogs.
2. Accessibility: menu trigger `aria-label="More actions"`; radio cards are real inputs with labels; the Active / Closed control is a `role="group"` of buttons with `aria-pressed`.
3. Scoped checks: typecheck (serialized with T5 / T6). No browser — the reviewer and T7 verify pixels.
4. CHANGELOG (Added / Changed).

### T5 — Opportunity detail page
**Files:** `frontend/src/pages/OpportunityDetail.tsx`.
1. §4.5 to the mockups.
2. Scoped checks: typecheck (serialized).
3. CHANGELOG (Added / Changed).

### T6 — Import dialog, analytics section, Overview panel, DealCard, PIC drill-down, form stage select
**Files:** `frontend/src/components/PipelineImportDialog.tsx`, `frontend/src/components/pipeline/{PipelineAnalyticsSection,PipelineOverviewPanel,PicDrillDownModal}.tsx`, `frontend/src/components/DealCard.tsx`, `frontend/src/components/OpportunityFormModal.tsx`.
1. §4.6 (the component halves; the logic landed in T3).
2. Scoped checks: typecheck (serialized).
3. CHANGELOG (Added / Changed).

### T7 — Playwright, CHANGELOG assembly check
**Files:** `e2e/tests/pipeline-board.spec.ts`, `e2e/tests/pipeline-form.spec.ts`.
1. §5 Playwright.
2. Scoped checks: `cd e2e && npm test` against the dev stack (`BASE_URL=http://localhost:5173`), after `docker compose restart backend` (trap: a long-up backend container 404s new routes).
3. CHANGELOG (Added, one line under the tests entry).

## 7. Waves and gates

| Wave | Tasks | Notes |
|---|---|---|
| W1 | T1 | Serial: everything depends on the Prisma client. Start Docker first (`open -a Docker`, wait for `docker compose ps` healthy). Gates will be red on the backend typecheck until T2 lands — run gates for the migration + guardrail greps and record the expected red; **instant opus review** on `schema.prisma` + the migration SQL (spine) before W2 starts. |
| W2 | T2 ∥ T3 | Disjoint areas; T3 codes against the §3 contract. T2 on `solvro_t2_test`. Gates at integration (backend green; frontend typecheck red only in T4–T6's page files is expected — record it) + **instant opus review** on `queries.ts` (spine). |
| W3 | T4 ∥ T5 ∥ T6 | Disjoint files. Serialize the three `tsc` runs. Gates at integration, now fully green. |
| W4 | T7 | Needs the dev stack with W1–W3; `docker compose restart backend` first. Gates (Playwright smoke inside gates; the full e2e run is T7's own check). |
| Close | — | One `solvro-reviewer` phase review on the combined diff (design lens: `docs/DESIGN.md`; permission and state lens: `pipelineAccess.ts`, the close / reopen / move rules; migration lens: the backfill SQL). `solvro-docs-keeper` **is triggered**: `docs/DESIGN.md`'s "Status chip tone table" names `StageChip` rows for WON / DROP / HOLD that this phase removes, and `docs/ISSUES.md` line 196 (the order-dependent test) is resolved by T2. Then stage, draft one commit message per task and the PR body → **stop for approval**. `TaskStop` every agent. |

Fix rounds continue the same implementor via `SendMessage`. Sonnet floor. Never poke an idle agent for a report — read the tree. Before the PR: run the production stage count (`SELECT stage, count(*) FROM opportunities GROUP BY stage`) so the backfill's scope is known; the migration handles any count, the number is for the PR body.

## 8. CHANGELOG headline (draft, orchestrator-owned)

Under `[Unreleased]` → `### Changed — 2026-09-XX — Pipeline: stage, sub-status, status tag and outcome become separate fields`. One entry per task, merged serially at integration. Public wording: what changed, where, why (the opportunity flow spec: no deal without a clear owner and next actor; Won, Lost, Cancelled and Hold no longer erase the stage a deal reached). No pipeline vocabulary.

## 9. Out of scope

Everything in D14 · any change to `assertCanWriteOpportunity` or the assign rules · a stored `owner` or `idle_alert` column · a cron of any kind · Swimlane / Quarter over closed deals · SLA editing in Admin · Telegram / Google Chat · the Reports page.

## 10. Open questions for the VP (defaults applied; an answer changes the plan, not the build order)

1. Existing Drop deals: Lost or Cancelled? — default Cancelled / other (D6).
2. Skip form: §2 says Technical Clarification → RFP, §8 says the PoC → RFP form. — default: the TC → RFP jump (D4).
3. Backward moves allowed? — default yes (D4).
4. Red on Waiting Response: colour only? — default colour + the Idle alerts tile count (§4.4).
5. Who clears Delayed, and does it need a new deadline? — default manual, no date rule.
6. Does Sales see the whole pipeline? — default yes, read-only (D7).
