import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  type OverviewProject,
  type OverviewResponse,
  type OverviewTask,
  type TaskStatus,
  useOverview,
} from "@/lib/queries";

const TASK_LABEL: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const TASK_TONE: Record<TaskStatus, string> = {
  TODO: "bg-surface-container text-on-surface-variant",
  IN_PROGRESS: "bg-primary/10 text-primary",
  DONE: "bg-emerald-100 text-emerald-700",
};

export function Overview() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-h1 text-on-surface">
          Welcome back, {user?.username ?? "operator"}
        </h1>
        <p className="text-sm text-on-surface-variant">
          A high-density snapshot of your active workload.
        </p>
      </div>

      {isLoading && <SkeletonGrid />}

      {isError && (
        <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load overview: {(error as Error).message}
        </div>
      )}

      {data && <OverviewBody data={data} />}
    </div>
  );
}

function OverviewBody({ data }: { data: OverviewResponse }) {
  const totalTasks =
    data.taskCounts.TODO + data.taskCounts.IN_PROGRESS + data.taskCounts.DONE;
  const donePct = totalTasks === 0 ? 0 : Math.round((data.taskCounts.DONE / totalTasks) * 100);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projects" value={data.projectCount} icon="assignment" />
        <StatCard
          label="Tasks · In Progress"
          value={data.taskCounts.IN_PROGRESS}
          icon="autorenew"
          tone="primary"
        />
        <StatCard
          label="Tasks · To Do"
          value={data.taskCounts.TODO}
          icon="checklist"
        />
        <StatCard
          label="Completion"
          value={`${donePct}%`}
          icon="trending_up"
          tone="success"
          hint={`${data.taskCounts.DONE} / ${totalTasks} tasks done`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded border border-outline-variant bg-surface-container-lowest p-5 lg:col-span-2">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
              Recent Projects
            </h2>
            <Link
              to="/projects"
              className="font-display text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              View all
            </Link>
          </header>
          <RecentProjects items={data.recentProjects} />
        </section>

        <section className="rounded border border-outline-variant bg-surface-container-lowest p-5">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
              Recent Tasks
            </h2>
            <Link
              to="/tasks"
              className="font-display text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              View all
            </Link>
          </header>
          <RecentTasks items={data.recentTasks} />
        </section>
      </div>
    </>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  tone?: "default" | "primary" | "success";
  hint?: string;
}

function StatCard({ label, value, icon, tone = "default", hint }: StatCardProps) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-600"
        : "text-on-surface";
  return (
    <div className="rounded border border-outline-variant bg-surface-container-lowest p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
        <span className="material-symbols-outlined text-on-surface-variant">{icon}</span>
      </div>
      <div className={`font-display text-h1 leading-none ${toneClass}`}>{value}</div>
      {hint && <p className="mt-2 text-[11px] text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function RecentProjects({ items }: { items: OverviewProject[] }) {
  if (items.length === 0) return <EmptyHint label="No projects yet." />;
  return (
    <ul className="divide-y divide-outline-variant">
      {items.map((p) => (
        <li key={p.id}>
          <Link
            to={`/projects/${p.id}`}
            className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-surface-container-low"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
                  SOLV-{String(p.id).padStart(3, "0")}
                </span>
                <StatusChip status={p.status} />
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold text-on-surface">
                {p.name}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                TAM {p.tam.username} · SA {p.sa.username} · {p._count.tasks} tasks
              </p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">
              chevron_right
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentTasks({ items }: { items: OverviewTask[] }) {
  if (items.length === 0) return <EmptyHint label="No tasks yet." />;
  return (
    <ul className="divide-y divide-outline-variant">
      {items.map((t) => (
        <li key={t.id} className="py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-on-surface">{t.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                {t.project.name}
                {t.assignedTo ? ` · ${t.assignedTo.username}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 rounded px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${TASK_TONE[t.status]}`}
            >
              {TASK_LABEL[t.status]}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : status === "COMPLETED"
        ? "bg-primary/10 text-primary"
        : status === "ON_HOLD" || status === "CANCELLED"
          ? "bg-error-container text-on-error-container"
          : "bg-surface-container text-on-surface-variant";
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${tone}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <p className="rounded border border-dashed border-outline-variant px-4 py-6 text-center text-xs text-on-surface-variant">
      {label}
    </p>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded border border-outline-variant bg-surface-container-low"
        />
      ))}
    </div>
  );
}
