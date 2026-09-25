-- Opportunity flow redesign (VP spec, 2026-09-25 — see
-- docs/archive/plans/opportunity-flow-redesign.md §2.3). Hand-written:
-- Prisma's own `migrate diff` output for this schema change casts the
-- `stage` column straight from the old 9-value enum to the new 6-value one,
-- which fails on any row still holding 'won'/'drop'/'hold' (those literals
-- have no counterpart in the new PipelineStage). This file keeps Prisma's
-- generated DDL (type names, column types/defaults, the enum-swap dance,
-- the index name) but backfills every won/drop/hold row's recovered stage,
-- outcome, statusTag and subStatus BEFORE the enum swap, via a temporary
-- `stage_next` TEXT column that the swap's USING clause casts from instead
-- of the old `stage` column directly. The whole file runs as ONE
-- transaction (explicit BEGIN/COMMIT wrapping everything, not just the enum
-- swap) so a failure anywhere leaves neither the swap nor the repack
-- committed.
BEGIN;

-- CreateEnum
CREATE TYPE "PipelineSubStatus" AS ENUM ('progress', 'waiting_sales_input');

-- CreateEnum
CREATE TYPE "PipelineStatusTag" AS ENUM ('hold', 'delayed');

-- CreateEnum
CREATE TYPE "PipelineOutcome" AS ENUM ('won', 'lost', 'cancelled');

-- CreateEnum
CREATE TYPE "PipelineOutcomeReason" AS ENUM ('price', 'competitor', 'technical', 'budget_withdrawn', 'project_cancelled', 'lost_contact', 'other');

-- AlterTable: add the 8 opportunity_flow_redesign columns, plus a temporary
-- `stage_next` TEXT column that holds each row's recovered stage until the
-- enum swap below casts it into the new PipelineStage type. `pre_hold_stage`
-- is NOT dropped here yet — the Hold backfill below still reads it; it's
-- dropped inside the enum-swap block further down (it's typed against the
-- OLD PipelineStage enum, so it must go before that type is dropped).
ALTER TABLE "opportunities"
  ADD COLUMN     "closed_at" TIMESTAMP(3),
  ADD COLUMN     "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN     "outcome" "PipelineOutcome",
  ADD COLUMN     "outcome_reason" TEXT,
  ADD COLUMN     "outcome_reason_category" "PipelineOutcomeReason",
  ADD COLUMN     "status_tag" "PipelineStatusTag",
  ADD COLUMN     "sub_status" "PipelineSubStatus",
  ADD COLUMN     "waiting_input_since" TIMESTAMP(3),
  ADD COLUMN     "stage_next" TEXT;

-- Backfill setup: compute the "last recoverable move" ONCE, per opportunity,
-- into a temp table the three won/drop/hold UPDATEs below all read from
-- (rather than repeating the same subquery three times). Restricted to
-- notes whose SOURCE label is one of the 6 surviving stages — a note like
-- "Moved from Hold to Won" or "Moved from Drop to Hold" must NOT win over an
-- older, genuinely recoverable "Moved from RFP to Hold", and a free-text
-- note that merely ends in "... to Won" must never be mistaken for a real
-- move note. DISTINCT ON picks the newest matching note per opportunity.
CREATE TEMP TABLE "last_move" AS
SELECT DISTINCT ON (a."opportunity_id") a."opportunity_id",
  CASE (regexp_match(a."note", '^Moved from (Assessment|RFP|PoC|Technical Clarification|Delivered Proposal|Waiting Response) to (Won|Drop|Hold)$'))[1]
    WHEN 'Assessment'              THEN 'assessment'
    WHEN 'RFP'                     THEN 'rfp'
    WHEN 'PoC'                     THEN 'poc'
    WHEN 'Technical Clarification' THEN 'technical_clarification'
    WHEN 'Delivered Proposal'      THEN 'deliver_proposal'
    WHEN 'Waiting Response'        THEN 'waiting_response'
  END AS "label"
FROM "opportunity_activities" a
WHERE a."note" ~ '^Moved from (Assessment|RFP|PoC|Technical Clarification|Delivered Proposal|Waiting Response) to (Won|Drop|Hold)$'
ORDER BY a."opportunity_id", a."created_at" DESC;

-- Backfill (D6): Won -> outcome='won', closed_at = won_at (fallback
-- updated_at), stage recovered from "last_move", else Delivered Proposal.
UPDATE "opportunities" o
SET
  "outcome" = 'won',
  "closed_at" = COALESCE(o."won_at", o."updated_at"),
  "stage_next" = COALESCE(lm."label", 'deliver_proposal')
FROM "opportunities" o2
LEFT JOIN "last_move" lm ON lm."opportunity_id" = o2."id"
WHERE o."id" = o2."id" AND o2."stage" = 'won';

