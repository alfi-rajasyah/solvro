import { Link } from "react-router-dom";
import type { ProjectStatus } from "@/lib/queries";
import type { ProjectDetail as ProjectDetailType } from "@/lib/queries";

interface RightSidebarProps {
  project: ProjectDetailType;
  open: boolean;
  onClose: () => void;
  blueprintVersion?: string;
  blueprintDocsUrl?: string;
}

const STATUS_TONE: Record<ProjectStatus, string> = {
  PLANNING: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  ACTIVE: "bg-primary text-on-primary ring-1 ring-primary",
  ON_HOLD: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
  COMPLETED: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
  CANCELLED: "bg-rose-100 text-rose-900 ring-1 ring-rose-300",
};

export function RightSidebar({
  project,
  open,
  onClose,
  blueprintVersion = "SA Blueprint v2.4",
  blueprintDocsUrl = "https://docs.solvro.dev/blueprints/v2.4",
}: RightSidebarProps) {
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
        "fixed right-0 top-16 bottom-0 z-40 w-full transform border-l border-outline-variant bg-surface-container-low/95 font-display backdrop-blur-md transition-transform duration-200 ease-out md:z-30 md:w-context-panel",
        open ? "translate-x-0" : "translate-x-full",
      ].join(" ")}
    >
      <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Project context
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close project context"
          className="flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <div className="space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] font-semibold tracking-tight text-on-surface">
              SOLV-{String(project.id).padStart(3, "0")}
            </span>
            <span
              className={[
                "rounded px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest",
                STATUS_TONE[project.status],
              ].join(" ")}
            >
              {project.status.replace("_", " ")}
            </span>
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
          <h3 className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Blueprint reference
          </h3>
          <div className="rounded border border-outline-variant bg-surface-container-lowest p-3">
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
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  Source-of-truth payload (JSONB) — read-only.
                </p>
                <a
                  href={blueprintDocsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  View source documentation
                  <span className="material-symbols-outlined text-[14px]">
                    open_in_new
                  </span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Stakeholders
          </h3>
          <dl className="space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">TAM</dt>
              <dd className="font-medium text-on-surface">{project.tam.username}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">SA</dt>
              <dd className="font-medium text-on-surface">{project.sa.username}</dd>
            </div>
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

        {project.customer && (
          <section>
            <h3 className="mb-2 font-display text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Documents
            </h3>
            <Link
              to={`/customers/${project.customer.id}?tab=documents`}
              className="flex items-start gap-3 rounded border border-outline-variant bg-surface-container-lowest p-3 transition-colors hover:border-primary/40"
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
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  Open the Documents resource for {project.customer.name}.
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  Go to Documents
                  <span className="material-symbols-outlined text-[14px]">
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
