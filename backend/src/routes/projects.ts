import { Router } from "express";
import { z } from "zod";
import {
  NoteVisibility,
  Prisma,
  Priority,
  ProjectStatus,
  RiskCategory,
  RiskStatus,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "../prisma.js";
import {
  hasPermission,
  requireAuth,
  requirePermission,
  type JwtPayload,
} from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  saId: z.number().int().positive(),
  tamId: z.number().int().positive().optional(),
  customerId: z.number().int().positive(),
  status: z.nativeEnum(ProjectStatus).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  saId: z.number().int().positive().optional(),
  tamId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
});

const projectListQuerySchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  assignedToId: z.number().int().positive().nullable().optional(),
  parentTaskId: z.number().int().positive().nullable().optional(),
  sectionId: z.number().int().positive().nullable().optional(),
  labelIds: z.array(z.number().int().positive()).optional(),
  isMilestone: z.boolean().optional(),
});

const createSectionSchema = z.object({
  name: z.string().min(1).max(100),
  position: z.number().int().min(0).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const taskListQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  parentTaskId: z
    .union([z.literal("null"), z.coerce.number().int().positive()])
    .optional(),
});

export function projectVisibilityFilter(user: JwtPayload): Prisma.ProjectWhereInput {
  // Wildcard permission grants global visibility (built-in ADMIN, plus any
  // custom role configured with "*" by the deployer in Admin > Roles).
  if (hasPermission(user, "*")) return {};
  switch (user.role) {
    case "STAKEHOLDER":
      return {};
    case "TAM":
      return { tamId: user.sub };
    case "SA":
      return { saId: user.sub };
    default:
      // Custom roles without "*": only see projects they're directly
      // assigned to (as TAM or SA on the project row). Admin can grant
      // broader access by adding "*" to that role's permissions.
      return { OR: [{ tamId: user.sub }, { saId: user.sub }] };
  }
}

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get("/", validate("query", projectListQuerySchema), async (req, res) => {
  const { customerId } = req.query as unknown as z.infer<typeof projectListQuerySchema>;
  const where: Prisma.ProjectWhereInput = projectVisibilityFilter(req.user!);
  if (customerId) where.customerId = customerId;
  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      sa: { select: { id: true, username: true } },
      tam: { select: { id: true, username: true } },
      customer: { select: { id: true, name: true } },
    },
  });
  res.json(projects);
});

projectsRouter.post(
  "/",
  requirePermission("project:write"),
  validate("body", createProjectSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof createProjectSchema>;
    const tamId = body.tamId ?? req.user!.sub;

    const project = await prisma.project.create({
      data: {
        name: body.name,
        description: body.description,
        saId: body.saId,
        tamId,
        customerId: body.customerId,
        status: body.status ?? "PLANNING",
      },
    });
    res.status(201).json(project);
  },
);

projectsRouter.get("/:id", validate("params", idParamSchema), async (req, res) => {
  const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      sa: { select: { id: true, username: true, email: true } },
      tam: { select: { id: true, username: true, email: true } },
      customer: { select: { id: true, name: true } },
      baselineLockedBy: { select: { id: true, username: true } },
      _count: { select: { tasks: true, blueprints: true } },
    },
  });
  if (!project) throw new HttpError(404, "not_found", "Project not found");

  const filter = projectVisibilityFilter(req.user!);
  if ("tamId" in filter && project.tamId !== filter.tamId) {
    throw new HttpError(403, "forbidden", "Project not visible to caller");
  }
  if ("saId" in filter && project.saId !== filter.saId) {
    throw new HttpError(403, "forbidden", "Project not visible to caller");
  }

  res.json(project);
});

const lockBaselineSchema = z.object({
  asOfDate: z.coerce.date().optional(),
  clear: z.boolean().optional(),
});

