import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OpportunityFormModal } from "@/components/OpportunityFormModal";
import { PipelineImportDialog } from "@/components/PipelineImportDialog";
import { PIPELINE_STAGES } from "@/components/pipeline/adapter";
import { isActiveDeal } from "@/components/pipeline/kpi";
import { PipelineKpiBar } from "@/components/pipeline/PipelineKpiBar";
import { SolvroPipelineKanban, type SolvroPipelineKanbanHandle } from "@/components/pipeline/SolvroPipelineKanban";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { hasPermission, useAuth } from "@/lib/auth";
import { isClosed } from "@/lib/pipelineFormat";
import { useOpportunities, type Opportunity } from "@/lib/queries";
import { PipelineClosed } from "@/pages/views/PipelineClosed";
import { PipelineList } from "@/pages/views/PipelineList";
import { PipelineQuarter } from "@/pages/views/PipelineQuarter";
import { PipelineSwimlane } from "@/pages/views/PipelineSwimlane";

// Stable empty-array constant — same convention PipelineList.tsx used to
// keep locally (pre-2026-09-25 self-fetch version) and Tasks.tsx's own
// `EMPTY_TASKS`: avoids a new array identity every render while `deals` is
// undefined/loading, which would otherwise needlessly re-run
// `useMemo`/`useReactTable`'s row-model memoization downstream.
const EMPTY_DEALS: Opportunity[] = [];

type ViewMode = "kanban" | "list" | "swimlane" | "quarter";
type DealsFilter = "active" | "closed";

// View-switcher shell (PRD §2.3's mockup toolbar row). M2 shipped this as a
// static, Kanban-only shell (all other buttons disabled, "Arrives in a
// later milestone" tooltip) — this task (M3 integration) wires all 4.
//
// Persistence: mirrors CustomerDetail.tsx's `?tab=` convention — the house
// pattern for a same-page view switcher (as opposed to ProjectDetail.tsx's
// tab convention, which is actually nested *routes*, not client state; that
// would mean adding /pipeline/kanban, /pipeline/list, etc. to App.tsx, out
// of this task's scoped files). "kanban" is the default and stays out of
// the URL, same as CustomerDetail omitting `?tab=overview`.
const VIEW_MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: "kanban", label: "Kanban", icon: "view_kanban" },
  { id: "list", label: "List", icon: "view_list" },
  { id: "swimlane", label: "Swimlane", icon: "view_agenda" },
  { id: "quarter", label: "Quarter", icon: "calendar_view_month" },
];

// Active/Closed switch (docs/plans/opportunity-flow-redesign.md §4.4, D11)
// — same `?deals=` functional setSearchParams pattern as `?view=` above.
// "active" is the default and stays out of the URL.
const DEALS_FILTERS: { id: DealsFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "closed", label: "Closed" },
];

function isViewMode(value: string | null): value is ViewMode {
  return VIEW_MODES.some((m) => m.id === value);
}

function isDealsFilter(value: string | null): value is DealsFilter {
  return DEALS_FILTERS.some((f) => f.id === value);
}

// Phase-review fix N3 — the Kanban board lost its own loading skeleton when
// it became prop-driven (SolvroPipelineKanban.tsx no longer self-fetches, so
// it has no `isLoading` of its own to branch on, and Pipeline.tsx doesn't
// know yet whether to mount SolvroPipelineKanban or PipelineClosed while the
// fetch is in flight). Same 6-column shape SolvroPipelineKanban.tsx used to
// render itself, now rendered here instead while Pipeline.tsx's own
// `useOpportunities()` is still loading.
function PipelineKanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {PIPELINE_STAGES.map((stage) => (
        <div
          key={stage}
          className="h-64 w-[85vw] shrink-0 animate-pulse rounded-xl bg-surface-container-low sm:w-72"
        />
      ))}
    </div>
  );
}

