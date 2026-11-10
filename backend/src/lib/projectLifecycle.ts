import { Prisma, type PrismaClient, type ProjectStatus } from "@prisma/client";
import { HttpError } from "../http/errors.js";
import { utcMidnightOf, utcMidnightOfDayString } from "./dateBoundary.js";
import { CLOSED_TASK_STATUSES, OPEN_TASK_STATUS_FILTER } from "./taskStatus.js";

// Project lifecycle writes: the cancel cascade, the on-hold stamp and the
// reactivation date shift (docs/archive/plans/feedback-round-lifecycle-spec.md,
// F1 and F7). Every helper takes the caller's transaction; the caller has
// already taken the project lock (lockProject order: project first).

type Tx = Prisma.TransactionClient | PrismaClient;

const DAY_MS = 86_400_000;

/**
 * Whole calendar days from the UTC day of `since` to the `today` day string
 * (never negative). Approximate by up to one day for users ahead of UTC: the UI
 * derives its own pre-filled day count from `onHoldSince` in local time.
 */
export function wholeDaysBetween(since: Date, today: string | undefined): number {
  const end = today ? utcMidnightOfDayString(today) : utcMidnightOf(Date.now());
  return Math.max(0, Math.round((end.getTime() - utcMidnightOf(since).getTime()) / DAY_MS));
}

/**
 * Value for `Project.onHoldSince` when a status write runs: `undefined` leaves
 * the column alone, a Date stamps it, null clears it.
 */
export function onHoldSinceFor(
  before: ProjectStatus | null,
  next: ProjectStatus | undefined,
): Date | null | undefined {
  if (next === undefined) return undefined;
  if (next === "ON_HOLD") return before === "ON_HOLD" ? undefined : new Date();
  return before === "ON_HOLD" ? null : undefined;
}

/** True when a write moves the project into CANCELLED from any other status. */
export const entersCancelled = (before: ProjectStatus, next: ProjectStatus | undefined): boolean =>
  next === "CANCELLED" && before !== "CANCELLED";

/** True when a write moves an on-hold project back to ACTIVE or PLANNING. */
export const isReactivation = (before: ProjectStatus, next: ProjectStatus | undefined): boolean =>
  before === "ON_HOLD" && (next === "ACTIVE" || next === "PLANNING");

/**
 * Sets every open task of the project (subtasks included) to CANCELLED — the
 * same single `status` write a normal task cancel makes. DONE tasks and epics
 * are untouched. Returns how many tasks were cancelled.
 */
export async function cancelOpenTasks(tx: Tx, projectId: number): Promise<number> {
  const { count } = await tx.task.updateMany({
    where: { projectId, status: OPEN_TASK_STATUS_FILTER },
    data: { status: "CANCELLED" },
  });
  return count;
}

/**
 * Adds `days` calendar days to startDate and dueDate of every open task
 * (subtasks included) and every epic that is not closed. Baseline dates,
 * closed tasks and dependencies are untouched. Dates are stored as UTC
 * midnight in `timestamp(3)` columns, so interval addition is exact.
 * Returns the number of tasks whose dates moved.
 */
export async function shiftOpenDates(
  tx: Tx,
  projectId: number,
  days: number,
): Promise<{ shiftedTasks: number }> {
  const closed = Prisma.join(CLOSED_TASK_STATUSES.map((s) => Prisma.sql`${s}::"TaskStatus"`));
  // Bound from JS (not NOW()), like lib/positionRepack.ts: UTC regardless of session zone.
  // Epics are updated before tasks: epic delete locks the epic row, then its tasks.
  await tx.$executeRaw`
    UPDATE epics
    SET start_date = start_date + (${days}::int * INTERVAL '1 day'),
        due_date = due_date + (${days}::int * INTERVAL '1 day'),
        updated_at = ${new Date()}
    WHERE project_id = ${projectId}
      AND status NOT IN (${closed})
      AND (start_date IS NOT NULL OR due_date IS NOT NULL)`;
  const shiftedTasks = await tx.$executeRaw`
    UPDATE tasks
    SET start_date = start_date + (${days}::int * INTERVAL '1 day'),
        due_date = due_date + (${days}::int * INTERVAL '1 day')
    WHERE project_id = ${projectId}
      AND status NOT IN (${closed})
      AND (start_date IS NOT NULL OR due_date IS NOT NULL)`;
  return { shiftedTasks };
}

export function assertShiftAllowed(before: ProjectStatus, next: ProjectStatus | undefined): void {
  if (!isReactivation(before, next)) {
    throw new HttpError(
      400,
      "shift_requires_reactivation",
      "Dates can only be shifted when an on-hold project is moved back to Active or Planning",
    );
  }
}

export interface LifecyclePreview {
  openTasks: number;
  doneTasks: number;
  cancelledTasks: number;
  onHoldSince: Date | null;
  holdDays: number | null;
  pastDueOpenTasks: number;
}

export async function getLifecyclePreview(
  db: Tx,
  projectId: number,
  today: string | undefined,
): Promise<LifecyclePreview> {
  const boundary = today ? utcMidnightOfDayString(today) : utcMidnightOf(Date.now());
  const [project, groups, pastDueOpenTasks] = await Promise.all([
    db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { status: true, onHoldSince: true },
    }),
    db.task.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
    db.task.count({
      where: { projectId, status: OPEN_TASK_STATUS_FILTER, dueDate: { lt: boundary } },
    }),
  ]);
  const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    openTasks: n("TODO") + n("IN_PROGRESS"),
    doneTasks: n("DONE"),
    cancelledTasks: n("CANCELLED"),
    onHoldSince: project.onHoldSince,
    holdDays:
      project.status === "ON_HOLD" && project.onHoldSince
        ? wholeDaysBetween(project.onHoldSince, today)
        : null,
    pastDueOpenTasks,
  };
}
