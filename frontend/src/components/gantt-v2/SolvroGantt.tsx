import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseISO } from "date-fns";
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  DEFAULT_SECTION_COLOR,
  legendEntries,
  resolveSectionColors,
  type ColorByMode,
} from "@/lib/gantt/palette";
import {
  type Task,
  useCreateSection,
  useHolidays,
  useLockBaseline,
  useProjectDependencies,
  useProjectSections,
  useProjectTasks,
  useUpdateSection,
  useUpdateTask,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Gantt, type GanttApi, type GanttColumn } from "@/components/reui/gantt/gantt";
import { GanttView } from "@/components/reui/gantt/gantt-view";
import type {
  GanttEvent,
  GanttProposedUpdate,
  GanttResourceReorder,
  GanttScale,
  GanttUpdateResult,
} from "@/components/reui/gantt/gantt-types";
import {
  buildEvents,
  buildResources,
  buildRollupEvents,
  eventPatch,
  parseTaskId,
  sectionNodeId,
  taskNodeId,
} from "./adapter";
import { SolvroBar } from "./SolvroBar";
import { SectionColorCell, TaskDatesCell } from "./TreeCells";

// Plan B Task 4 — SolvroBar owns every bar's inner content (solid fills,
// milestones, rollup pills, measured-fit labels, the dormant AI-glow hook).
// `overflow-visible` is what lets its "outside" label escape the button's
// box; the bg-transparent trio neutralizes the built-in 20%-opacity ghost
// track across base/hover/selected states (three separate tailwind-merge
// conflict groups — all three must be named or the ghost look flashes back
// on hover/select). See SolvroBar.tsx's file header for the full rationale.
const SOLVRO_EVENT_CLASSNAMES = "overflow-visible bg-transparent hover:bg-transparent data-selected:bg-transparent";

export interface SolvroGanttProps {
  projectId: number;
  projectName: string;
  baselineLockedAt: string | null;
  baselineLockedBy: { id: number; username: string } | null;
  onEditTask: (task: Task) => void;
  onCreateTaskOpen: (sectionId: number | null) => void;
}

// Ported verbatim from GanttFrame.tsx:65-70 — the four zoom-pill scales the
// old engine offered (ReUI's GanttScale type adds a fifth, "year", which the
// old Gantt never exposed and this toolbar deliberately doesn't either).
const SCALES: Array<{ mode: GanttScale; label: string }> = [
  { mode: "day", label: "Day" },
  { mode: "week", label: "Week" },
  { mode: "month", label: "Month" },
  { mode: "quarter", label: "Quarter" },
];

// Ported verbatim from GanttFrame.tsx:72 — same key, same values, so a user's
// existing pick survives the engine swap.
const COLOR_BY_STORAGE_KEY = "solvro.gantt.colorBy";

// Ported verbatim from GanttFrame.tsx:76.
const LEGEND_CAP = 6;

/**
 * Port of GanttFrame.tsx:356-364's `yearsCovered` memo, re-derived from the
 * adapter's Date-valued events instead of the old geometry module's padded
 * chartStart/chartEnd window — ReUI has no such upfront window (it scrolls
 * infinitely), so the holiday-year span is just the min/max year the actual
 * task bars touch. Falls back to the current year with no dated tasks, same
 * as the old memo's `!chartStart` branch.
 */
function yearsCoveredBy(events: Array<{ start: Date; end: Date }>): number[] {
  if (events.length === 0) return [new Date().getFullYear()];
  let min = Infinity;
  let max = -Infinity;
  for (const e of events) {
    min = Math.min(min, e.start.getFullYear());
    max = Math.max(max, e.end.getFullYear());
  }
  const out: number[] = [];
  for (let y = min; y <= max; y++) out.push(y);
  return out;
}

