import { FIELD_FOCUS, TOOLBAR_BUTTON_OUTLINE, TOOLBAR_BUTTON_PRIMARY, TOOLBAR_STAT } from "@/lib/utils";
import { useId, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { CHIP_BASE, Chip } from "@/components/StatusChip";
import { EmptyState } from "@/components/EmptyState";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { ApiError } from "@/lib/api";
import {
  type ServiceAssignmentInput,
  useCreateService,
  useServices,
} from "@/lib/queries";

export interface ServiceMappingListProps {
  /** Current saved set for the entity being edited (customer or project). */
  assignments: { serviceId: number; tools: string[] }[];
  /** Full-replace semantics: called with the complete next assignment list. */
  onSave: (next: ServiceAssignmentInput[]) => Promise<unknown>;
  canMutate: boolean;
  /**
   * Whether the inline "Add service" form is shown. Creating a catalogue
   * service is admin-only on the server (the catalogue is global), so this is
   * separate from `canMutate`, which only governs picking existing services.
   */
  canCreateService: boolean;
  saving: boolean;
  /** When provided (project context): badge these services as "Subscribed" and sort them first. */
  subscribedServiceIds?: Set<number>;
  /** Copy overrides so customer/project screens can keep distinct headings. */
  title: string;
  description: string;
  /**
   * What a ticked service is on this screen: "In this project" for a project
   * (the default), "Subscribed" for a customer. Names the count card and the two
   * groups of the table.
   */
  assignedLabel?: string;
  unassignedLabel?: string;
  /** Extra toolbar buttons from the host screen (the project's "Add all subscribed"). */
  toolbarActions?: ReactNode;
}

// Row template, shared by the header and every row so the columns line up.
// Phone: checkbox + one content column, everything else stacks under the name.
const ROW_BASE = "grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-3";
const ROW_COLS = "md:grid-cols-[16px_minmax(0,2fr)_minmax(0,3fr)]";
const ROW_COLS_WITH_SUBSCRIPTION = "md:grid-cols-[16px_minmax(0,2fr)_176px_minmax(0,3fr)]";

/**
 * Reusable service-catalogue mapping UI: checkbox rows to assign/unassign a
 * service, a chip-input tools editor per assigned row, and an inline
 * "Add service" form (admins only) so new catalogue entries don't require a
 * trip to Admin.
 *
 * Shared by CustomerDetail's Services tab and ProjectDetail's Services tab.
 */
export function ServiceMappingList({
  assignments,
  onSave,
  canMutate,
  canCreateService,
  saving,
  subscribedServiceIds,
  title,
  description,
  assignedLabel = "In this project",
  unassignedLabel = "Not in this project",
  toolbarActions,
}: ServiceMappingListProps) {
  const [adding, setAdding] = useState(false);
  const idPrefix = useId();
  const { data: catalogue, isLoading } = useServices();
  const create = useCreateService();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const assignmentByServiceId = useMemo(() => {
    const m = new Map<number, { serviceId: number; tools: string[] }>();
    for (const a of assignments) m.set(a.serviceId, a);
    return m;
  }, [assignments]);

  // Subscribed-first (when subscribedServiceIds is present), then by name.
  const sortedCatalogue = useMemo(() => {
    if (!catalogue) return [];
    const list = [...catalogue];
    list.sort((a, b) => {
      if (subscribedServiceIds) {
        const aSub = subscribedServiceIds.has(a.id) ? 0 : 1;
        const bSub = subscribedServiceIds.has(b.id) ? 0 : 1;
        if (aSub !== bSub) return aSub - bSub;
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [catalogue, subscribedServiceIds]);

  // Build the full assignment list for an idempotent PUT, optionally
  // overriding one service's tools or toggling a service's presence.
  function buildAssignments(
    serviceId: number,
    intent: "toggle" | "set-tools",
    tools?: string[],
  ): ServiceAssignmentInput[] {
    const out: ServiceAssignmentInput[] = [];
    const wasAssigned = assignmentByServiceId.has(serviceId);
    for (const a of assignments) {
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
      await onSave(buildAssignments(serviceId, "toggle"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update services.");
    }
  }

  async function setTools(serviceId: number, tools: string[]) {
    if (!canMutate) return;
    setError(null);
    try {
      await onSave(buildAssignments(serviceId, "set-tools", tools));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update tools.");
    }
  }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) return;
    try {
      const created = await create.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      await onSave([
        ...assignments.map((a) => ({ serviceId: a.serviceId, tools: a.tools })),
        { serviceId: created.id, tools: [] },
      ]);
      setNewName("");
      setNewDesc("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create service.");
    }
  }

  const showSubscription = Boolean(subscribedServiceIds);
  const cols = showSubscription ? ROW_COLS_WITH_SUBSCRIPTION : ROW_COLS;
  // Ticked services first, as their own group: "what is on this project" is
  // the answer the tab exists to give. Each group keeps the sort above.
  const groups = [
    { key: "assigned", label: assignedLabel, rows: sortedCatalogue.filter((s) => assignmentByServiceId.has(s.id)) },
    { key: "unassigned", label: unassignedLabel, rows: sortedCatalogue.filter((s) => !assignmentByServiceId.has(s.id)) },
  ];
  const subscribedCount = subscribedServiceIds
    ? sortedCatalogue.filter((s) => subscribedServiceIds.has(s.id)).length
    : 0;

  return (
    <div className="space-y-3">
      <h2 className="sr-only">{title}</h2>

      {/* Toolbar: counts on the left, actions on the right, in the shared
          toolbar box (lib/utils.ts) like every other project tab. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <div className={TOOLBAR_STAT}>
            <span className="text-sm font-bold tabular-nums text-on-surface">{groups[0].rows.length}</span>
            {assignedLabel}
          </div>
          {showSubscription && (
            <div className={TOOLBAR_STAT}>
              <span className="text-sm font-bold tabular-nums text-on-surface">{subscribedCount}</span>
              Customer subscribes to
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {toolbarActions}
          {canMutate && canCreateService && (
            <button
              type="button"
              aria-expanded={adding}
              onClick={() => setAdding((v) => !v)}
              className={TOOLBAR_BUTTON_OUTLINE}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
              Add service
            </button>
          )}
        </div>
      </div>

      <p className="text-meta text-on-surface-variant">{description}</p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* New catalogue entry (admins). The catalogue is shared by every
          customer and project, so the form says so and stays closed until
          asked for. */}
      {adding && canMutate && canCreateService && (
        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-end gap-2 rounded-sm border border-outline-variant bg-surface-container-lowest p-3"
        >
          <label className="w-full md:min-w-[160px] md:flex-1">
            <span className="mb-1 block font-display text-label-caps uppercase text-on-surface-variant">
              Name
            </span>
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Penetration Testing"
              className={`h-8 w-full rounded-sm border border-outline-variant bg-surface px-2 text-sm ${FIELD_FOCUS}`}
            />
          </label>
          <label className="w-full md:min-w-[240px] md:flex-2">
            <span className="mb-1 block font-display text-label-caps uppercase text-on-surface-variant">
              Description
            </span>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              maxLength={1000}
              placeholder="Short blurb shown in the catalogue"
              className={`h-8 w-full rounded-sm border border-outline-variant bg-surface px-2 text-sm ${FIELD_FOCUS}`}
            />
          </label>
          <button type="button" onClick={() => setAdding(false)} className={TOOLBAR_BUTTON_OUTLINE}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || !newName.trim()}
            className={TOOLBAR_BUTTON_PRIMARY}
          >
            {create.isPending ? "Adding…" : "Add to catalogue"}
          </button>
          <p className="w-full text-meta text-on-surface-variant">
            Adds the service to the shared catalogue for every customer and project, and ticks it here.
          </p>
        </form>
      )}

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-sm border border-outline-variant bg-surface-container-low" />
      ) : !catalogue || catalogue.length === 0 ? (
        <EmptyState
          icon="category"
          message={
            canCreateService
              ? "No services yet. Use Add service to create the first one."
              : "No services yet. Ask an admin to add one."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-sm border border-outline-variant bg-surface-container-lowest">
          {/* Column labels (md and up; on a phone each row stacks and labels itself). */}
          <div
            aria-hidden="true"
            className={`${ROW_BASE} ${cols} hidden bg-surface-container-low py-2 font-display text-label-caps uppercase text-on-surface-variant md:grid`}
          >
            <span />
            <span>Service</span>
            {showSubscription && <span>Customer subscription</span>}
            <span>Tools</span>
          </div>

          {groups.map((group, groupIndex) => (
            <section key={group.key} aria-label={`${group.label}: ${group.rows.length}`}>
              <h3
                className={`border-outline-variant bg-surface-container-low/50 px-3 py-1.5 text-meta font-semibold text-on-surface-variant ${
                  groupIndex === 0 ? "md:border-t" : "border-t"
                }`}
              >
                {group.label} · <span className="tabular-nums">{group.rows.length}</span>
              </h3>
              {group.rows.length === 0 ? (
                <p className="border-t border-outline-variant px-3 py-3 text-meta text-on-surface-variant">
                  {group.key === "assigned"
                    ? canMutate
                      ? "Nothing here yet. Tick a service below to add it."
                      : "Nothing here yet."
                    : "Every service in the catalogue is ticked."}
                </p>
              ) : (
                <ul>
                  {group.rows.map((s) => {
                    const assignment = assignmentByServiceId.get(s.id);
                    const subscribed = subscribedServiceIds?.has(s.id) ?? false;
                    const checkboxId = `${idPrefix}-service-${s.id}`;
                    const locked = !s.active && !assignment;
                    return (
                      <li
                        key={s.id}
                        className={[
                          ROW_BASE,
                          cols,
                          "border-t border-outline-variant py-2.5",
                          assignment ? "bg-primary/5" : "",
                        ].join(" ")}
                      >
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={Boolean(assignment)}
                          disabled={!canMutate || saving || locked}
                          onChange={() => toggle(s.id)}
                          className={`mt-0.5 h-4 w-4 rounded-xs accent-primary ${FIELD_FOCUS} ${canMutate && !saving && !locked ? "cursor-pointer" : ""} ${locked ? "cursor-not-allowed" : ""}`}
                        />
                        <label
                          htmlFor={checkboxId}
                          className={`min-w-0 ${!s.active ? "opacity-70" : ""} ${locked ? "cursor-not-allowed" : canMutate ? "" : "cursor-default"}`}
                        >
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-on-surface">
                            {s.name}
                            {!s.active && <Chip tone="gray">Inactive</Chip>}
                          </span>
                          {s.description && (
                            <span className="block text-meta text-on-surface-variant">{s.description}</span>
                          )}
                        </label>
                        {showSubscription && (
                          <div className={`col-start-2 md:col-start-auto ${subscribed ? "" : "hidden md:block"}`}>
                            {subscribed && <Chip tone="blue">Subscribed</Chip>}
                          </div>
                        )}
                        <div className={`col-start-2 min-w-0 md:col-start-auto ${assignment ? "" : "hidden md:block"}`}>
                          {assignment && (
                            <ToolsEditor
                              serviceName={s.name}
                              tools={assignment.tools}
                              canMutate={canMutate}
                              saving={saving}
                              onChange={(next) => setTools(s.id, next)}
                              labelClassName="md:hidden"
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolsEditor({
  serviceName,
  tools,
  canMutate,
  saving,
  onChange,
  labelClassName = "",
}: {
  /** Extra classes for the "Tools used" label (the table hides it where a column header says it). */
  labelClassName?: string;
  /** One editor renders per assigned service, so the service names its input. */
  serviceName: string;
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
      <p className={`mb-1 font-display text-label-caps uppercase text-on-surface-variant ${labelClassName}`}>
        Tools used
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {tools.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className={`${CHIP_BASE} bg-surface-container-high text-on-surface`}
          >
            {t}
            {canMutate && (
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={saving}
                aria-label={`Remove ${t}`}
                className="-mr-0.5 inline-flex rounded-full text-on-surface-variant hover:text-on-surface disabled:opacity-50"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[13px]">close</span>
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
            aria-label={`Add tool for ${serviceName}`}
            className={`h-[22px] w-44 rounded-sm border border-outline-variant bg-surface px-2 text-meta ${FIELD_FOCUS} disabled:opacity-50`}
          />
        )}
        {!canMutate && tools.length === 0 && (
          <span className="text-meta italic text-on-surface-variant">
            No tools listed.
          </span>
        )}
      </div>
    </div>
  );
}
