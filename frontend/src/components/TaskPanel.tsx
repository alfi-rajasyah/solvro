import { useEffect, useRef, useState, type FormEvent } from "react";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { ConfirmModal } from "./ConfirmModal";
import { InlineDateRangeEditor } from "./InlineDateRangeEditor";
import { LabelPicker } from "./LabelPicker";
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
import { dayFromIso, dayToDate } from "@/lib/dateField";
import {
  type Priority,
  type Task,
  type TaskStatus,
  useAddComment,
  useComments,
  useCreateTask,
  useDeleteTask,
  useProjectSections,
  useProjectTasks,
  useUpdateTask,
  useUsers,
} from "@/lib/queries";

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};
const STATUS_TONE_CLASS: Record<TaskStatus, string> = {
  TODO: "bg-surface-container-high text-on-surface-variant",
  IN_PROGRESS: "bg-chip-emerald-bg text-chip-emerald-text",
  DONE: "bg-chip-emerald-bg text-chip-emerald-text",
};

const PRIORITY_ORDER: Priority[] = ["LOW", "MEDIUM", "HIGH"];
const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};
const PRIORITY_ICON_CLASS: Record<Priority, string> = {
  LOW: "text-on-surface-variant",
  MEDIUM: "text-chip-amber-text",
  HIGH: "text-error",
  URGENT: "text-error",
};

function nextPriority(p: Priority): Priority {
  const idx = PRIORITY_ORDER.indexOf(p);
  if (idx === -1) return "LOW";
  return PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length];
}

