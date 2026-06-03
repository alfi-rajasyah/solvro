import { useMemo, useState, type FormEvent } from "react";
import { useProjectContext } from "../ProjectDetail";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { InlineDateRangeEditor } from "@/components/InlineDateRangeEditor";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TaskStatusChip } from "@/components/StatusChip";
import { TaskFormModal } from "@/components/TaskFormModal";
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  type Section,
  type Task,
  useCreateSection,
  useDeleteSection,
  useProjectSections,
  useProjectTasks,
  useUpdateSection,
  useUpdateTask,
} from "@/lib/queries";

export function ProjectList() {
  const { project } = useProjectContext();
  const { user } = useAuth();
  const canEdit = hasPermission(user, "task:write");

  const { data: tasks, isLoading: tasksLoading, isError, error } = useProjectTasks(project.id);
  const { data: sections, isLoading: sectionsLoading } = useProjectSections(project.id);
  const updateTask = useUpdateTask(project.id);
  const createSection = useCreateSection(project.id);
  const updateSection = useUpdateSection(project.id);
  const deleteSection = useDeleteSection(project.id);

  const [collapsed, setCollapsed] = useState<Set<number | "none">>(new Set());
  const [createTaskCtx, setCreateTaskCtx] = useState<{
    sectionId: number | null;
    parentTaskId: number | null;
  } | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  // renamingSectionKey: a real section.id (number) OR the literal "none" for
  // the synthetic (No section) group. When "none" is submitted, we create a
  // real section and migrate every orphan task into it.
  const [renamingSectionKey, setRenamingSectionKey] = useState<number | "none" | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const grouped = useMemo(() => groupBySection(tasks ?? [], sections ?? []), [tasks, sections]);

  if (tasksLoading || sectionsLoading) {
    return (
      <div className="h-64 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
        Could not load tasks: {(error as Error).message}
      </div>
    );
  }

  function toggle(id: number | "none") {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newSectionName.trim()) return;
    setActionError(null);
    try {
      await createSection.mutateAsync({ name: newSectionName.trim() });
      setNewSectionName("");
      setAddingSection(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not create section.");
    }
  }

  async function handleRename(
    key: number | "none",
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const name = renameValue.trim();
    if (!name) {
      setRenamingSectionKey(null);
      return;
    }
    setActionError(null);
    try {
      if (key === "none") {
        // Promote the synthetic (No section) group into a real section
        // and migrate every orphan task into it.
        const created = await createSection.mutateAsync({ name });
        const orphans = (tasks ?? []).filter((t) => t.sectionId === null);
        await Promise.all(
          orphans.map((t) =>
            updateTask.mutateAsync({ id: t.id, patch: { sectionId: created.id } }),
          ),
        );
      } else {
        await updateSection.mutateAsync({ id: key, patch: { name } });
      }
      setRenamingSectionKey(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not rename section.");
    }
  }

  async function handleUpdateTaskDates(
    taskId: number,
    startISO: string | null,
    dueISO: string | null,
  ) {
    setActionError(null);
    try {
      await updateTask.mutateAsync({
        id: taskId,
        patch: { startDate: startISO, dueDate: dueISO },
      });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update dates.");
    }
  }

  async function handleSectionColorChange(s: Section, color: string) {
    setActionError(null);
    try {
      await updateSection.mutateAsync({ id: s.id, patch: { color } });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not update color.");
    }
  }

  async function handleDeleteSection(s: Section) {
    if (
      !confirm(
        `Delete section "${s.name}"? Tasks in this section keep their data but lose the section link.`,
      )
    )
      return;
    setActionError(null);
    try {
      await deleteSection.mutateAsync(s.id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not delete section.");
    }
  }

  function toggleTaskDone(task: Task) {
    updateTask.mutate({
      id: task.id,
      patch: { status: task.status === "DONE" ? "TODO" : "DONE" },
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded border border-outline-variant bg-surface-container-lowest">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setCreateTaskCtx({ sectionId: null, parentTaskId: null })}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-display text-label-caps uppercase tracking-wider text-on-primary hover:bg-primary-container"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add task
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setAddingSection(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add section
            </button>
          )}
          <span className="ml-auto font-mono text-[12px] text-on-surface-variant">
            {tasks?.length ?? 0} tasks · {sections?.length ?? 0} sections
          </span>
        </div>

        {actionError && (
          <div className="border-b border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container">
            {actionError}
          </div>
        )}

        {/* Column headers */}
        <div className="hidden grid-cols-[36px_minmax(240px,1fr)_190px_170px_80px_48px_28px] items-center border-b border-outline-variant bg-surface-container-low px-3 py-2 font-display text-label-caps uppercase tracking-widest text-on-surface-variant md:grid">
          <span></span>
          <span>Task</span>
          <span>Status</span>
          <span>Dates</span>
          <span>Timer</span>
          <span>Assignee</span>
          <span></span>
        </div>

        {/* Sections */}
        {grouped.map((g) => (
          <SectionBlock
            key={g.section?.id ?? "none"}
            section={g.section}
            tasks={g.tasks}
            collapsed={collapsed.has(g.section?.id ?? "none")}
            canEdit={canEdit}
            onToggle={() => toggle(g.section?.id ?? "none")}
            onAddTask={() =>
              setCreateTaskCtx({
                sectionId: g.section?.id ?? null,
                parentTaskId: null,
              })
            }
            onAddSubtask={(parentId) =>
              setCreateTaskCtx({
                sectionId: g.section?.id ?? null,
                parentTaskId: parentId,
              })
            }
            onEditTask={setEditTask}
            onToggleDone={toggleTaskDone}
            onUpdateDates={handleUpdateTaskDates}
            onRename={(s) => {
              setRenamingSectionKey(s ? s.id : "none");
              setRenameValue(s ? s.name : "");
            }}
            onDelete={handleDeleteSection}
            onColorChange={handleSectionColorChange}
            renamingKey={renamingSectionKey}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRename}
            onRenameCancel={() => setRenamingSectionKey(null)}
          />
        ))}

        {addingSection && (
          <form
            onSubmit={handleAddSection}
            className="flex items-center gap-2 border-t border-outline-variant bg-surface-container-low px-3 py-2"
          >
            <input
              autoFocus
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="Section name"
              maxLength={100}
              className="w-64 rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={createSection.isPending || !newSectionName.trim()}
              className="rounded bg-primary px-2 py-1 font-display text-label-caps uppercase text-on-primary hover:bg-primary-container disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingSection(false);
                setNewSectionName("");
              }}
              className="rounded px-2 py-1 text-[11px] text-on-surface-variant hover:bg-surface-container"
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      {createTaskCtx && (
        <TaskFormModal
          mode="create"
          open={createTaskCtx !== null}
          onClose={() => setCreateTaskCtx(null)}
          projectId={project.id}
          initialSectionId={createTaskCtx.sectionId}
          initialParentTaskId={createTaskCtx.parentTaskId}
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

interface SectionBlockProps {
  section: Section | null;
  tasks: TaskNode[];
  collapsed: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onAddTask: () => void;
  onAddSubtask: (parentId: number) => void;
  onEditTask: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onUpdateDates: (taskId: number, startISO: string | null, dueISO: string | null) => void;
  // s === null when the user clicks edit on the synthetic (No section) group;
  // the parent then opens the rename input keyed on the literal "none".
  onRename: (s: Section | null) => void;
  onDelete: (s: Section) => void;
  onColorChange: (s: Section, color: string) => void;
  renamingKey: number | "none" | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameSubmit: (key: number | "none", e: FormEvent<HTMLFormElement>) => void;
  onRenameCancel: () => void;
}

function SectionBlock({
  section,
  tasks,
  collapsed,
  canEdit,
  onToggle,
  onAddTask,
  onAddSubtask,
  onEditTask,
  onToggleDone,
  onUpdateDates,
  onRename,
  onDelete,
  onColorChange,
  renamingKey,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: SectionBlockProps) {
  const sectionKey: number | "none" = section ? section.id : "none";
  const isRenaming = renamingKey === sectionKey;
  return (
    <div className="border-b border-outline-variant">
      <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="text-on-surface-variant hover:text-on-surface"
          aria-label={collapsed ? "Expand section" : "Collapse section"}
        >
          <span className="material-symbols-outlined text-base">
            {collapsed ? "chevron_right" : "expand_more"}
          </span>
        </button>
        {isRenaming ? (
          <form
            onSubmit={(e) => onRenameSubmit(sectionKey, e)}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              maxLength={100}
              placeholder={
                section ? section.name : "Name this section to promote it"
              }
              className="w-64 rounded border border-outline-variant bg-surface-container-lowest px-2 py-0.5 text-sm font-semibold focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="rounded bg-primary px-2 py-0.5 font-display text-label-caps uppercase text-on-primary"
            >
              {section ? "Save" : "Create"}
            </button>
            <button
              type="button"
              onClick={onRenameCancel}
              className="text-[11px] text-on-surface-variant"
            >
              Cancel
            </button>
          </form>
        ) : (
          <h3
            className={[
              "font-display text-sm font-semibold",
              section ? "text-on-surface" : "italic text-on-surface-variant",
            ].join(" ")}
          >
            {section?.name ?? "(No section)"}
          </h3>
        )}
        <span className="font-mono text-[12px] text-on-surface-variant">
          · {tasks.length}
        </span>
        {canEdit && !isRenaming && (
          <div className="ml-auto flex items-center gap-1">
            {section && (
              <label
                className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded hover:ring-2 hover:ring-outline-variant"
                title="Phase color (used in the Network Diagram)"
                style={{ backgroundColor: section.color }}
              >
                <input
                  type="color"
                  value={section.color}
                  onChange={(e) => onColorChange(section, e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Section color"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => onRename(section)}
              className="rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              title={section ? "Rename section" : "Promote into a real section"}
            >
              <span className="material-symbols-outlined text-[17px]">edit</span>
            </button>
            {section && (
              <button
                type="button"
                onClick={() => onDelete(section)}
                className="rounded p-1 text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                title="Delete section"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
              </button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {tasks.map((node, idx) => (
            <TaskRow
              key={node.task.id}
              node={node}
              index={idx + 1}
              canEdit={canEdit}
              onAddSubtask={onAddSubtask}
              onEdit={onEditTask}
              onToggleDone={onToggleDone}
              onUpdateDates={onUpdateDates}
            />
          ))}

          {tasks.length === 0 && (
            <div className="px-12 py-2 text-[12px] text-on-surface-variant">
              No tasks in this section.
            </div>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={onAddTask}
              className="flex w-full items-center gap-2 px-12 py-1 text-left text-[12px] text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              Add task...
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface TaskNode {
  task: Task;
  subtasks: Task[];
}

function TaskRow({
  node,
  index,
  canEdit,
  onAddSubtask,
  onEdit,
  onToggleDone,
  onUpdateDates,
}: {
  node: TaskNode;
  index: number;
  canEdit: boolean;
  onAddSubtask: (parentId: number) => void;
  onEdit: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onUpdateDates: (taskId: number, startISO: string | null, dueISO: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(node.subtasks.length > 0);
  const [editingDates, setEditingDates] = useState(false);
  const overdue =
    node.task.dueDate &&
    node.task.status !== "DONE" &&
    new Date(node.task.dueDate) < startOfToday();

  return (
    <>
      {/* Desktop grid row */}
      <div className="hidden grid-cols-[36px_minmax(240px,1fr)_190px_170px_80px_48px_28px] items-center border-t border-outline-variant px-3 py-1.5 hover:bg-surface-container-low md:grid">
        {/* Done toggle */}
        <button
          type="button"
          onClick={() => onToggleDone(node.task)}
          className={[
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            node.task.status === "DONE"
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-outline-variant text-transparent hover:border-primary",
          ].join(" ")}
          aria-label="Toggle done"
        >
          <span className="material-symbols-outlined text-[13px]">check</span>
        </button>

        {/* Title + subtext */}
        <button
          type="button"
          onClick={() => onEdit(node.task)}
          className="flex min-w-0 flex-col items-start text-left"
        >
          <span className="flex items-center gap-1.5">
            {node.subtasks.length > 0 && (
              <span
                className="material-symbols-outlined text-[15px] text-on-surface-variant"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
              >
                {expanded ? "expand_more" : "chevron_right"}
              </span>
            )}
            <span
              className={[
                "truncate text-sm font-semibold",
                node.task.status === "DONE"
                  ? "text-on-surface-variant line-through"
                  : "text-on-surface",
              ].join(" ")}
            >
              {node.task.title}
            </span>
          </span>
          <span className="text-[11px] text-on-surface-variant">
            T-{String(node.task.id).padStart(3, "0")}
            {node.task.assignedTo && ` · ${node.task.assignedTo.username}`}
            {node.subtasks.length > 0 && ` · ${node.subtasks.length} subtask${node.subtasks.length === 1 ? "" : "s"}`}
          </span>
        </button>

        {/* Status + priority chips */}
        <div className="flex flex-wrap items-center gap-1">
          <TaskStatusChip status={node.task.status} />
          <PriorityBadge priority={node.task.priority} compact />
        </div>

        {/* Dates (editable) */}
        <span className="relative">
          <button
            type="button"
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation();
              setEditingDates(true);
            }}
            className={[
              "flex items-center gap-1 rounded px-1 text-left",
              overdue
                ? "font-mono text-[12px] font-bold text-error"
                : "font-mono text-[12px] text-on-surface-variant",
              canEdit ? "hover:bg-surface-container-low hover:text-primary" : "cursor-default",
            ].join(" ")}
            title={canEdit ? "Click to edit dates" : undefined}
          >
            <span className="material-symbols-outlined text-[13px]">calendar_today</span>
            {fmtRange(node.task.startDate, node.task.dueDate)}
            {overdue && " · OVERDUE"}
          </button>
          {editingDates && canEdit && (
            <InlineDateRangeEditor
              className="absolute left-0 top-full z-50 mt-1"
              startISO={node.task.startDate}
              endISO={node.task.dueDate}
              onSave={(s, e) => {
                onUpdateDates(node.task.id, s, e);
                setEditingDates(false);
              }}
              onCancel={() => setEditingDates(false)}
            />
          )}
        </span>

        {/* Timer placeholder */}
        <div className="flex items-center gap-1 font-mono text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">timer</span>
          <span>--:--:--</span>
        </div>

        {/* Assignee avatar */}
        <AssigneeAvatar user={node.task.assignedTo} size="xs" />

        {/* Comment count */}
        <div className="flex items-center gap-0.5 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
          {node.task._count.comments > 0 ? node.task._count.comments : ""}
        </div>
      </div>

      {/* Mobile card */}
      <div className="flex flex-col gap-2 border-t border-outline-variant px-3 py-2 md:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleDone(node.task)}
            className={[
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
              node.task.status === "DONE"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-outline-variant text-transparent",
            ].join(" ")}
            aria-label="Toggle done"
          >
            <span className="material-symbols-outlined text-[15px]">check</span>
          </button>
          <button
            type="button"
            onClick={() => onEdit(node.task)}
            className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
          >
            <span
              className={[
                "shrink-0 truncate text-sm",
                node.task.status === "DONE"
                  ? "text-on-surface-variant line-through"
                  : "text-on-surface",
              ].join(" ")}
            >
              <span className="mr-2 font-mono text-[11px] text-on-surface-variant">
                #{index}
              </span>
              {node.task.title}
            </span>
            {node.task.description && (
              <span className="min-w-0 truncate text-[12px] text-on-surface-variant">
                — {node.task.description}
              </span>
            )}
          </button>
          {node.subtasks.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 rounded p-1 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
            >
              <span className="material-symbols-outlined text-[19px]">
                {expanded ? "expand_more" : "chevron_right"}
              </span>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pl-7">
          <span className="flex min-w-0 items-center gap-1.5">
            <AssigneeAvatar user={node.task.assignedTo} size="xs" />
            {node.task.assignedTo && (
              <span className="truncate text-[12px] text-on-surface-variant">
                {node.task.assignedTo.username}
              </span>
            )}
          </span>
          <span className="relative">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setEditingDates(true)}
              className={[
                "rounded px-1 text-right font-mono text-[12px]",
                overdue ? "font-bold text-error" : "text-on-surface-variant",
              ].join(" ")}
            >
              {fmtRange(node.task.startDate, node.task.dueDate)}
              {overdue && " · OVERDUE"}
            </button>
            {editingDates && canEdit && (
              <InlineDateRangeEditor
                className="absolute right-0 top-full z-50 mt-1"
                startISO={node.task.startDate}
                endISO={node.task.dueDate}
                onSave={(s, e) => {
                  onUpdateDates(node.task.id, s, e);
                  setEditingDates(false);
                }}
                onCancel={() => setEditingDates(false)}
              />
            )}
          </span>
        </div>
        {node.subtasks.length > 0 && (
          <span className="pl-7 font-mono text-[11px] text-on-surface-variant">
            {node.subtasks.length} subtask{node.subtasks.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {expanded &&
        node.subtasks.map((s, idx) => (
          <SubtaskRow
            key={s.id}
            task={s}
            index={idx + 1}
            canEdit={canEdit}
            onEdit={onEdit}
            onToggleDone={onToggleDone}
            onUpdateDates={onUpdateDates}
          />
        ))}
      {expanded && canEdit && (
        <>
          <button
            type="button"
            onClick={() => onAddSubtask(node.task.id)}
            className="hidden w-full grid-cols-[36px_minmax(240px,1fr)_190px_170px_80px_48px_28px] items-center border-t border-outline-variant px-3 py-1 text-left text-[12px] text-on-surface-variant hover:bg-surface-container-low hover:text-primary md:grid"
          >
            <span></span>
            <span className="flex items-center gap-1 pl-5">
              <span className="material-symbols-outlined text-[15px]">add</span>
              Add subtask…
            </span>
          </button>
          <button
            type="button"
            onClick={() => onAddSubtask(node.task.id)}
            className="flex w-full items-center gap-1 border-t border-outline-variant px-3 py-2 pl-10 text-left text-[12px] text-on-surface-variant hover:bg-surface-container-low hover:text-primary md:hidden"
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
            Add subtask…
          </button>
        </>
      )}
    </>
  );
}

function SubtaskRow({
  task,
  index,
  canEdit,
  onEdit,
  onToggleDone,
  onUpdateDates,
}: {
  task: Task;
  index: number;
  canEdit: boolean;
  onEdit: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onUpdateDates: (taskId: number, startISO: string | null, dueISO: string | null) => void;
}) {
  const [editingDates, setEditingDates] = useState(false);
  const overdue =
    task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < startOfToday();
  return (
    <>
      {/* Desktop grid row (subtask, indented) */}
      <div className="hidden grid-cols-[36px_minmax(240px,1fr)_190px_170px_80px_48px_28px] items-center border-t border-outline-variant bg-surface-container-low/40 px-3 py-1 hover:bg-surface-container-low md:grid">
        {/* Done toggle */}
        <button
          type="button"
          onClick={() => onToggleDone(task)}
          className={[
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            task.status === "DONE"
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-outline-variant text-transparent hover:border-primary",
          ].join(" ")}
          aria-label="Toggle done"
        >
          <span className="material-symbols-outlined text-[12px]">check</span>
        </button>

        {/* Title (indented) */}
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="flex min-w-0 flex-col items-start pl-5 text-left"
        >
          <span
            className={[
              "truncate text-xs font-medium",
              task.status === "DONE"
                ? "text-on-surface-variant line-through"
                : "text-on-surface",
            ].join(" ")}
          >
            {task.title}
          </span>
          <span className="text-[11px] text-on-surface-variant">
            T-{String(task.id).padStart(3, "0")}
            {task.assignedTo && ` · ${task.assignedTo.username}`}
          </span>
        </button>

        {/* Status + priority */}
        <div className="flex flex-wrap items-center gap-1">
          <TaskStatusChip status={task.status} />
          <PriorityBadge priority={task.priority} compact />
        </div>

        {/* Dates */}
        <span className="relative">
          <button
            type="button"
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation();
              setEditingDates(true);
            }}
            className={[
              "flex items-center gap-1 rounded px-1 text-left",
              overdue
                ? "font-mono text-[12px] font-bold text-error"
                : "font-mono text-[12px] text-on-surface-variant",
              canEdit ? "hover:bg-surface-container-low hover:text-primary" : "cursor-default",
            ].join(" ")}
          >
            <span className="material-symbols-outlined text-[13px]">calendar_today</span>
            {fmtRange(task.startDate, task.dueDate)}
          </button>
          {editingDates && canEdit && (
            <InlineDateRangeEditor
              className="absolute left-0 top-full z-50 mt-1"
              startISO={task.startDate}
              endISO={task.dueDate}
              onSave={(s, e) => {
                onUpdateDates(task.id, s, e);
                setEditingDates(false);
              }}
              onCancel={() => setEditingDates(false)}
            />
          )}
        </span>

        {/* Timer placeholder */}
        <div className="flex items-center gap-1 font-mono text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">timer</span>
          <span>--:--:--</span>
        </div>

        {/* Assignee */}
        <AssigneeAvatar user={task.assignedTo} size="xs" />

        {/* Comment count */}
        <div className="flex items-center gap-0.5 text-[12px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
          {task._count.comments > 0 ? task._count.comments : ""}
        </div>
      </div>

      {/* Mobile subtask card */}
      <div className="flex flex-col gap-1.5 border-t border-outline-variant bg-surface-container-low/40 px-3 py-1.5 pl-8 md:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleDone(task)}
            className={[
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              task.status === "DONE"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-outline-variant text-transparent",
            ].join(" ")}
            aria-label="Toggle done"
          >
            <span className="material-symbols-outlined text-[13px]">check</span>
          </button>
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
          >
            <span
              className={[
                "shrink-0 truncate text-xs",
                task.status === "DONE"
                  ? "text-on-surface-variant line-through"
                  : "text-on-surface",
              ].join(" ")}
            >
              <span className="mr-2 font-mono text-[11px] text-on-surface-variant">
                {index}
              </span>
              {task.title}
            </span>
            {task.description && (
              <span className="min-w-0 truncate text-[12px] text-on-surface-variant">
                — {task.description}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 pl-6">
          <span className="flex min-w-0 items-center gap-1.5">
            <AssigneeAvatar user={task.assignedTo} size="xs" />
            {task.assignedTo && (
              <span className="truncate text-[12px] text-on-surface-variant">
                {task.assignedTo.username}
              </span>
            )}
          </span>
          <span className="relative">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setEditingDates(true)}
              className={[
                "rounded px-1 text-right font-mono text-[12px]",
                overdue ? "font-bold text-error" : "text-on-surface-variant",
              ].join(" ")}
            >
              {fmtRange(task.startDate, task.dueDate)}
            </button>
            {editingDates && canEdit && (
              <InlineDateRangeEditor
                className="absolute right-0 top-full z-50 mt-1"
                startISO={task.startDate}
                endISO={task.dueDate}
                onSave={(s, e) => {
                  onUpdateDates(task.id, s, e);
                  setEditingDates(false);
                }}
                onCancel={() => setEditingDates(false)}
              />
            )}
          </span>
        </div>
      </div>
    </>
  );
}

function groupBySection(
  tasks: Task[],
  sections: Section[],
): { section: Section | null; tasks: TaskNode[] }[] {
  const topLevel = tasks.filter((t) => t.parentTaskId === null);
  const subtasksByParent = new Map<number, Task[]>();
  for (const t of tasks) {
    if (t.parentTaskId !== null) {
      const arr = subtasksByParent.get(t.parentTaskId) ?? [];
      arr.push(t);
      subtasksByParent.set(t.parentTaskId, arr);
    }
  }

  const bySection = new Map<number, TaskNode[]>();
  const noSection: TaskNode[] = [];
  for (const t of topLevel) {
    const node: TaskNode = { task: t, subtasks: subtasksByParent.get(t.id) ?? [] };
    if (t.sectionId === null) noSection.push(node);
    else {
      const arr = bySection.get(t.sectionId) ?? [];
      arr.push(node);
      bySection.set(t.sectionId, arr);
    }
  }

  const groups: { section: Section | null; tasks: TaskNode[] }[] = sections
    .slice()
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((s) => ({ section: s, tasks: bySection.get(s.id) ?? [] }));

  if (noSection.length > 0 || sections.length === 0) {
    groups.push({ section: null, tasks: noSection });
  }

  return groups;
}

function fmt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtRange(start: string | null, end: string | null) {
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `${s} – ${e}`;
  if (s) return `${s} – —`;
  if (e) return `— – ${e}`;
  return "—";
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
