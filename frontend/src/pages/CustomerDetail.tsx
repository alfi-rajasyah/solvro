import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CustomerFormModal } from "@/components/CustomerFormModal";
import { EmptyState } from "@/components/EmptyState";
import { Tabs } from "@/components/Tabs";
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  type CustomerDetail as CustomerDetailType,
  type CustomerServiceAssignment,
  type ServiceAssignmentInput,
  useCustomer,
  useDeleteCustomer,
  useServices,
  useUpdateCustomerServices,
} from "@/lib/queries";

type Tab = "overview" | "services" | "topology" | "documents" | "org";

const TAB_ITEMS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "topology", label: "Topology" },
  { key: "org", label: "Organization Structure" },
  { key: "documents", label: "Documents" },
];

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const customerId = id ? Number(id) : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const canMutate = hasPermission(user, "project:write");

  const { data: customer, isLoading, isError, error } = useCustomer(customerId);
  const deleteCustomer = useDeleteCustomer();
  const [editOpen, setEditOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (() => {
    const t = searchParams.get("tab");
    return TAB_ITEMS.some((x) => x.key === t) ? (t as Tab) : "overview";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);

  // Honor ?tab= changes from external navigation (e.g. project sidebar Documents link).
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && TAB_ITEMS.some((x) => x.key === t) && t !== tab) {
      setTab(t as Tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleTabChange(next: Tab) {
    setTab(next);
    if (next === "overview") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", next);
    }
    setSearchParams(searchParams, { replace: true });
  }

  if (isLoading) {
    return (
      <div className="m-6 h-64 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
    );
  }
  if (isError || !customer) {
    return (
      <div className="m-6 rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
        Could not load customer{error ? `: ${(error as Error).message}` : "."}
      </div>
    );
  }

  async function handleDelete() {
    if (!customer) return;
    if (
      !confirm(
        `Delete customer "${customer.name}"? Linked projects keep their tasks but lose the customer link.`,
      )
    )
      return;
    setActionError(null);
    try {
      await deleteCustomer.mutateAsync(customer.id);
      navigate("/customers");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/customers"
          className="inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-primary"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          Customers
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-h1 text-on-surface">{customer.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-on-surface-variant">
              {customer.accountManager && (
                <span>
                  <span className="font-display font-bold uppercase tracking-wider">
                    AM:
                  </span>{" "}
                  {customer.accountManager}
                </span>
              )}
              {customer.solutionArchitect && (
                <span>
                  <span className="font-display font-bold uppercase tracking-wider">
                    SA:
                  </span>{" "}
                  {customer.solutionArchitect}
                </span>
              )}
              <span className="font-mono">
                {customer._count.projects} project
                {customer._count.projects === 1 ? "" : "s"}
              </span>
            </div>
            {customer.description && (
              <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-on-surface-variant">
                {customer.description}
              </p>
            )}
          </div>
          {canMutate && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface hover:border-primary hover:text-primary"
              >
                <span className="material-symbols-outlined text-base">edit</span>
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteCustomer.isPending}
                className="inline-flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:border-error hover:text-error disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">delete</span>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          {actionError}
        </div>
      )}

      <Tabs items={TAB_ITEMS} active={tab} onChange={handleTabChange} />

      <div>
        {tab === "overview" && (
          <OverviewTab
            customer={customer}
            canMutate={canMutate}
            onEdit={() => setEditOpen(true)}
          />
        )}
        {tab === "services" && (
          <ServicesTab customer={customer} canMutate={canMutate} />
        )}
        {tab === "topology" && (
          <EmptyState
            icon="hub"
            title="Topology"
            message="Network topology view will live here once we wire it up."
          />
        )}
        {tab === "documents" && (
          <EmptyState
            icon="description"
            title="Documents"
            message="Document attachments will live here once uploads are implemented."
          />
        )}
        {tab === "org" && (
          <EmptyState
            icon="account_tree"
            title="Organization Structure"
            message="Customer org chart will live here once roles + reports are modelled."
          />
        )}
      </div>

      <CustomerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer}
      />
    </div>
  );
}

