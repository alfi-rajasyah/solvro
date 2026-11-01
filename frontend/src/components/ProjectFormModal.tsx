import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { useAuth } from "@/lib/auth";
import { fieldErrorsFrom, formErrorMessage } from "@/lib/formErrors";
import { isOwnerOnlyError, saveErrorMessage } from "@/lib/ownerAccess";
import { PROJECT_STATUS_LABEL, taskStatusOptions } from "@/lib/labels";
import {
  type ProjectDetail,
  type ProjectStatus,
  type WipStatus,
  type WipLimits,
  useCreateProject,
  useCustomers,
  useUpdateProject,
  useUsers,
} from "@/lib/queries";

const PROJECT_STATUSES: ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];

const WIP_COLUMNS = taskStatusOptions.filter(
  (o): o is { value: WipStatus; label: string } => o.value !== "CANCELLED",
);

// Request fields this form always shows a server message under (F-34); any
// other rejected field is listed in the alert instead. `tamId` joins them only
// while its picker is on screen (see `inlineErrorFields` in the component).
const INLINE_ERROR_FIELDS = [
  "name",
  "description",
  "customerId",
  "saId",
  "status",
  "wipLimits",
] as const;

// Form-local representation: each column's limit as the literal <input>
// string value ("" = no limit) so the field can be edited freely without
// fighting number coercion on every keystroke.
type WipLimitsForm = Record<WipStatus, string>;

function wipLimitsToForm(limits: WipLimits | null | undefined): WipLimitsForm {
  return {
    TODO: limits?.TODO != null ? String(limits.TODO) : "",
    IN_PROGRESS: limits?.IN_PROGRESS != null ? String(limits.IN_PROGRESS) : "",
    DONE: limits?.DONE != null ? String(limits.DONE) : "",
  };
}

function formToWipLimits(form: WipLimitsForm): WipLimits {
  const toLimit = (v: string): number | null => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  return { TODO: toLimit(form.TODO), IN_PROGRESS: toLimit(form.IN_PROGRESS), DONE: toLimit(form.DONE) };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** When supplied, the form opens in edit mode for this project. */
  project?: ProjectDetail | null;
  onSaved?: (id: number) => void;
  /**
   * Edit mode only: false for someone with access through membership or the SA assignment alone,
   * who may not change the TAM, customer or SA (server: 403 owner_only). The
   * customer and SA selects are then read-only and none of the three is sent.
   */
  canChangeOwnership?: boolean;
}