projectsRouter.post(
  "/:id/baseline",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", lockBaselineSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { asOfDate, clear } = req.body as z.infer<typeof lockBaselineSchema>;
    const lockedAt = asOfDate ?? new Date();

    const updated = await prisma.$transaction(async (tx) => {
      if (clear) {
        await tx.$executeRaw`
          UPDATE tasks
          SET baseline_start_date = NULL,
              baseline_due_date = NULL
          WHERE project_id = ${id}
        `;
        return tx.project.update({
          where: { id },
          data: { baselineLockedAt: null, baselineLockedById: null },
          include: {
            sa: { select: { id: true, username: true, email: true } },
            tam: { select: { id: true, username: true, email: true } },
            customer: { select: { id: true, name: true } },
            baselineLockedBy: { select: { id: true, username: true } },
            _count: { select: { tasks: true, blueprints: true } },
          },
        });
      }
      // Column-to-column copy: live → baseline for every task in the project.
      // Prisma's updateMany can't reference other columns, so raw SQL.
      await tx.$executeRaw`
        UPDATE tasks
        SET baseline_start_date = start_date,
            baseline_due_date = due_date
        WHERE project_id = ${id}
      `;
      return tx.project.update({
        where: { id },
        data: {
          baselineLockedAt: lockedAt,
          baselineLockedById: req.user!.sub,
        },
        include: {
          sa: { select: { id: true, username: true, email: true } },
          tam: { select: { id: true, username: true, email: true } },
          customer: { select: { id: true, name: true } },
          baselineLockedBy: { select: { id: true, username: true } },
          _count: { select: { tasks: true, blueprints: true } },
        },
      });
    });
    res.json(updated);
  },
);

projectsRouter.patch(
  "/:id",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", updateProjectSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const updated = await prisma.project.update({
      where: { id },
      data: req.body as z.infer<typeof updateProjectSchema>,
    });
    res.json(updated);
  },
);

projectsRouter.get(
  "/:id/tasks",
  validate("params", idParamSchema),
  validate("query", taskListQuerySchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { status, parentTaskId } = req.query as unknown as z.infer<typeof taskListQuerySchema>;

    const where: Prisma.TaskWhereInput = { projectId: id };
    if (status) where.status = status;
    if (parentTaskId === "null") where.parentTaskId = null;
    else if (typeof parentTaskId === "number") where.parentTaskId = parentTaskId;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { id: "asc" },
      include: {
        assignedTo: { select: { id: true, username: true, email: true } },
        labels: true,
        section: { select: { id: true, name: true, position: true, color: true } },
        _count: { select: { subtasks: true, comments: true } },
      },
    });
    res.json(tasks);
  },
);

projectsRouter.post(
  "/:id/tasks",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", createTaskSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof createTaskSchema>;

    if (body.parentTaskId) {
      const parent = await prisma.task.findUnique({
        where: { id: body.parentTaskId },
        select: { projectId: true },
      });
      if (!parent || parent.projectId !== id) {
        throw new HttpError(400, "invalid_parent", "Parent task must belong to this project");
      }
    }

    const task = await prisma.task.create({
      data: {
        projectId: id,
        title: body.title,
        description: body.description,
        status: body.status ?? "TODO",
        priority: body.priority ?? "MEDIUM",
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        assignedToId: body.assignedToId ?? null,
        parentTaskId: body.parentTaskId ?? null,
        sectionId: body.sectionId ?? null,
        isMilestone: body.isMilestone ?? false,
        labels: body.labelIds && body.labelIds.length > 0
          ? { connect: body.labelIds.map((lid) => ({ id: lid })) }
          : undefined,
      },
      include: {
        assignedTo: { select: { id: true, username: true, email: true } },
        labels: true,
        section: { select: { id: true, name: true, position: true, color: true } },
        _count: { select: { subtasks: true, comments: true } },
      },
    });
    res.status(201).json(task);
  },
);

