import { isTaskOverdue } from "./formatDate";
import type { ProjectStatus, TaskStatus } from "./queries";

/**
 * Project statuses whose tasks are never overdue: ON_HOLD and CANCELLED. The
 * server applies the same rule to every count and list it serves
 * (backend/src/lib/taskStatus.ts, NO_OVERDUE_PROJECT_STATUSES).
 */
export function projectSuppressesOverdue(projectStatus: ProjectStatus | undefined): boolean {
  return projectStatus === "ON_HOLD" || projectStatus === "CANCELLED";
}

/**
 * The one client-side rule for "is this task painted as overdue": the plain
 * date predicate, except that a task in an ON_HOLD or CANCELLED project is
 * never overdue. `projectStatus` undefined (project not loaded yet) keeps the
 * plain predicate, so a task is never hidden-as-fine by a missing lookup.
 */
export function isTaskShownOverdue(
  status: TaskStatus,
  dueDateIso: string | null,
  todayDay: string | null,
  projectStatus: ProjectStatus | undefined,
): boolean {
  if (projectSuppressesOverdue(projectStatus)) return false;
  return isTaskOverdue(status, dueDateIso, todayDay);
}

/**
 * True when a task's due date reads as the plain date (no "Nd late"): finished
 * tasks, and any task of an ON_HOLD or CANCELLED project (never overdue).
 */
export function showsPlainDue(
  status: TaskStatus,
  projectStatus: ProjectStatus | undefined,
): boolean {
  return status === "DONE" || status === "CANCELLED" || projectSuppressesOverdue(projectStatus);
}
