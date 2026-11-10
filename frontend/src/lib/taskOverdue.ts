import { isTaskOverdue } from "./formatDate";
import type { ProjectStatus, TaskStatus } from "./queries";

/**
 * The one client-side rule for "is this task painted as overdue": the plain
 * date predicate, except that a task in an ON_HOLD project is never overdue
 * (the server applies the same rule to every count and list it serves).
 * `projectStatus` undefined (project not loaded yet) keeps the plain
 * predicate, so a task is never hidden-as-fine by a missing lookup.
 */
export function isTaskShownOverdue(
  status: TaskStatus,
  dueDateIso: string | null,
  todayDay: string | null,
  projectStatus: ProjectStatus | undefined,
): boolean {
  if (projectStatus === "ON_HOLD") return false;
  return isTaskOverdue(status, dueDateIso, todayDay);
}

/**
 * True when a task's due date reads as the plain date (no "Nd late"): finished
 * tasks, and any task of an ON_HOLD project (never overdue while on hold).
 */
export function showsPlainDue(
  status: TaskStatus,
  projectStatus: ProjectStatus | undefined,
): boolean {
  return status === "DONE" || status === "CANCELLED" || projectStatus === "ON_HOLD";
}
