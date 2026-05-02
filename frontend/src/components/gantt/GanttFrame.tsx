import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  AXIS_HEIGHT,
  COLUMN_DEFAULT_WIDTH,
  LIST_PANE_WIDTH,
  ROW_HEIGHT,
} from "@/lib/gantt/constants";
import {
  type Row,
  type ViewMode,
  buildRows,
  computeChartEnd,
  computeChartStart,
  iterColumns,
  positionFor,
  rowsDateRange,
  startOfDay,
} from "@/lib/gantt/geometry";
import {
  type Task,
  type TaskStatus,
  useCreateSection,
  useHolidays,
  useLockBaseline,
  useProjectSections,
  useProjectTasks,
  useUpdateSection,
  useUpdateTask,
} from "@/lib/queries";
import { ConfirmModal } from "@/components/ConfirmModal";
import { GanttChartPane } from "./GanttChartPane";
import { GanttListPane } from "./GanttListPane";
import type { RowDragData, RowDropData } from "./GanttListRow";

interface GanttFrameProps {
  projectId: number;
  baselineLockedAt: string | null;
  baselineLockedBy: { id: number; username: string } | null;
  onEditTask: (task: Task) => void;
  onCreateTaskOpen: (sectionId: number | null) => void;
}

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "day", label: "Day" },
  { mode: "week", label: "Week" },
  { mode: "month", label: "Month" },
];

