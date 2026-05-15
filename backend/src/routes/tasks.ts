import { Router } from "express";
import { z } from "zod";
import { Prisma, Priority, TaskStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission, type JwtPayload } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { projectVisibilityFilter } from "./projects.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  baselineStartDate: z.coerce.date().nullable().optional(),
  baselineDueDate: z.coerce.date().nullable().optional(),
  assignedToId: z.number().int().positive().nullable().optional(),
  parentTaskId: z.number().int().positive().nullable().optional(),
  sectionId: z.number().int().positive().nullable().optional(),
  labelIds: z.array(z.number().int().positive()).optional(),
});

const tasksListQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assignedToId: z.coerce.number().int().positive().optional(),
  labelId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  overdue: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  topLevel: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
});

const createCommentSchema = z.object({
  body: z.string().min(1).max(5000),
});

function buildVisibilityWhere(user: JwtPayload): Prisma.TaskWhereInput {
  const projectWhere = projectVisibilityFilter(user);
  if (Object.keys(projectWhere).length === 0) return {};
  return { project: projectWhere };
}

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

// Cross-project list with filters
tasksRouter.get("/", validate("query", tasksListQuerySchema), async (req, res) => {
  const { status, priority, assignedToId, labelId, customerId, overdue, topLevel } =
    req.query as unknown as z.infer<typeof tasksListQuerySchema>;

  const where: Prisma.TaskWhereInput = {
    ...buildVisibilityWhere(req.user!),
  };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (assignedToId) where.assignedToId = assignedToId;
  if (labelId) where.labels = { some: { id: labelId } };
  if (customerId) {
    where.project = { ...(where.project as object | undefined), customerId };
  }
  if (topLevel) where.parentTaskId = null;
  if (overdue) {
    where.dueDate = { lt: new Date() };
    where.status = { not: "DONE" };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    include: {
      assignedTo: { select: { id: true, username: true, email: true } },
      labels: true,
      project: {
        select: {
          id: true,
          name: true,
          customer: { select: { id: true, name: true } },
        },
      },
      _count: { select: { subtasks: true, comments: true } },
    },
    take: 200,
  });
  res.json(tasks);
});

tasksRouter.patch(
  "/:id",
  requirePermission("task:write"),
  validate("params", idParamSchema),
  validate("body", updateTaskSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof updateTaskSchema>;

    if (body.parentTaskId === id) {
      throw new HttpError(400, "invalid_parent", "Task cannot be its own parent");
    }

    const data: Prisma.TaskUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.startDate !== undefined) data.startDate = body.startDate;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate;
    if (body.assignedToId !== undefined) {
      data.assignedTo = body.assignedToId === null
        ? { disconnect: true }
        : { connect: { id: body.assignedToId } };
    }
    if (body.parentTaskId !== undefined) {
      data.parent = body.parentTaskId === null
        ? { disconnect: true }
        : { connect: { id: body.parentTaskId } };
    }
    if (body.sectionId !== undefined) {
      data.section = body.sectionId === null
        ? { disconnect: true }
        : { connect: { id: body.sectionId } };
    }
    if (body.labelIds !== undefined) {
      data.labels = { set: body.labelIds.map((lid) => ({ id: lid })) };
    }

    const updated = await prisma.task.update({
      where: { id },
      data,
      include: {
        assignedTo: { select: { id: true, username: true, email: true } },
        labels: true,
        section: { select: { id: true, name: true, position: true, color: true } },
        _count: { select: { subtasks: true, comments: true } },
      },
    });
    res.json(updated);
  },
);

tasksRouter.delete(
  "/:id",
  requirePermission("task:write"),
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    await prisma.task.delete({ where: { id } });
    res.status(204).end();
  },
);

// Comments thread
tasksRouter.get(
  "/:id/comments",
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const comments = await prisma.comment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, username: true, email: true } } },
    });
    res.json(comments);
  },
);

tasksRouter.post(
  "/:id/comments",
  validate("params", idParamSchema),
  validate("body", createCommentSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { body } = req.body as z.infer<typeof createCommentSchema>;
    const comment = await prisma.comment.create({
      data: {
        taskId: id,
        authorId: req.user!.sub,
        body,
      },
      include: { author: { select: { id: true, username: true, email: true } } },
    });
    res.status(201).json(comment);
  },
);