function OverviewTab({
  customer,
  canMutate,
  onEdit,
}: {
  customer: CustomerDetailType;
  canMutate: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-6">
      <ProfileCompletionCard
        customer={customer}
        canMutate={canMutate}
        onEdit={onEdit}
      />

      <ResourceSection icon="category" title="Services">
        {customer.services.length === 0 ? (
          <p className="text-[12px] text-on-surface-variant">
            No services mapped yet. Assign them from the Services tab.
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/60">
            {customer.services.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface">{a.service.name}</p>
                  {a.service.description && (
                    <p className="text-[11px] text-on-surface-variant">
                      {a.service.description}
                    </p>
                  )}
                </div>
                <div className="flex max-w-[60%] shrink-0 flex-wrap justify-end gap-1">
                  {a.tools.length === 0 ? (
                    <span className="text-[11px] italic text-on-surface-variant">
                      No tools listed
                    </span>
                  ) : (
                    a.tools.map((t, i) => (
                      <span
                        key={`${t}-${i}`}
                        className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary"
                      >
                        {t}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ResourceSection>

      <ResourceSection icon="hub" title="Topology" soon>
        <p className="text-[12px] text-on-surface-variant">
          No network topology configured. The Topology tab will host the diagram once
          this feature is built.
        </p>
      </ResourceSection>

      <ResourceSection icon="account_tree" title="Organization Structure" soon>
        <p className="text-[12px] text-on-surface-variant">
          Customer org chart not yet captured. The Organization Structure tab will show
          roles and reporting lines once the model is in place.
        </p>
      </ResourceSection>

      <div>
        <h2 className="mb-2 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
          Projects
        </h2>
        {customer.projects.length === 0 ? (
          <EmptyState
            icon="assignment"
            title="No projects yet"
            message="When projects are linked to this customer, they'll appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded border border-outline-variant bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-outline-variant bg-surface-container-low font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">TAM</th>
                  <th className="px-3 py-2">SA</th>
                  <th className="px-3 py-2 text-right">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {customer.projects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-outline-variant/60 last:border-0 hover:bg-surface-container-low/50"
                  >
                    <td className="px-3 py-2">
                      <Link
                        to={`/projects/${p.id}`}
                        className="font-medium text-on-surface hover:text-primary"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-surface-container-low px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-on-surface-variant">{p.tam.username}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{p.sa.username}</td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] text-on-surface-variant">
                      {p._count.tasks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceSection({
  icon,
  title,
  soon,
  children,
}: {
  icon: string;
  title: string;
  soon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">
            {icon}
          </span>
          <h3 className="font-display text-[12px] font-bold uppercase tracking-wider text-on-surface">
            {title}
          </h3>
        </div>
        {soon && (
          <span className="rounded bg-surface-container px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
            Soon
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function ProfileCompletionCard({
  customer,
  canMutate,
  onEdit,
}: {
  customer: CustomerDetailType;
  canMutate: boolean;
  onEdit: () => void;
}) {
  const items: Array<{
    label: string;
    done: boolean;
    hint: string;
    actionLabel?: string;
    onAction?: () => void;
  }> = [
    {
      label: "Description",
      done: customer.description.trim().length > 0,
      hint: "A short summary of the customer's business and engagement.",
      actionLabel: "Edit",
      onAction: onEdit,
    },
    {
      label: "Account Manager",
      done: Boolean(customer.accountManager),
      hint: "Name the AM responsible for this customer relationship.",
      actionLabel: "Edit",
      onAction: onEdit,
    },
    {
      label: "Solution Architect",
      done: Boolean(customer.solutionArchitect),
      hint: "Name the SA who designs solutions for this customer.",
      actionLabel: "Edit",
      onAction: onEdit,
    },
    {
      label: "Services",
      done: customer.services.length > 0,
      hint: "Map at least one service from the catalogue to this customer.",
    },
    {
      label: "Projects",
      done: customer.projects.length > 0,
      hint: "Linked projects will appear in the Overview table.",
    },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((doneCount / total) * 100);

  if (doneCount === total) {
    return (
      <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <span className="material-symbols-outlined mr-1 align-middle text-[18px]">
          check_circle
        </span>
        Profile complete — all sections filled in.
      </div>
    );
  }

  return (
    <div className="rounded border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[12px] font-bold uppercase tracking-wider text-on-surface">
            Customer profile completion
          </h2>
          <p className="text-[11px] text-on-surface-variant">
            Fill these sections to give TAMs and stakeholders a complete picture.
          </p>
        </div>
        <span className="font-mono text-xs text-on-surface-variant">
          {doneCount}/{total} · {pct}%
        </span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-surface-container-low"
          >
            <div className="flex min-w-0 items-start gap-2">
              <span
                className={[
                  "material-symbols-outlined mt-0.5 text-[18px]",
                  item.done ? "text-emerald-600" : "text-on-surface-variant",
                ].join(" ")}
              >
                {item.done ? "check_circle" : "radio_button_unchecked"}
              </span>
              <div className="min-w-0">
                <p
                  className={[
                    "text-sm font-medium",
                    item.done ? "text-on-surface-variant line-through" : "text-on-surface",
                  ].join(" ")}
                >
                  {item.label}
                </p>
                {!item.done && (
                  <p className="text-[11px] text-on-surface-variant">{item.hint}</p>
                )}
              </div>
            </div>
            {!item.done && canMutate && item.actionLabel && item.onAction && (
              <button
                type="button"
                onClick={item.onAction}
                className="shrink-0 rounded border border-outline-variant px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary"
              >
                {item.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServicesTab({
  customer,
  canMutate,
}: {
  customer: CustomerDetailType;
  canMutate: boolean;
}) {
  const { data: catalogue, isLoading } = useServices();
  const update = useUpdateCustomerServices(customer.id);
  const [error, setError] = useState<string | null>(null);

  const assignmentByServiceId = useMemo(() => {
    const m = new Map<number, CustomerServiceAssignment>();
    for (const a of customer.services) m.set(a.serviceId, a);
    return m;
  }, [customer.services]);

  // Build the full assignment list for an idempotent PUT, optionally
  // overriding one service's tools or toggling a service's presence.
  function buildAssignments(
    serviceId: number,
    intent: "toggle" | "set-tools",
    tools?: string[],
  ): ServiceAssignmentInput[] {
    const out: ServiceAssignmentInput[] = [];
    const wasAssigned = assignmentByServiceId.has(serviceId);
    for (const a of customer.services) {
      if (a.serviceId === serviceId && intent === "toggle" && wasAssigned) continue; // remove
      if (a.serviceId === serviceId && intent === "set-tools") {
        out.push({ serviceId, tools: tools ?? [] });
      } else {
        out.push({ serviceId: a.serviceId, tools: a.tools });
      }
    }
    if (intent === "toggle" && !wasAssigned) {
      out.push({ serviceId, tools: [] });
    }
    return out;
  }

  async function toggle(serviceId: number) {
    if (!canMutate) return;
    setError(null);
    try {
      await update.mutateAsync(buildAssignments(serviceId, "toggle"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update services.");
    }
  }

  async function setTools(serviceId: number, tools: string[]) {
    if (!canMutate) return;
    setError(null);
    try {
      await update.mutateAsync(buildAssignments(serviceId, "set-tools", tools));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update tools.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-[12px] font-bold uppercase tracking-wider text-on-surface">
          Service Catalogue Mapping
        </h2>
        <p className="text-[11px] text-on-surface-variant">
          Select the services this customer subscribes to and list the tools used for
          each — e.g. "Backup &amp; Restore" → Acronis, Veeam.
        </p>
      </div>

      {error && (
        <div className="rounded border border-error/30 bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="h-24 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
      ) : !catalogue || catalogue.length === 0 ? (
        <EmptyState
          icon="category"
          message="No services in the catalogue yet. An Admin can add them via the Admin → Service Catalogue tab."
        />
      ) : (
        <div className="space-y-1.5">
          {catalogue.map((s) => {
            const assignment = assignmentByServiceId.get(s.id);
            const assigned = Boolean(assignment);
            return (
              <div
                key={s.id}
                className={[
                  "rounded border px-3 py-2 transition-colors",
                  assigned
                    ? "border-primary bg-primary/5"
                    : "border-outline-variant bg-surface-container-lowest",
                  !s.active ? "opacity-60" : "",
                ].join(" ")}
              >
                <button
                  type="button"
                  disabled={!canMutate || update.isPending}
                  onClick={() => toggle(s.id)}
                  className={[
                    "flex w-full items-center justify-between gap-3 text-left text-sm",
                    canMutate ? "" : "cursor-default",
                  ].join(" ")}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={[
                        "material-symbols-outlined text-[18px]",
                        assigned ? "text-primary" : "text-on-surface-variant",
                      ].join(" ")}
                    >
                      {assigned ? "check_box" : "check_box_outline_blank"}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-on-surface">
                        {s.name}
                        {!s.active && (
                          <span className="ml-2 font-display text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                            inactive
                          </span>
                        )}
                      </p>
                      {s.description && (
                        <p className="truncate text-[11px] text-on-surface-variant">
                          {s.description}
                        </p>
                      )}
                    </div>
                  </div>
                </button>

                {assigned && assignment && (
                  <div className="mt-2 border-t border-outline-variant/60 pt-2">
                    <ToolsEditor
                      tools={assignment.tools}
                      canMutate={canMutate}
                      saving={update.isPending}
                      onChange={(next) => setTools(s.id, next)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolsEditor({
  tools,
  canMutate,
  saving,
  onChange,
}: {
  tools: string[];
  canMutate: boolean;
  saving: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (tools.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tools, trimmed]);
    setDraft("");
  }

  function remove(idx: number) {
    onChange(tools.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && tools.length > 0) {
      onChange(tools.slice(0, -1));
    }
  }

  return (
    <div>
      <p className="mb-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        Tools used
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {tools.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary"
          >
            {t}
            {canMutate && (
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={saving}
                aria-label={`Remove ${t}`}
                className="rounded-full text-primary/70 hover:text-primary disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            )}
          </span>
        ))}
        {canMutate && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => commit(draft)}
            disabled={saving}
            placeholder={tools.length === 0 ? "e.g. Acronis, Crowdstrike" : "Add tool…"}
            className="min-w-[140px] flex-1 rounded border border-outline-variant bg-surface px-2 py-0.5 text-[11px] focus:border-primary focus:outline-none disabled:opacity-50"
          />
        )}
        {!canMutate && tools.length === 0 && (
          <span className="text-[11px] italic text-on-surface-variant">
            No tools listed.
          </span>
        )}
      </div>
    </div>
  );
}
