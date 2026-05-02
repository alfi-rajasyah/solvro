import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { hasPermission, requireAuth, type JwtPayload } from "../http/auth.js";

export const overviewRouter = Router();

overviewRouter.use(requireAuth);

function projectScope(user: JwtPayload): Prisma.ProjectWhereInput {
  if (hasPermission(user, "*")) return {};
  switch (user.role) {
    case "STAKEHOLDER":
      return {};
    case "TAM":
      return { tamId: user.sub };
    case "SA":
      return { saId: user.sub };
    default:
      return { OR: [{ tamId: user.sub }, { saId: user.sub }] };
  }
}

overviewRouter.get("/", async (req, res) => {
  const user = req.user!;
  const scope = projectScope(user);

  const [projectCount, projectsByStatus, taskGroups, recentProjects, recentTasks] =
    await Promise.all([
      prisma.project.count({ where: scope }),
      prisma.project.groupBy({
        by: ["status"],
        where: scope,
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ["status"],
        where: { project: scope },
        _count: { _all: true },
      }),
      prisma.project.findMany({
        where: scope,
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: {
          tam: { select: { id: true, username: true } },
          sa: { select: { id: true, username: true } },
          _count: { select: { tasks: true } },
        },
      }),
      prisma.task.findMany({
        where: { project: scope },
        orderBy: { id: "desc" },
        take: 5,
        include: {
          project: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, username: true } },
        },
      }),
    ]);

  const taskCounts = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const g of taskGroups) taskCounts[g.status] = g._count._all;

  const projectStatusCounts = Object.fromEntries(
    projectsByStatus.map((g) => [g.status, g._count._all]),
  );

  res.json({
    projectCount,
    projectStatusCounts,
    taskCounts,
    recentProjects,
    recentTasks,
  });
});