export function ProjectFormModal({
  open,
  onClose,
  project,
  onSaved,
  canChangeOwnership = true,
}: Props) {
  const { user } = useAuth();
  const isEdit = Boolean(project);
  const { data: users } = useUsers();
  const { data: customers } = useCustomers();

  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? 0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saId, setSaId] = useState<number | "">("");
  const [tamId, setTamId] = useState<number | "">("");
  const [customerId, setCustomerId] = useState<number | "">("");
  const [status, setStatus] = useState<ProjectStatus>("PLANNING");
  const [wipLimits, setWipLimits] = useState<WipLimitsForm>(wipLimitsToForm(null));
  const [excludeFromPortfolio, setExcludeFromPortfolio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Server validation messages by request field (docs/archive/plans/application-review-2026-10-22.md, F-34).
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setSaId(project.saId ?? "");
      setTamId(project.tamId);
      setCustomerId(project.customerId ?? "");
      setStatus(project.status);
      setWipLimits(wipLimitsToForm(project.wipLimits));
      setExcludeFromPortfolio(project.excludeFromPortfolio);
    } else {
      setName("");
      setDescription("");
      setSaId("");
      setTamId("");
      setCustomerId("");
      setStatus("PLANNING");
      setWipLimits(wipLimitsToForm(null));
      setExcludeFromPortfolio(false);
    }
    // Seed on open / project switch only — `project` gets a fresh identity on
    // every 30 s refetch (and any task edit moves its `health`), and re-running
    // this reset wipes in-progress input (docs/archive/plans/collaboration-and-sharing.md).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  // SA / TAM dropdowns list all users — role names no longer gate who's
  // eligible to be assigned (admin's choice). Anti-self-clutter not done
  // here because useUsers() doesn't expose `active`.
  const sas = users ?? [];
  const tams = users ?? [];
  const canPickTam = user?.permissions?.includes("*") ?? false;
  const showTamPicker = canPickTam && canChangeOwnership;
  const inlineErrorFields: readonly string[] = showTamPicker
    ? [...INLINE_ERROR_FIELDS, "tamId"]
    : INLINE_ERROR_FIELDS;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (customerId === "") {
      setError("Customer is required.");
      return;
    }

    try {
      if (isEdit && project) {
        await update.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          ...(canChangeOwnership
            ? {
                tamId: tamId === "" ? undefined : Number(tamId),
                customerId: Number(customerId),
                // Changing the SA is owner-only too (port decision M-2,
                // docs/archive/plans/solvro-cust-port-plan.md §10).
                saId: saId === "" ? null : Number(saId),
              }
            : {}),
          status,
          wipLimits: formToWipLimits(wipLimits),
          excludeFromPortfolio,
        });
        onSaved?.(project.id);
      } else {
        const created = await create.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          saId: saId === "" ? undefined : Number(saId),
          tamId: tamId === "" ? undefined : Number(tamId),
          customerId: Number(customerId),
          status,
          wipLimits: formToWipLimits(wipLimits),
          excludeFromPortfolio,
        });
        onSaved?.(created.id);
      }
      onClose();
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(
        isOwnerOnlyError(err)
          ? saveErrorMessage(err, "Save failed.")
          : formErrorMessage(err, "Save failed.", inlineErrorFields),
      );
    }
  }

  const submitting = create.isPending || update.isPending;

  const errorId = (field: string) => `project-form-${field}-error`;
  // aria-invalid + aria-describedby for a field the server rejected.
  const invalidProps = (field: string) =>
    fieldErrors[field]
      ? { "aria-invalid": true as const, "aria-describedby": errorId(field) }
      : {};

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit project" : "New project"}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-outline-variant px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="project-form"
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create project"}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required error={fieldErrors.name} errorId={errorId("name")}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            autoFocus
            {...invalidProps("name")}
            className={inputClass(fieldErrors.name)}
          />
        </Field>

        <Field label="Description" error={fieldErrors.description} errorId={errorId("description")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            {...invalidProps("description")}
            className={inputClass(fieldErrors.description)}
          />
        </Field>

        <Field label="Customer" required error={fieldErrors.customerId} errorId={errorId("customerId")}>
          <select
            value={customerId === "" ? "" : String(customerId)}
            onChange={(e) =>
              setCustomerId(e.target.value === "" ? "" : Number(e.target.value))
            }
            disabled={isEdit && !canChangeOwnership}
            {...invalidProps("customerId")}
            className={`${inputClass(fieldErrors.customerId)} disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <option value="">
              {customers && customers.length === 0
                ? "No customers — create one in the Customers tab first"
                : "Select customer…"}
            </option>
            {(customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {/* A member may not see the customer in the list; keep it shown. */}
            {project?.customer && !(customers ?? []).some((c) => c.id === project.customer!.id) && (
              <option value={project.customer.id}>{project.customer.name}</option>
            )}
          </select>
          {isEdit && !canChangeOwnership && (
            <p className="mt-1 text-meta text-on-surface-variant">
              Only the project's TAM or the customer's owner can move it to another customer.
            </p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Solution Architect" error={fieldErrors.saId} errorId={errorId("saId")}>
            <select
              value={saId === "" ? "" : String(saId)}
              onChange={(e) => setSaId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={isEdit && !canChangeOwnership}
              {...invalidProps("saId")}
              className={`${inputClass(fieldErrors.saId)} disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <option value="">No SA</option>
              {sas.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
            {isEdit && !canChangeOwnership && (
              <p className="mt-1 text-meta text-on-surface-variant">
                Only the project's TAM or the customer's owner can change the SA.
              </p>
            )}
          </Field>

          <Field label="Status" error={fieldErrors.status} errorId={errorId("status")}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              {...invalidProps("status")}
              className={inputClass(fieldErrors.status)}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {showTamPicker && (
          <Field label="Technical Account Manager" error={fieldErrors.tamId} errorId={errorId("tamId")}>
            <select
              value={tamId === "" ? "" : String(tamId)}
              onChange={(e) => setTamId(e.target.value === "" ? "" : Number(e.target.value))}
              {...invalidProps("tamId")}
              className={inputClass(fieldErrors.tamId)}
            >
              <option value="">Defaults to current user</option>
              {tams.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="WIP limit — leave empty for none" error={fieldErrors.wipLimits} errorId={errorId("wipLimits")}>
          <div className="grid grid-cols-3 gap-3">
            {WIP_COLUMNS.map((col) => (
              <label key={col.value} className="block">
                <span className="mb-1 block text-xs text-on-surface-variant">
                  {col.label}
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={wipLimits[col.value]}
                  onChange={(e) =>
                    setWipLimits((prev) => ({ ...prev, [col.value]: e.target.value }))
                  }
                  placeholder="—"
                  {...invalidProps("wipLimits")}
                  className={inputClass(fieldErrors.wipLimits, true)}
                />
              </label>
            ))}
          </div>
        </Field>

        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={excludeFromPortfolio}
            onChange={(e) => setExcludeFromPortfolio(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
              Administrative project
            </span>
            <span className="block text-xs text-on-surface-variant">
              Exclude from portfolio roll-ups (Executive dashboard, Overview,
              overdue monitoring). The project stays fully usable here.
            </span>
          </span>
        </label>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>
    </Modal>
  );
}

function inputClass(error: string | undefined, compact = false): string {
  return `w-full rounded-lg border bg-surface-container-lowest text-sm text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30 ${
    compact ? "px-2 py-1.5" : "px-3 py-2"
  } ${error ? "border-error" : "border-outline-variant"}`;
}

function Field({
  label,
  required,
  error,
  errorId,
  children,
}: {
  label: string;
  required?: boolean;
  /** The server's validation message for this field, shown under the input. */
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
          {label}
          {required && <span className="ml-1 text-error">*</span>}
        </span>
        {children}
      </label>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
