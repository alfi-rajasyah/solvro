import { TOOLBAR_BUTTON_PRIMARY } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProjectFormModal } from "@/components/ProjectFormModal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Chip, ProjectStatusChip } from "@/components/StatusChip";
import {
  createFilter,
  Filters,
  type Filter,
  type FilterFieldConfig,
} from "@/components/reui/filters";
import { useNewParam } from "@/hooks/useNewParam";
import { hasPermission, useAuth } from "@/lib/auth";
import { IS_ANY_OF_OPERATOR, IS_OPERATOR } from "@/lib/filterOperators";
import { fmtRange } from "@/lib/formatDate";
import { PROJECT_STATUS_LABEL, projectStatusOptions } from "@/lib/labels";
import { parseStatusParam, serialiseStatusParam } from "@/lib/projectStatusFilter";
import { type ProjectSummary, useCustomers, useProjects } from "@/lib/queries";

const CUSTOMER_FILTER_FIELD = "customerId";
const STATUS_FILTER_FIELD = "status";

export function Projects() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdParam = searchParams.get("customerId");
  const customerFilter = customerIdParam ? Number(customerIdParam) : undefined;

  const { data: customers } = useCustomers();
  const { data: allProjects, isLoading, isError, error } = useProjects(
    customerFilter ? { customerId: customerFilter } : {},
  );
  // Status filter is client-side over the list already fetched (ANDs with the
  // server-side customer filter). The raw param is memoised on its string so
  // the derived array is referentially stable.
  const statusParam = searchParams.get(STATUS_FILTER_FIELD);
  const statusFilter = useMemo(() => parseStatusParam(statusParam), [statusParam]);
  const projects = useMemo(
    () =>
      allProjects && statusFilter.length > 0
        ? allProjects.filter((p) => statusFilter.includes(p.status))
        : allProjects,
    [allProjects, statusFilter],
  );
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = hasPermission(user, "project:write");
  useNewParam("1", canCreate, () => setCreateOpen(true));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setCustomerFilter is re-created every render; the effect must only re-run when the filter or the customer list changes.
  }, [customerFilter, customers]);

  const activeCustomer = customers?.find((c) => c.id === customerFilter);

  function setStatusFilter(statuses: readonly string[]) {
    const next = new URLSearchParams(searchParams);
    const value = serialiseStatusParam(statuses);
    if (value === null) next.delete(STATUS_FILTER_FIELD);
    else next.set(STATUS_FILTER_FIELD, value);
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    next.delete("customerId");
    next.delete(STATUS_FILTER_FIELD);
    setSearchParams(next, { replace: true });
  }

  // Two-field Filters config. Customer maps onto the ?customerId= contract and
  // Status onto ?status=. Each offers only the affirmative operator ("is" /
  // "is any of") — the URL can only express "filtered to these" or "no
  // filter", so the negating/empty operators the vendored fields default to
  // have no URL state and are dropped. Values are strings (customer ids are
  // stringified) so both fields share one Filter value type.
  const filterFields: FilterFieldConfig<string>[] = useMemo(
    () => [
      {
        key: CUSTOMER_FILTER_FIELD,
        label: "Customer",
        type: "select",
        operators: IS_OPERATOR,
        options: (customers ?? []).map((c) => ({ value: String(c.id), label: c.name })),
      },
      {
        key: STATUS_FILTER_FIELD,
        label: "Status",
        type: "multiselect",
        operators: IS_ANY_OF_OPERATOR,
        options: projectStatusOptions.map((o) => ({ value: o.value, label: o.label })),
      },
    ],
    [customers],
  );

  // Filters state is derived FROM the URL params (not an independent
  // useState) so the URL stays the single source of truth.
  const activeFilters: Filter<string>[] = useMemo(() => {
    const out: Filter<string>[] = [];
    if (customerFilter !== undefined) {
      out.push(createFilter<string>(CUSTOMER_FILTER_FIELD, "is", [String(customerFilter)]));
    }
    if (statusFilter.length > 0) {
      out.push(createFilter<string>(STATUS_FILTER_FIELD, "is_any_of", [...statusFilter]));
    }
    return out;
  }, [customerFilter, statusFilter]);

  // Every chip interaction (add, change value, remove) funnels back through
  // the URL setters — same set/remove + { replace: true } behaviour as before.
  // Deliberately plain functions: they close over the current searchParams
  // and must stay fresh each render.
  function handleFiltersChange(next: Filter<string>[]) {
    const customer = next.find((f) => f.field === CUSTOMER_FILTER_FIELD)?.values[0];
    const status = next.find((f) => f.field === STATUS_FILTER_FIELD)?.values ?? [];
    const customerNow = customer === undefined ? "" : Number(customer);
    if (customerNow !== (customerFilter ?? "")) setCustomerFilter(customerNow);
    else setStatusFilter(status);
  }

  const filtersActive = activeFilters.length > 0;
  const emptyFilterName = [
    activeCustomer ? `customer ${activeCustomer.name}` : null,
    statusFilter.length > 0
      ? `status ${statusFilter.map((s) => PROJECT_STATUS_LABEL[s]).join(" or ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
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
            className={TOOLBAR_BUTTON_PRIMARY}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
            New project
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filters
          filters={activeFilters}
          fields={filterFields}
          onChange={handleFiltersChange}
          size="sm"
          allowMultiple={false}
        />
        {projects && projects.length > 0 && (
          <span className="ml-auto font-mono text-meta text-on-surface-variant">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </span>
        )}
      </div>

      {isLoading && <SkeletonGrid />}

      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load projects: {(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {projects && projects.length === 0 && filtersActive && (
        <FilteredEmptyState filterName={emptyFilterName} onClear={clearFilters} />
      )}

      {projects && projects.length === 0 && !filtersActive && (
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
  const saInit = project.sa ? project.sa.username.slice(0, 2).toUpperCase() : null;
  const tamInit = project.tam.username.slice(0, 2).toUpperCase();
  const idBadge = `P-${String(project.id).padStart(3, "0")}`;
  const health = project.health;
  const done = health?.progress.done ?? 0;
  const total = health?.progress.total ?? project._count.tasks;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue = health?.overdueCount ?? 0;
  const openRisks = health?.openRiskCount ?? 0;
  const hasDates = health !== undefined && (health.startDate !== null || health.endDate !== null);

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group flex flex-col rounded-sm border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:border-primary"
    >
      {/* ID + status row */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="font-mono text-meta text-on-surface-variant">{idBadge}</span>
        <ProjectStatusChip status={project.status} />
      </div>

      {/* Title */}
      <h2 className="mb-1 truncate font-display text-sm font-bold leading-tight text-on-surface group-hover:text-primary">
        {project.name}
      </h2>

      {/* Description */}
      <p className="mb-3 line-clamp-2 min-h-[2.4rem] text-meta leading-snug text-on-surface-variant">
        {project.description ?? "No description."}
      </p>

      {/* Bottom row: customer + avatar stack + task count */}
      <div className="mt-auto flex items-center justify-between gap-2 text-meta text-on-surface-variant">
        <span className="min-w-0 flex-1 truncate">
          {project.customer?.name ?? <em className="opacity-70">No customer</em>}
        </span>
        <div className="flex -space-x-1.5">
          {project.sa && (
            <span
              title={`SA: ${project.sa.username}`}
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface-container-lowest text-meta font-bold ${avatarClass(project.sa.username)}`}
            >
              {saInit}
            </span>
          )}
          <span
            title={`TAM: ${project.tam.username}`}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface-container-lowest bg-primary text-meta font-bold text-on-primary"
          >
            {tamInit}
          </span>
        </div>
      </div>

      {/* Progress + health footer */}
      <div className="mt-3 border-t border-outline-variant pt-2 text-meta text-on-surface-variant">
        {total > 0 ? (
          <div className="flex items-center gap-2">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Project progress"
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-container-high"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 whitespace-nowrap tabular-nums">
              {pct}% · {done} of {total}
            </span>
          </div>
        ) : (
          <span>No tasks yet</span>
        )}

        {(hasDates || overdue > 0 || openRisks > 0 || project.baselineLockedAt) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {overdue > 0 && <Chip tone="rose">{overdue} overdue</Chip>}
            {openRisks > 0 && (
              <Chip tone="amber">
                {openRisks} open {openRisks === 1 ? "risk" : "risks"}
              </Chip>
            )}
            {project.baselineLockedAt && (
              <span className="flex items-center gap-1" title="Baseline locked">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-primary">bookmark</span>
                Baseline locked
              </span>
            )}
            {hasDates && (
              <span className="ml-auto whitespace-nowrap tabular-nums">
                {fmtRange(health.startDate, health.endDate)}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

const AVATAR_PALETTE = [
  "bg-chip-violet-bg text-chip-violet-text",
  "bg-chip-amber-bg text-chip-amber-text",
  "bg-chip-emerald-bg text-chip-emerald-text",
  "bg-secondary-container text-on-secondary-container",
];
function avatarClass(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="rounded-sm border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center">
      <span aria-hidden="true" className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant">
        folder_open
      </span>
      <p className="mb-4 text-sm text-on-surface-variant">No projects yet.</p>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 font-display text-xs font-bold text-on-primary hover:bg-primary-container"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
          Create your first project
        </button>
      )}
    </div>
  );
}

function FilteredEmptyState({ filterName, onClear }: { filterName: string; onClear: () => void }) {
  return (
    <div className="rounded-sm border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center">
      <span aria-hidden="true" className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant">
        filter_alt_off
      </span>
      <p className="mb-4 text-sm text-on-surface-variant">No projects match {filterName}.</p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-2 rounded-sm border border-outline-variant px-4 py-2 font-display text-xs font-bold text-on-surface hover:border-primary hover:text-primary"
      >
        Clear filters
      </button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-sm bg-surface-container-low"
        />
      ))}
    </div>
  );
}
