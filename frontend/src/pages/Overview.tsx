import { Link } from "react-router-dom";
import {
  PortfolioCalendar,
  sortPortfolioRows,
} from "@/components/portfolio/PortfolioCalendar";
import { ProjectStatusChip } from "@/components/StatusChip";
import { useAuth } from "@/lib/auth";
import {
  type OverviewProject,
  type OverviewResponse,
  type OverviewTask,
  type ProjectStatus,
  type TaskStatus,
  useOverview,
} from "@/lib/queries";

export function Overview() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-on-surface">
          Welcome back, {firstNameOf(user)}.
        </h1>
        <p className="text-sm text-on-surface-variant">
          A high-density snapshot of your active workload.
        </p>
      </div>

      {isLoading && <SkeletonGrid />}

      {isError && (
        <div className="rounded-sm border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load overview: {(error as Error).message}
        </div>
      )}

      {data && <OverviewBody data={data} />}
    </div>
  );
}

function OverviewBody({ data }: { data: OverviewResponse }) {
  const activeProjects = data.projectStatusCounts.ACTIVE ?? 0;
  const totalTasks = data.taskCounts.TODO + data.taskCounts.IN_PROGRESS + data.taskCounts.DONE;
  const openTasks = data.taskCounts.TODO + data.taskCounts.IN_PROGRESS;
  const completionRate = totalTasks === 0 ? 0 : Math.round((data.taskCounts.DONE / totalTasks) * 100);

  return (
    <>
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Active Projects"
          value={activeProjects}
          hint={`${data.projectCount} total`}
          icon="folder_open"
          tone="primary"
        />
        <Kpi
          label="Open Tasks"
          value={openTasks}
          hint={`${data.taskCounts.IN_PROGRESS} in progress`}
          icon="task_alt"
          tone="primary"
        />
        <Kpi
          label="Completed"
          value={data.taskCounts.DONE}
          hint={totalTasks > 0 ? `${completionRate}% of all tasks` : "—"}
          icon="trending_up"
          tone="emerald"
        />
        <Kpi
          label="Total tasks"
          value={totalTasks}
          hint={`${data.taskCounts.TODO} to do`}
          icon="checklist"
          tone="neutral"
        />
      </div>

      {/* Full-width portfolio timeline */}
      <section className="space-y-3">
        <header>
          <h3 className="font-display text-sm font-bold text-on-surface">Portfolio timeline</h3>
          <p className="text-[11px] text-on-surface-variant">
            Where each of your projects sits across the year
          </p>
        </header>
        {data.portfolio.length === 0 ? (
          <EmptyHint label="No projects yet." />
        ) : (
          <PortfolioCalendar
            projects={sortPortfolioRows(data.portfolio)}
            unscheduledNote={(n) =>
              `${n} project${n === 1 ? "" : "s"} ha${n === 1 ? "s" : "ve"} no scheduled dates.`
            }
          />
        )}
      </section>

      {/* Two-up: attention + recent activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-sm border border-outline-variant bg-surface-container-lowest p-5 lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-on-surface">Projects needing attention</h3>
            <Link to="/projects" className="text-[11px] font-semibold text-primary hover:underline">
              View all →
            </Link>
          </header>
          {data.portfolio.length === 0 ? (
            <EmptyHint label="No projects yet." />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {[...data.portfolio]
                .sort((a, b) => {
                  const ra = healthRank(a);
                  const rb = healthRank(b);
                  if (ra !== rb) return ra - rb;
                  if (ra === 0) return b.daysOverdue - a.daysOverdue;
                  return (
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                  );
                })
                .slice(0, 6)
                .map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      style={{
                        borderLeftWidth: 3,
                        borderLeftStyle: "solid",
                        borderLeftColor: healthColor(p),
                      }}
                      className="flex items-center gap-3 rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 transition-colors hover:border-primary"
                    >
                      <span className="font-mono text-[11px] text-on-surface-variant">P-{String(p.id).padStart(3, "0")}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{p.name}</span>
                      {p.isOverdue && (
                        <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-chip-amber-text">
                          {p.daysOverdue}d overdue
                        </span>
                      )}
                      <span className="text-[11px] text-on-surface-variant">{p.totalTasks} tasks</span>
                      <ProjectStatusChip status={p.status} />
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="rounded-sm border border-outline-variant bg-surface-container-lowest p-5">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-on-surface">Recent activity</h3>
            <Link to="/projects" className="text-[11px] font-semibold text-primary hover:underline">
              All projects →
            </Link>
          </header>
          <ActivityFeed projects={data.recentProjects} tasks={data.recentTasks} />
        </div>
      </div>
    </>
  );
}

interface KpiProps {
  label: string;
  value: number;
  hint?: string;
  icon: string;
  tone: "primary" | "emerald" | "amber" | "neutral";
}

function Kpi({ label, value, hint, icon, tone }: KpiProps) {
  const iconColor =
    tone === "primary"
      ? "text-primary"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "amber"
          ? "text-amber-600"
          : "text-on-surface-variant";
  return (
    <div className="rounded-sm border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between">
        <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className={`material-symbols-outlined text-base ${iconColor}`}>{icon}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold tabular-nums text-on-surface">{value}</span>
        {hint && <span className="text-[11px] text-on-surface-variant">{hint}</span>}
      </div>
    </div>
  );
}

function ActivityFeed({ projects, tasks }: { projects: OverviewProject[]; tasks: OverviewTask[] }) {
  if (projects.length === 0 && tasks.length === 0) {
    return <EmptyHint label="No activity yet." />;
  }
  return (
    <ul className="space-y-3 text-[12px]">
      {tasks.slice(0, 5).map((t) => {
        const init = (t.assignedTo?.username ?? "?").slice(0, 2).toUpperCase();
        const tone = avatarColor(t.assignedTo?.username ?? "?");
        return (
          <li key={`t-${t.id}`} className="flex gap-2.5">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: tone }}
            >
              {init}
            </span>
            <div className="min-w-0 leading-snug">
              <span className="font-semibold text-on-surface">{t.assignedTo?.username ?? "Unassigned"}</span>
              {" · "}
              <span className="text-on-surface-variant">{taskVerb(t.status)}</span>{" "}
              <span className="font-mono text-primary">T-{String(t.id).padStart(3, "0")}</span>
              <div className="truncate text-on-surface-variant">{t.project.name}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <p className="rounded-sm border border-dashed border-outline-variant px-4 py-6 text-center text-xs text-on-surface-variant">
      {label}
    </p>
  );
}

function SkeletonGrid() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-sm bg-surface-container-low" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-sm bg-surface-container-low" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-sm bg-surface-container-low lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-sm bg-surface-container-low" />
      </div>
    </>
  );
}

function taskVerb(status: TaskStatus) {
  if (status === "DONE") return "completed";
  if (status === "IN_PROGRESS") return "is working on";
  return "took ownership of";
}

const AVATAR_PALETTE = ["#0d9488", "#7c3aed", "#dc2626", "#0ea5e9", "#9333ea", "#a78bfa", "#f59e0b", "#10b981"];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

// First name for the welcome heading. AuthUser carries no name field, so
// derive it from the username (or email): take the segment before the
// first "." or "@" and capitalize it. "alfi.rajasyah" → "Alfi",
// "tam@elitery.com" → "Tam", "admin" → "Admin".
function firstNameOf(
  user: { username?: string; email?: string } | null | undefined,
): string {
  const source = user?.username || user?.email || "operator";
  const head = source.split(/[.@]/)[0] || "operator";
  return head.charAt(0).toUpperCase() + head.slice(1);
}

// Health signal comes from portfolio[].isOverdue (real schedule data):
// overdue (amber) → active on-track (green) → everything else (gray).
function healthRank(p: { status: ProjectStatus; isOverdue: boolean }): number {
  if (p.isOverdue) return 0;
  if (p.status === "ACTIVE") return 1;
  return 2;
}
function healthColor(p: { status: ProjectStatus; isOverdue: boolean }): string {
  if (p.isOverdue) return "#F59E0B";
  if (p.status === "ACTIVE") return "#8DC63F";
  return "#6B7280";
}
