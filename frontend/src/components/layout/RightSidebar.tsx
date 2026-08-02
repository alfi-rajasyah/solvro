import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { ProjectStatusChip } from "@/components/StatusChip";
import { useGanttExport } from "@/lib/gantt/exportContext";
import type { ProjectDetail as ProjectDetailType } from "@/lib/queries";

interface RightSidebarProps {
  project: ProjectDetailType;
  open: boolean;
  onClose: () => void;
  blueprintVersion?: string;
  blueprintDocsUrl?: string;
}

export function RightSidebar({
  project,
  open,
  onClose,
  blueprintVersion = "SA Blueprint v2.4",
  blueprintDocsUrl = "https://docs.solvro.dev/blueprints/v2.4",
}: RightSidebarProps) {
  const { handlers: exportHandlers } = useGanttExport();
  const [exporting, setExporting] = useState<"excel" | "pdf" | "pdfTab" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function runExport(kind: "excel" | "pdf" | "pdfTab") {
    if (!exportHandlers || exporting) return;
    setExportError(null);
    setExporting(kind);
    // Open the tab synchronously inside the click's user activation —
    // opening after the async export work would be pop-up-blocked.
    const win = kind === "pdfTab" ? window.open("", "_blank") : null;
    try {
      if (kind === "pdfTab") await exportHandlers.pdfTab(win);
      else await exportHandlers[kind]();
    } catch (err) {
      win?.close();
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      {open && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close project context"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden"
        />
      )}
      <aside
      aria-hidden={!open}
      className={[
        "fixed right-0 top-14 bottom-0 z-40 w-full transform border-l border-outline-variant bg-surface-container-low/95 font-display backdrop-blur-md transition-transform duration-200 ease-out md:z-30 md:w-context-panel",
        open ? "translate-x-0" : "translate-x-full",
      ].join(" ")}
    >
      <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
        <span className="font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
          Project context
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close project context"
          className="flex h-7 w-7 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <div className="space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <div className="flex items-center gap-3">
            <ProjectStatusChip status={project.status} />
          </div>
          <h2 className="mt-2 truncate font-display text-base font-semibold text-on-surface">
            {project.name}
          </h2>
          {project.description && (
            <p className="mt-1 line-clamp-3 text-xs text-on-surface-variant">
              {project.description}
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
            Blueprint reference
          </h3>
          <div className="rounded-sm border border-outline-variant bg-surface-container-lowest p-3">
            <div className="flex items-start gap-3">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                schema
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-on-surface">
                  {blueprintVersion}
                </p>
                <p className="mt-0.5 text-[12px] text-on-surface-variant">
                  Source-of-truth payload (JSONB) — read-only.
                </p>
                <a
                  href={blueprintDocsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                >
                  View source documentation
                  <span className="material-symbols-outlined text-[15px]">
                    open_in_new
                  </span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
            Stakeholders
          </h3>
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">TAM</dt>
              <dd className="font-medium text-on-surface">{project.tam.username}</dd>
            </div>
            {project.sa && (
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">SA</dt>
                <dd className="font-medium text-on-surface">{project.sa.username}</dd>
              </div>
            )}
            {project.customer && (
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Customer</dt>
                <dd>
                  <Link
                    to={`/customers/${project.customer.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {project.customer.name}
                  </Link>
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Tasks</dt>
              <dd className="font-medium text-on-surface">{project._count.tasks}</dd>
            </div>
          </dl>
        </section>

        {exportHandlers && (
          <section>
            <h3 className="mb-2 font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
              Export schedule
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => runExport("excel")}
                disabled={exporting !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-outline-variant bg-surface-container-lowest px-2.5 py-2 font-display text-[12px] font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[17px]">
                  table_view
                </span>
                {exporting === "excel" ? "Exporting…" : "Excel"}
              </button>
              <button
                type="button"
                onClick={() => runExport("pdf")}
                disabled={exporting !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-outline-variant bg-surface-container-lowest px-2.5 py-2 font-display text-[12px] font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[17px]">
                  picture_as_pdf
                </span>
                {exporting === "pdf" ? "Exporting…" : "PDF"}
              </button>
              <button
                type="button"
                onClick={() => runExport("pdfTab")}
                disabled={exporting !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-outline-variant bg-surface-container-lowest px-2.5 py-2 font-display text-[12px] font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[17px]">
                  open_in_new
                </span>
                {exporting === "pdfTab" ? "Opening…" : "View"}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-on-surface-variant">
              Excel: tasks + date grid · PDF: download · View: open the PDF in a
              tab (use when downloads hang).
            </p>
            {exportError && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription className="text-xs">{exportError}</AlertDescription>
              </Alert>
            )}
          </section>
        )}

        {project.customer && (
          <section>
            <h3 className="mb-2 font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
              Documents
            </h3>
            <Link
              to={`/customers/${project.customer.id}?tab=documents`}
              className="flex items-start gap-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-3 transition-colors hover:border-primary/40"
            >
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                description
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold text-on-surface">
                  Customer documents
                </p>
                <p className="mt-0.5 text-[12px] text-on-surface-variant">
                  Open the Documents resource for {project.customer.name}.
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                  Go to Documents
                  <span className="material-symbols-outlined text-[15px]">
                    chevron_right
                  </span>
                </span>
              </div>
            </Link>
          </section>
        )}
      </div>
    </aside>
    </>
  );
}