function fmtShort(iso: string | null): string {
  // Derive the day via the UTC date-part,
  // not a local-time parse of the ISO instant.
  const d = dayToDate(dayFromIso(iso));
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface TaskPanelProps {
  projectId: number;
  taskId: number;
  onClose: () => void;
}

/**
 * Right-anchored task detail panel, deep-linked via `?task=<id>`. Replaces
 * TaskFormModal's edit mode everywhere it's opened from a card/row click —
 * TaskFormModal itself is kept around for CREATE only.
 */
export function TaskPanel({ projectId, taskId, onClose }: TaskPanelProps) {
  const { user } = useAuth();
  const canEdit = hasPermission(user, "task:write");

  const { data: tasks } = useProjectTasks(projectId);
  const { data: sections } = useProjectSections(projectId);
  const { data: users } = useUsers();
  const updateTask = useUpdateTask(projectId);
  const createTask = useCreateTask(projectId);
  const deleteTask = useDeleteTask(projectId);

  const task = (tasks ?? []).find((t) => t.id === taskId) ?? null;
  const subtasks = (tasks ?? [])
    .filter((t) => t.parentTaskId === taskId)
    // Explicit per-parent comparator — mirrors backend/src/lib/taskOrdering.ts's
    // dense per-parent ordering rather than relying on GET /tasks's incidental
    // global (position asc, id asc) sort surviving the filter() above.
    .sort((a, b) => a.position - b.position || a.id - b.id);
  const subtasksDone = subtasks.filter((s) => s.status === "DONE").length;

  const [menuOpen, setMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDates, setEditingDates] = useState(false);
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [editingSection, setEditingSection] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setEditingTitle(false);
    setEditingDates(false);
    setEditingAssignee(false);
    setEditingSection(false);
    setMenuOpen(false);
    setStatusMenuOpen(false);
    setError(null);
  }, [taskId]);

  if (!task) {
    return (
      <aside
        ref={panelRef}
        className="fixed right-0 top-14 bottom-0 z-40 flex w-full flex-col border-l border-outline-variant bg-surface-container px-5 py-4 md:w-[380px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-on-surface-variant">Loading task…</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </aside>
    );
  }

  function patch(body: Parameters<typeof updateTask.mutate>[0]["patch"]) {
    if (!task) return;
    setError(null);
    updateTask.mutate(
      { id: task.id, patch: body },
      {
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : "Update failed.");
        },
      },
    );
  }

  function handleTitleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (trimmed && trimmed !== task!.title) patch({ title: trimmed });
  }

  async function handleAddSubtask(e: FormEvent) {
    e.preventDefault();
    const title = newSubtask.trim();
    if (!title || !task) return;
    setError(null);
    try {
      await createTask.mutateAsync({
        title,
        parentTaskId: task.id,
        sectionId: task.sectionId,
        status: "TODO",
      });
      setNewSubtask("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add subtask.");
    }
  }

  function toggleSubtask(s: Task) {
    updateTask.mutate({ id: s.id, patch: { status: s.status === "DONE" ? "TODO" : "DONE" } });
  }

  function moveSubtask(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= subtasks.length) return;
    updateTask.mutate({ id: subtasks[index].id, patch: { position: target } });
  }

  async function handleDelete() {
    if (!task) return;
    setError(null);
    try {
      await deleteTask.mutateAsync(task.id);
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed.");
      setConfirmDelete(false);
    }
  }

  const sectionName = task.section?.name ?? "No section";

  return (
    <>
      <aside
        ref={panelRef}
        role="dialog"
        aria-label="Task details"
        className="fixed right-0 top-14 bottom-0 z-40 flex w-full flex-col border-l border-outline-variant bg-surface-container shadow-overlay md:w-[380px]"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-outline-variant px-4 py-3">
          <div className="relative">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setStatusMenuOpen((v) => !v)}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-display text-[11px] font-semibold",
                STATUS_TONE_CLASS[task.status],
                canEdit ? "cursor-pointer" : "cursor-default",
              ].join(" ")}
            >
              {STATUS_LABEL[task.status]}
              {canEdit && (
                <span className="material-symbols-outlined text-[13px]">expand_more</span>
              )}
            </button>
            {statusMenuOpen && canEdit && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusMenuOpen(false)} />
                <div className="absolute left-0 z-20 mt-1 w-36 rounded-lg border border-outline-variant bg-surface-container-lowest py-1 shadow-overlay">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        patch({ status: s });
                        setStatusMenuOpen(false);
                      }}
                      className={[
                        "flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-surface-container",
                        s === task.status ? "font-bold text-primary" : "text-on-surface",
                      ].join(" ")}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <span className="flex-1" />
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="material-symbols-outlined rounded-sm p-1 text-base text-on-surface-variant hover:bg-surface-container-high"
              aria-label="Task options"
            >
              more_horiz
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-outline-variant bg-surface-container-lowest py-1 shadow-overlay">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-error hover:bg-error-container disabled:cursor-default disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete task
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Title + subtitle */}
          {editingTitle ? (
            <form onSubmit={handleTitleSubmit}>
              <input
                autoFocus
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSubmit}
                maxLength={200}
                className="w-full border-none bg-transparent text-lg font-bold text-on-surface outline-hidden focus:outline-hidden"
              />
            </form>
          ) : (
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => {
                setTitleDraft(task.title);
                setEditingTitle(true);
              }}
              className="block w-full rounded-sm text-left text-lg font-bold text-on-surface hover:bg-surface-container-high disabled:cursor-default"
            >
              {task.title}
            </button>
          )}
          {task.section && (
            <p className="mt-0.5 text-[11px] text-on-surface-variant">in {sectionName}</p>
          )}

          {/* Meta grid */}
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-sm">
            <span className="self-center font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Assignee
            </span>
            <div className="relative">
              {editingAssignee && canEdit ? (
                <select
                  autoFocus
                  value={task.assignedToId ?? ""}
                  onChange={(e) => {
                    patch({ assignedToId: e.target.value === "" ? null : Number(e.target.value) });
                    setEditingAssignee(false);
                  }}
                  onBlur={() => setEditingAssignee(false)}
                  className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-1.5 py-1 text-xs text-on-surface focus:border-primary focus:outline-hidden"
                >
                  <option value="">Unassigned</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditingAssignee(true)}
                  className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-surface-container-high disabled:cursor-default"
                >
                  <AssigneeAvatar user={task.assignedTo} size="xs" />
                  <span className="text-on-surface">
                    {task.assignedTo ? task.assignedTo.username : "Unassigned"}
                  </span>
                </button>
              )}
            </div>

            <span className="self-center font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Dates
            </span>
            <div className="relative">
              {editingDates && canEdit ? (
                <InlineDateRangeEditor
                  startISO={task.startDate}
                  endISO={task.dueDate}
                  onSave={(s, e) => {
                    patch({ startDate: s, dueDate: e });
                    setEditingDates(false);
                  }}
                  onCancel={() => setEditingDates(false)}
                />
              ) : (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditingDates(true)}
                  className="rounded-sm px-1 py-0.5 text-left text-on-surface hover:bg-surface-container-high disabled:cursor-default"
                >
                  {fmtShort(task.startDate)} – {fmtShort(task.dueDate)}
                </button>
              )}
            </div>

            <span className="self-center font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Priority
            </span>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => patch({ priority: nextPriority(task.priority) })}
              className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-surface-container-high disabled:cursor-default"
              title={canEdit ? "Click to cycle priority" : undefined}
            >
              <span
                className={`material-symbols-outlined text-[15px] ${PRIORITY_ICON_CLASS[task.priority]}`}
              >
                flag
              </span>
              <span className="text-on-surface">{PRIORITY_LABEL[task.priority]}</span>
            </button>

            <span className="self-center font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Type
            </span>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => patch({ isMilestone: !task.isMilestone })}
              className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-surface-container-high disabled:cursor-default"
              title={canEdit ? "Toggle between task bar and milestone diamond" : undefined}
            >
              <span
                className={`material-symbols-outlined text-[15px] ${task.isMilestone ? "text-primary" : "text-on-surface-variant"}`}
              >
                {task.isMilestone ? "diamond" : "check_box_outline_blank"}
              </span>
              <span className="text-on-surface">
                {task.isMilestone ? "Milestone" : "Task"}
              </span>
            </button>

            <span className="self-center font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Section
            </span>
            <div className="relative">
              {editingSection && canEdit ? (
                <select
                  autoFocus
                  value={task.sectionId ?? ""}
                  onChange={(e) => {
                    patch({ sectionId: e.target.value === "" ? null : Number(e.target.value) });
                    setEditingSection(false);
                  }}
                  onBlur={() => setEditingSection(false)}
                  className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-1.5 py-1 text-xs text-on-surface focus:border-primary focus:outline-hidden"
                >
                  <option value="">No section</option>
                  {(sections ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditingSection(true)}
                  className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-surface-container-high disabled:cursor-default"
                >
                  {task.section && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: task.section.color }}
                    />
                  )}
                  <span className="text-on-surface">{sectionName}</span>
                </button>
              )}
            </div>
          </div>

          {/* Labels */}
          <div className="mt-4">
            <p className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Labels
            </p>
            <LabelPicker
              projectId={projectId}
              selectedIds={task.labels.map((l) => l.id)}
              onChange={canEdit ? (ids) => patch({ labelIds: ids }) : () => {}}
            />
          </div>

          {/* Subtasks */}
          <div className="mt-4">
            <p className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Subtasks {subtasks.length > 0 && `${subtasksDone}/${subtasks.length}`}
            </p>
            <ul className="space-y-0.5">
              {subtasks.map((s, index) => (
                <li key={s.id} className="flex items-center gap-2 rounded-sm px-1 py-1 text-[13px]">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleSubtask(s)}
                    aria-label={s.status === "DONE" ? "Mark not done" : "Mark done"}
                    className={[
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                      s.status === "DONE"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-outline-variant hover:border-primary",
                      canEdit ? "cursor-pointer" : "cursor-default",
                    ].join(" ")}
                  >
                    {s.status === "DONE" && (
                      <span className="material-symbols-outlined text-[11px] leading-none">
                        check
                      </span>
                    )}
                  </button>
                  <span
                    className={
                      s.status === "DONE"
                        ? "flex-1 truncate text-on-surface-variant line-through"
                        : "flex-1 truncate text-on-surface"
                    }
                  >
                    {s.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveSubtask(index, -1)}
                      disabled={!canEdit || index === 0}
                      aria-label="Move subtask up"
                      className="rounded-sm p-0.5 text-on-surface-variant hover:bg-surface-container disabled:pointer-events-none disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-sm">keyboard_arrow_up</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSubtask(index, 1)}
                      disabled={!canEdit || index === subtasks.length - 1}
                      aria-label="Move subtask down"
                      className="rounded-sm p-0.5 text-on-surface-variant hover:bg-surface-container disabled:pointer-events-none disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {canEdit && (
              <form onSubmit={handleAddSubtask} className="mt-1.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px] text-primary">add</span>
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="Add subtask"
                  maxLength={200}
                  className="flex-1 border-none bg-transparent text-[13px] text-on-surface outline-hidden placeholder:text-on-surface-variant/60 focus:outline-hidden"
                />
              </form>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-sm border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container"
            >
              {error}
            </div>
          )}

          {/* Comments */}
          <div className="mt-5 border-t border-outline-variant pt-4">
            <PanelComments taskId={task.id} />
          </div>
        </div>
      </aside>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete task"
        body={
          <>
            Delete task &quot;{task.title}&quot;? This cannot be undone.
            {subtasks.length > 0 && (
              <>
                <br />
                <br />
                This task has {subtasks.length} subtask(s) which will also be deleted.
              </>
            )}
          </>
        }
        confirmLabel="Delete"
        confirmTone="warning"
        busy={deleteTask.isPending}
      />
    </>
  );
}

