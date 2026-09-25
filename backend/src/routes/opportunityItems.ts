import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { ensureOpportunityEditable, PIC_SELECT } from "../lib/pipelineAccess.js";

// Mounted at "/opportunities" in src/app.ts — paths below are relative to that.

const opportunityIdParamSchema = z.object({ opportunityId: z.string().uuid() });
const linkParamSchema = opportunityIdParamSchema.extend({ linkId: z.string().uuid() });

const createActivitySchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

// Matches VeloraApp's opportunity_links contract: label + a plain http(s) URL
// (Velora's `documents` table stored file_name/file_url pairs that were
// always links, never uploads — see docs/plans/pipeline-native-port-plan.md).
const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "URL must be a valid http:// or https:// address");

const createLinkSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: httpUrlSchema,
});

const updateLinkSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  url: httpUrlSchema.optional(),
});

async function ensureOpportunityExists(opportunityId: string): Promise<void> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true },
  });
  if (!opportunity) throw new HttpError(404, "not_found", "Opportunity not found");
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
      include: { user: { select: PIC_SELECT } },
    });
    res.json(activities);
  },
);

// pipeline:view (not an edit permission) is deliberate: logging an activity
// note is collaboration on a deal, not editing it — anyone who can see the
// board can leave a note. Flagged for review per the dispatch brief.
//
// Bumps the opportunity's lastActivityAt in the same transaction
// (opportunity-flow-redesign §3.7) — a manual note is exactly the kind of
// activity the "activity" basis of computeIdle (lib/pipelineSla.ts) exists
// to track, same as the link writes below.
opportunityItemsRouter.post(
  "/:opportunityId/activities",
  requirePermission("pipeline:view"),
  validate("params", opportunityIdParamSchema),
  validate("body", createActivitySchema),
  async (req, res) => {
    const { opportunityId } = req.params as unknown as z.infer<typeof opportunityIdParamSchema>;
    const { note } = req.body as z.infer<typeof createActivitySchema>;
    await ensureOpportunityExists(opportunityId);
    const activity = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunityActivity.create({
        data: { opportunityId, userId: req.user!.sub, note },
        include: { user: { select: PIC_SELECT } },
      });
      await tx.opportunity.update({
        where: { id: opportunityId },
        data: { lastActivityAt: new Date() },
      });
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
      await tx.opportunity.update({ where: { id: opportunityId }, data: { lastActivityAt: new Date() } });
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
      select: { id: true, opportunityId: true },
    });
    if (!link || link.opportunityId !== opportunityId) {
      throw new HttpError(404, "not_found", "Link not found");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.opportunityLink.update({ where: { id: linkId }, data: body });
      await tx.opportunity.update({ where: { id: opportunityId }, data: { lastActivityAt: new Date() } });
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
      select: { id: true, opportunityId: true },
    });
    if (!link || link.opportunityId !== opportunityId) {
      throw new HttpError(404, "not_found", "Link not found");
    }
    await prisma.$transaction(async (tx) => {
      await tx.opportunityLink.delete({ where: { id: linkId } });
      await tx.opportunity.update({ where: { id: opportunityId }, data: { lastActivityAt: new Date() } });
    });
    res.status(204).end();
  },
);
