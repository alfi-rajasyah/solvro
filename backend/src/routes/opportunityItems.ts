import { Router } from "express";
import { z } from "zod";
import { PipelineSubStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { ensureOpportunityEditable, PIC_SELECT } from "../lib/pipelineAccess.js";
import { listActivityPage } from "../lib/activity.js";
import { recordOpportunityChange } from "../lib/opportunityActivity.js";
import { createLinkSchema, updateLinkSchema } from "../lib/linkSchemas.js";
import { filterActiveUsersWhoCanSeeOpportunity, notifyForEvent } from "../lib/notifications.js";
import { MAX_DEAL_ACTIVITIES } from "../lib/limits.js";

// Mounted at "/opportunities" in src/app.ts — paths below are relative to that.

const opportunityIdParamSchema = z.object({ opportunityId: z.guid() });
const linkParamSchema = opportunityIdParamSchema.extend({ linkId: z.guid() });

const MAX_MENTIONS = 20;

const createActivitySchema = z.object({
  note: z.string().trim().min(1).max(2000),
  // Same contract as task comments: <= 20 distinct user ids; ids that are
  // unknown, inactive or without pipeline:view are dropped by the handler.
  mentionedUserIds: z
    .array(z.number().int().positive())
    .max(MAX_MENTIONS)
    .transform((ids) => [...new Set(ids)])
    .optional(),
});

const activityFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.number().int().positive().optional(),
  actorId: z.coerce.number().int().positive().optional(),
});

async function ensureOpportunityExists(opportunityId: string) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, title: true, picId: true },
  });
  if (!opportunity) throw new HttpError(404, "not_found", "Opportunity not found");
  return opportunity;
}

// The edit_own/edit_all ownership gate and the PIC/acting-user select shape
// both used to be private copies here, divergent from routes/opportunities.ts's
// (different 403 message, near-identical select). Now shared from
// lib/pipelineAccess.ts so the two pipeline routers can't drift again
// (M1 review, finding S3).

export const opportunityItemsRouter = Router();

opportunityItemsRouter.use(requireAuth);

opportunityItemsRouter.get(
  "/:opportunityId/activities",
  requirePermission("pipeline:view"),
  validate("params", opportunityIdParamSchema),
  async (req, res) => {
    const { opportunityId } = req.params as unknown as z.infer<typeof opportunityIdParamSchema>;
    await ensureOpportunityExists(opportunityId);
    const activities = await prisma.opportunityActivity.findMany({
      where: { opportunityId },
      orderBy: { createdAt: "desc" },
      take: MAX_DEAL_ACTIVITIES,
      include: { user: { select: PIC_SELECT } },
    });
    res.json(activities);
  },
);

// The deal's STRUCTURED events (lib/opportunityActivity.ts — field diffs, moves,
// closes, assignments, notes, links), newest first, same paging and shape as
// GET /projects/:id/activity. Complements the timeline above, which stays the
// deal's permanent human-readable record. Deal visibility is global for
// pipeline:view holders.
opportunityItemsRouter.get(
  "/:opportunityId/activity",
  requirePermission("pipeline:view"),
  validate("params", opportunityIdParamSchema),
  validate("query", activityFeedQuerySchema),
  async (req, res) => {
    const { opportunityId } = req.params as unknown as z.infer<typeof opportunityIdParamSchema>;
    const { limit, before, actorId } = req.query as unknown as z.infer<typeof activityFeedQuerySchema>;
    await ensureOpportunityExists(opportunityId);
    res.json(await listActivityPage({ opportunityId }, { limit, before, actorId }, true));
  },
);

// pipeline:view (not an edit permission) is deliberate: logging an activity
// note is collaboration on a deal, not editing it — anyone who can see the
// board can leave a note. Flagged for review per the dispatch brief.
//
// Bumps the opportunity's lastActivityAt in the same transaction
// (opportunity-flow-redesign §3.7) — a manual note is exactly the kind of
// activity the "activity" basis of computeIdle (lib/pipelineSla.ts) exists
// to track, same as the link writes below. A note also restarts the
// "waiting" basis: on a deal in Waiting Sales input it re-stamps
// `waitingInputSince`, so every SLA clock restarts on a new comment whatever
// the deal's state (Hold deals never idle either way).
opportunityItemsRouter.post(
  "/:opportunityId/activities",
  requirePermission("pipeline:view"),
  validate("params", opportunityIdParamSchema),
  validate("body", createActivitySchema),
  async (req, res) => {
    const { opportunityId } = req.params as unknown as z.infer<typeof opportunityIdParamSchema>;
    const { note, mentionedUserIds: requestedMentions = [] } = req.body as z.infer<
      typeof createActivitySchema
    >;
    const deal = await ensureOpportunityExists(opportunityId);
    const activity = await prisma.$transaction(async (tx) => {
      // Keep only mentions of active users who can see the Pipeline; unknown,
      // inactive and hidden ids are dropped silently. A self-mention is kept
      // (so the chip renders) — notifyForEvent never notifies the actor.
      const visible = await filterActiveUsersWhoCanSeeOpportunity(tx, requestedMentions);
      const mentionedUserIds = requestedMentions.filter((uid) => visible.has(uid));
      const created = await tx.opportunityActivity.create({
        data: { opportunityId, userId: req.user!.sub, note, mentionedUserIds },
        include: { user: { select: PIC_SELECT } },
      });
      const now = new Date();
      await tx.opportunity.update({
        where: { id: opportunityId },
        data: { lastActivityAt: now },
      });
      await tx.opportunity.updateMany({
        where: { id: opportunityId, subStatus: PipelineSubStatus.WAITING_SALES_INPUT },
        data: { waitingInputSince: now },
      });
      // Never the note text or the mention ids: the event carries the note's
      // id (the row itself is the timeline entry).
      const event = await recordOpportunityChange(tx, {
        opportunityId,
        actorId: req.user!.sub,
        action: "created",
        entityType: "opportunity_note",
        entityLabel: deal.title,
        changes: { activityId: created.id },
      });
      // The PIC hears about a note by someone else; a mention wins over that.
      await notifyForEvent(tx, event, { picId: deal.picId, mentionedUserIds });
      return created;
    });
    res.status(201).json(activity);
  },
);

