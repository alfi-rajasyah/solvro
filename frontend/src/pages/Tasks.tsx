import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AssigneeAvatar } from "@/components/AssigneeAvatar";
import { LabelChip } from "@/components/LabelChip";
import { PriorityBadge } from "@/components/PriorityBadge";
import { TaskFormModal } from "@/components/TaskFormModal";
import { TaskStatusChip } from "@/components/StatusChip";
import { dateToDay, dayFromIso, dayToDate } from "@/lib/dateField";
import {
  type Priority,
  type Task,
  type TaskStatus,
  type TaskWithProject,
  type TasksFilter,
  useCustomers,
  useTasks,
  useUsers,
} from "@/lib/queries";

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const PRIORITY_ORDER: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

type SortKey = "due" | "priority" | "project" | "status";

export function Tasks() {
  const [filter, setFilter] = useState<TasksFilter>({ topLevel: true });
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [editTask, setEditTask] = useState<TaskWithProject | null>(null);

  const { data: tasks, isLoading, isError, error } = useTasks(filter);
  const { data: users } = useUsers();
  const { data: customers } = useCustomers();

  // Hoisted once per render of the list rather than once per Row — the
  // day string is identical for every row in a single render pass.
  const todayDay = dateToDay(startOfToday());

  const sorted = useMemo(() => {
    if (!tasks) return [];
    const copy = [...tasks];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "due": {
          const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
          const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
          return ad - bd;
        }
        case "priority":
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        case "project":
          return a.project.name.localeCompare(b.project.name);
        case "status":
          return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
      }
    });
    return copy;
  }, [tasks, sortKey]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold text-on-surface">Tasks</h1>
        <p className="text-sm text-on-surface-variant">
          Cross-project task list. Apply filters, sort, click any row to open the editor.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-3">
        <FilterSelect
          label="Status"
          value={filter.status ?? ""}
          options={STATUSES.map((s) => [s, s.replace("_", " ")] as const)}
          onChange={(v) =>
            setFilter((f) => ({ ...f, status: (v as TaskStatus) || undefined }))
          }
        />
        <FilterSelect
          label="Priority"
          value={filter.priority ?? ""}
          options={PRIORITIES.map((p) => [p, p] as const)}
          onChange={(v) =>
            setFilter((f) => ({ ...f, priority: (v as Priority) || undefined }))
          }
        />
        <FilterSelect
          label="Assignee"
          value={filter.assignedToId === undefined ? "" : String(filter.assignedToId)}
          options={(users ?? []).map((u) => [String(u.id), u.username] as const)}
          onChange={(v) =>
            setFilter((f) => ({
              ...f,
              assignedToId: v === "" ? undefined : Number(v),
            }))
          }
        />
        <FilterSelect
          label="Customer"
          value={filter.customerId === undefined ? "" : String(filter.customerId)}
          options={(customers ?? []).map((c) => [String(c.id), c.name] as const)}
          onChange={(v) =>
            setFilter((f) => ({
              ...f,
              customerId: v === "" ? undefined : Number(v),
            }))
          }
        />
        <label className="flex items-center gap-2 text-xs text-on-surface-variant">
          <input
            type="checkbox"
            checked={filter.overdue ?? false}
            onChange={(e) =>
              setFilter((f) => ({ ...f, overdue: e.target.checked || undefined }))
            }
            className="h-3.5 w-3.5 accent-primary"
          />
          Overdue only
        </label>
        <label className="flex items-center gap-2 text-xs text-on-surface-variant">
          <input
            type="checkbox"
            checked={filter.topLevel ?? false}
            onChange={(e) => setFilter((f) => ({ ...f, topLevel: e.target.checked || undefined }))}
            className="h-3.5 w-3.5 accent-primary"
          />
          Top-level only
        </label>
        <button
          type="button"
          onClick={() => setFilter({ topLevel: true })}
          className="ml-auto rounded-sm border border-outline-variant px-2 py-1 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary"
        >
          Reset
        </button>
      </div>

      {isLoading && (
        <div className="h-64 animate-pulse rounded-xl bg-surface-container-low" />
      )}

      {isError && (
        <div className="rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load tasks: {(error as Error).message}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-sm border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-xs">
            <thead className="border-b border-outline-variant bg-surface-container-low text-on-surface-variant">
              <tr className="text-left">
                <Th>ID</Th>
                <Th>Title</Th>
                <Th sortKey="project" current={sortKey} onSort={setSortKey}>
                  Project
                </Th>
                <Th>Labels</Th>
                <Th sortKey="priority" current={sortKey} onSort={setSortKey}>
                  Priority
                </Th>
                <Th>Assignee</Th>
                <Th sortKey="due" current={sortKey} onSort={setSortKey}>
                  Due
                </Th>
                <Th sortKey="status" current={sortKey} onSort={setSortKey}>
                  Status
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <Row key={t.id} task={t} todayDay={todayDay} onEdit={() => setEditTask(t)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <div className="rounded-sm border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center text-on-surface-variant">
          <p className="text-sm">No tasks match the current filters.</p>
        </div>
      )}

      {editTask && (
        <TaskFormModal
          mode="edit"
          open={editTask !== null}
          onClose={() => setEditTask(null)}
          projectId={editTask.projectId}
          task={editTask}
        />
      )}
    </div>
  );
}

