import { Router } from "express";
import { z } from "zod";
import { PipelineStage } from "@prisma/client";
import type { Opportunity, Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { isValidDayString, utcMidnightOfDayString } from "../lib/dateBoundary.js";
import { assertCanWriteOpportunity, PIC_SELECT } from "../lib/pipelineAccess.js";

// Pipeline module (native port of Velora — docs/plans/pipeline-native-port-plan.md).
// CRUD + the single stage-transition writer for Opportunity. Deal visibility
// is global for any pipeline:view holder (PRD §5) — no per-user list
// scoping, unlike projects/visibility.ts. Ownership (`picId`) gates writes
// only, via the edit_own/edit_all and delete_own/delete_all permission pairs.

const idParamSchema = z.object({ id: z.string().uuid() });

// Plain calendar day ("yyyy-MM-dd", no time/zone) — the `deadline` column is
// `@db.Date` precisely so it never carries instant semantics. Validated with
// the same house day-string helper `routes/tasks.ts` uses for its `today`
// query param (`lib/dateBoundary.ts`), and converted to storage the same way.
const dayStringSchema = z
  .string()
  .refine(isValidDayString, { message: "Must be a valid yyyy-MM-dd date" });

const picIdField = z.number().int().positive().nullable();

// `.strict()` on create too (symmetry with update): `stage` is the one
// writable field this schema exposes (POST /:id/move owns transitions
// thereafter); everything else outside the listed fields — notably
// `stageOrder` and `preHoldStage`, both server-computed/route-owned — 400s
// instead of silently no-op'ing.
const createOpportunitySchema = z
  .object({
    title: z.string().min(1).max(200),
    customerName: z.string().min(1).max(200),
    dealValue: z.number().min(0).optional(),
    picId: picIdField.optional(),
    deadline: dayStringSchema.nullable().optional(),
    requestDate: dayStringSchema.nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    productSolution: z.string().max(500).optional(),
    leadSource: z.string().max(200).nullable().optional(),
    winProbability: z.number().int().min(0).max(100).optional(),
    stage: z.nativeEnum(PipelineStage).optional(),
  })
  .strict();

// `.strict()`: stage (and stageOrder, preHoldStage) changes are rejected
// here rather than silently dropped — POST /:id/move is the ONLY writer of
// stage changes (and the HOLD/preHoldStage pair that comes with them), so a
// client that sends `stage` in a PATCH body gets a 400, not a no-op.
const updateOpportunitySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    customerName: z.string().min(1).max(200).optional(),
    dealValue: z.number().min(0).optional(),
    picId: picIdField.optional(),
    deadline: dayStringSchema.nullable().optional(),
    requestDate: dayStringSchema.nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    productSolution: z.string().max(500).optional(),
    leadSource: z.string().max(200).nullable().optional(),
    winProbability: z.number().int().min(0).max(100).optional(),
  })
  .strict();

const moveOpportunitySchema = z.object({
  stage: z.nativeEnum(PipelineStage),
  stageOrder: z.number().int().min(0),
});

const STAGE_LABELS: Record<PipelineStage, string> = {
  ASSESSMENT: "Assessment",
  RFP: "RFP",
  POC: "PoC",
  TECHNICAL_CLARIFICATION: "Technical Clarification",
  DELIVER_PROPOSAL: "Deliver Proposal",
  WAITING_RESPONSE: "Waiting Response",
  WON: "Won",
  DROP: "Drop",
  HOLD: "Hold",
};

type OpportunityWithPic = Opportunity & {
  pic: { id: number; username: string; avatarUrl: string | null } | null;
};

/**
 * `dealValue` is a Prisma BigInt (IDR values fit in Number.MAX_SAFE_INTEGER,
 * so a plain Number round-trips exactly) and `res.json` throws on a raw
 * BigInt. `deadline`/`requestDate` are plain calendar days (`@db.Date`, "no
 * instant conversion" per the schema comment) — re-deriving the UTC
 * date-part keeps the wire contract a bare "yyyy-MM-dd" day string rather
 * than a full ISO instant. `preHoldStage` needs no conversion (plain enum,
 * already part of `...o`). Every response funnels through this one helper
 * so these conversions never drift out of sync across handlers.
 */
function serializeOpportunity(o: OpportunityWithPic) {
  return {
    ...o,
    dealValue: Number(o.dealValue),
    deadline: o.deadline ? o.deadline.toISOString().slice(0, 10) : null,
    requestDate: o.requestDate ? o.requestDate.toISOString().slice(0, 10) : null,
  };
}

function toDealValue(value: number): bigint {
  return BigInt(Math.round(value));
}

async function findOpportunityOr404(id: string): Promise<Opportunity> {
  const opportunity = await prisma.opportunity.findUnique({ where: { id } });
  if (!opportunity) throw new HttpError(404, "not_found", "Opportunity not found");
  return opportunity;
}

type Tx = Prisma.TransactionClient;

