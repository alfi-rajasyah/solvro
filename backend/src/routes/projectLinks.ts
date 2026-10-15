import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { ensureProjectVisible } from "../lib/visibility.js";
import { recordActivity } from "../lib/activity.js";
import { createLinkSchema, updateLinkSchema } from "../lib/linkSchemas.js";

// Label + http(s) URL document links on a project (docs/archive/plans/project-customer-links.md).
// Anyone who can see the project and holds `project:write` may add, edit or
// remove them — not owner-only. Links are internal: they never reach exports
// or the guest view. Mounted on /projects next to shareLinksRouter.
//
// Every write records a project activity event in the same transaction. The
// event carries the link's label only — never the URL (same rule as deal links).

const projectParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const linkParamsSchema = projectParamsSchema.extend({ linkId: z.string().uuid() });

// Visibility 404 before any body validation, so a hidden project cannot be
// told apart from a missing one by a 400.
async function requireVisible(req: Request, _res: Response, next: NextFunction) {
  const { id } = req.params as unknown as z.infer<typeof projectParamsSchema>;
  await ensureProjectVisible(req.user!, id);
  next();
}

export const projectLinksRouter = Router();

projectLinksRouter.use(requireAuth);

projectLinksRouter.get(
  "/:id/links",
  requirePermission("project:read"),
  validate("params", projectParamsSchema),
  requireVisible,
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof projectParamsSchema>;
    const links = await prisma.projectLink.findMany({
      where: { projectId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    res.json(links);
  },
);

projectLinksRouter.post(
  "/:id/links",
  requirePermission("project:write"),
  validate("params", projectParamsSchema),
  requireVisible,
  validate("body", createLinkSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof projectParamsSchema>;
    const body = req.body as z.infer<typeof createLinkSchema>;
    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.projectLink.create({
        data: { projectId: id, label: body.label, url: body.url },
      });
      await recordActivity(tx, {
        projectId: id,
        actorId: req.user!.sub,
        entityType: "project_link",
        entityId: null,
        action: "added",
        entityLabel: created.label,
        changes: { linkId: created.id, label: created.label },
      });
      return created;
    });
    res.status(201).json(link);
  },
);

projectLinksRouter.patch(
  "/:id/links/:linkId",
  requirePermission("project:write"),
  validate("params", linkParamsSchema),
  requireVisible,
  validate("body", updateLinkSchema),
  async (req, res) => {
    const { id, linkId } = req.params as unknown as z.infer<typeof linkParamsSchema>;
    const body = req.body as z.infer<typeof updateLinkSchema>;
    const link = await prisma.projectLink.findFirst({ where: { id: linkId, projectId: id } });
    if (!link) throw new HttpError(404, "not_found", "Link not found");

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.projectLink.update({ where: { id: linkId }, data: body });
      // Re-saving identical values records nothing.
      if (result.label !== link.label || result.url !== link.url) {
        await recordActivity(tx, {
          projectId: id,
          actorId: req.user!.sub,
          entityType: "project_link",
          entityId: null,
          action: "updated",
          entityLabel: result.label,
          changes: { linkId, label: result.label },
        });
      }
      return result;
    });
    res.json(updated);
  },
);

projectLinksRouter.delete(
  "/:id/links/:linkId",
  requirePermission("project:write"),
  validate("params", linkParamsSchema),
  requireVisible,
  async (req, res) => {
    const { id, linkId } = req.params as unknown as z.infer<typeof linkParamsSchema>;
    const link = await prisma.projectLink.findFirst({
      where: { id: linkId, projectId: id },
      select: { id: true, label: true },
    });
    if (!link) throw new HttpError(404, "not_found", "Link not found");

    await prisma.$transaction(async (tx) => {
      await tx.projectLink.delete({ where: { id: linkId } });
      await recordActivity(tx, {
        projectId: id,
        actorId: req.user!.sub,
        entityType: "project_link",
        entityId: null,
        action: "removed",
        entityLabel: link.label,
        changes: { linkId, label: link.label },
      });
    });
    res.status(204).end();
  },
);
