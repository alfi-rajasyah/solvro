import { Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "../prisma.js";

export interface PortfolioProjectRow {
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
  updatedAt: string;
  sections: { id: number; name: string; color: string }[];
}

export async function computePortfolioRows(
  where: Prisma.ProjectWhereInput,
): Promise<PortfolioProjectRow[]> {
  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
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

  const rows: PortfolioProjectRow[] = projects.map((project) => {
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
      updatedAt: project.updatedAt.toISOString(),
      sections: project.sections,
    };
  });

  return rows;
}