async function stageSiblingIds(tx: Tx, stage: PipelineStage, excludeId: string): Promise<string[]> {
  const rows = await tx.opportunity.findMany({
    where: { stage, id: { not: excludeId } },
    orderBy: [{ stageOrder: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Inserts `oppId` into `stage`'s sibling list at `requestedPosition`
 * (clamped to [0, siblings.length]), then re-packs the whole list to dense
 * 0..n-1 — mirrors `lib/taskOrdering.ts`'s `insertAt`, scoped to `stage`
 * instead of (projectId, parentTaskId). Must run inside a
 * `prisma.$transaction`. Returns the final stageOrder assigned to `oppId`.
 */
async function insertAtStage(
  tx: Tx,
  stage: PipelineStage,
  oppId: string,
  requestedPosition: number,
): Promise<number> {
  const others = await stageSiblingIds(tx, stage, oppId);
  const clamped = Math.max(0, Math.min(requestedPosition, others.length));
  const ordered = [...others];
  ordered.splice(clamped, 0, oppId);
  for (let i = 0; i < ordered.length; i++) {
    await tx.opportunity.update({ where: { id: ordered[i] }, data: { stageOrder: i } });
  }
  return clamped;
}

/**
 * Re-packs `stage`'s remaining siblings to dense 0..n-1 after `oppId` leaves
 * it on a cross-stage move — mirrors `lib/taskOrdering.ts`'s `closeGap`.
 */
async function closeGapInStage(tx: Tx, stage: PipelineStage, oppId: string): Promise<void> {
  const remaining = await stageSiblingIds(tx, stage, oppId);
  for (let i = 0; i < remaining.length; i++) {
    await tx.opportunity.update({ where: { id: remaining[i] }, data: { stageOrder: i } });
  }
}

export const opportunitiesRouter = Router();

// Both this router and opportunityItemsRouter mount at "/opportunities"
// (src/app.ts) and each calls requireAuth at their own router root, so a
// request handled by opportunityItemsRouter (e.g. /:id/activities) runs
// requireAuth twice — once here (no route in this router matches that
// shape, so it just falls through) and once in opportunityItemsRouter.
// Harmless: requireAuth is a pure, idempotent JWT verification against the
// same header each time (just re-sets req.user to the same value) — not
// worth the coupling of hoisting it to app.ts or merging the two routers.
opportunitiesRouter.use(requireAuth);

// Full list, no pagination (SA-team scale — client-side filtering per
// docs/plans/pipeline-native-port-plan.md). Board column order: stage, then
// stageOrder within it.
opportunitiesRouter.get("/", requirePermission("pipeline:view"), async (_req, res) => {
  const opportunities = await prisma.opportunity.findMany({
    orderBy: [{ stage: "asc" }, { stageOrder: "asc" }],
    include: { pic: { select: PIC_SELECT } },
  });
  res.json(opportunities.map((o) => serializeOpportunity(o as OpportunityWithPic)));
});

opportunitiesRouter.get(
  "/:id",
  requirePermission("pipeline:view"),
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: { pic: { select: PIC_SELECT } },
    });
    if (!opportunity) throw new HttpError(404, "not_found", "Opportunity not found");
    res.json(serializeOpportunity(opportunity as OpportunityWithPic));
  },
);

opportunitiesRouter.post(
  "/",
  requirePermission("pipeline:create"),
  validate("body", createOpportunitySchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof createOpportunitySchema>;
    const stage = body.stage ?? PipelineStage.ASSESSMENT;

    const data: Prisma.OpportunityCreateInput = {
      title: body.title,
      customerName: body.customerName,
      stage,
    };
    if (body.dealValue !== undefined) data.dealValue = toDealValue(body.dealValue);
    // `disconnect` isn't a valid nested-write action on create (there's
    // nothing yet to disconnect from) — an explicit `picId: null` is simply
    // "don't connect a pic", already the default for a brand-new row. A
    // real id goes through a relation `connect`, not a raw FK-scalar write,
    // so a nonexistent user id 404s via Prisma's P2025 mapping instead of
    // 500ing on an unmapped P2003 FK violation (finding S1).
    if (body.picId !== undefined && body.picId !== null) {
      data.pic = { connect: { id: body.picId } };
    }
    if (body.deadline !== undefined) {
      data.deadline = body.deadline === null ? null : utcMidnightOfDayString(body.deadline);
    }
    if (body.requestDate !== undefined) {
      data.requestDate = body.requestDate === null ? null : utcMidnightOfDayString(body.requestDate);
    }
    if (body.description !== undefined) data.description = body.description;
    if (body.productSolution !== undefined) data.productSolution = body.productSolution;
    if (body.leadSource !== undefined) data.leadSource = body.leadSource;
    if (body.winProbability !== undefined) data.winProbability = body.winProbability;
    // Creating directly into WON is a real flow (the PRD's per-column "+"
    // lets an SA add a deal straight into any column, including Won) so it
    // gets the same wonAt bookkeeping POST /:id/move does on a transition
    // into WON (finding S2).
    if (stage === PipelineStage.WON) data.wonAt = new Date();
    // Creating directly into HOLD, by contrast, has no "prior stage" to
    // record — HOLD is normally only reached via /move from an existing
    // stage — so preHoldStage is deliberately left null here (the schema
    // default), same as any other creation path.

    // New card lands at the BOTTOM of its stage (MAX(stageOrder)+1
    // semantics) — matches the reference's
    // `COALESCE(MAX(stage_order), -1) + 1` (VeloraApp's opportunities
    // route) and lib/taskOrdering.ts's append-at-end (finding S6). The
    // stage's existing siblings are already dense 0..n-1, so a plain count
    // is the next slot; wrapped in a transaction so a concurrent create
    // into the same stage can't race to the same stageOrder.
    const created = await prisma.$transaction(async (tx) => {
      const stageOrder = await tx.opportunity.count({ where: { stage } });
      return tx.opportunity.create({
        data: { ...data, stageOrder },
        include: { pic: { select: PIC_SELECT } },
      });
    });

    res.status(201).json(serializeOpportunity(created));
  },
);

opportunitiesRouter.patch(
  "/:id",
  validate("params", idParamSchema),
  validate("body", updateOpportunitySchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof updateOpportunitySchema>;
    const current = await findOpportunityOr404(id);
    assertCanWriteOpportunity(req.user!, "edit", current);

    const data: Prisma.OpportunityUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.customerName !== undefined) data.customerName = body.customerName;
    if (body.dealValue !== undefined) data.dealValue = toDealValue(body.dealValue);
    // Relation `connect`/`disconnect` instead of a raw FK-scalar write —
    // house pattern (routes/projects.ts's `data.sa` PATCH) — so a
    // nonexistent user id 404s via Prisma's P2025 mapping instead of
    // 500ing on an unmapped P2003 FK violation (finding S1).
    if (body.picId !== undefined) {
      data.pic = body.picId === null ? { disconnect: true } : { connect: { id: body.picId } };
    }
    if (body.deadline !== undefined) {
      data.deadline = body.deadline === null ? null : utcMidnightOfDayString(body.deadline);
    }
    if (body.requestDate !== undefined) {
      data.requestDate = body.requestDate === null ? null : utcMidnightOfDayString(body.requestDate);
    }
    if (body.description !== undefined) data.description = body.description;
    if (body.productSolution !== undefined) data.productSolution = body.productSolution;
    if (body.leadSource !== undefined) data.leadSource = body.leadSource;
    if (body.winProbability !== undefined) data.winProbability = body.winProbability;

    const updated = await prisma.opportunity.update({
      where: { id },
      data,
      include: { pic: { select: PIC_SELECT } },
    });
    res.json(serializeOpportunity(updated));
  },
);

// The ONLY writer of stage changes. One transaction: resequence siblings in
// the old/new stage (dense 0..n-1 each), set/clear `wonAt` on a real
// transition into/out of WON, set/clear `preHoldStage` on a real transition
// into/out of HOLD (mirrors the reference's cron-driven auto-hold/restore —
// VeloraApp/lib/run-auto-hold-cron.ts — except here /move is the single
// writer for both manual and would-be-automated hold transitions, so the
// invariant is enforced on every stage change, not only the cron path), and
// log an OpportunityActivity — but only on an actual stage change, never a
// same-stage reorder.
opportunitiesRouter.post(
  "/:id/move",
  validate("params", idParamSchema),
  validate("body", moveOpportunitySchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof moveOpportunitySchema>;
    const current = await findOpportunityOr404(id);
    assertCanWriteOpportunity(req.user!, "edit", current);

    const sameStage = current.stage === body.stage;

    const updated = await prisma.$transaction(async (tx) => {
      if (!sameStage) {
        await closeGapInStage(tx, current.stage, id);
      }
      const finalStageOrder = await insertAtStage(tx, body.stage, id, body.stageOrder);

      const enteringWon = body.stage === PipelineStage.WON && current.stage !== PipelineStage.WON;
      const leavingWon = body.stage !== PipelineStage.WON && current.stage === PipelineStage.WON;
      const enteringHold = body.stage === PipelineStage.HOLD && current.stage !== PipelineStage.HOLD;
      const leavingHold = body.stage !== PipelineStage.HOLD && current.stage === PipelineStage.HOLD;

      const data: Prisma.OpportunityUncheckedUpdateInput = {
        stage: body.stage,
        stageOrder: finalStageOrder,
      };
      if (enteringWon) data.wonAt = new Date();
      if (leavingWon) data.wonAt = null;
      if (enteringHold) data.preHoldStage = current.stage;
      if (leavingHold) data.preHoldStage = null;

      const result = await tx.opportunity.update({
        where: { id },
        data,
        include: { pic: { select: PIC_SELECT } },
      });

      if (!sameStage) {
        await tx.opportunityActivity.create({
          data: {
            opportunityId: id,
            userId: req.user!.sub,
            note: `Moved from ${STAGE_LABELS[current.stage]} to ${STAGE_LABELS[body.stage]}`,
          },
        });
      }

      return result;
    });

    res.json(serializeOpportunity(updated));
  },
);

opportunitiesRouter.delete("/:id", validate("params", idParamSchema), async (req, res) => {
  const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
  const current = await findOpportunityOr404(id);
  assertCanWriteOpportunity(req.user!, "delete", current);
  await prisma.opportunity.delete({ where: { id } });
  res.status(204).end();
});
