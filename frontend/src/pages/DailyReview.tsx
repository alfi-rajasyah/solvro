import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ProjectStatusChip } from "@/components/StatusChip";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  type NoteVisibility,
  type ProjectSummary,
  type Task,
  useAddProjectNote,
  useProjectNotes,
  useProjectRisks,
  useProjects,
  useProjectTasks,
} from "@/lib/queries";

const TODAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_MS = 86_400_000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime() === startOfToday().getTime();
}

function maxDate(values: (string | null)[]): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (max === null || t > max) max = t;
  }
  return max;
}

interface CardMetrics {
  overdue: number;
  openRisks: number;
  notesToday: number;
  reviewed: boolean;
}

// Daily Review is the INPUT screen of the core TAM loop: one scrollable
// cross-project page where the TAM logs a note per active project. The
// CUSTOMER_FACING toggle is the only thing that promotes a note into the
// Reports export — it is deliberately the most prominent control on a card.
export function DailyReview() {
  const { user } = useAuth();
  const { data: projects, isLoading, isError, error } = useProjects();

  // Wildcard users (built-in ADMIN + custom roles with "*") review every
  // active project; a TAM is scoped to the ones they own. Mirrors the
  // backend projectVisibilityFilter.
  const myActive = useMemo(() => {
    const seesAll = hasPermission(user, "*");
    return (projects ?? []).filter(
      (p) => p.status === "ACTIVE" && (seesAll || p.tamId === user?.id),
    );
  }, [projects, user]);

  const [metrics, setMetrics] = useState<Record<number, CardMetrics>>({});
  const reportMetrics = useCallback((id: number, m: CardMetrics) => {
    setMetrics((prev) => {
      const ex = prev[id];
      if (
        ex &&
        ex.overdue === m.overdue &&
        ex.openRisks === m.openRisks &&
        ex.notesToday === m.notesToday &&
        ex.reviewed === m.reviewed
      ) {
        return prev;
      }
      return { ...prev, [id]: m };
    });
  }, []);

  const session = useMemo(() => {
    let reviewed = 0;
    let notes = 0;
    let overdue = 0;
    let risks = 0;
    for (const p of myActive) {
      const m = metrics[p.id];
      if (!m) continue;
      if (m.reviewed) reviewed++;
      notes += m.notesToday;
      overdue += m.overdue;
      risks += m.openRisks;
    }
    return { reviewed, notes, overdue, risks, total: myActive.length };
  }, [metrics, myActive]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-on-surface">
          Daily Review
        </h1>
        <p className="text-sm text-on-surface-variant">
          {TODAY_FMT.format(new Date())}
          {user?.username ? ` — ${user.username}` : ""}. Log a note for each
          active project.
        </p>
      </div>

      <StatsBar
        reviewed={session.reviewed}
        total={session.total}
        notes={session.notes}
        overdue={session.overdue}
        risks={session.risks}
      />

      {isLoading && <SkeletonRows />}

      {isError && (
        <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load projects: {(error as Error).message}
        </div>
      )}

      {projects && myActive.length === 0 && (
        <div className="rounded border border-outline-variant bg-surface-container px-6 py-10 text-center text-sm text-on-surface-variant">
          No active projects to review. Notes are scoped per project — an
          active project is needed to start logging.
        </div>
      )}

      {myActive.length > 0 && (
        <div className="space-y-4">
          {myActive.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              userId={user?.id ?? -1}
              onMetrics={reportMetrics}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatsBar({
  reviewed,
  total,
  notes,
  overdue,
  risks,
}: {
  reviewed: number;
  total: number;
  notes: number;
  overdue: number;
  risks: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        label="Projects reviewed"
        value={`${reviewed} / ${total}`}
        icon="fact_check"
        tone={reviewed > 0 ? "primary" : "neutral"}
      />
      <Stat
        label="Notes written today"
        value={notes}
        icon="edit_note"
        tone={notes > 0 ? "primary" : "neutral"}
      />
      <Stat
        label="Overdue tasks"
        value={overdue}
        icon="event_busy"
        tone={overdue > 0 ? "bad" : "good"}
      />
      <Stat
        label="Open risks"
        value={risks}
        icon="warning"
        tone={risks > 0 ? "warn" : "good"}
      />
    </div>
  );
}

type Tone = "primary" | "good" | "warn" | "bad" | "neutral";

const TONE_ICON: Record<Tone, string> = {
  primary: "text-primary",
  good: "text-chip-emerald-text",
  warn: "text-chip-amber-text",
  bad: "text-chip-rose-text",
  neutral: "text-on-surface-variant",
};

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: string;
  tone: Tone;
}) {
  return (
    <div className="rounded border border-outline-variant bg-surface-container-lowest p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        <span className={`material-symbols-outlined text-base ${TONE_ICON[tone]}`}>
          {icon}
        </span>
      </div>
      <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-on-surface">
        {value}
      </div>
    </div>
  );
}

const CHIP_TONE: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good: "bg-chip-emerald-bg text-chip-emerald-text",
  warn: "bg-chip-amber-bg text-chip-amber-text",
  bad: "bg-chip-rose-bg text-chip-rose-text",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

function scheduleSignal(
  project: ProjectSummary,
  tasks: Task[],
): { label: string; tone: "good" | "warn" | "bad" | "neutral" } {
  if (!project.baselineLockedAt) {
    return { label: "No baseline", tone: "neutral" };
  }
  const b = maxDate(tasks.map((t) => t.baselineDueDate));
  const c = maxDate(tasks.map((t) => t.dueDate));
  if (b === null || c === null) {
    return { label: "No baseline dates", tone: "neutral" };
  }
  const slip = Math.round((c - b) / DAY_MS);
  if (slip > 0) return { label: `${slip}d behind`, tone: "bad" };
  if (slip < 0) return { label: `${-slip}d ahead`, tone: "good" };
  return { label: "On schedule", tone: "good" };
}

// Earliest section (by position) with unfinished work. Derived from the
// section embedded on each task — no first-class "phase" concept exists.
function currentPhase(tasks: Task[]): string {
  const bySection = new Map<
    number,
    { name: string; pos: number; total: number; done: number }
  >();
  for (const t of tasks) {
    if (!t.section) continue;
    const e =
      bySection.get(t.section.id) ??
      { name: t.section.name, pos: t.section.position, total: 0, done: 0 };
    e.total++;
    if (t.status === "DONE") e.done++;
    bySection.set(t.section.id, e);
  }
  const ordered = [...bySection.values()].sort((a, b) => a.pos - b.pos);
  const cur = ordered.find((s) => s.done < s.total);
  if (cur) return cur.name;
  return ordered.length > 0 ? "All phases complete" : "—";
}

function ProjectCard({
  project,
  userId,
  onMetrics,
}: {
  project: ProjectSummary;
  userId: number;
  onMetrics: (id: number, m: CardMetrics) => void;
}) {
  const tasksQ = useProjectTasks(project.id);
  const risksQ = useProjectRisks(project.id);
  const notesQ = useProjectNotes(project.id, { limit: 50 });
  const addNote = useAddProjectNote(project.id);

  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("INTERNAL");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const tasks = tasksQ.data ?? [];
  const risks = risksQ.data ?? [];
  const notes = notesQ.data ?? [];

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const today = startOfToday();
  const overdue = tasks.filter(
    (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < today,
  ).length;
  const openRisks = risks.filter((r) => r.status === "OPEN").length;
  const notesToday = notes.filter(
    (n) => n.author.id === userId && isToday(n.createdAt),
  ).length;
  const phase = currentPhase(tasks);
  const schedule = scheduleSignal(project, tasks);

  useEffect(() => {
    onMetrics(project.id, {
      overdue,
      openRisks,
      notesToday,
      reviewed: notesToday > 0,
    });
  }, [project.id, overdue, openRisks, notesToday, onMetrics]);

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !addNote.isPending;

  function submit() {
    if (!canSubmit) return;
    addNote.mutate(
      { body: trimmed, visibility },
      {
        onSuccess: () => {
          setBody("");
          setVisibility("INTERNAL");
          setSavedAt(new Date());
        },
      },
    );
  }

  const customerFacing = visibility === "CUSTOMER_FACING";

  return (
    <article className="rounded border border-outline-variant bg-surface-container-lowest shadow-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-outline-variant px-4 py-3">
        <Link
          to={`/projects/${project.id}/overview`}
          className="font-display text-sm font-semibold text-on-surface hover:text-primary"
        >
          {project.name}
        </Link>
        <ProjectStatusChip status={project.status} />
        <span className="text-xs text-on-surface-variant">
          {project.customer?.name ?? "No customer"}
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CHIP_TONE[schedule.tone]}`}
          title="Schedule variance vs. locked baseline"
        >
          {schedule.label}
        </span>
      </header>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-outline-variant px-4 py-2.5">
        <Metric label="Phase" value={phase} />
        <Metric label="Progress" value={`${pct}%`} sub={`${done}/${total}`} />
        <Metric
          label="Overdue"
          value={overdue}
          tone={overdue > 0 ? "bad" : "good"}
        />
        <Metric
          label="Open risks"
          value={openRisks}
          tone={openRisks > 0 ? "warn" : "good"}
        />
      </div>

      <div className="space-y-3 px-4 py-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          placeholder="What happened on this project today?"
          rows={3}
          className="w-full resize-y rounded border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <VisibilityToggle value={visibility} onChange={setVisibility} />

        {customerFacing && (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-primary">
            <span className="material-symbols-outlined text-sm">campaign</span>
            This note will be included in the customer-facing export packet.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {addNote.isError && (
            <span className="text-xs text-error">
              {(addNote.error as Error).message}
            </span>
          )}
          {savedAt && !addNote.isError && (
            <span className="flex items-center gap-1 text-[12px] text-chip-emerald-text">
              <span className="material-symbols-outlined text-sm">
                check_circle
              </span>
              Saved {TIME_FMT.format(savedAt)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-on-surface-variant">
              ⌘↵ to save
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded bg-primary px-3 py-1.5 font-display text-[12px] font-semibold text-on-primary hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addNote.isPending ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const valueColor =
    tone === "bad"
      ? "text-chip-rose-text"
      : tone === "warn"
        ? "text-chip-amber-text"
        : tone === "good"
          ? "text-chip-emerald-text"
          : "text-on-surface";
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label}
      </div>
      <div className={`truncate text-sm font-semibold ${valueColor}`}>
        {value}
        {sub && (
          <span className="ml-1 font-mono text-[11px] font-normal text-on-surface-variant">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

// Segmented control. CUSTOMER_FACING is intentionally the louder option:
// selecting it fills with the brand accent and shows an icon, because it
// changes where the note travels (into customer exports).
function VisibilityToggle({
  value,
  onChange,
}: {
  value: NoteVisibility;
  onChange: (v: NoteVisibility) => void;
}) {
  const cf = value === "CUSTOMER_FACING";
  return (
    <div
      role="radiogroup"
      aria-label="Note visibility"
      className="inline-flex items-stretch overflow-hidden rounded border border-outline-variant text-[12px] font-semibold"
    >
      <button
        type="button"
        role="radio"
        aria-checked={!cf}
        onClick={() => onChange("INTERNAL")}
        title="Internal notes never appear in any customer-facing export."
        className={[
          "px-3 py-1.5 transition-colors",
          !cf
            ? "bg-surface-container-high text-on-surface"
            : "bg-surface text-on-surface-variant hover:text-on-surface",
        ].join(" ")}
      >
        Internal
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={cf}
        onClick={() => onChange("CUSTOMER_FACING")}
        title="Customer-facing notes feed the Reports export packet."
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
          cf
            ? "bg-primary text-on-primary"
            : "bg-surface text-primary ring-1 ring-inset ring-primary/40 hover:bg-primary/10",
        ].join(" ")}
      >
        <span className="material-symbols-outlined text-sm">campaign</span>
        Customer-facing
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-52 animate-pulse rounded border border-outline-variant bg-surface-container"
        />
      ))}
    </div>
  );
}