export function GanttFrame({
  projectId,
  baselineLockedAt,
  baselineLockedBy,
  onEditTask,
  onCreateTaskOpen,
}: GanttFrameProps) {
  const { user } = useAuth();
  const canEdit = hasPermission(user, "task:write");

  const { data: tasks, isLoading, isError, error } = useProjectTasks(projectId);
  const { data: sections } = useProjectSections(projectId);
  const updateTask = useUpdateTask(projectId);
  const createSection = useCreateSection(projectId);
  const updateSection = useUpdateSection(projectId);
  const lockBaseline = useLockBaseline(projectId);
  const [confirmingBaseline, setConfirmingBaseline] = useState(false);
  const [baselineAsOf, setBaselineAsOf] = useState<string>("");
  const [baselineToast, setBaselineToast] = useState<string | null>(null);

  // Auto-dismiss the toast after 4s.
  useEffect(() => {
    if (!baselineToast) return;
    const t = setTimeout(() => setBaselineToast(null), 4000);
    return () => clearTimeout(t);
  }, [baselineToast]);

  // Reset the as-of input each time the modal opens (default = today's date).
  useEffect(() => {
    if (confirmingBaseline) {
      setBaselineAsOf(new Date().toISOString().slice(0, 10));
    }
  }, [confirmingBaseline]);

  const baselineLockedAtPretty = baselineLockedAt
    ? new Date(baselineLockedAt).toLocaleString()
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo<Row[]>(
    () => buildRows({ tasks: tasks ?? [], sections: sections ?? [], collapsed }),
    [tasks, sections, collapsed],
  );

  const dateRange = useMemo(() => rowsDateRange(rows), [rows]);

  const chartStart = useMemo(
    () => (dateRange ? computeChartStart(dateRange.min, viewMode) : null),
    [dateRange, viewMode],
  );
  const chartEnd = useMemo(
    () => (dateRange ? computeChartEnd(dateRange.max, viewMode) : null),
    [dateRange, viewMode],
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const columnCount = useMemo(() => {
    if (!chartStart || !chartEnd) return 0;
    return iterColumns(chartStart, chartEnd, viewMode).length;
  }, [chartStart, chartEnd, viewMode]);

  const columnWidth = COLUMN_DEFAULT_WIDTH[viewMode];
  const contentWidth = columnCount * columnWidth;

  const yearsCovered = useMemo(() => {
    if (!chartStart || !chartEnd) return [new Date().getFullYear()];
    const out: number[] = [];
    for (let y = chartStart.getFullYear(); y <= chartEnd.getFullYear(); y++) {
      out.push(y);
    }
    return out;
  }, [chartStart, chartEnd]);
  const { data: holidays } = useHolidays(yearsCovered);

  const handleToggleSection = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTaskClick = useCallback(
    (taskId: number) => {
      const t = (tasks ?? []).find((x) => x.id === taskId);
      if (t) onEditTask(t);
    },
    [tasks, onEditTask],
  );

  const handleCommit = useCallback(
    async (taskId: number, startDate: Date, dueDate: Date) => {
      setActionError(null);
      try {
        await updateTask.mutateAsync({
          id: taskId,
          patch: {
            startDate: startOfDay(startDate).toISOString(),
            dueDate: startOfDay(dueDate).toISOString(),
          },
        });
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "Could not update task dates.",
        );
      }
    },
    [updateTask],
  );

  const handleToggleStatus = useCallback(
    async (taskId: number, current: TaskStatus) => {
      setActionError(null);
      const next: TaskStatus = current === "DONE" ? "TODO" : "DONE";
      try {
        await updateTask.mutateAsync({ id: taskId, patch: { status: next } });
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "Could not update task status.",
        );
      }
    },
    [updateTask],
  );

  const handleUpdateDates = useCallback(
    async (taskId: number, startISO: string | null, dueISO: string | null) => {
      setActionError(null);
      try {
        await updateTask.mutateAsync({
          id: taskId,
          patch: { startDate: startISO, dueDate: dueISO },
        });
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "Could not update dates.",
        );
      }
    },
    [updateTask],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeData = active.data.current as RowDragData | undefined;
      const overData = over.data.current as RowDropData | undefined;
      if (!activeData || !overData) return;
      if (overData.kind !== "section-target") return;

      setActionError(null);

      if (activeData.kind === "task" && activeData.taskId !== undefined) {
        if (activeData.sectionId === overData.sectionId) return;
        try {
          await updateTask.mutateAsync({
            id: activeData.taskId,
            patch: { sectionId: overData.sectionId },
          });
        } catch (err) {
          setActionError(
            err instanceof ApiError ? err.message : "Could not move task.",
          );
        }
        return;
      }

      if (activeData.kind === "section" && activeData.sectionId !== null) {
        // Section dropped on the "(No section)" pseudo-target — ignore
        // (you can't reorder relative to a non-section).
        if (overData.sectionId === null) return;
        if (activeData.sectionId === overData.sectionId) return;
        const ordered = [...(sections ?? [])].sort(
          (a, b) => a.position - b.position || a.id - b.id,
        );
        const moved = ordered.find((s) => s.id === activeData.sectionId);
        if (!moved) return;
        const filtered = ordered.filter((s) => s.id !== activeData.sectionId);
        const targetIdx = filtered.findIndex((s) => s.id === overData.sectionId);
        if (targetIdx < 0) return;
        filtered.splice(targetIdx, 0, moved);
        try {
          await Promise.all(
            filtered.flatMap((s, i) =>
              s.position === i
                ? []
                : [updateSection.mutateAsync({ id: s.id, patch: { position: i } })],
            ),
          );
        } catch (err) {
          setActionError(
            err instanceof ApiError ? err.message : "Could not reorder sections.",
          );
        }
      }
    },
    [sections, updateTask, updateSection],
  );

  const scrollToTodayPos = useCallback(
    (behavior: ScrollBehavior) => {
      const el = scrollerRef.current;
      if (!el || !chartStart) return;
      const today = startOfDay(new Date());
      const { x } = positionFor(today, chartStart, viewMode, columnWidth);
      const target = Math.max(0, x - (el.clientWidth - LIST_PANE_WIDTH) / 2);
      el.scrollTo({ left: target, behavior });
    },
    [chartStart, viewMode, columnWidth],
  );

  const scrollToToday = useCallback(() => scrollToTodayPos("smooth"), [scrollToTodayPos]);

  // Auto-scroll to today on first paint of the chart and whenever the
  // chart's coordinate system changes (view mode swap rebuilds the axis).
  useEffect(() => {
    if (!chartStart || rows.length === 0) return;
    const id = requestAnimationFrame(() => scrollToTodayPos("auto"));
    return () => cancelAnimationFrame(id);
  }, [chartStart, viewMode, columnWidth, rows.length, scrollToTodayPos]);

  const handleAddSection = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const name = newSectionName.trim();
      if (!name) return;
      setActionError(null);
      try {
        await createSection.mutateAsync({ name });
        setNewSectionName("");
        setAddingSection(false);
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "Could not create section.",
        );
      }
    },
    [createSection, newSectionName],
  );

  const sectionCount = sections?.length ?? 0;
  const datedTaskCount = (tasks ?? []).filter((t) => t.startDate || t.dueDate).length;

  return (
    <div className="flex h-full min-h-[460px] min-w-0 flex-col overflow-hidden rounded border border-outline-variant bg-surface-container-lowest">
      <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-3 py-1.5">
        <button
          type="button"
          onClick={scrollToToday}
          disabled={!chartStart}
          className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base">today</span>
          Today
        </button>
        {canEdit && (
          <>
            <span className="mx-1 h-4 w-px bg-outline-variant" aria-hidden />
            <button
              type="button"
              onClick={() => onCreateTaskOpen(null)}
              className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Task
            </button>
            <button
              type="button"
              onClick={() => setAddingSection(true)}
              className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Section
            </button>
            <span className="mx-1 h-4 w-px bg-outline-variant" aria-hidden />
            <button
              type="button"
              onClick={() => setConfirmingBaseline(true)}
              title={
                baselineLockedAt
                  ? `Baseline locked ${new Date(baselineLockedAt).toLocaleString()}${baselineLockedBy ? ` by ${baselineLockedBy.username}` : ""}`
                  : "Snapshot the current schedule as the official baseline"
              }
              className={
                baselineLockedAt
                  ? "inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary"
                  : "inline-flex items-center gap-1 rounded border border-primary bg-primary px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-primary hover:bg-primary-container"
              }
            >
              <span className="material-symbols-outlined text-base">
                {baselineLockedAt ? "bookmark" : "bookmark_add"}
              </span>
              {baselineLockedAt ? "Reset Baseline" : "Lock Baseline"}
            </button>
          </>
        )}
        <span className="ml-3 font-mono text-[11px] text-on-surface-variant">
          {datedTaskCount} dated · {sectionCount} sections
          {canEdit && " · drag bars or edges to reschedule"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Scale
          </span>
          <div className="inline-flex overflow-hidden rounded border border-outline-variant">
            {VIEW_MODES.map((v, i) => (
              <button
                key={v.mode}
                type="button"
                onClick={() => setViewMode(v.mode)}
                className={[
                  "px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider",
                  i > 0 ? "border-l border-outline-variant" : "",
                  v.mode === viewMode
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-lowest text-on-surface-variant hover:text-primary",
                ].join(" ")}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {addingSection && (
        <form
          onSubmit={handleAddSection}
          className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-low px-3 py-2"
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
            className="rounded bg-primary px-2 py-1 font-display text-[10px] font-bold uppercase text-on-primary hover:bg-primary-container disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingSection(false);
              setNewSectionName("");
            }}
            className="rounded px-2 py-1 text-[10px] text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
        </form>
      )}

      {actionError && (
        <div className="border-b border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container">
          {actionError}
        </div>
      )}

      {isLoading && (
        <div className="m-3 h-64 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
      )}
      {isError && (
        <div className="m-3 rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load tasks: {(error as Error).message}
        </div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="m-3 rounded border border-dashed border-outline-variant p-12 text-center text-on-surface-variant">
          <p className="text-sm">
            No tasks have start or due dates yet. Add dates from the task editor to see them here.
          </p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && chartStart && chartEnd && (
        <div
          ref={scrollerRef}
          className="solvro-gantt relative min-h-0 min-w-0 flex-1 overflow-auto"
        >
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div
              style={{
                width: LIST_PANE_WIDTH + contentWidth,
                minHeight: AXIS_HEIGHT + rows.length * ROW_HEIGHT,
              }}
              className="relative flex items-stretch"
            >
              <GanttListPane
                rows={rows}
                canEdit={canEdit}
                onToggleSection={handleToggleSection}
                onTaskClick={handleTaskClick}
                onToggleStatus={handleToggleStatus}
                onUpdateDates={handleUpdateDates}
              />
              <div className="relative flex-shrink-0" style={{ width: contentWidth }}>
                <GanttChartPane
                  rows={rows}
                  chartStart={chartStart}
                  chartEnd={chartEnd}
                  viewMode={viewMode}
                  columnWidth={columnWidth}
                  contentWidth={contentWidth}
                  holidays={holidays}
                  canEdit={canEdit}
                  onCommit={handleCommit}
                  onTaskClick={handleTaskClick}
                />
              </div>
            </div>
          </DndContext>
        </div>
      )}

      <ConfirmModal
        open={confirmingBaseline}
        onClose={() => setConfirmingBaseline(false)}
        onConfirm={async () => {
          try {
            const asOfIso = baselineAsOf
              ? new Date(`${baselineAsOf}T00:00:00`).toISOString()
              : undefined;
            const res = await lockBaseline.mutateAsync({ asOfDate: asOfIso });
            const stamp = res.baselineLockedAt
              ? new Date(res.baselineLockedAt).toLocaleDateString()
              : "";
            setBaselineToast(
              baselineLockedAt
                ? `Baseline overwritten — now anchored to ${stamp}`
                : `Baseline locked as of ${stamp}`,
            );
            setConfirmingBaseline(false);
          } catch (err) {
            setActionError(
              err instanceof ApiError ? err.message : "Could not lock baseline.",
            );
            setConfirmingBaseline(false);
          }
        }}
        title={baselineLockedAt ? "Reset project baseline?" : "Lock project baseline?"}
        confirmLabel={baselineLockedAt ? "Overwrite baseline" : "Lock baseline"}
        confirmTone={baselineLockedAt ? "warning" : "primary"}
        busy={lockBaseline.isPending}
        body={
          <div className="space-y-3">
            {baselineLockedAt ? (
              <p>
                <strong>Overwrite the existing baseline?</strong> The previous snapshot
                {baselineLockedBy ? ` (locked by ${baselineLockedBy.username} on ${baselineLockedAtPretty})` : ` (locked ${baselineLockedAtPretty})`}{" "}
                will be replaced with the current schedule. This cannot be undone.
              </p>
            ) : (
              <p>
                Lock the current schedule as the official baseline for this project?
                Every task's current Start and Due dates will be saved as its baseline so
                future slips can be measured against this snapshot.
              </p>
            )}
            <label className="block">
              <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Baseline as-of date
              </span>
              <input
                type="date"
                value={baselineAsOf}
                onChange={(e) => setBaselineAsOf(e.target.value)}
                className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="mt-1 block text-[10px] text-on-surface-variant">
                Defaults to today. Use a different date to backdate the snapshot — e.g.
                "May 1 baseline".
              </span>
            </label>
            {baselineLockedAt && (
              <div className="border-t border-outline-variant pt-2">
                <button
                  type="button"
                  disabled={lockBaseline.isPending}
                  onClick={async () => {
                    try {
                      await lockBaseline.mutateAsync({ clear: true });
                      setBaselineToast("Baseline cleared");
                      setConfirmingBaseline(false);
                    } catch (err) {
                      setActionError(
                        err instanceof ApiError
                          ? err.message
                          : "Could not clear baseline.",
                      );
                      setConfirmingBaseline(false);
                    }
                  }}
                  className="font-display text-[10px] font-bold uppercase tracking-wider text-error hover:underline disabled:opacity-50"
                >
                  Clear baseline instead
                </button>
                <span className="ml-1 text-[10px] text-on-surface-variant">
                  — removes the snapshot entirely.
                </span>
              </div>
            )}
          </div>
        }
      />

      {baselineToast && (
        <div
          role="status"
          className="pointer-events-auto fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 font-display text-[11px] font-bold uppercase tracking-wider text-emerald-700 shadow-md"
        >
          <span className="material-symbols-outlined mr-1 align-middle text-[14px]">
            check_circle
          </span>
          {baselineToast}
        </div>
      )}
    </div>
  );
}
