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
  DEFAULT_LIST_PANE_WIDTH,
  DIVIDER_WIDTH,
  MAX_LIST_PANE_WIDTH,
  MIN_LIST_PANE_WIDTH,
  ROW_HEIGHT,
} from "@/lib/gantt/constants";
import {
  type Row,
  type ViewMode,
  addDays,
  buildRows,
  computeChartEnd,
  computeChartStart,
  iterColumns,
  positionFor,
  rowsDateRange,
  startOfDay,
  toUtcMidnightISO,
} from "@/lib/gantt/geometry";
import { useGanttExport } from "@/lib/gantt/exportContext";
import { exportGanttToExcel } from "@/lib/gantt/exportExcel";
import { exportGanttToPdf } from "@/lib/gantt/exportPdf";
import {
  type Task,
  useCreateDependency,
  useCreateSection,
  useDeleteDependency,
  useHolidays,
  useLockBaseline,
  useProjectDependencies,
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
  projectName: string;
  baselineLockedAt: string | null;
  baselineLockedBy: { id: number; username: string } | null;
  onEditTask: (task: Task) => void;
  onCreateTaskOpen: (sectionId: number | null) => void;
}

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "day", label: "Day" },
  { mode: "week", label: "Week" },
  { mode: "month", label: "Month" },
  { mode: "quarter", label: "Quarter" },
];

