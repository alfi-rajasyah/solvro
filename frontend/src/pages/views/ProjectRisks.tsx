import { useMemo, useState } from "react";
import { useProjectContext } from "../ProjectDetail";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  RiskFormModal,
  scoreClass,
  scoreLevel,
} from "@/components/RiskFormModal";
import { hasPermission, useAuth } from "@/lib/auth";
import {
  type Risk,
  type RiskCategory,
  type RiskStatus,
  useDeleteRisk,
  useProjectRisks,
  useUpdateRisk,
} from "@/lib/queries";

const CATEGORY_LABEL: Record<RiskCategory, string> = {
  EXTERNAL: "External",
  INTERNAL: "Internal",
  TECHNICAL: "Technical",
  ORGANIZATIONAL: "Organizational",
  FINANCIAL: "Financial",
};

const STATUS_LABEL: Record<RiskStatus, string> = {
  OPEN: "Open",
  MITIGATED: "Mitigated",
  CLOSED: "Closed",
};

const STATUS_TONE: Record<RiskStatus, string> = {
  OPEN: "bg-error-container text-on-error-container",
  MITIGATED: "bg-amber-100 text-amber-800",
  CLOSED: "bg-emerald-100 text-emerald-700",
};

const CATEGORIES: (RiskCategory | "ALL")[] = [
  "ALL",
  "EXTERNAL",
  "INTERNAL",
  "TECHNICAL",
  "ORGANIZATIONAL",
  "FINANCIAL",
];

const STATUSES: (RiskStatus | "ALL")[] = ["ALL", "OPEN", "MITIGATED", "CLOSED"];

const SCALE = [1, 2, 3, 4, 5];