export function Pipeline() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, "pipeline:create");

  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<ViewMode>(() => {
    const v = searchParams.get("view");
    return isViewMode(v) ? v : "kanban";
  });
  const [dealsFilter, setDealsFilter] = useState<DealsFilter>(() => {
    const d = searchParams.get("deals");
    return isDealsFilter(d) ? d : "active";
  });

  // Honor ?view=/?deals= changes from external navigation (e.g. a future
  // deep link or the browser back/forward button) — same effect
  // CustomerDetail.tsx runs for its own ?tab= param.
  useEffect(() => {
    const v = searchParams.get("view");
    if (isViewMode(v) && v !== view) setView(v);
    const d = searchParams.get("deals");
    if (isDealsFilter(d) && d !== dealsFilter) setDealsFilter(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleViewChange(next: ViewMode) {
    setView(next);
    // Functional form — mutates the updater's own draft `URLSearchParams`
    // rather than the `searchParams` instance this render closed over
    // (React Router warns that a stale/mutated instance from `useState`
    // shouldn't be written back directly; the callback form always
    // operates on the current one).
    setSearchParams(
      (prev) => {
        if (next === "kanban") prev.delete("view");
        else prev.set("view", next);
        return prev;
      },
      { replace: true },
    );
  }

  function handleDealsFilterChange(next: DealsFilter) {
    setDealsFilter(next);
    setSearchParams(
      (prev) => {
        if (next === "active") prev.delete("deals");
        else prev.set("deals", next);
        return prev;
      },
      { replace: true },
    );
  }

  // Hoisted KPI bar (PRD §2.4: "shared toolbar and KPI bar stay mounted
  // across views") — SolvroPipelineKanban no longer mounts its own
  // PipelineKpiBar. This is also the ONE `useOpportunities()` call the
  // Kanban/List/Closed views now read through a `deals` prop instead of
  // fetching independently (2026-09-25 flow redesign, D11's Active/Closed
  // switch needs one shared source of truth for "which half of the list is
  // this deal in") — Swimlane/Quarter stay self-contained (their own scope
  // never changes with the switch; see their own header comments), so they
  // keep their own `useOpportunities()` call, which shares this same cache
  // entry (`pipelineKeys.list`) rather than firing a second network request.
  const { data: deals, isLoading, isError, error } = useOpportunities();
  const allDeals = deals ?? [];
  const activeDeals = useMemo(() => allDeals.filter(isActiveDeal), [allDeals]);
  const closedDeals = useMemo(() => allDeals.filter(isClosed), [allDeals]);
  const visibleDeals = dealsFilter === "active" ? activeDeals : closedDeals;

  // Funnel-strip scroll-to-column (PRD §2.3's mockup) only makes sense
  // against the Kanban view's columns while the ACTIVE board (
  // SolvroPipelineKanban) is actually mounted — on the Closed switch, the
  // Kanban tab renders `PipelineClosed` instead, which has no per-stage
  // column to scroll to. `kanbanRef` is populated only while
  // SolvroPipelineKanban is mounted (forwardRef), so
  // `kanbanRef.current?.scrollToStage(...)` would already be a silent no-op
  // in that case regardless — but `onFunnelStageClick` is still gated
  // explicitly (below) rather than relying on that no-op: `PipelineKpiBar`'s
  // own `FunnelStrip` uses whether the prop is present (not whether it does
  // anything) to decide `cursor-pointer` vs `cursor-default` and its
  // "scroll to column" aria-label — leaving it wired when the board isn't
  // mounted would keep advertising a working affordance that's actually inert.
  const kanbanRef = useRef<SolvroPipelineKanbanHandle>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-h2 text-on-surface">Pipeline</h1>
          <p className="text-sm text-on-surface-variant">Opportunity stages, at a glance.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-outline-variant" role="group">
            {VIEW_MODES.map((mode, idx) => {
              const active = mode.id === view;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleViewChange(mode.id)}
                  className={[
                    "inline-flex items-center gap-1.5 px-3 py-1.5 font-display text-xs font-semibold transition-colors",
                    idx > 0 ? "border-l border-outline-variant" : "",
                    active
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:bg-surface-container",
                  ].join(" ")}
                >
                  <span className="material-symbols-outlined text-base">{mode.icon}</span>
                  {mode.label}
                </button>
              );
            })}
          </div>

          <div
            className="inline-flex overflow-hidden rounded-lg border border-outline-variant"
            role="group"
            aria-label="Deal status"
          >
            {DEALS_FILTERS.map((f, idx) => {
              const active = f.id === dealsFilter;
              const count = f.id === "active" ? activeDeals.length : closedDeals.length;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleDealsFilterChange(f.id)}
                  className={[
                    "inline-flex items-center gap-1.5 px-3 py-1.5 font-display text-xs font-semibold transition-colors",
                    idx > 0 ? "border-l border-outline-variant" : "",
                    active
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:bg-surface-container",
                  ].join(" ")}
                >
                  {f.label} · {count}
                </button>
              );
            })}
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-outline-variant px-3 py-1.5 font-display text-label-caps uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-base">upload_file</span>
              Import
            </button>
          )}

          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 font-display text-label-caps uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
            >
              <span className="material-symbols-outlined text-base">add</span>
              New opportunity
            </button>
          )}
        </div>
      </div>

      {/* KPI tiles: their own skeleton while loading, an error Alert on
          failure, the real bar once loaded — unchanged 3-way split. */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-sm bg-surface-container-low" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load Pipeline metrics: {(error as Error).message}</AlertDescription>
        </Alert>
      ) : (
        <PipelineKpiBar
          deals={allDeals}
          onFunnelStageClick={
            view === "kanban" && dealsFilter === "active"
              ? (stage) => kanbanRef.current?.scrollToStage(stage)
              : undefined
          }
        />
      )}

      {/* Phase-review fix N3 — Kanban and List (the two views Pipeline.tsx
          now feeds a `deals` prop) get their own loading-shaped skeleton
          here rather than going blank; on `isError` they render nothing (the
          Alert above already reports the failure once). Swimlane/Quarter
          stay self-contained (own `useOpportunities()` call, same cache
          entry) and always render — they already show their own loading
          skeleton/error Alert internally, in sync with this same fetch. */}
      {!isError &&
        view === "kanban" &&
        (isLoading ? (
          <PipelineKanbanSkeleton />
        ) : dealsFilter === "active" ? (
          <SolvroPipelineKanban
            ref={kanbanRef}
            deals={activeDeals}
            onCreateOpportunity={canCreate ? () => setCreateOpen(true) : undefined}
          />
        ) : (
          <PipelineClosed deals={closedDeals} />
        ))}
      {!isError && view === "list" && (
        <PipelineList
          deals={isLoading ? EMPTY_DEALS : visibleDeals}
          closedView={dealsFilter === "closed"}
          isLoading={isLoading}
        />
      )}
      {view === "swimlane" && <PipelineSwimlane />}
      {view === "quarter" && <PipelineQuarter />}

      <OpportunityFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <PipelineImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
