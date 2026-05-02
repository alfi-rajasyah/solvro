import { useMemo, useState } from "react";
import { useProjectContext } from "../ProjectDetail";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { LabelChip } from "@/components/LabelChip";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TaskStatusChip } from "@/components/StatusChip";
import { TaskFormModal } from "@/components/TaskFormModal";
import { useAuth } from "@/lib/auth";
import { type Priority, type Task, type TaskStatus, useProjectTasks, useUpdateTask } from "@/lib/queries";

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const PRIORITY_ORDER: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function ProjectTimeline() {
  const { project } = useProjectContext();
  const { user } = useAuth();
  const { data: tasks, isLoading, isError, error } = useProjectTasks(project.id);
  const updateTask = useUpdateTask(project.id);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const canEdit = user?.role === "TAM" || user?.role === "ADMIN";

  const ordered = useMemo(() => {
    if (!tasks) return [];
    const topLevel = tasks.filter((t) => t.parentTaskId === null);
    return [...topLevel].sort((a, b) => {
      const aStart = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY;
      if (aStart !== bStart) return aStart - bStart;
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      const ap = PRIORITY_ORDER[a.priority];
      const bp = PRIORITY_ORDER[b.priority];
      if (ap !== bp) return ap - bp;
      return a.id - b.id;
    });
  }, [tasks]);

  const subtasksOf = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const t of tasks ?? []) {
      if (t.parentTaskId !== null) {
        const arr = map.get(t.parentTaskId) ?? [];
        arr.push(t);
        map.set(t.parentTaskId, arr);
      }
    }
    return map;
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="h-64 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
    );
  }

  if (isError) {
    return (
      <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
        Could not load tasks: {(error as Error).message}
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="rounded border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center text-on-surface-variant">
        <p className="text-sm">No tasks yet. Add tasks from the Kanban board.</p>
      </div>
    );
  }

  return (
    <>
      <ol className="relative ml-3 border-l border-outline-variant">
        {ordered.map((task) => (
          <TimelineItem
            key={task.id}
            task={task}
            subtasks={subtasksOf.get(task.id) ?? []}
            canEdit={canEdit}
            onChangeStatus={(status) => updateTask.mutate({ id: task.id, patch: { status } })}
            onEdit={() => setEditTask(task)}
          />
        ))}
      </ol>

      {editTask && (
        <TaskFormModal
          mode="edit"
          open={editTask !== null}
          onClose={() => setEditTask(null)}
          projectId={project.id}
          task={editTask}
        />
      )}
    </>
  );
}

function TimelineItem({
  task,
  subtasks,
  canEdit,
  onChangeStatus,
  onEdit,
}: {
  task: Task;
  subtasks: Task[];
  canEdit: boolean;
  onChangeStatus: (status: TaskStatus) => void;
  onEdit: () => void;
}) {
  const overdue =
    task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < startOfToday();

  return (
    <li className="relative mb-4 ml-6">
      <span
        className={[
          "absolute -left-[34px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface-container-lowest",
          task.status === "DONE"
            ? "bg-emerald-500"
            : task.status === "IN_PROGRESS"
              ? "bg-primary"
              : "bg-surface-container-highest",
        ].join(" ")}
      />
      <div className="rounded border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:border-primary/40">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
              T-{String(task.id).padStart(3, "0")}
            </span>
            <TaskStatusChip status={task.status} />
            <PriorityBadge priority={task.priority} compact />
            {task.labels.slice(0, 4).map((l) => (
              <LabelChip key={l.id} label={l} compact />
            ))}
          </div>
          <span
            className={`font-mono text-[11px] ${overdue ? "font-bold text-error" : "text-on-surface-variant"}`}
          >
            {fmt(task.startDate)} → {fmt(task.dueDate)}
            {overdue && " · OVERDUE"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="block text-left text-sm font-medium text-on-surface hover:text-primary"
          >
            {task.title}
          </button>
          <AssigneeAvatar user={task.assignedTo} size="xs" />
        </div>
        {task.description && (
          <p className="mt-1 text-[11px] text-on-surface-variant">{task.description}</p>
        )}
        {subtasks.length > 0 && (
          <ul className="mt-2 space-y-0.5 border-l border-outline-variant pl-3">
            {subtasks.map((s) => (
              <li
                key={s.id}
                className={`text-[11px] ${s.status === "DONE" ? "text-on-surface-variant line-through" : "text-on-surface"}`}
              >
                {s.status === "DONE" ? "✓" : "·"} T-{String(s.id).padStart(3, "0")} {s.title}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="mt-3 flex items-center gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChangeStatus(s)}
                disabled={task.status === s}
                className={[
                  "rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider transition-colors",
                  task.status === s
                    ? "cursor-default bg-primary text-on-primary"
                    : "border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary",
                ].join(" ")}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