opportunityItemsRouter.get(
  "/:opportunityId/links",
  requirePermission("pipeline:view"),
  validate("params", opportunityIdParamSchema),
  async (req, res) => {
    const { opportunityId } = req.params as unknown as z.infer<typeof opportunityIdParamSchema>;
    await ensureOpportunityExists(opportunityId);
    const links = await prisma.opportunityLink.findMany({
      where: { opportunityId },
      orderBy: { createdAt: "asc" },
    });
    res.json(links);
  },
);

// lastActivityAt bumps in the same transaction as the link create/patch/
// delete below (§3.7, same reasoning as the activity-note POST above) —
// adding, editing, or removing a link is deal activity same as a note.
opportunityItemsRouter.post(
  "/:opportunityId/links",
  validate("params", opportunityIdParamSchema),
  validate("body", createLinkSchema),
  async (req, res) => {
    const { opportunityId } = req.params as unknown as z.infer<typeof opportunityIdParamSchema>;
    const body = req.body as z.infer<typeof createLinkSchema>;
    await ensureOpportunityEditable(req.user!, opportunityId);
    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunityLink.create({
        data: { opportunityId, label: body.label, url: body.url },
      });
      const deal = await tx.opportunity.update({
        where: { id: opportunityId },
        data: { lastActivityAt: new Date() },
        select: { title: true },
      });
      // Label only — the URL never enters the log.
      await recordOpportunityChange(tx, {
        opportunityId,
        actorId: req.user!.sub,
        action: "added",
        entityType: "opportunity_link",
        entityLabel: deal.title,
        changes: { linkId: created.id, label: created.label },
        note: `Link added: ${created.label}`,
      });
      return created;
    });
    res.status(201).json(link);
  },
);

opportunityItemsRouter.patch(
  "/:opportunityId/links/:linkId",
  validate("params", linkParamSchema),
  validate("body", updateLinkSchema),
  async (req, res) => {
    const { opportunityId, linkId } = req.params as unknown as z.infer<typeof linkParamSchema>;
    const body = req.body as z.infer<typeof updateLinkSchema>;
    await ensureOpportunityEditable(req.user!, opportunityId);
    const link = await prisma.opportunityLink.findUnique({
      where: { id: linkId },
      select: { id: true, opportunityId: true, label: true, url: true },
    });
    if (!link || link.opportunityId !== opportunityId) {
      throw new HttpError(404, "not_found", "Link not found");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.opportunityLink.update({ where: { id: linkId }, data: body });
      const deal = await tx.opportunity.update({
        where: { id: opportunityId },
        data: { lastActivityAt: new Date() },
        select: { title: true },
      });
      // Re-saving identical values records nothing.
      if (result.label !== link.label || result.url !== link.url) {
        await recordOpportunityChange(tx, {
          opportunityId,
          actorId: req.user!.sub,
          action: "updated",
          entityType: "opportunity_link",
          entityLabel: deal.title,
          changes: { linkId, label: result.label },
        });
      }
      return result;
    });
    res.json(updated);
  },
);

opportunityItemsRouter.delete(
  "/:opportunityId/links/:linkId",
  validate("params", linkParamSchema),
  async (req, res) => {
    const { opportunityId, linkId } = req.params as unknown as z.infer<typeof linkParamSchema>;
    await ensureOpportunityEditable(req.user!, opportunityId);
    const link = await prisma.opportunityLink.findUnique({
      where: { id: linkId },
      select: { id: true, opportunityId: true, label: true },
    });
    if (!link || link.opportunityId !== opportunityId) {
      throw new HttpError(404, "not_found", "Link not found");
    }
    await prisma.$transaction(async (tx) => {
      await tx.opportunityLink.delete({ where: { id: linkId } });
      const deal = await tx.opportunity.update({
        where: { id: opportunityId },
        data: { lastActivityAt: new Date() },
        select: { title: true },
      });
      await recordOpportunityChange(tx, {
        opportunityId,
        actorId: req.user!.sub,
        action: "removed",
        entityType: "opportunity_link",
        entityLabel: deal.title,
        changes: { linkId, label: link.label },
        note: `Link removed: ${link.label}`,
      });
    });
    res.status(204).end();
  },
);