export function ProjectRisks() {
  const { project } = useProjectContext();
  const { user } = useAuth();
  const { data: risks, isLoading, isError, error } = useProjectRisks(project.id);
  const updateRisk = useUpdateRisk(project.id);
  const deleteRisk = useDeleteRisk(project.id);

  const canEdit = hasPermission(user, "project:write");

  const [categoryFilter, setCategoryFilter] = useState<RiskCategory | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<RiskStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Risk | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Risk | null>(null);

  const filtered = useMemo(() => {
    if (!risks) return [];
    const q = search.trim().toLowerCase();
    return risks
      .filter((r) => categoryFilter === "ALL" || r.category === categoryFilter)
      .filter((r) => statusFilter === "ALL" || r.status === statusFilter)
      .filter((r) =>
        q === ""
          ? true
          : r.description.toLowerCase().includes(q) ||
            (r.mitigationPlan ?? "").toLowerCase().includes(q) ||
            (r.contingencyPlan ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => b.probability * b.impact - a.probability * a.impact);
  }, [risks, categoryFilter, statusFilter, search]);

  const summary = useMemo(() => {
    const out = { high: 0, medium: 0, low: 0, open: 0 };
    for (const r of risks ?? []) {
      const s = r.probability * r.impact;
      if (s <= 8) out.low++;
      else if (s <= 15) out.medium++;
      else out.high++;
      if (r.status === "OPEN") out.open++;
    }
    return out;
  }, [risks]);

  if (isLoading) {
    return (
      <div className="h-64 animate-pulse rounded-sm border border-outline-variant bg-surface-container-low" />
    );
  }

  if (isError) {
    return (
      <div className="rounded-sm border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
        Could not load risks: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Stat label="High" value={summary.high} tone="high" />
          <Stat label="Medium" value={summary.medium} tone="medium" />
          <Stat label="Low" value={summary.low} tone="low" />
          <Stat label="Open" value={summary.open} />
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add risk
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-outline-variant bg-surface-container-lowest p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search description, mitigation, contingency…"
          className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-hidden sm:w-72"
        />
        <Select
          label="Category"
          value={categoryFilter}
          onChange={(v) => setCategoryFilter(v as RiskCategory | "ALL")}
          options={CATEGORIES.map((c) => ({
            value: c,
            label: c === "ALL" ? "All categories" : CATEGORY_LABEL[c],
          }))}
        />
        <Select
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as RiskStatus | "ALL")}
          options={STATUSES.map((s) => ({
            value: s,
            label: s === "ALL" ? "All statuses" : STATUS_LABEL[s],
          }))}
        />
        {(categoryFilter !== "ALL" || statusFilter !== "ALL" || search) && (
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("ALL");
              setStatusFilter("ALL");
              setSearch("");
            }}
            className="ml-auto rounded-sm px-2 py-1 font-display text-[12px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-primary"
          >
            Reset
          </button>
        )}
      </div>

      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="rounded-sm border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center text-on-surface-variant">
            <p className="text-sm">
              {risks && risks.length > 0
                ? "No risks match the current filters."
                : "No risks logged yet."}
            </p>
            {canEdit && risks && risks.length === 0 && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-3 rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-display text-xs font-bold text-on-surface hover:bg-surface-container"
              >
                Add the first risk
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-sm border border-outline-variant bg-surface-container-lowest md:block">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-left font-display text-label-caps uppercase tracking-widest text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="w-24 px-3 py-2 text-center">Prob</th>
                    <th className="w-24 px-3 py-2 text-center">Impact</th>
                    <th className="w-28 px-3 py-2 text-center">Score</th>
                    <th className="w-32 px-3 py-2">Status</th>
                    {canEdit && <th className="w-20 px-3 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {filtered.map((r) => (
                    <RiskRow
                      key={r.id}
                      risk={r}
                      canEdit={canEdit}
                      onEdit={() => setEditing(r)}
                      onDelete={() => setConfirmDelete(r)}
                      onChange={(patch) =>
                        updateRisk.mutate({ id: r.id, patch })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 md:hidden">
              {filtered.map((r) => (
                <RiskCard
                  key={r.id}
                  risk={r}
                  canEdit={canEdit}
                  onEdit={() => setEditing(r)}
                  onDelete={() => setConfirmDelete(r)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {(creating || editing) && (
        <RiskFormModal
          open={creating || editing !== null}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          projectId={project.id}
          risk={editing}
        />
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            deleteRisk.mutate(confirmDelete.id, {
              onSuccess: () => setConfirmDelete(null),
            });
          }
        }}
        title="Delete risk"
        body={
          confirmDelete ? (
            <p>
              Delete the risk{" "}
              <span className="font-semibold text-on-surface">
                "{truncate(confirmDelete.description, 80)}"
              </span>
              ? This cannot be undone.
            </p>
          ) : null
        }
        confirmLabel="Delete"
        confirmTone="warning"
        busy={deleteRisk.isPending}
      />
    </div>
  );
}

function RiskRow({
  risk,
  canEdit,
  onEdit,
  onDelete,
  onChange,
}: {
  risk: Risk;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (patch: { probability?: number; impact?: number; status?: RiskStatus }) => void;
}) {
  const score = risk.probability * risk.impact;
  return (
    <tr className="hover:bg-surface-container-low">
      <td className="max-w-md px-3 py-2 align-top">
        <button
          type="button"
          onClick={onEdit}
          className="block text-left text-sm font-medium text-on-surface hover:text-primary"
        >
          {risk.description}
        </button>
        {(risk.mitigationPlan || risk.contingencyPlan) && (
          <div className="mt-1 space-y-0.5 text-[12px] text-on-surface-variant">
            {risk.mitigationPlan && (
              <p className="line-clamp-2">
                <span className="font-display font-bold uppercase tracking-wider">
                  Mitigation:
                </span>{" "}
                {risk.mitigationPlan}
              </p>
            )}
            {risk.contingencyPlan && (
              <p className="line-clamp-2">
                <span className="font-display font-bold uppercase tracking-wider">
                  Contingency:
                </span>{" "}
                {risk.contingencyPlan}
              </p>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top text-xs text-on-surface-variant">
        {CATEGORY_LABEL[risk.category]}
      </td>
      <td className="px-3 py-2 align-top text-center">
        {canEdit ? (
          <select
            value={risk.probability}
            onChange={(e) => onChange({ probability: Number(e.target.value) })}
            className="rounded-sm border border-outline-variant bg-surface-container-lowest px-2 py-1 font-mono text-xs"
          >
            {SCALE.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono text-xs">{risk.probability}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top text-center">
        {canEdit ? (
          <select
            value={risk.impact}
            onChange={(e) => onChange({ impact: Number(e.target.value) })}
            className="rounded-sm border border-outline-variant bg-surface-container-lowest px-2 py-1 font-mono text-xs"
          >
            {SCALE.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono text-xs">{risk.impact}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div
          className={[
            "flex items-center justify-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs font-bold tabular-nums",
            scoreClass(score),
          ].join(" ")}
          title={`${risk.probability} × ${risk.impact} = ${score}`}
        >
          {score}
          <span className="font-display text-[10px] font-bold uppercase tracking-wider">
            {scoreLevel(score)}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        {canEdit ? (
          <select
            value={risk.status}
            onChange={(e) => onChange({ status: e.target.value as RiskStatus })}
            className={[
              "w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2 py-1 font-display text-[12px] font-bold uppercase tracking-wider",
              STATUS_TONE[risk.status],
            ].join(" ")}
          >
            {(Object.keys(STATUS_LABEL) as RiskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={[
              "inline-block rounded-sm px-2 py-0.5 font-display text-label-caps uppercase tracking-wider",
              STATUS_TONE[risk.status],
            ].join(" ")}
          >
            {STATUS_LABEL[risk.status]}
          </span>
        )}
      </td>
      {canEdit && (
        <td className="px-3 py-2 align-top text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary"
              aria-label="Edit risk"
            >
              <span className="material-symbols-outlined text-base">edit</span>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-sm p-1 text-on-surface-variant hover:bg-error-container hover:text-error"
              aria-label="Delete risk"
            >
              <span className="material-symbols-outlined text-base">delete</span>
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

function RiskCard({
  risk,
  canEdit,
  onEdit,
  onDelete,
}: {
  risk: Risk;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const score = risk.probability * risk.impact;
  return (
    <div className="rounded-sm border border-outline-variant bg-surface-container-lowest p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="block flex-1 text-left text-sm font-medium text-on-surface hover:text-primary"
        >
          {risk.description}
        </button>
        <div
          className={[
            "shrink-0 rounded-sm border px-2 py-1 font-mono text-xs font-bold tabular-nums",
            scoreClass(score),
          ].join(" ")}
        >
          {score}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-on-surface-variant">
          {CATEGORY_LABEL[risk.category]}
        </span>
        <span className="text-on-surface-variant">
          P{risk.probability} · I{risk.impact}
        </span>
        <span
          className={[
            "rounded-sm px-2 py-0.5 font-display text-label-caps uppercase tracking-wider",
            STATUS_TONE[risk.status],
          ].join(" ")}
        >
          {STATUS_LABEL[risk.status]}
        </span>
      </div>
      {canEdit && (
        <div className="mt-2 flex justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary"
            aria-label="Edit risk"
          >
            <span className="material-symbols-outlined text-base">edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-sm p-1 text-on-surface-variant hover:bg-error-container hover:text-error"
            aria-label="Delete risk"
          >
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-on-surface-variant">
      <span className="font-display font-bold uppercase tracking-wider">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-outline-variant bg-surface-container-lowest px-2 py-1 text-sm text-on-surface focus:border-primary focus:outline-hidden"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "high" | "medium" | "low";
}) {
  const toneClass =
    tone === "high"
      ? "border-error/40 bg-error-container text-on-error-container"
      : tone === "medium"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : tone === "low"
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-outline-variant bg-surface-container-lowest text-on-surface-variant";
  return (
    <div
      className={[
        "rounded-sm border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wider",
        toneClass,
      ].join(" ")}
    >
      <span className="mr-2 font-mono text-sm tabular-nums">{value}</span>
      {label}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