export function SolvroGantt(props: SolvroGanttProps) {
  const { projectId, projectName, baselineLockedAt, baselineLockedBy, onEditTask, onCreateTaskOpen } =
    props;

  const { user } = useAuth();
  // Ported verbatim from GanttFrame.tsx:86-87.
  const canEdit = hasPermission(user, "task:write");

  const { data: tasks = [], isLoading, isError, error } = useProjectTasks(projectId);
  const { data: sections = [] } = useProjectSections(projectId);
  // Connector arrows are Task B6 (overlay). The query is wired here now —
  // matching this task's stated interface — purely to warm the cache ahead
  // of that task; its result is intentionally not consumed yet.
  useProjectDependencies(projectId);

  const updateTask = useUpdateTask(projectId);
  const updateSection = useUpdateSection(projectId);
  const createSection = useCreateSection(projectId);
  const lockBaseline = useLockBaseline(projectId);

  const [scale, setScale] = useState<GanttScale>("week");
  const [showBaseline, setShowBaseline] = useState(false);
  // Ported verbatim from GanttFrame.tsx:151-157, including its actual default
  // ("section", not "status" — the skeleton's stated default of "status"
  // disagrees with the shipped GanttFrame.tsx behavior this task is porting
  // parity from; verbatim porting wins so existing localStorage picks and
  // first-run visuals don't regress).
  const [colorBy, setColorBy] = useState<ColorByMode>(() => {
    const v = localStorage.getItem(COLOR_BY_STORAGE_KEY);
    return v === "section" || v === "priority" || v === "status" ? v : "section";
  });
  useEffect(() => {
    localStorage.setItem(COLOR_BY_STORAGE_KEY, colorBy);
  }, [colorBy]);

  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Baseline lock flow — ported verbatim from GanttFrame.tsx:97-121, 1033-1123.
  const [confirmingBaseline, setConfirmingBaseline] = useState(false);
  const [baselineAsOf, setBaselineAsOf] = useState<string>("");
  const [baselineToast, setBaselineToast] = useState<string | null>(null);
  useEffect(() => {
    if (!baselineToast) return;
    const t = setTimeout(() => setBaselineToast(null), 4000);
    return () => clearTimeout(t);
  }, [baselineToast]);
  useEffect(() => {
    if (confirmingBaseline) {
      setBaselineAsOf(new Date().toISOString().slice(0, 10));
    }
  }, [confirmingBaseline]);
  const baselineLockedAtPretty = baselineLockedAt ? new Date(baselineLockedAt).toLocaleString() : null;

  const resources = useMemo(() => buildResources(tasks, sections), [tasks, sections]);
  const events = useMemo<GanttEvent<Task>[]>(
    () => [...buildEvents(tasks, sections, colorBy, canEdit), ...buildRollupEvents(tasks, sections)],
    [tasks, sections, colorBy, canEdit],
  );
  const years = useMemo(() => yearsCoveredBy(events), [events]);
  const { data: holidays = [] } = useHolidays(years);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Plan B Task 5 — drag/resize commit. `events` is a controlled prop (see
  // the removed comment this replaces), so nothing here needs to touch local
  // state to "revert" a rejected gesture: on `false` the mutation never
  // fires, the tasks-query cache never changes, and the next render's
  // `events` memo (still derived from that unchanged cache) is what the
  // engine paints — that IS the revert. `eventPatch` (adapter.ts) converts
  // ReUI's exclusive `end` back to Solvro's inclusive `dueDate`.
  const handleEventUpdate = useCallback(
    (update: GanttProposedUpdate<Task>): GanttUpdateResult => {
      // Rollup pills (`section-rollup-*`, buildRollupEvents) are `readOnly:
      // true`, which gantt-types.tsx:97/gantt-bar already excludes from
      // drag/resize gestures entirely; they also carry no `data`, so
      // eventPatch's `!task` branch below would reject them a second time
      // even if a gesture somehow reached here. This id check is a third,
      // belt-and-suspenders layer — not what's actually doing the work.
      if (!canEdit || update.event.id.startsWith("section-rollup-")) return false;
      const patch = eventPatch(update);
      if (!patch) return false;
      setActionError(null);
      updateTask.mutate(patch, {
        onError: (err) => {
          setActionError(err instanceof ApiError ? err.message : "Could not update task dates.");
        },
      });
      return true;
    },
    [canEdit, updateTask],
  );

  // Plan B Task 5 — tree-row reorder commit. Mirrors GanttFrame.tsx:420-569's
  // `handleDragEnd` drop semantics (the OLD engine's constraints ARE the
  // spec) onto ReUI's single `{resourceId, parentId, index}` proposal shape.
  // Returns `false` to reject; per gantt.tsx:127 the real contract is
  // `void | false` (never `true` — unlike onEventUpdate's GanttUpdateResult,
  // there is no accept-with-adjustment form here).
  const handleResourceReorder = useCallback(
    (proposal: GanttResourceReorder): void | false => {
      if (!canEdit) return false;
      const { resourceId, parentId, index } = proposal;

      // ---- Section-group reorder (root level only) ----
      if (resourceId.startsWith("section-")) {
        // The "(No section)" pseudo-group has no backing Section row — old
        // engine only starts a section drag when `sectionId !== null`
        // (GanttFrame.tsx:539).
        if (resourceId === sectionNodeId(null)) return false;
        // Sections never nest under a task (GanttFrame.tsx:542: dropping a
        // section onto the pseudo group is rejected; dropping it under a
        // task isn't even representable in the old engine's flat section
        // list at all).
        if (parentId !== null) return false;

        // Re-derive the desired root order from the CURRENT (pre-drag) root
        // list — same shape `resources` already is (sections, then the
        // pseudo group last if present) — splice the move in at `index`,
        // then patch every REAL section whose position actually changed.
        // Mirrors GanttFrame.tsx:544-559's ordered/filtered/splice + diffed
        // Promise.all of useUpdateSection calls.
        const currentRootIds = resources.map((r) => r.id);
        const others = currentRootIds.filter((id) => id !== resourceId);
        const clamped = Math.max(0, Math.min(index, others.length));
        const nextRootOrder = [...others];
        nextRootOrder.splice(clamped, 0, resourceId);

        const patches = nextRootOrder
          .filter((id) => id !== sectionNodeId(null))
          .map((id, i) => ({ id: Number(id.slice("section-".length)), position: i }))
          .filter(({ id, position }) => sections.find((s) => s.id === id)?.position !== position);

        if (patches.length === 0) return false; // no-op — nothing actually moved
        setActionError(null);
        patches.forEach(({ id, position }) =>
          updateSection.mutate(
            { id, patch: { position } },
            {
              onError: (err) => {
                setActionError(err instanceof ApiError ? err.message : "Could not reorder sections.");
              },
            },
          ),
        );
        return;
      }

      // ---- Task-level reorder ----
      const taskId = parseTaskId(resourceId);
      if (taskId === null) return false;
      const moved = taskById.get(taskId);
      if (!moved) return false;

      if (moved.parentTaskId !== null) {
        // Subtask: reorder WITHIN its parent only — no re-parent via row
        // drags (GanttFrame.tsx:474-495: "Ignore drops outside the sibling
        // checklist"). ReUI's `index` already counts only OTHER same-parent
        // rows above the drop point (gantt-view.tsx's `propose()`), which is
        // exactly the backend's insertAt convention — no extra math needed,
        // unlike the top-level case below.
        if (parentId !== taskNodeId(moved.parentTaskId)) return false;
        if (index === moved.position) return false; // no-op
        setActionError(null);
        updateTask.mutate(
          { id: taskId, patch: { position: index } },
          {
            onError: (err) => {
              setActionError(err instanceof ApiError ? err.message : "Could not reorder subtask.");
            },
          },
        );
        return;
      }

      // Top-level task: must land under a section group (real or the "(No
      // section)" pseudo group), never under a task node — promoting a
      // top-level task into a subtask (or vice versa) via drag isn't
      // supported by the old engine's row-drag affordance.
      if (parentId === null || parseTaskId(parentId) !== null) return false;
      const targetSectionId =
        parentId === sectionNodeId(null) ? null : Number(parentId.slice("section-".length));

      // `position` is one GLOBAL dense index across every top-level task in
      // the project (CLAUDE.md: "one canonical manual order"; backend's
      // sibling key for parentTaskId===null is project-wide, not
      // per-section — taskOrdering.ts:17-19). Unifies GanttFrame's two old
      // drop paths — the row-target case (:431-471, arbitrary same/cross
      // -section position via a specific target row) and the
      // section-target case (:500-536, always append at the target
      // section's block end) — into one index-based computation, since
      // ReUI's `index` gives the precise slot in EITHER case.
      const topLevelOrdered = tasks
        .filter((t) => t.parentTaskId === null)
        .sort((a, b) => a.position - b.position || a.id - b.id);
      const others = topLevelOrdered.filter((t) => t.id !== taskId);
      const targetSiblings = others.filter((t) => t.sectionId === targetSectionId);
      const crossSection = targetSectionId !== moved.sectionId;

      let position: number | undefined;
      if (targetSiblings.length === 0) {
        // No other task in the target section — GanttFrame.tsx:529's `last`
        // undefined branch: omit position entirely (appends at the global
        // end; harmless, since display groups by section anyway).
        position = undefined;
      } else if (index >= targetSiblings.length) {
        const last = targetSiblings[targetSiblings.length - 1];
        position = others.findIndex((t) => t.id === last.id) + 1;
      } else {
        const before = targetSiblings[index];
        position = others.findIndex((t) => t.id === before.id);
      }

      if (!crossSection && (position === undefined || position === moved.position)) {
        return false; // no-op — same section, same slot (or nothing to reorder against)
      }

      const patch: { sectionId?: number | null; position?: number } = {};
      if (crossSection) patch.sectionId = targetSectionId;
      if (position !== undefined) patch.position = position;
      setActionError(null);
      updateTask.mutate(
        { id: taskId, patch },
        {
          onError: (err) => {
            setActionError(err instanceof ApiError ? err.message : "Could not move task.");
          },
        },
      );
      return;
    },
    [canEdit, resources, sections, tasks, taskById, updateTask, updateSection],
  );

  const handleUpdateDates = useCallback(
    (taskId: number, startISO: string | null, dueISO: string | null) => {
      setActionError(null);
      updateTask.mutate(
        { id: taskId, patch: { startDate: startISO, dueDate: dueISO } },
        {
          onError: (err) => {
            setActionError(err instanceof ApiError ? err.message : "Could not update dates.");
          },
        },
      );
    },
    [updateTask],
  );

  const handleSetSectionColor = useCallback(
    (sectionId: number, color: string) => {
      updateSection.mutate({ id: sectionId, patch: { color } });
    },
    [updateSection],
  );

  // Tree-pane inline editors, ported into ReUI's GanttColumn contract —
  // GanttListRow.tsx:240-270 (dates popover) and :151-194 (section color
  // popover); see TreeCells.tsx for the ported bodies. "Dates" renders only
  // on task nodes (parseTaskId !== null); the color swatch only on real
  // section groups (excludes the "(No section)" pseudo-group, matching
  // GanttListRow's `row.sectionId === null` guard on its color button).
  const columns = useMemo<GanttColumn[]>(() => {
    const sectionColors = resolveSectionColors(sections);
    return [
      {
        id: "dates",
        title: "Dates",
        width: 132,
        align: "end",
        render: (ctx) => {
          const taskId = parseTaskId(ctx.resource.id);
          if (taskId === null) return null;
          const task = taskById.get(taskId);
          if (!task) return null;
          return <TaskDatesCell task={task} canEdit={canEdit} onSave={handleUpdateDates} />;
        },
      },
      {
        id: "color",
        title: "",
        width: 24,
        align: "center",
        render: (ctx) => {
          if (ctx.resource.id === sectionNodeId(null) || !ctx.resource.id.startsWith("section-")) {
            return null;
          }
          const sectionId = Number(ctx.resource.id.slice("section-".length));
          if (!sectionColors.has(sectionId)) return null;
          return (
            <SectionColorCell
              sectionId={sectionId}
              color={sectionColors.get(sectionId) ?? DEFAULT_SECTION_COLOR}
              canEdit={canEdit}
              onPick={handleSetSectionColor}
            />
          );
        },
      },
    ];
  }, [sections, taskById, canEdit, handleUpdateDates, handleSetSectionColor]);

  const apiRef = useRef<GanttApi<Task> | null>(null);

  const legend = useMemo(() => legendEntries(colorBy, sections), [colorBy, sections]);
  const legendShown = legend.slice(0, LEGEND_CAP);
  const legendOverflow = legend.slice(LEGEND_CAP);

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
        setActionError(err instanceof ApiError ? err.message : "Could not create section.");
      }
    },
    [createSection, newSectionName],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-sm border border-outline-variant bg-surface-container-lowest"
      data-testid="solvro-gantt"
      aria-label={`${projectName} Gantt chart`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-3 py-1.5">
        {/* Zoom pill group — Day / Week / Month / Quarter, active segment solid green. */}
        <div className="inline-flex overflow-hidden rounded-md bg-surface-container-low p-0.5">
          {SCALES.map((s) => (
            <button
              key={s.mode}
              type="button"
              onClick={() => setScale(s.mode)}
              className={cn(
                "rounded-sm px-2.5 py-1 font-display text-[11.5px] font-semibold tracking-wide transition-colors",
                s.mode === scale
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-on-surface",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {canEdit && (
          <>
            <span className="mx-1 h-4 w-px bg-outline-variant" aria-hidden />
            <button
              type="button"
              onClick={() => onCreateTaskOpen(null)}
              className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1 font-display text-label-caps uppercase tracking-wider text-on-surface hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Task
            </button>
            <button
              type="button"
              onClick={() => setAddingSection(true)}
              className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1 font-display text-label-caps uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Section
            </button>
          </>
        )}

        <span className="ml-2 hidden font-mono text-[12px] text-on-surface-variant lg:inline">
          {tasks.filter((t) => t.startDate || t.dueDate).length} dated · {sections.length} sections
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => apiRef.current?.today()}
            disabled={resources.length === 0}
            className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1 font-display text-[11.5px] font-medium text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-50"
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
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 font-display text-[11.5px] font-medium",
              showBaseline
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary",
            )}
          >
            <span className="material-symbols-outlined text-[15px]">show_chart</span>
            Baseline
          </button>
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Color by
              </span>
              <select
                value={colorBy}
                onChange={(e) => setColorBy(e.target.value as ColorByMode)}
                className="rounded-sm border border-outline-variant bg-surface-container-lowest px-2 py-1 font-display text-[11.5px] font-medium text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
              >
                <option value="status">Status</option>
                <option value="section">Section</option>
                <option value="priority">Priority</option>
              </select>
            </label>
            {legendShown.length > 0 && (
              <div data-testid="gantt-legend" className="ml-1 flex flex-wrap items-center gap-2">
                {legendShown.map(([label, hex], i) => (
                  <span
                    key={`${colorBy}-${i}-${label}`}
                    className="flex items-center gap-1 text-[10px] text-on-surface-variant"
                  >
                    <span
                      className="h-2 w-2 rounded-[2px]"
                      style={{ backgroundColor: hex }}
                      aria-hidden="true"
                    />
                    {label}
                  </span>
                ))}
                {legendOverflow.length > 0 && (
                  <span
                    title={legendOverflow.map(([label]) => label).join(", ")}
                    className="text-[10px] text-on-surface-variant"
                  >
                    +{legendOverflow.length} more
                  </span>
                )}
              </div>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setConfirmingBaseline(true)}
              className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1 font-display text-[11.5px] font-medium text-on-surface-variant hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-[15px]">
                {baselineLockedAt ? "bookmark" : "bookmark_add"}
              </span>
              {baselineLockedAt ? "Reset baseline" : "Lock baseline"}
            </button>
          )}
          {/* Export (Excel/PDF) wiring is Task B7 — stubbed disabled rather
              than omitted so the toolbar doesn't visually regress ahead of
              that task landing. */}
          <button
            type="button"
            disabled
            title="Export — wired in Plan B Task 7"
            className="inline-flex items-center gap-1 rounded-sm border border-outline-variant px-2.5 py-1 font-display text-[11.5px] font-medium text-on-surface-variant opacity-50"
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            Export
          </button>
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
            className="w-64 rounded-sm border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs focus:border-primary focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={createSection.isPending || !newSectionName.trim()}
            className="rounded-sm bg-primary px-2 py-1 font-display text-label-caps uppercase text-on-primary hover:bg-primary-container disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingSection(false);
              setNewSectionName("");
            }}
            className="rounded-sm px-2 py-1 text-[11px] text-on-surface-variant hover:bg-surface-container"
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
        <div className="m-3 h-64 animate-pulse rounded-sm border border-outline-variant bg-surface-container-low" />
      )}
      {isError && (
        <div className="m-3 rounded-sm border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load tasks: {(error as Error).message}
        </div>
      )}
      {!isLoading && !isError && resources.length === 0 && (
        <div className="m-3 rounded-sm border border-dashed border-outline-variant p-12 text-center text-on-surface-variant">
          <p className="text-sm">
            No tasks or sections yet. Use + Task or + Section above to start building the plan.
          </p>
        </div>
      )}

      {!isLoading && !isError && resources.length > 0 && (
        <div className="min-h-0 flex-1">
          <Gantt<Task>
            apiRef={apiRef}
            events={events}
            resources={resources}
            scale={scale}
            onScaleChange={setScale}
            weekStartsOn={1}
            interactions={{ drag: canEdit, resize: canEdit, selectSlot: false }}
            // Accepted deviation (documented in CHANGELOG.md): the old engine
            // shaded weekends only at Day/Week zoom while holidays shaded at
            // every zoom (GanttColumnGrid.tsx:41-61). ReUI's offDays applies
            // uniformly across all zooms — weekendDays defaults to [0,6], so
            // both weekends and these explicit holiday dates now shade at
            // every scale.
            offDays={{ dates: holidays.map((h) => parseISO(h.date)) }}
            columns={columns}
            rowCheckboxes={false}
            zoomControl={false}
            // Plan B Task 4: renderEvent hands every bar's inner content to
            // SolvroBar; barLabel="inside" (already the engine default, made
            // explicit) disables ReUI's own width-threshold outside-label
            // flip so SolvroBar's measured-fit check is the only placement
            // decision in play — see SolvroBar.tsx's file header.
            renderEvent={(renderProps) => <SolvroBar {...renderProps} />}
            classNames={{ event: SOLVRO_EVENT_CLASSNAMES }}
            barLabel="inside"
            renderResourceLabel={({ resource }) => (
              <span className="truncate">
                {resource.id === sectionNodeId(null) ? "(No section)" : resource.title}
              </span>
            )}
            onEventClick={(occurrence) => {
              const task = occurrence.event.data;
              if (task) onEditTask(task);
            }}
            onResourceClick={(ctx) => {
              const taskId = parseTaskId(ctx.resource.id);
              if (taskId === null) return;
              const task = taskById.get(taskId);
              if (task) onEditTask(task);
            }}
            className="h-full"
            // Plan B Task 5: commit pipeline. onEventUpdate is additionally
            // gated by `interactions.drag/resize` above (canEdit-driven), so
            // the handler's own `!canEdit` check is redundant there —
            // cheap insurance, not the primary gate. onResourceReorder has
            // no separate interactions flag: passing it unconditionally
            // would render the row-drag grip (gantt-view.tsx:1591 →
            // `reorderEnabled = !!settings.onResourceReorder`, wired to
            // `onGripPointerDown` at :1888, rendered at :2659-2670) for
            // read-only users too, so `undefined` here is what actually
            // hides it — the handler's internal check is the fallback,
            // not this.
            onEventUpdate={handleEventUpdate}
            onResourceReorder={canEdit ? handleResourceReorder : undefined}
          >
            <GanttView />
          </Gantt>
        </div>
      )}

      <ConfirmModal
        open={confirmingBaseline}
        onClose={() => setConfirmingBaseline(false)}
        onConfirm={async () => {
          try {
            const asOfIso = baselineAsOf ? new Date(`${baselineAsOf}T00:00:00`).toISOString() : undefined;
            const res = await lockBaseline.mutateAsync({ asOfDate: asOfIso });
            const stamp = res.baselineLockedAt ? new Date(res.baselineLockedAt).toLocaleDateString() : "";
            setBaselineToast(
              baselineLockedAt
                ? `Baseline overwritten — now anchored to ${stamp}`
                : `Baseline locked as of ${stamp}`,
            );
            setShowBaseline(true);
            setConfirmingBaseline(false);
          } catch (err) {
            setActionError(err instanceof ApiError ? err.message : "Could not lock baseline.");
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
                {baselineLockedBy
                  ? ` (locked by ${baselineLockedBy.username} on ${baselineLockedAtPretty})`
                  : ` (locked ${baselineLockedAtPretty})`}{" "}
                will be replaced with the current schedule. This cannot be undone.
              </p>
            ) : (
              <p>
                Lock the current schedule as the official baseline for this project? Every task's
                current Start and Due dates will be saved as its baseline so future slips can be
                measured against this snapshot.
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
                className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-xs focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
              />
              <span className="mt-1 block text-[11px] text-on-surface-variant">
                Defaults to today. Use a different date to backdate the snapshot — e.g. "May 1
                baseline".
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
                      setActionError(err instanceof ApiError ? err.message : "Could not clear baseline.");
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
          className="pointer-events-auto fixed bottom-6 left-1/2 z-110 -translate-x-1/2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wider text-emerald-700 shadow-md"
        >
          <span className="material-symbols-outlined mr-1 align-middle text-[15px]">check_circle</span>
          {baselineToast}
        </div>
      )}
    </div>
  );
}
