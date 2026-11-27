import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAnyPermission, requireAuth, requirePermission } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { ensureTaskVisible } from "../lib/visibility.js";
import { recordActivity, type ActivityAction } from "../lib/activity.js";
import { createLinkSchema, updateLinkSchema } from "../lib/linkSchemas.js";

// Label + http(s) URL document links on a task (docs/archive/plans/task-links.md).
// Same body rules as project, customer and deal links. Reading needs the task
// read gate (same as comments); adding, editing or removing needs `task:write`
// (same as editing the task). Links are internal: they never reach exports or
// the guest view. Mounted on /tasks after tasksRouter.
//
// Every write records a project activity event in the same transaction. The
// event carries the link's label and the task id, never the URL; its
// entityLabel is the task title (same as a comment event).

const taskParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const linkParamsSchema = taskParamsSchema.extend({ linkId: z.guid() });

// Visibility 404 before any body validation, so a hidden task cannot be told
// apart from a missing one by a 400.
async function requireVisible(req: Request, _res: Response, next: NextFunction) {
  const { id } = req.params as unknown as z.infer<typeof taskParamsSchema>;
  await ensureTaskVisible(req.user!, id);
  next();
}

async function recordLinkEvent(
  tx: Prisma.TransactionClient,
  actorId: number,
  taskId: number,
  action: ActivityAction,
  link: { id: string; label: string },
) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, title: true },
  });
  if (!task) throw new HttpError(404, "not_found", "Task not found");
  await recordActivity(tx, {
    projectId: task.projectId,
    actorId,
    entityType: "task_link",
    entityId: null,
    action,
    entityLabel: task.title,
    changes: { taskId, linkId: link.id, label: link.label },
  });
}

export const taskLinksRouter = Router();

taskLinksRouter.use(requireAuth);

taskLinksRouter.get(
  "/:id/links",
  requireAnyPermission("project:read", "pipeline:view"),
  validate("params", taskParamsSchema),
  requireVisible,
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof taskParamsSchema>;
    const links = await prisma.taskLink.findMany({
      where: { taskId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    res.json(links);
  },
);

taskLinksRouter.post(
  "/:id/links",
  requirePermission("task:write"),
  validate("params", taskParamsSchema),
  requireVisible,
  validate("body", createLinkSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof taskParamsSchema>;
    const body = req.body as z.infer<typeof createLinkSchema>;
    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.taskLink.create({
        data: { taskId: id, label: body.label, url: body.url },
      });
      await recordLinkEvent(tx, req.user!.sub, id, "added", created);
      return created;
    });
    res.status(201).json(link);
  },
);

taskLinksRouter.patch(
  "/:id/links/:linkId",
  requirePermission("task:write"),
  validate("params", linkParamsSchema),
  requireVisible,
  validate("body", updateLinkSchema),
  async (req, res) => {
    const { id, linkId } = req.params as unknown as z.infer<typeof linkParamsSchema>;
    const body = req.body as z.infer<typeof updateLinkSchema>;
    const link = await prisma.taskLink.findFirst({ where: { id: linkId, taskId: id } });
    if (!link) throw new HttpError(404, "not_found", "Link not found");

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.taskLink.update({ where: { id: linkId }, data: body });
      // Re-saving identical values records nothing.
      if (result.label !== link.label || result.url !== link.url) {
        await recordLinkEvent(tx, req.user!.sub, id, "updated", result);
      }
      return result;
    });
    res.json(updated);
  },
);

taskLinksRouter.delete(
  "/:id/links/:linkId",
  requirePermission("task:write"),
  validate("params", linkParamsSchema),
  requireVisible,
  async (req, res) => {
    const { id, linkId } = req.params as unknown as z.infer<typeof linkParamsSchema>;
    const link = await prisma.taskLink.findFirst({
      where: { id: linkId, taskId: id },
      select: { id: true, label: true },
    });
    if (!link) throw new HttpError(404, "not_found", "Link not found");

    await prisma.$transaction(async (tx) => {
      await tx.taskLink.delete({ where: { id: linkId } });
      await recordLinkEvent(tx, req.user!.sub, id, "removed", link);
    });
    res.status(204).end();
  },
);