function Row({
  task,
  todayDay,
  onEdit,
}: {
  task: TaskWithProject;
  todayDay: string | null;
  onEdit: () => void;
}) {
  // Compare calendar days, not instants —
  // lexicographic "yyyy-MM-dd" comparison is calendar-correct (dateField.ts).
  // `todayDay` is hoisted by the caller (once per render, not once per row).
  const overdue = task.dueDate && task.status !== "DONE" && dayFromIso(task.dueDate)! < todayDay!;
  return (
    <tr
      onClick={onEdit}
      className="cursor-pointer border-t border-outline-variant transition-colors hover:bg-surface-container-low"
    >
      <td className="px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
          T-{String(task.id).padStart(3, "0")}
        </span>
      </td>
      <td className="px-3 py-2 font-medium text-on-surface">{task.title}</td>
      <td className="px-3 py-2">
        <Link
          to={`/projects/${task.project.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-on-surface-variant hover:text-primary"
        >
          {task.project.name}
        </Link>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {task.labels.slice(0, 2).map((l) => (
            <LabelChip key={l.id} label={l} compact />
          ))}
          {task.labels.length > 2 && (
            <span className="text-[11px] text-on-surface-variant">+{task.labels.length - 2}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <PriorityBadge priority={task.priority} compact />
      </td>
      <td className="px-3 py-2">
        <AssigneeAvatar user={task.assignedTo} size="xs" />
      </td>
      <td className="px-3 py-2">
        <span
          className={
            overdue
              ? "font-mono text-[12px] font-bold text-error"
              : "font-mono text-[12px] text-on-surface-variant"
          }
        >
          {fmt(task.dueDate)}
          {overdue && " · OVERDUE"}
        </span>
      </td>
      <td className="px-3 py-2">
        <TaskStatusChip status={task.status} />
      </td>
    </tr>
  );
}

function Th({
  children,
  sortKey,
  current,
  onSort,
}: {
  children: React.ReactNode;
  sortKey?: SortKey;
  current?: SortKey;
  onSort?: (k: SortKey) => void;
}) {
  const sortable = sortKey && onSort;
  return (
    <th
      onClick={sortable ? () => onSort!(sortKey) : undefined}
      className={[
        "px-3 py-2 font-display text-label-caps uppercase tracking-widest",
        sortable ? "cursor-pointer hover:text-primary" : "",
        sortKey && current === sortKey ? "text-primary" : "",
      ].join(" ")}
    >
      {children}
      {sortable && current === sortKey ? " ↑" : ""}
    </th>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-label-caps uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs focus:border-primary focus:outline-hidden"
      >
        <option value="">Any</option>
        {options.map(([v, lbl]) => (
          <option key={v} value={v}>
            {lbl}
          </option>
        ))}
      </select>
    </label>
  );
}

function fmt(iso: string | null) {
  // Derive the day via the UTC date-part,
  // not a local-time parse of the ISO instant.
  const d = dayToDate(dayFromIso(iso));
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Re-export Task to silence TS in callers that import this file.
export type { Task };
