import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ProjectStatusChip } from "@/components/StatusChip";
import { useAuth } from "@/lib/auth";
import {
  type NoteVisibility,
  type ProjectSummary,
  useAddProjectNote,
  useProjectNotes,
  useProjects,
} from "@/lib/queries";

const TODAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export function DailyReview() {
  const { user } = useAuth();
  const { data: projects, isLoading, isError, error } = useProjects();

  const activeProjects = useMemo(
    () =>
      (projects ?? []).filter(
        (p) => p.status === "ACTIVE" || p.status === "PLANNING",
      ),
    [projects],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-on-surface">
          Daily Review
        </h1>
        <p className="text-sm text-on-surface-variant">
          {TODAY_FMT.format(new Date())} — log a note for each active project,
          {user?.username ? ` ${user.username}` : ""}.
        </p>
      </div>

      {isLoading && <SkeletonRows />}

      {isError && (
        <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load projects: {(error as Error).message}
        </div>
      )}

      {projects && activeProjects.length === 0 && (
        <div className="rounded border border-outline-variant bg-surface-container px-6 py-10 text-center text-sm text-on-surface-variant">
          No active projects assigned to you. Notes are scoped per project —
          create or get assigned to one to start logging.
        </div>
      )}

      <div className="space-y-4">
        {activeProjects.map((project) => (
          <NoteRow key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}

function NoteRow({ project }: { project: ProjectSummary }) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("INTERNAL");
  const addNote = useAddProjectNote(project.id);
  const { data: recentNotes } = useProjectNotes(project.id, { limit: 5 });

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
        },
      },
    );
  }

  return (
    <article className="rounded border border-outline-variant bg-surface-container shadow-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-outline-variant px-4 py-3">
        <Link
          to={`/projects/${project.id}/overview`}
          className="font-display text-sm font-semibold text-on-surface hover:text-primary"
        >
          {project.name}
        </Link>
        <ProjectStatusChip status={project.status} />
        {project.customer && (
          <span className="text-xs text-on-surface-variant">
            {project.customer.name}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-on-surface-variant">
          P-{String(project.id).padStart(3, "0")}
        </span>
      </header>

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

        <div className="flex flex-wrap items-center gap-3">
          <VisibilityToggle value={visibility} onChange={setVisibility} />
          {addNote.isError && (
            <span className="text-xs text-error">
              {(addNote.error as Error).message}
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
              className="rounded bg-primary px-3 py-1.5 font-display text-[12px] font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addNote.isPending ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      </div>

      {recentNotes && recentNotes.length > 0 && (
        <div className="border-t border-outline-variant px-4 py-3">
          <div className="mb-2 font-display text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Recent notes
          </div>
          <ul className="space-y-2">
            {recentNotes.map((note) => (
              <li
                key={note.id}
                className="flex items-start gap-3 text-sm text-on-surface"
              >
                <VisibilityDot visibility={note.visibility} />
                <div className="min-w-0 flex-1">
                  <div className="whitespace-pre-wrap break-words">
                    {note.body}
                  </div>
                  <div className="mt-1 text-[11px] text-on-surface-variant">
                    {note.author.username} ·{" "}
                    {new Date(note.createdAt).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function VisibilityToggle({
  value,
  onChange,
}: {
  value: NoteVisibility;
  onChange: (v: NoteVisibility) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Note visibility"
      className="inline-flex rounded border border-outline-variant bg-surface p-0.5 text-[11px] font-semibold"
    >
      <ToggleButton
        active={value === "INTERNAL"}
        onClick={() => onChange("INTERNAL")}
        label="Internal"
        title="Internal notes never appear in any customer-facing export."
      />
      <ToggleButton
        active={value === "CUSTOMER_FACING"}
        onClick={() => onChange("CUSTOMER_FACING")}
        label="Customer-facing"
        title="Customer-facing notes feed the Reports export packet."
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={title}
      onClick={onClick}
      className={[
        "rounded px-2.5 py-1 transition-colors",
        active
          ? "bg-primary text-white"
          : "text-on-surface-variant hover:text-on-surface",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function VisibilityDot({ visibility }: { visibility: NoteVisibility }) {
  const internal = visibility === "INTERNAL";
  return (
    <span
      title={internal ? "Internal" : "Customer-facing"}
      className={[
        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
        internal ? "bg-on-surface-variant" : "bg-primary",
      ].join(" ")}
    />
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded border border-outline-variant bg-surface-container"
        />
      ))}
    </div>
  );
}
