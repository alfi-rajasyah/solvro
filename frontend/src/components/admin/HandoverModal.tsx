// Offboarding handover: hands a leaver's work to other people and deactivates
// them in one call (docs/archive/plans/feedback-round-lifecycle-spec.md, F5).
import { useEffect, useId, useState } from "react";
import { Modal } from "@/components/Modal";
import { ProjectStatusChip } from "@/components/StatusChip";
import { Alert, AlertDescription } from "@/components/reui/alert";
import {
  HANDOVER_NOTE_MAX,
  applyAssigneeToAll,
  buildOffboardBody,
  handoverReceivers,
  handoverErrorFrom,
  initialDraft,
  isHandoverComplete,
  missingTamProjectIds,
  type HandoverDraft,
  type HandoverError,
  type ProjectDraft,
} from "@/lib/handover";
import {
  useAdminOffboardUser,
  useUsers,
  type AdminUser,
  type HandoverPreview,
  type UserSummary,
} from "@/lib/queries";
import { FIELD_FOCUS } from "@/lib/utils";

interface Props {
  open: boolean;
  user: AdminUser;
  preview: HandoverPreview;
  onClose: () => void;
  /** Called after a successful handover (the user is now inactive). */
  onDone: () => void;
  /** The server says the work changed; the parent reloads the preview and resolves true on success. */
  onStale: () => Promise<boolean>;
}

const SELECT_CLASS = `w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface ${FIELD_FOCUS}`;
const LABEL_CLASS = "mb-1 block text-label-caps uppercase text-on-surface-variant";

function toValue(id: number | null): string {
  return id === null ? "" : String(id);
}
function fromValue(v: string): number | null {
  return v === "" ? null : Number(v);
}

// Keeps choices already made for rows that still exist after a reload.
function mergeDraft(fresh: HandoverDraft, prev: HandoverDraft): HandoverDraft {
  const projects = { ...fresh.projects };
  for (const id of Object.keys(projects)) if (prev.projects[Number(id)]) projects[Number(id)] = prev.projects[Number(id)];
  const customers = { ...fresh.customers };
  for (const id of Object.keys(customers)) if (id in prev.customers) customers[Number(id)] = prev.customers[Number(id)];
  return { projects, customers, dealsPicId: prev.dealsPicId };
}

export function PersonSelect({
  label,
  value,
  onChange,
  users,
  emptyLabel,
  required,
  describedBy,
  invalid,
  disabled,
  testId,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  users: UserSummary[];
  emptyLabel: string;
  required?: boolean;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={LABEL_CLASS}>
        {label}
        {required && <span className="ml-1 text-error">*</span>}
      </span>
      <select
        value={toValue(value)}
        onChange={(e) => onChange(fromValue(e.target.value))}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        data-testid={testId}
        className={SELECT_CLASS}
      >
        <option value="">{emptyLabel}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username}
          </option>
        ))}
      </select>
    </label>
  );
}

function RowError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-error">
      {message}
    </p>
  );
}

