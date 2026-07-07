import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useProjectContext } from "../ProjectDetail";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { LabelChip } from "@/components/LabelChip";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TaskFormModal } from "@/components/TaskFormModal";
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  type Priority,
  type Task,
  type TaskStatus,
  type UpdateTaskInput,
  useProjectTasks,
  useUpdateTask,
  useUsers,
} from "@/lib/queries";

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "TODO", label: "To Do" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "DONE", label: "Done" },
];

// Drag-and-drop items carry a `data` payload identifying what's being
// dragged and, for subtasks, which card currently owns them — this lets
// onDragEnd tell "reorder within card", "re-parent onto another card", and
// "promote into a column" apart without re-deriving it from DOM ids.
interface CardDragData {
  type: "card";
  status: TaskStatus;
}
interface SubtaskDragData {
  type: "subtask";
  parentTaskId: number;
}

function idOf(prefix: string, id: number | string): string {
  return `${prefix}:${id}`;
}
function isCardId(id: string): boolean {
  return id.startsWith("card:");
}
function isSubtaskId(id: string): boolean {
  return id.startsWith("subtask:");
}
function isColumnId(id: string): boolean {
  return id.startsWith("column:");
}
function numFromId(id: string): number {
  return Number(id.split(":")[1]);
}
function statusFromColumnId(colId: string): TaskStatus {
  return colId.split(":")[1] as TaskStatus;
}

// Custom collision detection. Bare closestCorners has two failure modes on
// this board (both found by real-browser drag testing):
//   1. A dragged CARD dropped over another card's subtask region resolves to
//      the `subtask:*` droppable, which card-drop handling didn't recognise
//      → silent no-op. Cards must never resolve to subtask rows, so subtask
//      droppables are filtered out of card-drag candidates entirely.
//   2. A tall card dragged a short distance can resolve to its OWN ghost
//      rect (the original slot is still a registered droppable), making
//      over.id === active.id → the drag-end no-op guard fires. The active
//      id is filtered out of the candidate set for every drag.
// Strategy: pointerWithin first (most faithful to where the user actually
// points, especially inside nested droppables), falling back to
// closestCorners (needed when the pointer is outside every rect, e.g.
// during touch drags with the overlay offset) — both over the filtered
// candidate list.
const boardCollisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const cardDrag = isCardId(activeId);

  const droppableContainers = args.droppableContainers.filter((container) => {
    const id = String(container.id);
    if (id === activeId) return false;
    if (cardDrag && isSubtaskId(id)) return false;
    return true;
  });

  // With the active card filtered out, a pointer that is still inside the
  // card's ORIGINAL slot would otherwise be captured by the enclosing
  // column rect and read as "append to end of column". Dropping a card
  // back where it was picked up must be a no-op, so report no collision.
  // (pointerCoordinates is null for keyboard drags — guard skipped.)
  if (cardDrag) {
    const initial = args.active.rect.current.initial;
    const p = args.pointerCoordinates;
    if (
      initial &&
      p &&
      p.x >= initial.left &&
      p.x <= initial.left + initial.width &&
      p.y >= initial.top &&
      p.y <= initial.top + initial.height
    ) {
      return [];
    }
  }

  const filteredArgs = { ...args, droppableContainers };
  const within = pointerWithin(filteredArgs);
  if (within.length > 0) return within;
  return closestCorners(filteredArgs);
};

