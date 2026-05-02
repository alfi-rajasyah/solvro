import { useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  type Priority,
  useOverview,
  useProjects,
  useProjectTasks,
} from "@/lib/queries";

const TASK_COLORS = {
  TODO: "#c2c6d6",
  IN_PROGRESS: "#0058be",
  DONE: "#10b981",
} as const;

const TASK_LABEL = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
} as const;

const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: "#94a3b8",
  MEDIUM: "#64748b",
  HIGH: "#f59e0b",
  URGENT: "#ba1a1a",
};

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function Reports() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");

  const { data: projects } = useProjects();
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: projectTasks } = useProjectTasks(
    selectedProjectId === "" ? null : selectedProjectId,
  );

  const projectStats = useMemo(() => {
    if (selectedProjectId === "" || !projectTasks) return null;
    const statusCounts = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
    const priorityCounts: Record<Priority, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
    for (const t of projectTasks) {
      statusCounts[t.status]++;
      priorityCounts[t.priority]++;
    }
    const total = projectTasks.length;
    return {
      statusCounts,
      priorityCounts,
      total,
      pct: total === 0 ? 0 : Math.round((statusCounts.DONE / total) * 100),
    };
  }, [projectTasks, selectedProjectId]);

  const globalStats = useMemo(() => {
    if (!overview) return null;
    const total =
      overview.taskCounts.TODO + overview.taskCounts.IN_PROGRESS + overview.taskCounts.DONE;
    return {
      statusCounts: overview.taskCounts,
      priorityCounts: null as Record<Priority, number> | null,
      total,
      pct: total === 0 ? 0 : Math.round((overview.taskCounts.DONE / total) * 100),
    };
  }, [overview]);

  const stats = projectStats ?? globalStats;
  const scopeLabel =
    selectedProjectId === ""
      ? "All projects"
      : projects?.find((p) => p.id === selectedProjectId)?.name ?? "Selected project";

  const statusPieData = stats
    ? (["TODO", "IN_PROGRESS", "DONE"] as const).map((s) => ({
        name: TASK_LABEL[s],
        value: stats.statusCounts[s],
        key: s,
      }))
    : [];

  const priorityPieData =
    projectStats?.priorityCounts
      ? PRIORITIES.map((p) => ({
          name: p,
          value: projectStats.priorityCounts[p],
          key: p,
        }))
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-h1 text-on-surface">Reports</h1>
          <p className="text-sm text-on-surface-variant">
            Task status + priority distribution and completion percentage.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Scope
          </span>
          <select
            value={selectedProjectId === "" ? "" : String(selectedProjectId)}
            onChange={(e) =>
              setSelectedProjectId(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All projects</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {overviewLoading && (
        <div className="h-64 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
      )}

      {stats && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title={`Task Status · ${scopeLabel}`}>
            {stats.total === 0 ? (
              <Empty />
            ) : (
              <PieChartShell data={statusPieData} colorMap={TASK_COLORS} />
            )}
          </ChartCard>

          <ChartCard
            title={`Priority · ${scopeLabel}`}
            hint={selectedProjectId === "" ? "Pick a project for priority breakdown" : undefined}
          >
            {selectedProjectId === "" ? (
              <p className="rounded border border-dashed border-outline-variant px-4 py-8 text-center text-xs text-on-surface-variant">
                Priority counts are per-project. Select a project from the Scope dropdown.
              </p>
            ) : projectStats && projectStats.total === 0 ? (
              <Empty />
            ) : projectStats ? (
              <PieChartShell data={priorityPieData} colorMap={PRIORITY_COLORS} />
            ) : null}
          </ChartCard>

          <section className="space-y-3">
            <SummaryCard
              label="Completion"
              value={`${stats.pct}%`}
              hint={`${stats.statusCounts.DONE} of ${stats.total} tasks done`}
              tone="primary"
            />
            <SummaryCard
              label="In Progress"
              value={stats.statusCounts.IN_PROGRESS}
              hint="Active work"
            />
            <SummaryCard
              label="Backlog"
              value={stats.statusCounts.TODO}
              hint="Awaiting start"
            />
          </section>
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-outline-variant bg-surface-container-lowest p-5">
      <header className="mb-4">
        <h2 className="font-display text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[11px] text-on-surface-variant">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function PieChartShell<K extends string>({
  data,
  colorMap,
}: {
  data: { name: string; value: number; key: K }[];
  colorMap: Record<K, string>;
}) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            label={({ percent }) => (percent ? `${Math.round(percent * 100)}%` : "")}
          >
            {data.map((entry) => (
              <Cell
                key={entry.key}
                fill={colorMap[entry.key]}
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip formatter={(v: number, name: string) => [`${v} tasks`, name]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function Empty() {
  return (
    <p className="rounded border border-dashed border-outline-variant px-4 py-8 text-center text-xs text-on-surface-variant">
      No tasks in this scope yet.
    </p>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "primary";
}) {
  const valueClass = tone === "primary" ? "text-primary" : "text-on-surface";
  return (
    <div className="rounded border border-outline-variant bg-surface-container-lowest p-4">
      <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        {label}
      </span>
      <div className={`font-display text-h2 leading-none ${valueClass}`}>{value}</div>
      {hint && <p className="mt-1 text-[11px] text-on-surface-variant">{hint}</p>}
    </div>
  );
}
