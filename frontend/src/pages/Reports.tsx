import { useEffect, useMemo, useState } from "react";
import { ProjectStatusChip } from "@/components/StatusChip";
import { hasPermission, useAuth } from "@/lib/auth";
import { copyText } from "@/lib/clipboard";
import {
  type ProjectSummary,
  useProjectDependencies,
  useProjectNotes,
  useProjectRisks,
  useProjects,
  useProjectSections,
  useProjectTasks,
} from "@/lib/queries";

// Reports is the OUTPUT screen: pick one of the TAM's active projects and
// generate a structured markdown packet to paste into an external AI tool.
// Daily Review is the input screen — they are not conflated here. No native
// summarisation: the export is the deliverable.
export function Reports() {
  const { user } = useAuth();
  const { data: projects, isLoading, isError } = useProjects();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Wildcard users (built-in ADMIN + custom roles with "*") see every
  // active project; a TAM is scoped to the ones they own. Mirrors the
  // backend projectVisibilityFilter.
  const myActive = useMemo(() => {
    const seesAll = hasPermission(user, "*");
    return (projects ?? []).filter(
      (p) => p.status === "ACTIVE" && (seesAll || p.tamId === user?.id),
    );
  }, [projects, user]);

  const selected = useMemo(
    () => myActive.find((p) => p.id === selectedId) ?? null,
    [myActive, selectedId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-on-surface">
          Reports
        </h1>
        <p className="text-sm text-on-surface-variant">
          Generate a customer-ready export packet for one of your active
          projects, then paste it into your AI tool to draft the summary.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Project picker — the TAM's ACTIVE projects only */}
        <aside className="space-y-2">
          <h2 className="text-label-caps uppercase tracking-wider text-on-surface-variant">
            Your active projects
          </h2>

          {isLoading && (
            <div className="h-32 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
          )}
          {isError && (
            <p className="rounded border border-outline-variant bg-surface-container-low px-3 py-4 text-xs text-on-surface-variant">
              Could not load projects.
            </p>
          )}
          {!isLoading && !isError && myActive.length === 0 && (
            <p className="rounded border border-dashed border-outline-variant px-3 py-6 text-center text-xs text-on-surface-variant">
              No active projects to export.
            </p>
          )}

          <ul className="space-y-1">
            {myActive.map((p) => {
              const active = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={[
                      "flex w-full flex-col gap-1 rounded border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-outline-variant hover:bg-surface-container",
                    ].join(" ")}
                  >
                    <span className="truncate text-sm font-semibold text-on-surface">
                      {p.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <ProjectStatusChip status={p.status} />
                      <span className="truncate text-[11px] text-on-surface-variant">
                        {p.customer?.name ?? "No customer"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Export panel for the selected project */}
        <section className="min-w-0">
          {selected ? (
            <ExportPanel key={selected.id} project={selected} />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center rounded border border-dashed border-outline-variant px-6 text-center text-sm text-on-surface-variant">
              Select a project to generate its export packet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ExportPanel({ project }: { project: ProjectSummary }) {
  const tasks = useProjectTasks(project.id);
  const risks = useProjectRisks(project.id);
  const sections = useProjectSections(project.id);
  const deps = useProjectDependencies(project.id);
  // Query CUSTOMER_FACING only — INTERNAL notes never enter this screen.
  const notes = useProjectNotes(project.id, {
    visibility: "CUSTOMER_FACING",
  });

  const sources = [tasks, risks, sections, deps, notes];
  const loading = sources.some((q) => q.isLoading);
  const errored = sources.some((q) => q.isError);
  const ready =
    !loading &&
    !errored &&
    tasks.data !== undefined &&
    risks.data !== undefined &&
    sections.data !== undefined &&
    deps.data !== undefined &&
    notes.data !== undefined;

  const [markdown, setMarkdown] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "copy" | "download">(null);
  const [copied, setCopied] = useState(false);

  // Build the packet via the dynamically-imported export module (kept out
  // of the main bundle, mirroring the Gantt export layer).
  useEffect(() => {
    if (!ready) {
      setMarkdown(null);
      return;
    }
    let cancelled = false;
    setBuildError(null);
    void import("@/lib/export/projectExport")
      .then((mod) => {
        if (cancelled) return;
        setMarkdown(
          mod.buildProjectExportMarkdown({
            project,
            tasks: tasks.data!,
            risks: risks.data!,
            sections: sections.data!,
            dependencies: deps.data!,
            customerNotes: notes.data!,
            generatedAt: new Date(),
          }),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setBuildError(
            err instanceof Error ? err.message : "Failed to build export.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    project,
    tasks.data,
    risks.data,
    sections.data,
    deps.data,
    notes.data,
  ]);

  async function handleCopy() {
    if (!markdown) return;
    setBusy("copy");
    setBuildError(null);
    try {
      await copyText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setBuildError("Clipboard write was blocked by the browser.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    if (!markdown) return;
    setBusy("download");
    setBuildError(null);
    try {
      const mod = await import("@/lib/export/projectExport");
      mod.downloadMarkdownFile(mod.exportFileName(project.name), markdown);
    } catch (err) {
      setBuildError(
        err instanceof Error ? err.message : "Download failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-bold text-on-surface">
            {project.name}
          </h2>
          <p className="text-xs text-on-surface-variant">
            Export packet · customer-facing notes from the last 14 days only
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!markdown || busy !== null}
            className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-3 py-1.5 font-display text-[12px] font-bold text-on-surface hover:bg-surface-container disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">
              {copied ? "check" : "content_copy"}
            </span>
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!markdown || busy !== null}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-display text-[12px] font-bold text-on-primary hover:bg-primary-container disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">
              download
            </span>
            Download .md
          </button>
        </div>
      </div>

      {loading && (
        <div className="h-72 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
      )}
      {errored && (
        <p className="rounded border border-outline-variant bg-surface-container-low px-4 py-6 text-sm text-on-surface-variant">
          Could not load this project's data. Try again.
        </p>
      )}
      {buildError && (
        <p className="rounded border border-error/40 bg-error/5 px-4 py-2 text-xs text-error">
          {buildError}
        </p>
      )}

      {markdown !== null && (
        <pre className="max-h-[60vh] overflow-auto rounded border border-outline-variant bg-surface-container-lowest p-4 font-mono text-[12px] leading-relaxed text-on-surface">
          {markdown}
        </pre>
      )}
    </div>
  );
}