export function HandoverModal({ open, user, preview, onClose, onDone, onStale }: Props) {
  const uid = useId();
  const { data: allUsers } = useUsers();
  const offboard = useAdminOffboardUser();
  const [draft, setDraft] = useState<HandoverDraft>(() => initialDraft(preview));
  const [error, setError] = useState<HandoverError | null>(null);
  // After a stale error: whether the preview reload succeeded.
  const [reload, setReload] = useState<"idle" | "busy" | "ok" | "failed">("idle");

  // Reset on open; on a reloaded preview keep the choices for surviving rows.
  useEffect(() => {
    if (!open) return;
    setDraft((prev) => mergeDraft(initialDraft(preview), prev));
  }, [open, preview]);
  useEffect(() => {
    if (open) {
      setError(null);
      setReload("idle");
    }
  }, [open, user.id]);

  const receivers = handoverReceivers(allUsers ?? [], user.id);
  const picReceivers = receivers.filter((u) => u.pipelineAccess);
  const complete = isHandoverComplete(preview, draft);
  const missingTams = new Set(missingTamProjectIds(preview, draft));
  const busy = offboard.isPending;
  const tamHintId = `${uid}-tam-hint`;

  function patchProject(id: number, patch: Partial<ProjectDraft>) {
    setDraft((d) => ({ ...d, projects: { ...d.projects, [id]: { ...d.projects[id], ...patch } } }));
  }

  async function reloadPreview() {
    setReload("busy");
    setReload((await onStale()) ? "ok" : "failed");
  }

  async function submit() {
    if (!complete || busy) return;
    setError(null);
    setReload("idle");
    try {
      await offboard.mutateAsync({ id: user.id, body: buildOffboardBody(preview, draft) });
      onDone();
    } catch (err) {
      const mapped = handoverErrorFrom(err);
      setError(mapped);
      if (mapped.stale) void reloadPreview();
    }
  }

  const rowErr = (projectId: number) => (error?.projectId === projectId ? error.message : undefined);
  const generalError =
    error && error.projectId === undefined && error.customerId === undefined && !error.deals
      ? error.message
      : null;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Hand over ${user.username}'s work`}
      widthClass="max-w-2xl"
      footer={
        <>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            disabled={busy}
            className="rounded-sm border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!complete || busy}
            data-testid="handover-submit"
            className="rounded-sm bg-error px-4 py-1.5 text-xs font-semibold text-on-error hover:bg-error/90 disabled:opacity-60"
          >
            {busy ? "Working…" : "Hand over and deactivate"}
          </button>
        </>
      }
    >
      <div className="space-y-5" data-testid="handover-modal">
        <p className="text-sm text-on-surface-variant">
          {user.username} still holds work. Choose who takes it over; {user.username} is
          deactivated once you confirm. Task status does not change.
        </p>

        {preview.projects.length > 0 && (
          <section aria-labelledby={`${uid}-projects`} className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 id={`${uid}-projects`} className="font-display text-sm font-semibold text-on-surface">
                Projects
              </h3>
              <label className="block w-full sm:w-56">
                <span className={LABEL_CLASS}>Apply to all</span>
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    setDraft((d) => applyAssigneeToAll(d, v === "none" ? null : Number(v)));
                  }}
                  disabled={busy}
                  data-testid="handover-apply-all"
                  className={SELECT_CLASS}
                >
                  <option value="">Set the assignee on every project…</option>
                  <option value="none">Unassigned</option>
                  {receivers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {preview.projects.map((p) => {
              const d = draft.projects[p.id];
              if (!d) return null;
              const errId = `${uid}-p${p.id}-err`;
              const err = rowErr(p.id);
              const roles = [p.isTam ? "TAM" : null, p.isSa ? "SA" : null].filter(Boolean).join(" and ");
              return (
                <div
                  key={p.id}
                  data-testid={`handover-project-${p.id}`}
                  role="group"
                  aria-label={`Project ${p.name}`}
                  className="space-y-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-semibold text-on-surface">{p.name}</span>
                    <ProjectStatusChip status={p.status} />
                    {p.customerName && (
                      <span className="text-meta text-on-surface-variant">{p.customerName}</span>
                    )}
                  </div>
                  <p className="text-meta text-on-surface-variant">
                    {[
                      `${p.openTasks} open ${p.openTasks === 1 ? "task" : "tasks"}`,
                      `${p.openEpics} open ${p.openEpics === 1 ? "epic" : "epics"}`,
                      roles ? `${user.username} is ${roles}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PersonSelect
                      label="Tasks and epics go to"
                      value={d.assignTasksTo}
                      onChange={(v) => patchProject(p.id, { assignTasksTo: v })}
                      users={receivers}
                      emptyLabel="Unassigned"
                      describedBy={err ? errId : undefined}
                      disabled={busy}
                      testId={`handover-assignee-${p.id}`}
                    />
                    {p.isTam && (
                      <PersonSelect
                        label="New TAM"
                        value={d.newTamId}
                        onChange={(v) => patchProject(p.id, { newTamId: v })}
                        users={receivers}
                        emptyLabel="Choose a TAM…"
                        required
                        invalid={error?.projectId === p.id}
                        describedBy={[err ? errId : null, missingTams.size > 0 ? tamHintId : null].filter(Boolean).join(" ") || undefined}
                        disabled={busy}
                        testId={`handover-tam-${p.id}`}
                      />
                    )}
                    {p.isSa && (
                      <PersonSelect
                        label="New SA"
                        value={d.newSaId}
                        onChange={(v) => patchProject(p.id, { newSaId: v })}
                        users={receivers}
                        emptyLabel="No SA"
                        describedBy={err ? errId : undefined}
                        disabled={busy}
                        testId={`handover-sa-${p.id}`}
                      />
                    )}
                  </div>
                  <label className="block">
                    <span className={LABEL_CLASS}>Handover note (internal)</span>
                    <textarea
                      value={d.note}
                      onChange={(e) => patchProject(p.id, { note: e.target.value })}
                      maxLength={HANDOVER_NOTE_MAX}
                      rows={2}
                      disabled={busy}
                      data-testid={`handover-note-${p.id}`}
                      className={SELECT_CLASS}
                    />
                  </label>
                  <RowError id={errId} message={err} />
                </div>
              );
            })}
          </section>
        )}

        {preview.customers.length > 0 && (
          <section aria-labelledby={`${uid}-customers`} className="space-y-3">
            <h3 id={`${uid}-customers`} className="font-display text-sm font-semibold text-on-surface">
              Customers
            </h3>
            {preview.customers.map((c) => {
              const errId = `${uid}-c${c.id}-err`;
              const err = error?.customerId === c.id ? error.message : undefined;
              return (
                <div
                  key={c.id}
                  data-testid={`handover-customer-${c.id}`}
                  className="rounded-sm border border-outline-variant bg-surface-container-lowest p-3"
                >
                  <PersonSelect
                    label={`${c.name} owner`}
                    value={draft.customers[c.id] ?? null}
                    onChange={(v) => setDraft((d) => ({ ...d, customers: { ...d.customers, [c.id]: v } }))}
                    users={receivers}
                    emptyLabel="No owner"
                    invalid={!!err}
                    describedBy={err ? errId : undefined}
                    disabled={busy}
                    testId={`handover-owner-${c.id}`}
                  />
                  <RowError id={errId} message={err} />
                </div>
              );
            })}
          </section>
        )}

        {preview.openDeals > 0 && (
          <section aria-labelledby={`${uid}-pipeline`} className="space-y-3">
            <h3 id={`${uid}-pipeline`} className="font-display text-sm font-semibold text-on-surface">
              Pipeline
            </h3>
            <div className="rounded-sm border border-outline-variant bg-surface-container-lowest p-3">
              <PersonSelect
                label={`PIC for ${preview.openDeals} open ${preview.openDeals === 1 ? "deal" : "deals"}`}
                value={draft.dealsPicId}
                onChange={(v) => setDraft((d) => ({ ...d, dealsPicId: v }))}
                users={picReceivers}
                emptyLabel="Unassigned"
                invalid={!!error?.deals}
                describedBy={error?.deals ? `${uid}-deals-err` : undefined}
                disabled={busy}
                testId="handover-deals-pic"
              />
              <RowError id={`${uid}-deals-err`} message={error?.deals ? error.message : undefined} />
            </div>
          </section>
        )}

        {!complete && missingTams.size > 0 && (
          <p id={tamHintId} className="text-sm text-on-surface-variant">
            Choose a new TAM for every project {user.username} leads to continue.
          </p>
        )}

        {generalError && (
          <Alert variant="destructive" data-testid="handover-error">
            <AlertDescription>
              {generalError}
              {reload === "ok" && " The list has been reloaded; review it and try again."}
            </AlertDescription>
          </Alert>
        )}

        {reload === "failed" && (
          <Alert variant="destructive" data-testid="handover-reload-error">
            <AlertDescription>
              <span>Could not reload the list. </span>
              <button
                type="button"
                onClick={() => void reloadPreview()}
                className="font-semibold underline"
              >
                Try again
              </button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Modal>
  );
}