export function GanttFrame({
  projectId,
  projectName,
  baselineLockedAt,
  baselineLockedBy,
  onEditTask,
  onCreateTaskOpen,
}: GanttFrameProps) {
  const { user } = useAuth();
  const canEdit = hasPermission(user, "task:write");

  const { data: tasks, isLoading, isError, error } = useProjectTasks(projectId);
  const { data: sections } = useProjectSections(projectId);
  const { data: dependencies } = useProjectDependencies(projectId);
  const createDep = useCreateDependency(projectId);
  const deleteDep = useDeleteDependency(projectId);
  const updateTask = useUpdateTask(projectId);
  const createSection = useCreateSection(projectId);
  const updateSection = useUpdateSection(projectId);
  const lockBaseline = useLockBaseline(projectId);
  const [confirmingBaseline, setConfirmingBaseline] = useState(false);
  const [baselineAsOf, setBaselineAsOf] = useState<string>("");
  const [baselineToast, setBaselineToast] = useState<string | null>(null);
  // "Baseline" toolbar toggle — purely a display switch. Independent from
  // whether a baseline has actually been locked (that's baselineLockedAt).
  const [showBaseline, setShowBaseline] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!exportMenuOpen) return;
    function onDocPointer(e: PointerEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [exportMenuOpen]);

  const baselineLockedAtPretty = baselineLockedAt
    ? new Date(baselineLockedAt).toLocaleString()
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Resizable left (task table) pane. Draggable divider between the list
  // pane and the timeline; clamped to [MIN_LIST_PANE_WIDTH, MAX_LIST_PANE_WIDTH].
  const [listPaneWidth, setListPaneWidth] = useState(DEFAULT_LIST_PANE_WIDTH);
  const resizeRef = useRef<{ originX: number; originWidth: number } | null>(null);

  const handleDividerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      resizeRef.current = { originX: e.clientX, originWidth: listPaneWidth };
    },
    [listPaneWidth],
  );
  const handleDividerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current;
      if (!drag) return;
      const next = drag.originWidth + (e.clientX - drag.originX);
      setListPaneWidth(Math.max(MIN_LIST_PANE_WIDTH, Math.min(MAX_LIST_PANE_WIDTH, next)));
    },
    [],
  );
  const handleDividerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    resizeRef.current = null;
  }, []);

  // Declared early so connect-drag closures below can reach it; the
  // ref is attached to the scroller in the JSX further down.
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Connect-drag state: tracks the rubber-band line from a bar's right
   * edge to the cursor while the user is creating a new dependency.
   * `null` when no drag is in progress.
   *
   * Coordinates are local to the chart-body container (i.e. excluding
   * the list pane on the left and the date axis at the top), so the
   * SVG overlay rendered by `GanttChartPane` can use them directly.
   */
  const [connectDrag, setConnectDrag] = useState<{
    sourceTaskId: number;
    startX: number;
    startY: number;
    cursorX: number;
    cursorY: number;
  } | null>(null);

  const handleConnectStart = useCallback(
    (
      sourceTaskId: number,
      side: "right" | "left",
      clientX: number,
      clientY: number,
    ) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      // clientXY → chart-body-local coords. The chart body is offset by
      // listPaneWidth from the left and AXIS_HEIGHT from the top of
      // the scroller's content origin.
      const toLocal = (cx: number, cy: number) => ({
        x: cx - rect.left + scroller.scrollLeft - listPaneWidth,
        y: cy - rect.top + scroller.scrollTop - AXIS_HEIGHT,
      });
      const start = toLocal(clientX, clientY);
      setConnectDrag({
        sourceTaskId,
        startX: start.x,
        startY: start.y,
        cursorX: start.x,
        cursorY: start.y,
      });

      const onMove = (ev: PointerEvent) => {
        const c = toLocal(ev.clientX, ev.clientY);
        setConnectDrag((prev) =>
          prev ? { ...prev, cursorX: c.x, cursorY: c.y } : null,
        );
      };
      const onUp = (ev: PointerEvent) => {
        cleanup();
        // Walk up from elementFromPoint until we find a [data-task-id].
        // The release target is the successor.
        let node: Element | null = document.elementFromPoint(ev.clientX, ev.clientY);
        let targetTaskId: number | null = null;
        while (node) {
          const id = (node as HTMLElement).dataset?.taskId;
          if (id) {
            targetTaskId = Number(id);
            break;
          }
          node = node.parentElement;
        }
        setConnectDrag(null);
        if (targetTaskId === null || targetTaskId === sourceTaskId) return;
        // Right handle: this task is the predecessor, the drop target the
        // successor. Left handle: reversed — this task depends on the drop
        // target, so the drop target is the predecessor.
        const predecessorTaskId = side === "left" ? targetTaskId : sourceTaskId;
        const successorTaskId = side === "left" ? sourceTaskId : targetTaskId;
        createDep.mutate(
          {
            predecessorTaskId,
            successorTaskId,
            type: "HARD",
            // Gantt-created deps always render right→left regardless of
            // which handle started the drag; persist that orientation so
            // the Network Diagram view routes them the same way.
            sourceHandle: "right-source",
            targetHandle: "left-target",
          },
          {
            onError: (err) => {
              setActionError(
                err instanceof ApiError
                  ? err.message
                  : "Could not create dependency.",
              );
            },
          },
        );
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          cleanup();
          setConnectDrag(null);
        }
      };
      function cleanup() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("keydown", onKey);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("keydown", onKey);
    },
    [createDep, listPaneWidth],
  );

  const handleDeleteDependency = useCallback(
    (id: number) => {
      setActionError(null);
      deleteDep.mutate(id, {
        onError: (err) => {
          setActionError(
            err instanceof ApiError
              ? err.message
              : "Could not delete dependency.",
          );
        },
      });
    },
    [deleteDep],
  );

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
            startDate: toUtcMidnightISO(startDate),
            dueDate: toUtcMidnightISO(dueDate),
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
      const target = Math.max(0, x - (el.clientWidth - listPaneWidth) / 2);
      el.scrollTo({ left: target, behavior });
    },
    [chartStart, viewMode, columnWidth, listPaneWidth],
  );

  const scrollToToday = useCallback(() => scrollToTodayPos("smooth"), [scrollToTodayPos]);

  // Register Excel/PDF export handlers in the shared context so the
  // RightSidebar (mounted by ProjectDetail, not by this component) can show
  // an Export section while the Gantt is mounted, AND so this component's
  // own toolbar "Export" button (matching the Gantt v2 mockup) can trigger
  // the same handlers directly.
  const { handlers: exportHandlers, register } = useGanttExport();
  useEffect(() => {
    if (!chartStart || !chartEnd) {
      register(null);
      return;
    }
    // Excel export uses a tight ±7-day window around the actual task range,
    // not the chart's padded ±1-year window — otherwise the date grid is
    // dominated by empty columns. Falls back to chartStart/chartEnd when
    // there are no dated tasks (dateRange is null).
    const excelStart = dateRange
      ? startOfDay(addDays(dateRange.min, -7))
      : chartStart;
    const excelEnd = dateRange
      ? startOfDay(addDays(dateRange.max, 7))
      : chartEnd;
    register({
      excel: async () => {
        try {
          await exportGanttToExcel({
            projectName,
            rows,
            chartStart: excelStart,
            chartEnd: excelEnd,
            holidays: holidays ?? [],
          });
        } catch (err) {
          setActionError(
            err instanceof Error ? err.message : "Excel export failed.",
          );
          throw err;
        }
      },
      pdf: async () => {
        try {
          await exportGanttToPdf({
            projectName,
            rows,
            exportStart: excelStart,
            exportEnd: excelEnd,
            holidays: holidays ?? [],
          });
        } catch (err) {
          setActionError(
            err instanceof Error ? err.message : "PDF export failed.",
          );
          throw err;
        }
      },
    });
    return () => register(null);
  }, [
    register,
    projectName,
    rows,
    chartStart,
    chartEnd,
    dateRange,
    holidays,
    viewMode,
    columnWidth,
  ]);

  const runExport = useCallback(
    async (kind: "excel" | "pdf") => {
      if (!exportHandlers || exporting) return;
      setActionError(null);
      setExporting(kind);
      setExportMenuOpen(false);
      try {
        await exportHandlers[kind]();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Export failed.");
      } finally {
        setExporting(null);
      }
    },
    [exportHandlers, exporting],
  );

  // Auto-scroll to today only on first paint of the chart and on view-mode
  // swaps. Intentionally NOT triggered by chartStart / rows.length changes —
  // dragging a bar past the current chart's min or max recomputes chartStart
  // (since chartStart is padded around the rows' date range), which would
  // otherwise yank the user back to today every time they reschedule a task
  // outside the visible window.
  const didInitialScrollRef = useRef(false);
  const lastScrolledViewModeRef = useRef<ViewMode | null>(null);
  useEffect(() => {
    if (!chartStart || rows.length === 0) return;
    const isFirst = !didInitialScrollRef.current;
    const viewModeChanged = lastScrolledViewModeRef.current !== viewMode;
    if (!isFirst && !viewModeChanged) return;
    didInitialScrollRef.current = true;
    lastScrolledViewModeRef.current = viewMode;
    const id = requestAnimationFrame(() => scrollToTodayPos("auto"));
    return () => cancelAnimationFrame(id);
  }, [chartStart, viewMode, rows.length, scrollToTodayPos]);

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

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded border border-outline-variant bg-surface-container-lowest">
      <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-3 py-1.5">
        {/* Zoom pill group — Day / Week / Month / Quarter, active segment solid green */}
        <div className="inline-flex overflow-hidden rounded-md bg-surface-container-low p-0.5">
          {VIEW_MODES.map((v) => (
            <button
              key={v.mode}
              type="button"
              onClick={() => setViewMode(v.mode)}
              className={[
                "rounded px-2.5 py-1 font-display text-[11.5px] font-semibold tracking-wide transition-colors",
                v.mode === viewMode
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-on-surface",
              ].join(" ")}
            >
              {v.label}
            </button>
          ))}
        </div>

        {canEdit && (
          <>
            <span className="mx-1 h-4 w-px bg-outline-variant" aria-hidden />
            <button
              type="button"
              onClick={() => onCreateTaskOpen(null)}
              className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-label-caps uppercase tracking-wider text-on-surface hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Task
            </button>
            <button
              type="button"
              onClick={() => setAddingSection(true)}
              className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Section
            </button>
          </>
        )}

        <span className="ml-2 hidden font-mono text-[12px] text-on-surface-variant lg:inline">
          {(tasks ?? []).filter((t) => t.startDate || t.dueDate).length} dated ·{" "}
          {sections?.length ?? 0} sections
        </span>

        {/* Right-aligned: Today / Baseline / Export — outline-button style per mockup */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={scrollToToday}
            disabled={!chartStart}
            className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-[11.5px] font-medium text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[15px]">today</span>
            Today
          </button>
          <button
            type="button"
            onClick={() => setShowBaseline((v) => !v)}
            title={
              baselineLockedAt
                ? `Baseline locked ${baselineLockedAtPretty}${baselineLockedBy ? ` by ${baselineLockedBy.username}` : ""}`
                : "No baseline locked yet — lock one from the project menu"
            }
            className={[
              "inline-flex items-center gap-1 rounded border px-2.5 py-1 font-display text-[11.5px] font-medium",
              showBaseline
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary",
            ].join(" ")}
          >
            <span className="material-symbols-outlined text-[15px]">show_chart</span>
            Baseline
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setConfirmingBaseline(true)}
              className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-[11.5px] font-medium text-on-surface-variant hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-[15px]">
                {baselineLockedAt ? "bookmark" : "bookmark_add"}
              </span>
              {baselineLockedAt ? "Reset baseline" : "Lock baseline"}
            </button>
          )}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={!exportHandlers || exporting !== null}
              className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-[11.5px] font-medium text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px]">download</span>
              {exporting ? "Exporting…" : "Export"}
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded border border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => runExport("excel")}
                  className="block w-full px-3 py-1.5 text-left text-[12px] text-on-surface hover:bg-surface-container-low"
                >
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => runExport("pdf")}
                  className="block w-full px-3 py-1.5 text-left text-[12px] text-on-surface hover:bg-surface-container-low"
                >
                  PDF
                </button>
              </div>
            )}
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
          className="solvro-gantt relative min-w-0 overflow-x-auto"
        >
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div
              style={{
                width: listPaneWidth + contentWidth,
                minHeight: AXIS_HEIGHT + rows.length * ROW_HEIGHT,
              }}
              className="relative flex items-stretch bg-surface-container-lowest"
            >
              <GanttListPane
                rows={rows}
                width={listPaneWidth}
                canEdit={canEdit}
                hoveredRowId={hoveredRowId}
                onToggleSection={handleToggleSection}
                onTaskClick={handleTaskClick}
                onUpdateDates={handleUpdateDates}
                onHoverChange={setHoveredRowId}
              />
              {/* Draggable divider to resize the left pane */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize task list"
                onPointerDown={handleDividerPointerDown}
                onPointerMove={handleDividerPointerMove}
                onPointerUp={handleDividerPointerUp}
                className="sticky z-30 flex-shrink-0 cursor-col-resize bg-outline-variant/40 hover:bg-primary/60 active:bg-primary"
                style={{ left: listPaneWidth, width: DIVIDER_WIDTH, touchAction: "none" }}
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
                  showBaseline={showBaseline}
                  dependencies={dependencies ?? []}
                  hoveredRowId={hoveredRowId}
                  onHoverChange={setHoveredRowId}
                  connectDrag={connectDrag}
                  onCommit={handleCommit}
                  onTaskClick={handleTaskClick}
                  onConnectStart={canEdit ? handleConnectStart : undefined}
                  onDeleteDependency={canEdit ? handleDeleteDependency : undefined}
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
            setShowBaseline(true);
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
              <span className="mb-1 block font-display text-label-caps uppercase tracking-wider text-on-surface-variant">
                Baseline as-of date
              </span>
              <input
                type="date"
                value={baselineAsOf}
                onChange={(e) => setBaselineAsOf(e.target.value)}
                className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="mt-1 block text-[11px] text-on-surface-variant">
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
                  className="font-display text-label-caps uppercase tracking-wider text-error hover:underline disabled:opacity-50"
                >
                  Clear baseline instead
                </button>
                <span className="ml-1 text-[11px] text-on-surface-variant">
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
          className="pointer-events-auto fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wider text-emerald-700 shadow-md"
        >
          <span className="material-symbols-outlined mr-1 align-middle text-[15px]">
            check_circle
          </span>
          {baselineToast}
        </div>
      )}
    </div>
  );
}
