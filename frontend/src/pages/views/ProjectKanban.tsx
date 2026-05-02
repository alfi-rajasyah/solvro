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
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { LabelChip } from "@/components/LabelChip";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TaskFormModal } from "@/components/TaskFormModal";
import { useAuth } from "@/lib/auth";
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

  const canMove = user?.role === "TAM" || user?.role === "ADMIN";

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
      <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
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
              onAdd={() => setCreateStatus(col.id)}
              onCardClick={(t) => setEditTask(t)}
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
  onAdd: () => void;
  onCardClick: (t: Task) => void;
}

function Column({ id, label, tone, tasks, subtaskMap, canAdd, canDrag, onAdd, onCardClick }: ColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col gap-3 rounded border bg-surface-container-low p-3 transition-colors",
        isOver ? "border-primary" : "border-outline-variant",
      ].join(" ")}
    >
      <div className="flex items-center justify-between px-1">
        <h3 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
          {label}
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${tone}`}>{tasks.length}</span>
        </h3>
      </div>

      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            subtaskMap={subtaskMap}
            canDrag={canDrag}
            onClick={() => onCardClick(task)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="rounded border border-dashed border-outline-variant px-3 py-6 text-center text-[11px] text-on-surface-variant">
            Drop tasks here
          </div>
        )}
        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center gap-2 rounded border border-dashed border-outline-variant px-3 py-2 text-xs text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add task
          </button>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  subtaskMap,
  canDrag,
  dragging = false,
  onClick,
}: {
  task: Task;
  subtaskMap: Map<number, Task[]>;
  canDrag: boolean;
  dragging?: boolean;
  onClick?: () => void;
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
  const overdue =
    task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < startOfToday();

  // Drag movement should not also fire click
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
        "rounded border bg-surface-container-lowest p-3 shadow-sm transition-shadow",
        canDrag ? "cursor-grab active:cursor-grabbing" : "",
        isDragging ? "opacity-40" : "",
        dragging ? "border-primary shadow-md" : "border-outline-variant hover:border-primary/40",
      ].join(" ")}
    >
      {task.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <LabelChip key={l.id} label={l} compact />
          ))}
          {task.labels.length > 3 && (
            <span className="text-[10px] text-on-surface-variant">+{task.labels.length - 3}</span>
          )}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
          T-{String(task.id).padStart(3, "0")}
        </span>
        <div className="flex items-center gap-1.5">
          <PriorityBadge priority={task.priority} compact />
          <AssigneeAvatar user={task.assignedTo} size="xs" />
        </div>
      </div>

      <p className="text-sm font-medium leading-tight text-on-surface">{task.title}</p>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-[11px] text-on-surface-variant">{task.description}</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
        <span
          className={
            overdue
              ? "font-bold text-error"
              : "text-on-surface-variant"
          }
        >
          {task.dueDate ? (
            <>
              <span className="material-symbols-outlined align-middle text-[12px]">schedule</span>{" "}
              {fmt(task.dueDate)}
              {overdue && " · OVERDUE"}
            </>
          ) : (
            "No due date"
          )}
        </span>
        <span className="flex items-center gap-2 text-on-surface-variant">
          {subtasks.length > 0 && (
            <span title={`Subtasks: ${subtasksDone}/${subtasks.length} done`}>
              ✓ {subtasksDone}/{subtasks.length}
            </span>
          )}
          {task._count.comments > 0 && (
            <span title={`${task._count.comments} comments`}>
              💬 {task._count.comments}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