-- Backfill (D6): Drop -> outcome='cancelled', category 'other', note
-- "Backfilled from Drop" (pending the VP's answer, §10 Q1), closed_at =
-- updated_at, stage recovered from "last_move", else Assessment.
UPDATE "opportunities" o
SET
  "outcome" = 'cancelled',
  "outcome_reason_category" = 'other',
  "outcome_reason" = 'Backfilled from Drop',
  "closed_at" = o."updated_at",
  "stage_next" = COALESCE(lm."label", 'assessment')
FROM "opportunities" o2
LEFT JOIN "last_move" lm ON lm."opportunity_id" = o2."id"
WHERE o."id" = o2."id" AND o2."stage" = 'drop';

-- Backfill (D6): Hold -> statusTag='hold', stage recovered from
-- pre_hold_stage first, else "last_move", else Assessment. pre_hold_stage
-- is validated against the 6 surviving stages: origin/develop's /move
-- handler wrote `preHoldStage = current.stage` for ANY source stage (it
-- only excluded HOLD itself), so a deal moved WON -> HOLD or DROP -> HOLD on
-- the live board can carry `pre_hold_stage = 'won'`/`'drop'` — neither is a
-- valid PipelineStage_new literal, so it must be treated as absent here
-- (falls through to last_move, then the Assessment default) rather than
-- passed straight into stage_next.
UPDATE "opportunities" o
SET
  "status_tag" = 'hold',
  "stage_next" = COALESCE(
    CASE WHEN o."pre_hold_stage"::text IN ('won', 'drop', 'hold') THEN NULL ELSE o."pre_hold_stage"::text END,
    lm."label",
    'assessment'
  )
FROM "opportunities" o2
LEFT JOIN "last_move" lm ON lm."opportunity_id" = o2."id"
WHERE o."id" = o2."id" AND o2."stage" = 'hold';

DROP TABLE "last_move";

-- Backfill: every other row (already on one of the 6 surviving stages)
-- keeps its stage verbatim.
UPDATE "opportunities" o
SET "stage_next" = o."stage"::text
WHERE o."stage" NOT IN ('won', 'drop', 'hold');

-- Fail-safe: no unexpected literal may ever abort the enum-swap cast below
-- on production. Every row should already have a valid stage_next from the
-- backfill above, but if any slipped through (a NULL, or a stray value),
-- force it to Assessment rather than let the USING cast fail. Runs BEFORE
-- the sub_status backfill below — a row rescued here must still get
-- sub_status='progress' like any other open Assessment row, which the
-- sub_status UPDATE's `stage_next <> 'waiting_response'` comparison would
-- otherwise skip if stage_next were still NULL at that point.
UPDATE "opportunities"
SET "stage_next" = 'assessment'
WHERE "stage_next" IS NULL
   OR "stage_next" NOT IN ('assessment', 'technical_clarification', 'poc', 'rfp', 'deliver_proposal', 'waiting_response');

-- Backfill: every open deal not on Waiting Response starts in PROGRESS.
UPDATE "opportunities" o
SET "sub_status" = 'progress'
WHERE o."outcome" IS NULL AND o."stage_next" <> 'waiting_response';

-- Backfill: last_activity_at = the newer of updated_at and the deal's
-- newest activity note (NULL-safe — a deal with no notes keeps updated_at).
UPDATE "opportunities" o
SET "last_activity_at" = GREATEST(
  o."updated_at",
  COALESCE((SELECT MAX(a."created_at") FROM "opportunity_activities" a WHERE a."opportunity_id" = o."id"), o."updated_at")
);

-- AlterEnum: swap PipelineStage for the 6-value version, casting from the
-- backfilled `stage_next` column rather than the old `stage` column (which
-- still holds 'won'/'drop'/'hold' values with no counterpart in the new
-- type).
CREATE TYPE "PipelineStage_new" AS ENUM ('assessment', 'technical_clarification', 'poc', 'rfp', 'deliver_proposal', 'waiting_response');
ALTER TABLE "opportunities" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "opportunities" ALTER COLUMN "stage" TYPE "PipelineStage_new" USING ("stage_next"::"PipelineStage_new");
-- pre_hold_stage is still typed against the OLD PipelineStage enum (Hold no
-- longer needs it — the stage it stalled in lives directly on `stage` now,
-- per D5), so it must go before DROP TYPE "PipelineStage_old" below, or that
-- drop fails on the dependency.
ALTER TABLE "opportunities" DROP COLUMN "pre_hold_stage";
ALTER TYPE "PipelineStage" RENAME TO "PipelineStage_old";
ALTER TYPE "PipelineStage_new" RENAME TO "PipelineStage";
DROP TYPE "PipelineStage_old";
ALTER TABLE "opportunities" ALTER COLUMN "stage" SET DEFAULT 'assessment';

-- AlterTable: drop the now-consumed temporary column.
ALTER TABLE "opportunities" DROP COLUMN "stage_next";

-- Repack stage_order densely (0..n-1) within each stage now that Won/Drop/
-- Hold rows have joined their recovered stage's siblings — closed deals
-- (outcome IS NOT NULL) sort after open ones inside a stage.
UPDATE "opportunities" o
SET "stage_order" = ranked.rn - 1
FROM (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "stage"
    ORDER BY ("outcome" IS NOT NULL), "stage_order", "id"
  ) AS rn
  FROM "opportunities"
) ranked
WHERE o."id" = ranked."id";

-- CreateIndex
CREATE INDEX "opportunities_outcome_idx" ON "opportunities"("outcome");

COMMIT;
