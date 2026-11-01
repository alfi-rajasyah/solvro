import type { TaskStatus } from "@prisma/client";

// A closed task is finished one way or the other: completed (DONE) or called
// off (CANCELLED). "Open / still to do / overdue" filters exclude every closed
// status; progress totals additionally drop CANCELLED from the denominator.
export const CLOSED_TASK_STATUSES: TaskStatus[] = ["DONE", "CANCELLED"];

export const isClosedTaskStatus = (status: TaskStatus | string): boolean =>
  (CLOSED_TASK_STATUSES as string[]).includes(status);

/** Prisma `status` filter matching only open (not DONE, not CANCELLED) tasks. */
export const OPEN_TASK_STATUS_FILTER = { notIn: CLOSED_TASK_STATUSES } as const;

/** Prisma `status` filter matching every task that counts toward progress totals. */
export const COUNTED_TASK_STATUS_FILTER = { not: "CANCELLED" } as const;

/**
 * Prisma `_count` select for a project's task total: counts every task except
 * CANCELLED, the same set the progress denominator uses, so a "tasks" figure
 * on a card, sidebar or admin table never disagrees with the progress bar
 * (docs/archive/plans/application-review-2026-10-22.md, F-26). It is NOT the
 * number deleting the project removes: cancelled tasks are deleted too.
 */
export const COUNTED_TASKS_COUNT = {
  select: { tasks: { where: { status: COUNTED_TASK_STATUS_FILTER } } },
} as const;