projectsRouter.get(
  "/:id/sections",
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const sections = await prisma.section.findMany({
      where: { projectId: id },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    res.json(sections);
  },
);

projectsRouter.post(
  "/:id/sections",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", createSectionSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof createSectionSchema>;
    const max = await prisma.section.aggregate({
      where: { projectId: id },
      _max: { position: true },
    });
    const section = await prisma.section.create({
      data: {
        projectId: id,
        name: body.name,
        position: body.position ?? (max._max.position ?? -1) + 1,
        ...(body.color !== undefined && { color: body.color }),
      },
    });
    res.status(201).json(section);
  },
);

// Project-scoped risks
const createRiskSchema = z.object({
  description: z.string().min(1).max(2000),
  category: z.nativeEnum(RiskCategory).optional(),
  probability: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  status: z.nativeEnum(RiskStatus).optional(),
  mitigationPlan: z.string().max(4000).nullable().optional(),
  contingencyPlan: z.string().max(4000).nullable().optional(),
});

projectsRouter.get(
  "/:id/risks",
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const filter: Prisma.ProjectWhereInput = projectVisibilityFilter(req.user!);
    const project = await prisma.project.findFirst({
      where: { id, ...filter },
      select: { id: true },
    });
    if (!project) throw new HttpError(404, "not_found", "Project not found");

    const risks = await prisma.risk.findMany({
      where: { projectId: id },
      orderBy: [{ status: "asc" }, { id: "desc" }],
    });
    res.json(risks);
  },
);

projectsRouter.post(
  "/:id/risks",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", createRiskSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const filter: Prisma.ProjectWhereInput = projectVisibilityFilter(req.user!);
    const project = await prisma.project.findFirst({
      where: { id, ...filter },
      select: { id: true },
    });
    if (!project) throw new HttpError(404, "not_found", "Project not found");

    const body = req.body as z.infer<typeof createRiskSchema>;
    const risk = await prisma.risk.create({
      data: {
        projectId: id,
        description: body.description,
        category: body.category ?? "INTERNAL",
        probability: body.probability ?? 1,
        impact: body.impact ?? 1,
        status: body.status ?? "OPEN",
        mitigationPlan: body.mitigationPlan ?? null,
        contingencyPlan: body.contingencyPlan ?? null,
      },
    });
    res.status(201).json(risk);
  },
);

// Project-scoped Daily Review notes.
// INTERNAL is the default visibility; CUSTOMER_FACING is opt-in per note
// and is the only visibility the Reports export packet ever surfaces.
const noteListQuerySchema = z.object({
  visibility: z.nativeEnum(NoteVisibility).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createNoteSchema = z.object({
  body: z.string().min(1).max(4000),
  visibility: z.nativeEnum(NoteVisibility).optional(),
});

projectsRouter.get(
  "/:id/notes",
  validate("params", idParamSchema),
  validate("query", noteListQuerySchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { visibility, limit } = req.query as unknown as z.infer<
      typeof noteListQuerySchema
    >;
    const filter: Prisma.ProjectWhereInput = projectVisibilityFilter(req.user!);
    const project = await prisma.project.findFirst({
      where: { id, ...filter },
      select: { id: true },
    });
    if (!project) throw new HttpError(404, "not_found", "Project not found");

    const notes = await prisma.projectNote.findMany({
      where: { projectId: id, ...(visibility && { visibility }) },
      orderBy: { createdAt: "desc" },
      take: limit ?? 50,
      include: { author: { select: { id: true, username: true } } },
    });
    res.json(notes);
  },
);

projectsRouter.post(
  "/:id/notes",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", createNoteSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const filter: Prisma.ProjectWhereInput = projectVisibilityFilter(req.user!);
    const project = await prisma.project.findFirst({
      where: { id, ...filter },
      select: { id: true },
    });
    if (!project) throw new HttpError(404, "not_found", "Project not found");

    const body = req.body as z.infer<typeof createNoteSchema>;
    const note = await prisma.projectNote.create({
      data: {
        projectId: id,
        authorId: req.user!.sub,
        body: body.body,
        visibility: body.visibility ?? "INTERNAL",
      },
      include: { author: { select: { id: true, username: true } } },
    });
    res.status(201).json(note);
  },
);

// Project-scoped task dependencies. The dependency rows themselves are
// item-scoped (PATCH/DELETE) in routes/dependencies.ts; collection routes
// stay here for URL nesting.
const createDependencySchema = z.object({
  predecessorTaskId: z.number().int().positive(),
  successorTaskId: z.number().int().positive(),
  type: z.enum(["HARD", "SOFT"]).optional(),
  // Routing hints from the diagram drag — preserve which side of each
  // node the connection enters/exits. Validated loosely: any string from
  // the client, since the handle ID set is owned by the React Flow code.
  sourceHandle: z.string().max(40).nullable().optional(),
  targetHandle: z.string().max(40).nullable().optional(),
});

projectsRouter.get(
  "/:id/dependencies",
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const filter: Prisma.ProjectWhereInput = projectVisibilityFilter(req.user!);
    const project = await prisma.project.findFirst({
      where: { id, ...filter },
      select: { id: true },
    });
    if (!project) throw new HttpError(404, "not_found", "Project not found");

    const deps = await prisma.taskDependency.findMany({
      where: { projectId: id },
      orderBy: { id: "asc" },
    });
    res.json(deps);
  },
);

