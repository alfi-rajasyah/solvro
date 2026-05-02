import type { ProjectStatus, TaskStatus } from "@/lib/queries";

const PROJECT_TONE: Record<ProjectStatus, string> = {
  PLANNING: "bg-surface-container text-on-surface-variant",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  ON_HOLD: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-primary/10 text-primary",
  CANCELLED: "bg-error-container text-on-error-container",
};

const TASK_TONE: Record<TaskStatus, string> = {
  TODO: "bg-surface-container text-on-surface-variant",
  IN_PROGRESS: "bg-primary/10 text-primary",
  DONE: "bg-emerald-100 text-emerald-700",
};

const TASK_LABEL: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${PROJECT_TONE[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${TASK_TONE[status]}`}
    >
      {TASK_LABEL[status]}
    </span>
  );
}
