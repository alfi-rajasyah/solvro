import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useProjectContext } from "../ProjectDetail";
import { LabelChip } from "@/components/LabelChip";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TaskFormModal } from "@/components/TaskFormModal";
import { hasPermission, useAuth } from "@/lib/auth";
import { type Task, type TaskStatus, useProjectTasks, useUpdateTask } from "@/lib/queries";

const COLUMNS: { id: TaskStatus; label: string; tone: string }[] = [
  { id: "TODO", label: "To Do", tone: "bg-surface-container text-on-surface-variant" },
  { id: "IN_PROGRESS", label: "In Progress", tone: "bg-primary/10 text-primary" },
  { id: "DONE", label: "Done", tone: "bg-emerald-100 text-emerald-700" },
];

export function ProjectKanban() {
  const { project } = useProjectContext();
  const { user } = useAuth();
  const { data: tasks, isLoading, isError, error } = useProjectTasks(project.id);
  const updateTask = useUpdateTask(project.id);

  // Permission-based, not role-name based: anyone with task:write (which
  // "*" also satisfies via hasPermission) can move cards.
  const canMove = hasPermission(user, "task:write");

  const [activeId, setActiveId] = useState<number | null>(null);
  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Top-level only on the board; subtasks render inside the parent's edit modal.
  const topLevel = useMemo(() => (tasks ?? []).filter((t) => t.parentTaskId === null), [tasks]);
  const subtaskMap = useMemo(() => {
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

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
    for (const t of topLevel) map[t.status].push(t);
    return map;
  }, [topLevel]);

  const activeTask = useMemo(
    () => (activeId ? topLevel.find((t) => t.id === activeId) ?? null : null),
    [activeId, topLevel],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = Number(active.id);
    const newStatus = over.id as TaskStatus;
    const moved = topLevel.find((t) => t.id === taskId);
    if (!moved || moved.status === newStatus) return;
    updateTask.mutate({ id: taskId, patch: { status: newStatus } });
  }

  // Toggling a subtask's DONE state from inside the parent card. Subtasks
  // ride along with their parent on the board (no drag of their own), but
  // the inline checklist lets you tick them off without opening the modal.
  const toggleSubtaskStatus = (sub: Task) => {
    const next: TaskStatus = sub.status === "DONE" ? "TODO" : "DONE";
    updateTask.mutate({ id: sub.id, patch: { status: next } });
  };

  if (isLoading) {
    return (
      <div className="grid h-full grid-cols-3 gap-4">
        {COLUMNS.map((c) => (
          <div
            key={c.id}
            className="h-64 animate-pulse rounded border border-outline-variant bg-surface-container-low"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
        Could not load tasks: {(error as Error).message}
      </div>
    );
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              label={col.label}
              tone={col.tone}
              tasks={grouped[col.id]}
              subtaskMap={subtaskMap}
              canAdd={canMove}
              canDrag={canMove}
              canToggleSubtasks={canMove}
              onAdd={() => setCreateStatus(col.id)}
              onCardClick={(t) => setEditTask(t)}
              onToggleSubtask={toggleSubtaskStatus}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} subtaskMap={subtaskMap} canDrag={false} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {createStatus && (
        <TaskFormModal
          mode="create"
          open={createStatus !== null}
          onClose={() => setCreateStatus(null)}
          projectId={project.id}
          initialStatus={createStatus}
        />
      )}

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

interface ColumnProps {
  id: TaskStatus;
  label: string;
  tone: string;
  tasks: Task[];
  subtaskMap: Map<number, Task[]>;
  canAdd: boolean;
  canDrag: boolean;
  canToggleSubtasks: boolean;
  onAdd: () => void;
  onCardClick: (t: Task) => void;
  onToggleSubtask: (s: Task) => void;
}

function Column({ id, label, tasks, subtaskMap, canAdd, canDrag, canToggleSubtasks, onAdd, onCardClick, onToggleSubtask }: ColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col gap-2.5 rounded-xl p-2 transition-all",
        isOver ? "bg-primary/5 ring-2 ring-inset ring-primary/30" : "",
      ].join(" ")}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-1 pb-1">
        <h3 className="text-sm font-bold text-on-surface">{label}</h3>
        <span className="material-symbols-outlined cursor-pointer text-base text-on-surface-variant hover:text-on-surface">
          more_horiz
        </span>
      </div>

      {/* Teal dashed add box */}
      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex h-9 w-full items-center justify-center rounded-lg border-[1.5px] border-dashed border-teal-500 text-xl font-light text-teal-500 transition-colors hover:bg-teal-50 dark:hover:bg-teal-900/20"
        >
          +
        </button>
      )}

      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          subtaskMap={subtaskMap}
          canDrag={canDrag}
          canToggleSubtasks={canToggleSubtasks}
          onClick={() => onCardClick(task)}
          onToggleSubtask={onToggleSubtask}
        />
      ))}

      {tasks.length === 0 && (
        <div className="rounded-lg border border-dashed border-outline-variant px-3 py-8 text-center text-[12px] text-on-surface-variant">
          Drop tasks here
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  subtaskMap,
  canDrag,
  canToggleSubtasks = false,
  dragging = false,
  onClick,
  onToggleSubtask,
}: {
  task: Task;
  subtaskMap: Map<number, Task[]>;
  canDrag: boolean;
  canToggleSubtasks?: boolean;
  dragging?: boolean;
  onClick?: () => void;
  onToggleSubtask?: (s: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canDrag,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const subtasks = subtaskMap.get(task.id) ?? [];
  const subtasksDone = subtasks.filter((s) => s.status === "DONE").length;
  const duration = getDuration(task.startDate, task.dueDate);

  function handleClick(e: React.MouseEvent) {
    if (isDragging) return;
    e.stopPropagation();
    onClick?.();
  }

  return (
    <div
      ref={canDrag ? setNodeRef : undefined}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      style={style}
      onClick={handleClick}
      className={[
        "rounded border border-outline-variant bg-surface-container-lowest p-3 transition-shadow",
        canDrag ? "cursor-grab active:cursor-grabbing" : "",
        isDragging ? "opacity-40" : "",
        dragging ? "ring-2 ring-primary" : "hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)]",
      ].join(" ")}
    >
      {/* Title + duration */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-[15px] font-bold leading-tight text-on-surface">{task.title}</p>
        <div className="flex shrink-0 items-center gap-1 text-[13px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[15px]">schedule</span>
          <span className="whitespace-nowrap">{duration}</span>
        </div>
      </div>

      {/* Labels (compact, up to 2) */}
      {task.labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 2).map((l) => (
            <LabelChip key={l.id} label={l} compact />
          ))}
          {task.labels.length > 2 && (
            <span className="text-[11px] text-on-surface-variant">+{task.labels.length - 2}</span>
          )}
        </div>
      )}

      {/* Description */}
      {task.description && (
        <p className="mb-2 line-clamp-2 text-[13px] leading-snug text-on-surface-variant">
          {task.description}
        </p>
      )}

      {/* Inline subtask checklist */}
      {subtasks.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            Subtasks {subtasksDone}/{subtasks.length}
          </div>
          <ul className="space-y-0.5 border-l border-outline-variant/60 pl-2">
            {subtasks.map((s) => {
              const done = s.status === "DONE";
              return (
                <li key={s.id} className="flex items-center gap-1.5 text-[12px]">
                  <button
                    type="button"
                    disabled={!canToggleSubtasks}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSubtask?.(s);
                    }}
                    aria-label={done ? "Mark not done" : "Mark done"}
                    className={[
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-outline-variant hover:border-primary",
                      canToggleSubtasks ? "cursor-pointer" : "cursor-default",
                    ].join(" ")}
                  >
                    {done && (
                      <span className="material-symbols-outlined text-[11px] leading-none">check</span>
                    )}
                  </button>
                  <span
                    className={[
                      "flex-1 truncate",
                      done ? "text-on-surface-variant line-through" : "text-on-surface",
                    ].join(" ")}
                  >
                    {s.title}
                  </span>
                  {s.assignedTo && (
                    <span
                      title={s.assignedTo.username}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-on-primary"
                    >
                      {s.assignedTo.username[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Bottom: attach + comments + avatar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[13px] text-on-surface-variant">
          <span className="flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[14px]">attach_file</span>
            0
          </span>
          <span className="flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
            {task._count.comments}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <PriorityBadge priority={task.priority} compact />
          {task.assignedTo && (
            <span
              title={task.assignedTo.username}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary"
            >
              {task.assignedTo.username[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function getDuration(start: string | null, end: string | null): string {
  if (!end) return "—";
  if (!start) return new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const diff = Math.ceil(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff > 0 ? `${diff} Days` : "1 Day";
}

