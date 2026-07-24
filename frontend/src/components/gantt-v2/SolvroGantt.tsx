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
import type { GanttEvent, GanttScale } from "@/components/reui/gantt/gantt-types";
import {
  buildEvents,
  buildResources,
  buildRollupEvents,
  parseTaskId,
  sectionNodeId,
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
            // onEventUpdate / onResourceReorder are Task B5 — deliberately
            // left unwired. `events` is a controlled prop, so a drag/resize
            // gesture still shows its live preview but reverts on release
            // (nothing commits) rather than silently mutating uncontrolled
            // internal state. Left ON (canEdit-gated) since it's a safe no-op
            // today and lets Step 3's browser verification exercise the real
            // gesture surface once B5 lands.
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