/**
 * Comment thread + single-line composer per the mockup ("Write a comment…"
 * placeholder + green send icon), backed by useComments / useAddComment.
 * This is the app's only comment UI (the former standalone CommentThread
 * component was never mounted and has been removed).
 */
function PanelComments({ taskId }: { taskId: number }) {
  const { data: comments, isLoading, isError, error } = useComments(taskId);
  const addComment = useAddComment(taskId);
  const [body, setBody] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || addComment.isPending) return;
    try {
      await addComment.mutateAsync(trimmed);
      setBody("");
    } catch {
      // surfaced via mutation error state below
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        Comments {comments && comments.length > 0 && `· ${comments.length}`}
      </h3>

      {isLoading && (
        <div className="h-12 animate-pulse rounded-sm border border-outline-variant bg-surface-container-low" />
      )}

      {isError && (
        <div className="rounded-sm border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container">
          Could not load comments: {(error as Error).message}
        </div>
      )}

      {comments && comments.length === 0 && (
        <p className="text-xs text-on-surface-variant">No comments yet.</p>
      )}

      {comments && comments.length > 0 && (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <AssigneeAvatar user={c.author} size="xs" />
              <div className="min-w-0 flex-1 rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2">
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate font-medium text-on-surface">{c.author.username}</span>
                  <span className="shrink-0 text-on-surface-variant">{relativeTime(c.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap wrap-break-word text-xs text-on-surface">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2"
      >
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          placeholder="Write a comment…"
          className="min-w-0 flex-1 border-none bg-transparent text-xs text-on-surface outline-hidden placeholder:text-on-surface-variant/60 focus:outline-hidden"
        />
        <button
          type="submit"
          disabled={addComment.isPending || !body.trim()}
          aria-label="Send comment"
          className="flex shrink-0 items-center text-primary disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[17px]">send</span>
        </button>
      </form>
      {addComment.error && (
        <p className="text-[12px] text-error">{(addComment.error as Error).message}</p>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
