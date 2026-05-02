import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProjectFormModal } from "@/components/ProjectFormModal";
import { ProjectStatusChip } from "@/components/StatusChip";
import { hasPermission, useAuth } from "@/lib/auth";
import { type ProjectSummary, useCustomers, useProjects } from "@/lib/queries";

export function Projects() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdParam = searchParams.get("customerId");
  const customerFilter = customerIdParam ? Number(customerIdParam) : undefined;

  const { data: customers } = useCustomers();
  const { data: projects, isLoading, isError, error } = useProjects(
    customerFilter ? { customerId: customerFilter } : {},
  );
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = hasPermission(user, "project:write");

  function setCustomerFilter(id: number | "") {
    const next = new URLSearchParams(searchParams);
    if (id === "") next.delete("customerId");
    else next.set("customerId", String(id));
    setSearchParams(next, { replace: true });
  }

  // Clean URL param if customer no longer exists.
  useEffect(() => {
    if (!customerFilter || !customers) return;
    if (!customers.some((c) => c.id === customerFilter)) {
      setCustomerFilter("");
    }
  }, [customerFilter, customers]);

  const activeCustomer = customers?.find((c) => c.id === customerFilter);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-h1 text-on-surface">Projects</h1>
          <p className="text-sm text-on-surface-variant">
            {activeCustomer
              ? `Filtered by customer: ${activeCustomer.name}`
              : "All projects you own as a TAM, plus those you lead as an SA."}
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-display text-xs font-bold text-on-primary transition-colors hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Project
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-outline-variant bg-surface-container-lowest p-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Customer
          </span>
          <select
            value={customerFilter ?? ""}
            onChange={(e) =>
              setCustomerFilter(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs focus:border-primary focus:outline-none"
          >
            <option value="">All customers</option>
            {(customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {customerFilter && (
          <button
            type="button"
            onClick={() => setCustomerFilter("")}
            className="rounded border border-outline-variant px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading && <SkeletonGrid />}

      {isError && (
        <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load projects: {(error as Error).message}
        </div>
      )}

      {projects && projects.length === 0 && (
        <EmptyState onCreate={canCreate ? () => setCreateOpen(true) : undefined} />
      )}

      {projects && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <ProjectFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="group flex flex-col gap-3 rounded border border-outline-variant bg-surface-container-lowest p-5 transition-all hover:border-primary"
    >
      <div className="flex items-start justify-end gap-2">
        <ProjectStatusChip status={project.status} />
      </div>

      <h3 className="text-sm font-semibold leading-tight text-on-surface group-hover:text-primary">
        {project.name}
      </h3>

      {project.customer && (
        <p className="text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined align-middle text-[12px]">business</span>{" "}
          <span className="font-medium text-on-surface">{project.customer.name}</span>
        </p>
      )}

      {project.description && (
        <p className="line-clamp-2 text-xs text-on-surface-variant">
          {project.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-outline-variant pt-3 text-[11px] text-on-surface-variant">
        <span>
          TAM <span className="font-medium text-on-surface">{project.tam.username}</span>
        </span>
        <span className="font-mono">{project._count.tasks} tasks</span>
      </div>
    </Link>
  );
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="rounded border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center">
      <span className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant">
        folder_open
      </span>
      <p className="mb-4 text-sm text-on-surface-variant">No projects yet.</p>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-display text-xs font-bold text-on-primary hover:bg-primary-container"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Create your first project
        </button>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded border border-outline-variant bg-surface-container-low"
        />
      ))}
    </div>
  );
}
