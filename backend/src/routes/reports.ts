import { Router } from "express";
import { ProjectStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission } from "../http/auth.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

interface ExecutiveProjectRow {
  id: number;
  name: string;
  status: ProjectStatus;
  tamName: string;
  customerName: string | null;
  start: string | null;
  end: string | null;
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
  isOverdue: boolean;
  daysOverdue: number;
  sections: { id: number; name: string; color: string }[];
}

// Intentionally ORG-WIDE: this is the Executive/Manager portfolio roll-up.
// The `report:executive` permission itself is the org-wide read grant, so we
// deliberately do NOT apply projectVisibilityFilter here.
reportsRouter.get(
  "/executive",
  requirePermission("report:executive"),
  async (_req, res) => {
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        tam: { select: { username: true } },
        customer: { select: { name: true } },
        sections: {
          orderBy: { position: "asc" },
          select: { id: true, name: true, color: true },
        },
        tasks: {
          select: { status: true, startDate: true, dueDate: true },
        },
      },
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const rows: ExecutiveProjectRow[] = projects.map((project) => {
      const { tasks } = project;

      let startMs: number | null = null;
      let endMs: number | null = null;
      let doneTasks = 0;

      for (const task of tasks) {
        if (task.startDate !== null) {
          const ms = task.startDate.getTime();
          if (startMs === null || ms < startMs) startMs = ms;
        }
        if (task.dueDate !== null) {
          const ms = task.dueDate.getTime();
          if (endMs === null || ms > endMs) endMs = ms;
        }
        if (task.status === "DONE") doneTasks += 1;
      }

      const start = startMs !== null ? new Date(startMs).toISOString() : null;
      const end = endMs !== null ? new Date(endMs).toISOString() : null;

      const totalTasks = tasks.length;
      const progressPct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

      const isOverdue =
        endMs !== null &&
        endMs < startOfToday.getTime() &&
        project.status !== ProjectStatus.COMPLETED &&
        project.status !== ProjectStatus.CANCELLED;

      const daysOverdue = isOverdue
        ? Math.max(0, Math.floor((startOfToday.getTime() - (endMs as number)) / 86_400_000))
        : 0;

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        tamName: project.tam.username,
        customerName: project.customer?.name ?? null,
        start,
        end,
        totalTasks,
        doneTasks,
        progressPct,
        isOverdue,
        daysOverdue,
        sections: project.sections,
      };
    });

    res.json({ projects: rows, generatedAt: new Date().toISOString() });
  },
);
