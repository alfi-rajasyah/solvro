import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";
import { LabelPicker } from "./LabelPicker";
import { CommentThread } from "./CommentThread";
import { ApiError } from "@/lib/api";
import {
  type Priority,
  type Task,
  type TaskStatus,
  useCreateTask,
  useProjectSections,
  useProjectTasks,
  useUpdateTask,
  useUsers,
} from "@/lib/queries";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

interface CreateProps {
  open: boolean;
  onClose: () => void;
  mode: "create";
  projectId: number;
  initialStatus?: TaskStatus;
  initialParentTaskId?: number | null;
  initialSectionId?: number | null;
}

interface EditProps {
  open: boolean;
  onClose: () => void;
  mode: "edit";
  projectId: number;
  task: Task;
}

export type TaskFormModalProps = CreateProps | EditProps;

export function TaskFormModal(props: TaskFormModalProps) {
  const { open, onClose, projectId } = props;
  const isEdit = props.mode === "edit";

  const create = useCreateTask(projectId);
  const update = useUpdateTask(projectId);
  const { data: users } = useUsers();
  const { data: projectTasks } = useProjectTasks(open ? projectId : null);
  const { data: sections } = useProjectSections(open ? projectId : null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("TODO");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [startDate, setStartDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [baselineStartDate, setBaselineStartDate] = useState<string>("");
  const [baselineDueDate, setBaselineDueDate] = useState<string>("");
  const [assignedToId, setAssignedToId] = useState<number | "">("");
  const [parentTaskId, setParentTaskId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (isEdit) {
      const t = (props as EditProps).task;
      setTitle(t.title);
      setDescription(t.description ?? "");
      setStatus(t.status);
      setPriority(t.priority);
      setStartDate(t.startDate ? t.startDate.slice(0, 10) : "");
      setDueDate(t.dueDate ? t.dueDate.slice(0, 10) : "");
      setBaselineStartDate(t.baselineStartDate ? t.baselineStartDate.slice(0, 10) : "");
      setBaselineDueDate(t.baselineDueDate ? t.baselineDueDate.slice(0, 10) : "");
      setAssignedToId(t.assignedToId ?? "");
      setParentTaskId(t.parentTaskId ?? "");
      setSectionId(t.sectionId ?? "");
      setLabelIds(t.labels.map((l) => l.id));
    } else {
      const cp = props as CreateProps;
      setTitle("");
      setDescription("");
      setStatus(cp.initialStatus ?? "TODO");
      setPriority("MEDIUM");
      setStartDate("");
      setDueDate("");
      setBaselineStartDate("");
      setBaselineDueDate("");
      setAssignedToId("");
      setParentTaskId(cp.initialParentTaskId ?? "");
      setSectionId(cp.initialSectionId ?? "");
      setLabelIds([]);
    }
  }, [open, isEdit, props]);

  const editingTask = isEdit ? (props as EditProps).task : null;
  const possibleParents = (projectTasks ?? []).filter(
    (t) => !editingTask || (t.id !== editingTask.id && t.parentTaskId === null),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
      setError("Due date must be on or after start date.");
      return;
    }

    const startIso = startDate ? new Date(startDate).toISOString() : null;
    const dueIso = dueDate ? new Date(dueDate).toISOString() : null;
    const baselineStartIso = baselineStartDate
      ? new Date(baselineStartDate).toISOString()
      : null;
    const baselineDueIso = baselineDueDate
      ? new Date(baselineDueDate).toISOString()
      : null;
    const parent = parentTaskId === "" ? null : Number(parentTaskId);
    const sec = sectionId === "" ? null : Number(sectionId);
    const assignee = assignedToId === "" ? null : Number(assignedToId);

    try {
      if (isEdit && editingTask) {
        await update.mutateAsync({
          id: editingTask.id,
          patch: {
            title: title.trim(),
            description: description.trim() || null,
            status,
            priority,
            startDate: startIso,
            dueDate: dueIso,
            baselineStartDate: baselineStartIso,
            baselineDueDate: baselineDueIso,
            assignedToId: assignee,
            parentTaskId: parent,
            sectionId: sec,
            labelIds,
          },
        });
      } else {
        await create.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          priority,
          startDate: startIso,
          dueDate: dueIso,
          assignedToId: assignee,
          parentTaskId: parent,
          sectionId: sec,
          labelIds: labelIds.length > 0 ? labelIds : undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed.");
    }
  }

  const submitting = create.isPending || update.isPending;
  const subtasks = editingTask
    ? (projectTasks ?? []).filter((t) => t.parentTaskId === editingTask.id)
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit task · T-${String(editingTask!.id).padStart(3, "0")}` : "New task"}
      widthClass="max-w-3xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded px-3 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="task-form"
            disabled={submitting}
            className="rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create task"}
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Field label="Title" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              className="w-full resize-y rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          {isEdit && editingTask && (
            <div className="space-y-2">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                Subtasks {subtasks.length > 0 && `· ${subtasks.length}`}
              </span>
              {subtasks.length === 0 ? (
                <p className="text-xs text-on-surface-variant">
                  No subtasks. Create child tasks via the Kanban board's "+ Add task" with this
                  task selected as the parent.
                </p>
              ) : (
                <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
                  {subtasks.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={s.status === "DONE"}
                          onChange={() =>
                            update.mutate({
                              id: s.id,
                              patch: { status: s.status === "DONE" ? "TODO" : "DONE" },
                            })
                          }
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        <span
                          className={`text-xs ${s.status === "DONE" ? "text-on-surface-variant line-through" : "text-on-surface"}`}
                        >
                          {s.title}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-on-surface-variant">
                        T-{String(s.id).padStart(3, "0")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isEdit && editingTask && (
            <div className="border-t border-outline-variant pt-4">
              <CommentThread taskId={editingTask.id} />
            </div>
          )}
        </div>

        <div className="space-y-3 lg:col-span-1">
          {isEdit && (
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Start">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Field>
            <Field label="Due">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </Field>
          </div>

          {isEdit && (
            <div className="space-y-1.5 rounded border border-dashed border-outline-variant bg-surface-container-low/40 p-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">bookmark</span>
                Baseline Dates
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Baseline Start">
                  <input
                    type="date"
                    value={baselineStartDate}
                    onChange={(e) => setBaselineStartDate(e.target.value)}
                    className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </Field>
                <Field label="Baseline Due">
                  <input
                    type="date"
                    value={baselineDueDate}
                    onChange={(e) => setBaselineDueDate(e.target.value)}
                    className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </Field>
              </div>
              <p className="text-[10px] text-on-surface-variant">
                Override only if project scope officially changes — does not affect the
                live schedule.
              </p>
            </div>
          )}

          <Field label="Assignee">
            <select
              value={assignedToId === "" ? "" : String(assignedToId)}
              onChange={(e) =>
                setAssignedToId(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Unassigned</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} · {u.role}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Parent task">
            <select
              value={parentTaskId === "" ? "" : String(parentTaskId)}
              onChange={(e) =>
                setParentTaskId(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— Top level —</option>
              {possibleParents.map((t) => (
                <option key={t.id} value={t.id}>
                  T-{String(t.id).padStart(3, "0")} · {t.title}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Section">
            <select
              value={sectionId === "" ? "" : String(sectionId)}
              onChange={(e) =>
                setSectionId(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— No section —</option>
              {(sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Labels">
            <LabelPicker
              projectId={projectId}
              selectedIds={labelIds}
              onChange={setLabelIds}
            />
          </Field>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container lg:col-span-3"
          >
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label}
        {required && <span className="ml-1 text-error">*</span>}
      </span>
      {children}
    </label>
  );
}
