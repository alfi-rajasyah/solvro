import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { ProjectStatusChip } from "@/components/StatusChip";
import { parseISODate } from "@/lib/gantt/geometry";
import { type ExecutiveProjectRow, useExecutiveReport } from "@/lib/queries";

// Executive dashboard — org-wide portfolio roll-up. Two blocks: an
// "Overdue Projects" worklist (the thing an executive scans first) and a
// "Portfolio Timelines" progress-bar overview of every project. Both are
// derived client-side from the single GET /reports/executive payload — no
// extra fetches per project.
export function Executive() {
  const { data, isLoading, isError, error } = useExecutiveReport();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-on-surface">
          Executive
        </h1>
        <p className="text-sm text-on-surface-variant">
          Org-wide portfolio roll-up across every TAM's projects.
        </p>
      </div>

      {isLoading && (
        <div className="h-32 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
      )}

      {isError && (
        <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load executive report: {(error as Error).message}
        </div>
      )}

      {data && <ExecutiveBody data={data} />}
    </div>
  );
}

function ExecutiveBody({
  data,
}: {
  data: { projects: ExecutiveProjectRow[]; generatedAt: string };
}) {
  const { projects, generatedAt } = data;
  const overdue = projects.filter((p) => p.isOverdue);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon="query_stats"
        title="No projects yet"
        message="Once projects exist across the org, they'll show up here as a portfolio roll-up."
      />
    );
  }

  return (
    <div className="space-y-8">
      <p className="rounded border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface">
        {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
        <span className={overdue.length > 0 ? "font-semibold text-error" : ""}>
          {overdue.length} overdue
        </span>{" "}
        · Updated {fmtDateTime(generatedAt)}
      </p>

      <OverdueProjectsSection projects={overdue} />
      <PortfolioTimelinesSection projects={projects} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Block A — Overdue Projects
// ─────────────────────────────────────────────────────────────────────────

function OverdueProjectsSection({
  projects,
}: {
  projects: ExecutiveProjectRow[];
}) {
  const sorted = [...projects].sort((a, b) => b.daysOverdue - a.daysOverdue);

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <h2 className="font-display text-base font-bold text-on-surface">
          Overdue Projects
        </h2>
        <span className="inline-flex items-center rounded-full bg-error-container px-2 py-0.5 font-mono text-[11px] font-semibold text-on-error-container">
          {sorted.length}
        </span>
      </header>

      {sorted.length === 0 ? (
        <EmptyState
          icon="task_alt"
          message="No overdue projects — everything is on schedule."
        />
      ) : (
        <div className="overflow-x-auto rounded border border-outline-variant bg-surface-container-lowest">
          {/* Desktop grid */}
          <div className="hidden grid-cols-[minmax(200px,1.6fr)_140px_160px_140px_120px] items-center border-b border-outline-variant bg-surface-container-low px-3 py-2 font-display text-label-caps uppercase tracking-widest text-on-surface-variant md:grid">
            <span>Project</span>
            <span>TAM</span>
            <span>Customer</span>
            <span>Committed end</span>
            <span className="text-right">Overdue by</span>
          </div>

          {sorted.map((p) => (
            <OverdueRow key={p.id} project={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function OverdueRow({ project: p }: { project: ExecutiveProjectRow }) {
  return (
    <>
      {/* Desktop row */}
      <div className="hidden grid-cols-[minmax(200px,1.6fr)_140px_160px_140px_120px] items-center border-t border-outline-variant px-3 py-1.5 text-[13px] hover:bg-surface-container-low md:grid">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/projects/${p.id}`}
            className="truncate font-semibold text-primary hover:underline"
          >
            {p.name}
          </Link>
          <ProjectStatusChip status={p.status} />
        </div>
        <span className="truncate text-on-surface-variant">{p.tamName}</span>
        <span className="truncate text-on-surface-variant">
          {p.customerName ?? "—"}
        </span>
        <span className="font-mono text-[12px] text-on-surface-variant">
          {fmtDate(p.end)}
        </span>
        <span className="text-right font-semibold text-error">
          {fmtOverdueBy(p.daysOverdue)}
        </span>
      </div>

      {/* Mobile card */}
      <div className="flex flex-col gap-1.5 border-t border-outline-variant px-3 py-2 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/projects/${p.id}`}
            className="truncate font-semibold text-primary hover:underline"
          >
            {p.name}
          </Link>
          <ProjectStatusChip status={p.status} />
        </div>
        <div className="flex items-center justify-between gap-2 text-[12px] text-on-surface-variant">
          <span className="truncate">
            {p.tamName} · {p.customerName ?? "—"}
          </span>
          <span className="font-mono text-[12px]">{fmtDate(p.end)}</span>
        </div>
        <div className="text-right text-[13px] font-semibold text-error">
          {fmtOverdueBy(p.daysOverdue)} overdue
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Block B — Portfolio Timelines
// ─────────────────────────────────────────────────────────────────────────

type PortfolioView = "calendar" | "list";

const PORTFOLIO_VIEWS: { view: PortfolioView; label: string }[] = [
  { view: "calendar", label: "Calendar" },
  { view: "list", label: "List" },
];

function PortfolioTimelinesSection({
  projects,
}: {
  projects: ExecutiveProjectRow[];
}) {
  const [view, setView] = useState<PortfolioView>("calendar");

  const sorted = [...projects].sort((a, b) => {
    if (a.isOverdue && b.isOverdue) return b.daysOverdue - a.daysOverdue;
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (a.end && b.end) return a.end.localeCompare(b.end);
    if (a.end) return -1;
    if (b.end) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-bold text-on-surface">
            Portfolio Timelines
          </h2>
          <span className="text-[12px] text-on-surface-variant">
            {sorted.length} project{sorted.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="inline-flex overflow-hidden rounded border border-outline-variant">
          {PORTFOLIO_VIEWS.map((v, i) => (
            <button
              key={v.view}
              type="button"
              onClick={() => setView(v.view)}
              className={[
                "px-2.5 py-1 font-display text-label-caps uppercase tracking-wider",
                i > 0 ? "border-l border-outline-variant" : "",
                v.view === view
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-lowest text-on-surface-variant hover:text-primary",
              ].join(" ")}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {view === "calendar" ? (
        <PortfolioCalendar projects={sorted} />
      ) : (
        <PortfolioList projects={sorted} />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Portfolio Timelines — List view (existing row/progress-bar rendering)
// ─────────────────────────────────────────────────────────────────────────

function PortfolioList({ projects }: { projects: ExecutiveProjectRow[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-on-surface-variant">
        High-level progress overview — a first pass. Phase dots below are a
        legend, not date-positioned segments.
      </p>

      <div className="space-y-2">
        {projects.map((p) => (
          <TimelineRow key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

function TimelineRow({ project: p }: { project: ExecutiveProjectRow }) {
  const hasSchedule = p.start !== null && p.end !== null;
  const fillTone = p.isOverdue ? "bg-error" : "bg-primary";

  return (
    <div className="space-y-2 rounded border border-outline-variant bg-surface-container-lowest px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/projects/${p.id}`}
            className="truncate font-semibold text-primary hover:underline"
          >
            {p.name}
          </Link>
          <ProjectStatusChip status={p.status} />
        </div>
        <span className="truncate text-[12px] text-on-surface-variant">
          {p.tamName}
          {p.customerName ? ` · ${p.customerName}` : ""}
        </span>
      </div>

      {hasSchedule ? (
        <>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className={`h-full rounded-full ${fillTone}`}
                style={{ width: `${Math.min(100, Math.max(0, p.progressPct))}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right font-mono text-[12px] text-on-surface-variant">
              {p.progressPct}%
            </span>
          </div>
          <div className="font-mono text-[11px] text-on-surface-variant">
            {fmtDate(p.start)} → {fmtDate(p.end)}
          </div>
        </>
      ) : (
        <p className="text-[11px] italic text-on-surface-variant">
          No scheduled tasks
        </p>
      )}

      {p.sections.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          {p.sections.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Portfolio Timelines — Calendar view (horizontal year-roadmap)
// ─────────────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MIN_BAR_WIDTH_PCT = 1;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Single color-by-state mapping, shared by bar fills and the legend swatches
// below so the two can never drift out of sync.
const CALENDAR_TONE = {
  overdue: "bg-error",
  active: "bg-primary",
  planning: "bg-chip-amber-bg",
  muted: "bg-on-surface-variant/40",
};

function barTone(p: ExecutiveProjectRow): string {
  if (p.isOverdue) return CALENDAR_TONE.overdue;
  if (p.status === "ACTIVE") return CALENDAR_TONE.active;
  if (p.status === "COMPLETED") return CALENDAR_TONE.muted;
  if (p.status === "PLANNING" || p.status === "ON_HOLD") {
    return CALENDAR_TONE.planning;
  }
  return CALENDAR_TONE.muted; // CANCELLED
}

const CALENDAR_LEGEND = [
  { label: "Overdue", tone: CALENDAR_TONE.overdue },
  { label: "Active", tone: CALENDAR_TONE.active },
  { label: "Planning · On-hold", tone: CALENDAR_TONE.planning },
  { label: "Completed", tone: CALENDAR_TONE.muted },
];

function PortfolioCalendar({ projects }: { projects: ExecutiveProjectRow[] }) {
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const yearSpanMs = yearEnd.getTime() - yearStart.getTime();

  const unscheduledCount = projects.filter(
    (p) => p.start === null || p.end === null,
  ).length;

  const inYear = projects
    .filter((p): p is ExecutiveProjectRow & { start: string; end: string } =>
      p.start !== null && p.end !== null,
    )
    .map((p) => ({
      p,
      start: parseISODate(p.start),
      end: parseISODate(p.end),
    }))
    .filter(({ start, end }) => end >= yearStart && start < yearEnd);

  const today = new Date();
  const showTodayLine = year === today.getFullYear();
  const todayFrac = clamp01(
    (today.getTime() - yearStart.getTime()) / yearSpanMs,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
            className="flex h-6 w-6 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[17px]">
              chevron_left
            </span>
          </button>
          <span className="min-w-[4ch] text-center font-mono text-[13px] font-semibold text-on-surface">
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
            className="flex h-6 w-6 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[17px]">
              chevron_right
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {CALENDAR_LEGEND.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1.5 text-[11px] text-on-surface-variant"
            >
              <span className={`h-2 w-2 rounded-full ${item.tone}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-outline-variant bg-surface-container-lowest">
        <div className="min-w-[720px]">
          <div className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-low px-3">
            <div className="w-48 shrink-0" />
            <div className="grid flex-1 grid-cols-12">
              {MONTH_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`px-1.5 py-1.5 text-center font-display text-label-caps uppercase tracking-widest text-on-surface-variant ${
                    i > 0 ? "border-l border-outline-variant" : ""
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {inYear.length === 0 ? (
            <div className="p-3">
              <EmptyState message={`No projects scheduled in ${year}.`} />
            </div>
          ) : (
            <div className="relative">
              {showTodayLine && (
                <div className="pointer-events-none absolute inset-0 z-10 flex gap-3 px-3">
                  <div className="w-48 shrink-0" />
                  <div className="relative flex-1">
                    <div
                      className="absolute top-0 h-full border-l border-dashed border-primary"
                      style={{ left: `${todayFrac * 100}%` }}
                    >
                      <span className="absolute -top-0.5 left-1 whitespace-nowrap rounded-sm bg-primary px-1 py-0.5 font-display text-[9px] font-bold uppercase leading-none text-on-primary">
                        Today
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {inYear.map(({ p, start, end }) => {
                const leftFrac = clamp01(
                  (start.getTime() - yearStart.getTime()) / yearSpanMs,
                );
                const rightFrac = clamp01(
                  (end.getTime() - yearStart.getTime()) / yearSpanMs,
                );
                const widthPct = Math.max(
                  (rightFrac - leftFrac) * 100,
                  MIN_BAR_WIDTH_PCT,
                );
                const clippedStart = start < yearStart;
                const clippedEnd = end >= yearEnd;

                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 border-t border-outline-variant px-3 py-2 first:border-t-0"
                  >
                    <div className="flex w-48 shrink-0 flex-col gap-0.5">
                      <Link
                        to={`/projects/${p.id}`}
                        className="truncate font-semibold text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                      <ProjectStatusChip status={p.status} />
                    </div>
                    <div className="relative h-5 flex-1">
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-12">
                        {MONTH_LABELS.map((label, i) => (
                          <div
                            key={label}
                            className={
                              i > 0 ? "border-l border-outline-variant/50" : ""
                            }
                          />
                        ))}
                      </div>
                      <div
                        title={`${fmtDate(p.start)} → ${fmtDate(p.end)} · ${p.progressPct}%`}
                        className={`absolute top-1/2 flex h-2.5 -translate-y-1/2 items-center rounded-full ${barTone(p)}`}
                        style={{
                          left: `${leftFrac * 100}%`,
                          width: `${widthPct}%`,
                        }}
                      >
                        {clippedStart && (
                          <span className="absolute -left-3 text-[10px] leading-none text-on-surface-variant">
                            ‹
                          </span>
                        )}
                        {clippedEnd && (
                          <span className="absolute -right-3 text-[10px] leading-none text-on-surface-variant">
                            ›
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {unscheduledCount > 0 && (
        <p className="text-[11px] text-on-surface-variant">
          {unscheduledCount} project{unscheduledCount === 1 ? "" : "s"} ha
          {unscheduledCount === 1 ? "s" : "ve"} no scheduled dates — see List
          view.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtOverdueBy(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}
