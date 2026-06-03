import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useProjectContext } from "../ProjectDetail";
import { type Task, useProjectTasks } from "@/lib/queries";

export function ProjectOverview() {
  const { project } = useProjectContext();
  const { data: tasks, isLoading, isError, error } = useProjectTasks(project.id);

  const stats = useMemo(() => computeStats(tasks ?? []), [tasks]);
  const sCurve = useMemo(() => buildSCurve(tasks ?? []), [tasks]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
        Could not load tasks: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon="checklist"
          label="Total tasks"
          value={String(stats.total)}
          hint={`${stats.topLevel} top-level · ${stats.subtasks} subtasks`}
        />
        <Kpi
          icon="task_alt"
          label="Completion"
          value={`${stats.pct}%`}
          hint={`${stats.done} of ${stats.total} done`}
          accent={stats.pct === 100 ? "emerald" : undefined}
        />
        <Kpi
          icon="warning"
          label="Overdue"
          value={String(stats.overdue)}
          hint={stats.overdue > 0 ? "open tasks past due date" : "nothing overdue"}
          accent={stats.overdue > 0 ? "error" : "emerald"}
        />
        <Kpi
          icon={project.baselineLockedAt ? "lock" : "lock_open"}
          label="Baseline"
          value={project.baselineLockedAt ? "Locked" : "Not set"}
          hint={
            project.baselineLockedAt
              ? `by ${project.baselineLockedBy?.username ?? "—"} · ${fmtDate(project.baselineLockedAt)}`
              : "Lock to capture planned dates"
          }
          accent={project.baselineLockedAt ? "primary" : undefined}
        />
      </div>

      {/* S-Curve segment */}
      <section className="rounded border border-outline-variant bg-surface-container-lowest p-5">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-on-surface">
              Progress S-Curve
            </h3>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Cumulative tasks scheduled to complete over time. Compares the locked
              baseline against the current (re-planned) schedule.
            </p>
          </div>
          {!project.baselineLockedAt && (
            <Link
              to={`/projects/${project.id}/gantt`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-semibold text-on-surface hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">lock</span>
              Lock baseline in Gantt
            </Link>
          )}
        </header>

        {sCurve.points.length === 0 ? (
          <EmptyChart
            icon="show_chart"
            title="No scheduled tasks yet"
            body="Add start/due dates to tasks to populate the curve."
          />
        ) : !project.baselineLockedAt ? (
          <SCurveChart data={sCurve.points} todayIndex={sCurve.todayIndex} hasBaseline={false} />
        ) : (
          <SCurveChart data={sCurve.points} todayIndex={sCurve.todayIndex} hasBaseline={true} />
        )}

        {project.baselineLockedAt && sCurve.points.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-outline-variant pt-3 text-xs text-on-surface-variant">
            <Legend2 swatch="bg-on-surface-variant/40" label="Baseline (planned)" />
            <Legend2 swatch="bg-primary" label="Current (re-planned)" />
            <Legend2 swatch="bg-emerald-500" label={`Completed today: ${stats.done}/${stats.total}`} />
            <span className="ml-auto font-mono">
              Slip:{" "}
              <span className={sCurve.slipDays > 0 ? "text-error" : "text-emerald-600"}>
                {sCurve.slipDays > 0 ? `+${sCurve.slipDays}` : sCurve.slipDays} days
              </span>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  accent?: "primary" | "emerald" | "error";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "error"
        ? "text-error"
        : accent === "primary"
          ? "text-primary"
          : "text-on-surface";
  return (
    <div className="rounded border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between">
        <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-base ${accent === "primary" ? "text-primary" : accent === "emerald" ? "text-emerald-600" : accent === "error" ? "text-error" : "text-on-surface-variant"}`}>{icon}</span>
      </div>
      <div className={`mt-2 font-mono text-3xl font-bold tabular-nums ${accentClass}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-on-surface-variant">{hint}</div>}
    </div>
  );
}

function Legend2({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${swatch}`} />
      {label}
    </span>
  );
}

function EmptyChart({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-2 rounded border border-dashed border-outline-variant text-center">
      <span className="material-symbols-outlined text-3xl text-on-surface-variant">{icon}</span>
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      <p className="text-xs text-on-surface-variant">{body}</p>
    </div>
  );
}

interface SCurvePoint {
  date: string;
  label: string;
  baseline: number | null;
  current: number;
}

function SCurveChart({
  data,
  todayIndex,
  hasBaseline,
}: {
  data: SCurvePoint[];
  todayIndex: number | null;
  hasBaseline: boolean;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="rgb(var(--outline-variant))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "rgb(var(--on-surface-variant))" }}
            tickLine={false}
            axisLine={{ stroke: "rgb(var(--outline-variant))" }}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "rgb(var(--on-surface-variant))" }}
            tickLine={false}
            axisLine={{ stroke: "rgb(var(--outline-variant))" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid rgb(var(--outline-variant))",
              fontSize: 12,
            }}
            labelStyle={{ fontSize: 11, color: "rgb(var(--on-surface-variant))" }}
          />
          <Legend wrapperStyle={{ display: "none" }} />
          {todayIndex !== null && (
            <ReferenceLine
              x={data[todayIndex]?.label}
              stroke="rgb(var(--on-surface-variant))"
              strokeDasharray="4 4"
              label={{
                value: "Today",
                position: "insideTopRight",
                fill: "rgb(var(--on-surface-variant))",
                fontSize: 11,
              }}
            />
          )}
          {hasBaseline && (
            <Line
              type="monotone"
              dataKey="baseline"
              name="Baseline"
              stroke="rgb(var(--on-surface-variant))"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
          <Line
            type="monotone"
            dataKey="current"
            name="Current"
            stroke="rgb(var(--primary))"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface Stats {
  total: number;
  topLevel: number;
  subtasks: number;
  done: number;
  pct: number;
  overdue: number;
}

function computeStats(tasks: Task[]): Stats {
  const total = tasks.length;
  const topLevel = tasks.filter((t) => t.parentTaskId === null).length;
  const subtasks = total - topLevel;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const today = startOfToday();
  const overdue = tasks.filter(
    (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < today,
  ).length;
  return { total, topLevel, subtasks, done, pct, overdue };
}

interface SCurve {
  points: SCurvePoint[];
  todayIndex: number | null;
  slipDays: number;
}

function buildSCurve(tasks: Task[]): SCurve {
  const datedTasks = tasks.filter((t) => t.dueDate || t.baselineDueDate);
  if (datedTasks.length === 0) {
    return { points: [], todayIndex: null, slipDays: 0 };
  }

  const dateSet = new Set<string>();
  for (const t of datedTasks) {
    if (t.dueDate) dateSet.add(t.dueDate.slice(0, 10));
    if (t.baselineDueDate) dateSet.add(t.baselineDueDate.slice(0, 10));
  }
  const today = startOfToday().toISOString().slice(0, 10);
  dateSet.add(today);

  const sortedDates = Array.from(dateSet).sort();

  // Pre-extract due-date-only strings for cumulative counting.
  const baselineDates = datedTasks
    .map((t) => t.baselineDueDate?.slice(0, 10))
    .filter((d): d is string => !!d)
    .sort();
  const currentDates = datedTasks
    .map((t) => t.dueDate?.slice(0, 10))
    .filter((d): d is string => !!d)
    .sort();
  const hasBaseline = baselineDates.length > 0;

  const points: SCurvePoint[] = sortedDates.map((date) => ({
    date,
    label: fmtDateShort(date),
    baseline: hasBaseline ? cumulativeCount(baselineDates, date) : null,
    current: cumulativeCount(currentDates, date),
  }));

  const todayIndex = sortedDates.indexOf(today);

  // "Slip" = days between baseline final completion and current final completion.
  let slipDays = 0;
  if (hasBaseline && baselineDates.length > 0 && currentDates.length > 0) {
    const baselineEnd = new Date(baselineDates[baselineDates.length - 1]);
    const currentEnd = new Date(currentDates[currentDates.length - 1]);
    slipDays = Math.round(
      (currentEnd.getTime() - baselineEnd.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  return { points, todayIndex: todayIndex >= 0 ? todayIndex : null, slipDays };
}

// Counts entries in `sortedDates` that are `<= cutoff`. Linear scan is fine
// here since project task counts are small (typically < 1000).
function cumulativeCount(sortedDates: string[], cutoff: string): number {
  let n = 0;
  for (const d of sortedDates) {
    if (d <= cutoff) n++;
    else break;
  }
  return n;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateShort(isoDay: string): string {
  return new Date(isoDay + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