export function ProjectKanban() {
  const { project } = useProjectContext();
  const { user } = useAuth();
  const { data: tasks, isLoading, isError, error } = useProjectTasks(project.id);
  const { data: users } = useUsers();
  const updateTask = useUpdateTask(project.id);
  const [, setSearchParams] = useSearchParams();

  const canMove = hasPermission(user, "task:write");

  const [activeCard, setActiveCard] = useState<Task | null>(null);
  const [activeSubtask, setActiveSubtask] = useState<Task | null>(null);
  const [createStatus, setCreateStatus] = useState<TaskStatus | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAssigneeId, setFilterAssigneeId] = useState<number | "">("");
  const [filterPriority, setFilterPriority] = useState<Priority | "">("");
  const [mobileSheetTask, setMobileSheetTask] = useState<Task | null>(null);

  // Mobile swipeable-columns pager (<md). The board itself is unchanged on
  // desktop — this only tracks which column page is centered in the
  // scroll-snap container so the pager header/dots can reflect it.
  const [activeColIdx, setActiveColIdx] = useState(0);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  function scrollToColumn(idx: number) {
    const clamped = Math.max(0, Math.min(COLUMNS.length - 1, idx));
    columnRefs.current[clamped]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const topLevelAll = useMemo(() => (tasks ?? []).filter((t) => t.parentTaskId === null), [tasks]);
  const subtaskMapAll = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const t of tasks ?? []) {
      if (t.parentTaskId !== null) {
        const arr = map.get(t.parentTaskId) ?? [];
        arr.push(t);
        map.set(t.parentTaskId, arr);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.position - b.position || a.id - b.id);
    return map;
  }, [tasks]);

  // Client-side filter — assignee + priority. Filtering only ever hides
  // top-level cards from view; it never touches ordering/positions.
  const topLevel = useMemo(() => {
    let list = topLevelAll;
    if (filterAssigneeId !== "") list = list.filter((t) => t.assignedToId === filterAssigneeId);
    if (filterPriority !== "") list = list.filter((t) => t.priority === filterPriority);
    return list;
  }, [topLevelAll, filterAssigneeId, filterPriority]);

  // Unfiltered per-status groups — the real sibling lists the backend's
  // `position` indexes into. All drop-position math MUST use this, never
  // the filtered `grouped` below: when a filter hides some cards, an index
  // counted only over the visible subset would land on the wrong slot in
  // the server's full sibling list (see backend/src/lib/taskOrdering.ts
  // insertAt, which inserts into every sibling regardless of what the
  // client happens to be showing).
  const groupedAll = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
    for (const t of topLevelAll) map[t.status].push(t);
    for (const s of COLUMNS) map[s.id].sort((a, b) => a.position - b.position || a.id - b.id);
    return map;
  }, [topLevelAll]);

  // Filtered per-status groups — rendering only.
  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
    for (const t of topLevel) map[t.status].push(t);
    for (const s of COLUMNS) map[s.id].sort((a, b) => a.position - b.position || a.id - b.id);
    return map;
  }, [topLevel]);

  const filterActive = filterAssigneeId !== "" || filterPriority !== "";

  // Tracks which column page is centered in the mobile scroll-snap container,
  // so the pager header/dots stay in sync with manual swipes (not just
  // chevron taps). Scoped to the scroll container itself (`root`) so it only
  // observes intersections within the pager, not the whole viewport.
  useEffect(() => {
    const root = boardScrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!mostVisible) return;
        const idx = columnRefs.current.findIndex((el) => el === mostVisible.target);
        if (idx !== -1) setActiveColIdx(idx);
      },
      { root, threshold: [0.5, 0.75, 1] },
    );
    for (const el of columnRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  function handleDragStart(event: DragStartEvent) {
    setDropError(null);
    const id = String(event.active.id);
    if (isCardId(id)) {
      const task = topLevelAll.find((t) => t.id === numFromId(id)) ?? null;
      setActiveCard(task);
    } else if (isSubtaskId(id)) {
      const task = (tasks ?? []).find((t) => t.id === numFromId(id)) ?? null;
      setActiveSubtask(task);
    }
  }

  function computeCardDrop(activeId: number, overId: string): { status: TaskStatus; position: number } | null {
    const moved = topLevelAll.find((t) => t.id === activeId);
    if (!moved) return null;

    if (isColumnId(overId)) {
      const status = statusFromColumnId(overId);
      const list = groupedAll[status].filter((t) => t.id !== activeId);
      return { status, position: list.length };
    }

    // A card landing on a subtask row means "dropped on that row's parent
    // card" — resolve to the parent and fall through to the card branch.
    // (boardCollisionDetection already filters subtask candidates out of
    // card drags, so this is a safety net for any path that still yields
    // one, e.g. keyboard-sensor moves.)
    let effectiveOverId = overId;
    if (isSubtaskId(overId)) {
      const overSub = (tasks ?? []).find((t) => t.id === numFromId(overId));
      if (!overSub || overSub.parentTaskId === null) return null;
      effectiveOverId = idOf("card", overSub.parentTaskId);
    }

    if (isCardId(effectiveOverId)) {
      const overTask = topLevelAll.find((t) => t.id === numFromId(effectiveOverId));
      if (!overTask) return null;
      const status = overTask.status;
      // Index of the over-card within the *full* (unfiltered) sibling list,
      // INCLUDING the active card when it's in the same column. This is
      // arrayMove semantics: the backend's insertAt excludes the moved row
      // first, so sending the over-card's pre-move index makes a downward
      // move land *after* it and an upward move land *before* it — matching
      // what the user sees. (Excluding the active here would make a
      // one-slot downward drag compute the card's own current position and
      // silently no-op.) The list must also be unfiltered: an index counted
      // over a filtered view would land on the wrong server-side slot.
      const idx = groupedAll[status].findIndex((t) => t.id === overTask.id);
      return { status, position: idx === -1 ? groupedAll[status].length : idx };
    }
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const wasCard = activeCard !== null;
    const wasSubtask = activeSubtask !== null;
    setActiveCard(null);
    setActiveSubtask(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    if (wasCard && isCardId(activeId)) {
      const drop = computeCardDrop(numFromId(activeId), overId);
      if (!drop) return;
      const moved = topLevelAll.find((t) => t.id === numFromId(activeId));
      if (!moved) return;
      if (moved.status === drop.status && moved.position === drop.position) return;
      updateTask.mutate({
        id: moved.id,
        patch: { status: drop.status, position: drop.position },
      });
      return;
    }

    if (wasSubtask && isSubtaskId(activeId)) {
      const subtaskId = numFromId(activeId);
      const subtask = (tasks ?? []).find((t) => t.id === subtaskId);
      if (!subtask) return;
      handleSubtaskDrop(subtask, overId);
    }
  }

  function handleSubtaskDrop(subtask: Task, overId: string) {
    // Dropped onto another subtask row -> reorder within the same parent, or
    // re-parent onto that row's parent card if it belongs to a different one.
    if (isSubtaskId(overId)) {
      const overSub = (tasks ?? []).find((t) => t.id === numFromId(overId));
      if (!overSub || overSub.parentTaskId === null) return;
      const targetParent = overSub.parentTaskId;
      const siblings = (subtaskMapAll.get(targetParent) ?? []).filter((t) => t.id !== subtask.id);
      const idx = siblings.findIndex((t) => t.id === overSub.id);
      const position = idx === -1 ? siblings.length : idx;
      if (subtask.parentTaskId === targetParent && subtask.position === position) return;
      const patch: UpdateTaskInput =
        subtask.parentTaskId === targetParent
          ? { position }
          : { parentTaskId: targetParent, position };
      submitSubtaskPatch(subtask, patch);
      return;
    }

    // Dropped directly onto a card (not one of its subtask rows) -> re-parent
    // onto that card, appended at the end of its subtask list.
    if (isCardId(overId)) {
      const targetParent = numFromId(overId);
      if (subtask.parentTaskId === targetParent) return;
      const siblingCount = (subtaskMapAll.get(targetParent) ?? []).length;
      submitSubtaskPatch(subtask, { parentTaskId: targetParent, position: siblingCount });
      return;
    }

    // Dropped onto a column's empty background -> promote to top-level task
    // in that column, appended at the end. Append length must come from the
    // unfiltered sibling list — see the comment on `groupedAll` above.
    if (isColumnId(overId)) {
      const status = statusFromColumnId(overId);
      const position = groupedAll[status].length;
      submitSubtaskPatch(subtask, { parentTaskId: null, status, position });
    }
  }

  function submitSubtaskPatch(subtask: Task, patch: UpdateTaskInput) {
    updateTask.mutate(
      { id: subtask.id, patch },
      {
        onError: (err) => {
          const code = err instanceof ApiError && err.body && typeof err.body === "object"
            ? (err.body as { code?: string }).code
            : undefined;
          if (code === "invalid_parent" || code === "max_depth_exceeded") {
            setDropError(
              code === "max_depth_exceeded"
                ? "Can't nest subtasks more than one level deep."
                : "That drop isn't a valid parent for this subtask.",
            );
          } else {
            setDropError("Couldn't move that subtask. Please try again.");
          }
          window.setTimeout(() => setDropError(null), 4000);
        },
      },
    );
  }

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
      {/* Toolbar row: filter + add task */}
      <div className="mb-3 flex items-center justify-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-display text-xs font-semibold transition-colors",
              filterActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container",
            ].join(" ")}
          >
            <span className="material-symbols-outlined text-base">filter_alt</span>
            Filter
            {filterActive && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
                {(filterAssigneeId !== "" ? 1 : 0) + (filterPriority !== "" ? 1 : 0)}
              </span>
            )}
          </button>
          {filterOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 shadow-overlay">
                <div className="mb-3">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Assignee
                  </label>
                  <select
                    value={filterAssigneeId === "" ? "" : String(filterAssigneeId)}
                    onChange={(e) =>
                      setFilterAssigneeId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none"
                  >
                    <option value="">Everyone</option>
                    {(users ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Priority
                  </label>
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value as Priority | "")}
                    className="w-full rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none"
                  >
                    <option value="">Any priority</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                {filterActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterAssigneeId("");
                      setFilterPriority("");
                    }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {canMove && (
          <button
            type="button"
            onClick={() => setCreateStatus("TODO")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add task
          </button>
        )}
      </div>

      {dropError && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container"
        >
          {dropError}
        </div>
      )}

      {/* Mobile pager header: chevrons step to the prev/next column page,
          center label shows the currently-centered column + its count.
          Desktop (md+) doesn't render this — the 3-column grid is always
          fully visible there. */}
      <div className="mb-1 flex items-center justify-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => scrollToColumn(activeColIdx - 1)}
          disabled={activeColIdx === 0}
          aria-label="Previous column"
          className="material-symbols-outlined text-on-surface-variant disabled:opacity-30"
        >
          chevron_left
        </button>
        <span className="text-sm font-semibold text-on-surface">{COLUMNS[activeColIdx].label}</span>
        <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
          {grouped[COLUMNS[activeColIdx].id].length}
        </span>
        <button
          type="button"
          onClick={() => scrollToColumn(activeColIdx + 1)}
          disabled={activeColIdx === COLUMNS.length - 1}
          aria-label="Next column"
          className="material-symbols-outlined text-on-surface-variant disabled:opacity-30"
        >
          chevron_right
        </button>
      </div>
      <div className="mb-3 flex items-center justify-center gap-1.5 md:hidden">
        {COLUMNS.map((col, idx) => (
          <button
            key={col.id}
            type="button"
            onClick={() => scrollToColumn(idx)}
            aria-label={`Go to ${col.label} column`}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              idx === activeColIdx ? "bg-primary" : "bg-outline-variant"
            }`}
          />
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={boardScrollRef}
          className="flex h-full snap-x snap-mandatory gap-4 overflow-x-auto md:grid md:grid-cols-3 md:overflow-visible md:snap-none"
        >
          {COLUMNS.map((col, idx) => (
            <div
              key={col.id}
              ref={(el) => {
                columnRefs.current[idx] = el;
              }}
              className="w-full shrink-0 snap-center md:w-auto md:shrink md:snap-align-none"
            >
              <Column
                id={col.id}
                label={col.label}
                tasks={grouped[col.id]}
                subtaskMap={subtaskMapAll}
                wipLimit={project.wipLimits?.[col.id] ?? null}
                canDrag={canMove}
                canToggleSubtasks={canMove}
                onAdd={() => setCreateStatus(col.id)}
                onCardClick={(t) =>
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("task", String(t.id));
                      return next;
                    },
                    { replace: true },
                  )
                }
                onCardMenuClick={(t) => setMobileSheetTask(t)}
                onToggleSubtask={toggleSubtaskStatus}
              />
            </div>
          ))}
        </div>
        <DragOverlay>
          {activeCard ? (
            <TaskCard
              task={activeCard}
              subtaskMap={subtaskMapAll}
              canDrag={false}
              canToggleSubtasks={false}
              dragging
            />
          ) : activeSubtask ? (
            <SubtaskRow task={activeSubtask} canToggle={false} dragging />
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

      {mobileSheetTask && (
        <MobileMoveSheet
          task={mobileSheetTask}
          onClose={() => setMobileSheetTask(null)}
          onMove={(status) => {
            if (status !== mobileSheetTask.status) {
              // Unfiltered append length — same reasoning as computeCardDrop.
              const position = groupedAll[status].length;
              updateTask.mutate({ id: mobileSheetTask.id, patch: { status, position } });
            }
            setMobileSheetTask(null);
          }}
        />
      )}
    </>
  );
}

interface ColumnProps {
  id: TaskStatus;
  label: string;
  tasks: Task[];
  subtaskMap: Map<number, Task[]>;
  wipLimit: number | null;
  canDrag: boolean;
  canToggleSubtasks: boolean;
  onAdd: () => void;
  onCardClick: (t: Task) => void;
  onCardMenuClick: (t: Task) => void;
  onToggleSubtask: (s: Task) => void;
}

function Column({
  id,
  label,
  tasks,
  subtaskMap,
  wipLimit,
  canDrag,
  canToggleSubtasks,
  onAdd,
  onCardClick,
  onCardMenuClick,
  onToggleSubtask,
}: ColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: idOf("column", id) });
  const [menuOpen, setMenuOpen] = useState(false);
  const overLimit = wipLimit !== null && tasks.length > wipLimit;

  const sortableIds = tasks.map((t) => idOf("card", t.id));

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col gap-2.5 rounded-xl bg-surface-container p-2 transition-all",
        isOver ? "ring-2 ring-inset ring-primary/40" : "",
      ].join(" ")}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 pb-1">
        <h3 className="text-sm font-bold text-on-surface">{label}</h3>
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            overLimit
              ? "bg-chip-amber-bg text-chip-amber-text"
              : "bg-surface-container-high text-on-surface-variant",
          ].join(" ")}
          title={wipLimit !== null ? `WIP limit: ${wipLimit}` : undefined}
        >
          {overLimit ? `${tasks.length} / ${wipLimit}` : tasks.length}
        </span>
        <span className="flex-1" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="material-symbols-outlined cursor-pointer text-base text-on-surface-variant hover:text-on-surface"
            aria-label="Column options"
          >
            more_horiz
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-outline-variant bg-surface-container-lowest py-1 shadow-overlay">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAdd();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-on-surface hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  Add task here
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {tasks.map((task) => (
          <SortableCard
            key={task.id}
            task={task}
            subtaskMap={subtaskMap}
            canDrag={canDrag}
            canToggleSubtasks={canToggleSubtasks}
            onClick={() => onCardClick(task)}
            onMenuClick={() => onCardMenuClick(task)}
            onToggleSubtask={onToggleSubtask}
          />
        ))}
      </SortableContext>

      {tasks.length === 0 && (
        <div className="rounded-lg border border-dashed border-outline-variant px-3 py-8 text-center text-[12px] text-on-surface-variant">
          Drop tasks here
        </div>
      )}
    </div>
  );
}

function SortableCard({
  task,
  subtaskMap,
  canDrag,
  canToggleSubtasks,
  onClick,
  onMenuClick,
  onToggleSubtask,
}: {
  task: Task;
  subtaskMap: Map<number, Task[]>;
  canDrag: boolean;
  canToggleSubtasks: boolean;
  onClick: () => void;
  onMenuClick: () => void;
  onToggleSubtask: (s: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: idOf("card", task.id),
      data: { type: "card", status: task.status } satisfies CardDragData,
      disabled: !canDrag,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {isOver && !isDragging && (
        <div className="pointer-events-none absolute -top-[7px] left-0.5 right-0.5 z-10 h-0.5 rounded-full bg-primary">
          <span className="absolute -left-0.5 -top-[3px] h-2 w-2 rounded-full bg-primary" />
        </div>
      )}
      <TaskCard
        task={task}
        subtaskMap={subtaskMap}
        canDrag={canDrag}
        canToggleSubtasks={canToggleSubtasks}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        dragHandleRef={setActivatorNodeRef}
        onClick={onClick}
        onMenuClick={onMenuClick}
        onToggleSubtask={onToggleSubtask}
      />
    </div>
  );
}

function TaskCard({
  task,
  subtaskMap,
  canDrag,
  canToggleSubtasks = false,
  dragging = false,
  isDragging = false,
  dragHandleProps,
  dragHandleRef,
  onClick,
  onMenuClick,
  onToggleSubtask,
}: {
  task: Task;
  subtaskMap: Map<number, Task[]>;
  canDrag: boolean;
  canToggleSubtasks?: boolean;
  dragging?: boolean;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  dragHandleRef?: (el: HTMLElement | null) => void;
  onClick?: () => void;
  onMenuClick?: () => void;
  onToggleSubtask?: (s: Task) => void;
}) {
  const subtasks = subtaskMap.get(task.id) ?? [];
  const subtasksDone = subtasks.filter((s) => s.status === "DONE").length;
  const duration = getDuration(task.startDate, task.dueDate);
  const subtaskIds = subtasks.map((s) => idOf("subtask", s.id));

  function handleClick(e: React.MouseEvent) {
    if (isDragging) return;
    e.stopPropagation();
    onClick?.();
  }

  return (
    <div
      onClick={handleClick}
      className={[
        "touch-manipulation rounded border bg-surface-container-lowest p-3 transition-colors",
        isDragging ? "opacity-40" : "",
        dragging
          ? "rotate-[-1.2deg] border-[1.5px] border-primary shadow-overlay ring-2 ring-primary"
          : "border-outline-variant hover:border-primary",
      ].join(" ")}
    >
      {/* Title + duration + drag handle */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {canDrag && (
            <span
              ref={dragHandleRef}
              {...dragHandleProps}
              className="material-symbols-outlined mt-0.5 shrink-0 cursor-grab touch-none text-[16px] text-on-surface-variant/60 active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              drag_indicator
            </span>
          )}
          <p className="min-w-0 text-[15px] font-bold leading-tight text-on-surface">
            {task.status === "DONE" && (
              <span className="material-symbols-outlined mr-1 align-text-bottom text-[14px] text-primary">
                check_circle
              </span>
            )}
            {task.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 text-[13px] text-on-surface-variant">
            <span className="material-symbols-outlined text-[15px]">schedule</span>
            <span className="whitespace-nowrap">{duration}</span>
          </div>
          {onMenuClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMenuClick();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="material-symbols-outlined text-[17px] text-on-surface-variant hover:text-on-surface md:hidden"
              aria-label="Card options"
            >
              more_horiz
            </button>
          )}
        </div>
      </div>

      {/* Labels */}
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

      {/* Inline subtask checklist — sortable */}
      {subtasks.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            Subtasks {subtasksDone}/{subtasks.length}
          </div>
          <SortableContext items={subtaskIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-0.5 border-l border-outline-variant/60 pl-2">
              {subtasks.map((s) => (
                <SortableSubtaskRow
                  key={s.id}
                  task={s}
                  canToggle={canToggleSubtasks}
                  onToggle={() => onToggleSubtask?.(s)}
                />
              ))}
            </ul>
          </SortableContext>
        </div>
      )}

      {/* Bottom row: comments + priority + assignee */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[13px] text-on-surface-variant">
          <span className="flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
            {task._count.comments}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <PriorityBadge priority={task.priority} compact />
          {task.assignedTo && <AssigneeAvatar user={task.assignedTo} size="sm" />}
        </div>
      </div>
    </div>
  );
}

function SortableSubtaskRow({
  task,
  canToggle,
  onToggle,
}: {
  task: Task;
  canToggle: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: idOf("subtask", task.id),
      data: { type: "subtask", parentTaskId: task.parentTaskId! } satisfies SubtaskDragData,
    });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={style} className="relative">
      {isOver && !isDragging && (
        <div className="pointer-events-none absolute -top-[3px] left-0 right-0 z-10 h-0.5 rounded-full bg-primary" />
      )}
      <SubtaskRow
        task={task}
        canToggle={canToggle}
        onToggle={onToggle}
        dragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        dragHandleRef={setActivatorNodeRef}
      />
    </li>
  );
}

function SubtaskRow({
  task,
  canToggle,
  onToggle,
  dragging = false,
  dragHandleProps,
  dragHandleRef,
}: {
  task: Task;
  canToggle: boolean;
  onToggle?: () => void;
  dragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  dragHandleRef?: (el: HTMLElement | null) => void;
}) {
  const done = task.status === "DONE";
  return (
    <div
      className={[
        "flex touch-manipulation items-center gap-1.5 rounded px-0.5 py-0.5 text-[12px]",
        dragging ? "opacity-40" : "",
      ].join(" ")}
    >
      <span
        ref={dragHandleRef}
        {...dragHandleProps}
        onClick={(e) => e.stopPropagation()}
        className="material-symbols-outlined shrink-0 cursor-grab touch-none text-[14px] text-on-surface-variant/50 active:cursor-grabbing"
        aria-label="Drag subtask"
      >
        drag_indicator
      </span>
      <button
        type="button"
        disabled={!canToggle}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={[
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-outline-variant hover:border-primary",
          canToggle ? "cursor-pointer" : "cursor-default",
        ].join(" ")}
      >
        {done && <span className="material-symbols-outlined text-[11px] leading-none">check</span>}
      </button>
      <span
        onPointerDown={(e) => e.stopPropagation()}
        className={["flex-1 truncate", done ? "text-on-surface-variant line-through" : "text-on-surface"].join(" ")}
      >
        {task.title}
      </span>
      {task.assignedTo && (
        <span onPointerDown={(e) => e.stopPropagation()}>
          <AssigneeAvatar user={task.assignedTo} size="xs" />
        </span>
      )}
    </div>
  );
}

function MobileMoveSheet({
  task,
  onClose,
  onMove,
}: {
  task: Task;
  onClose: () => void;
  onMove: (status: TaskStatus) => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end md:hidden" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm" />
      <div
        className="relative w-full rounded-t-2xl border-t border-outline-variant bg-surface-container p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1 truncate text-sm font-bold text-on-surface">{task.title}</p>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          Move to
        </p>
        <ul className="space-y-1">
          {COLUMNS.map((col) => {
            const checked = task.status === col.id;
            return (
              <li key={col.id}>
                <button
                  type="button"
                  onClick={() => onMove(col.id)}
                  className={[
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                    checked ? "text-primary" : "text-on-surface",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      checked ? "border-primary bg-primary text-white" : "border-outline-variant",
                    ].join(" ")}
                  >
                    {checked && <span className="material-symbols-outlined text-[11px] leading-none">check</span>}
                  </span>
                  {col.label}
                </button>
              </li>
            );
          })}
        </ul>
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