projectsRouter.post(
  "/:id/dependencies",
  requirePermission("task:write"),
  validate("params", idParamSchema),
  validate("body", createDependencySchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const filter: Prisma.ProjectWhereInput = projectVisibilityFilter(req.user!);
    const project = await prisma.project.findFirst({
      where: { id, ...filter },
      select: { id: true },
    });
    if (!project) throw new HttpError(404, "not_found", "Project not found");

    const body = req.body as z.infer<typeof createDependencySchema>;
    if (body.predecessorTaskId === body.successorTaskId) {
      throw new HttpError(400, "self_dependency", "A task cannot depend on itself.");
    }

    // Both endpoints must live on this project.
    const tasks = await prisma.task.findMany({
      where: { id: { in: [body.predecessorTaskId, body.successorTaskId] }, projectId: id },
      select: { id: true },
    });
    if (tasks.length !== 2) {
      throw new HttpError(400, "task_not_in_project", "Both tasks must belong to this project.");
    }

    // Reject cycles: walk forward from `successor` over existing edges; if we
    // reach `predecessor` the new edge would close a loop.
    const allEdges = await prisma.taskDependency.findMany({
      where: { projectId: id },
      select: { predecessorTaskId: true, successorTaskId: true },
    });
    const adj = new Map<number, number[]>();
    for (const e of allEdges) {
      const arr = adj.get(e.predecessorTaskId) ?? [];
      arr.push(e.successorTaskId);
      adj.set(e.predecessorTaskId, arr);
    }
    const seen = new Set<number>();
    const stack = [body.successorTaskId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === body.predecessorTaskId) {
        throw new HttpError(400, "cycle", "This dependency would create a cycle.");
      }
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of adj.get(cur) ?? []) stack.push(next);
    }

    try {
      const dep = await prisma.taskDependency.create({
        data: {
          projectId: id,
          predecessorTaskId: body.predecessorTaskId,
          successorTaskId: body.successorTaskId,
          type: body.type ?? "HARD",
          sourceHandle: body.sourceHandle ?? null,
          targetHandle: body.targetHandle ?? null,
        },
      });
      res.status(201).json(dep);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, "duplicate", "This dependency already exists.");
      }
      throw err;
    }
  },
);

// Project-scoped labels (kept on the projects router for the nested URL)
const createLabelSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

projectsRouter.get(
  "/:id/labels",
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const labels = await prisma.label.findMany({
      where: { projectId: id },
      orderBy: { name: "asc" },
    });
    res.json(labels);
  },
);

projectsRouter.post(
  "/:id/labels",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", createLabelSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof createLabelSchema>;
    const label = await prisma.label.create({
      data: {
        projectId: id,
        name: body.name,
        color: body.color ?? "#0058be",
      },
    });
    res.status(201).json(label);
  },
);
