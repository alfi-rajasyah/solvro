import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  type ProjectDetail,
  type ProjectStatus,
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

interface Props {
  open: boolean;
  onClose: () => void;
  /** When supplied, the form opens in edit mode for this project. */
  project?: ProjectDetail | null;
  onSaved?: (id: number) => void;
}

export function ProjectFormModal({ open, onClose, project, onSaved }: Props) {
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setSaId(project.saId);
      setTamId(project.tamId);
      setCustomerId(project.customerId ?? "");
      setStatus(project.status);
    } else {
      setName("");
      setDescription("");
      setSaId("");
      setTamId("");
      setCustomerId("");
      setStatus("PLANNING");
    }
  }, [open, project, user]);

  // SA / TAM dropdowns list all users — role names no longer gate who's
  // eligible to be assigned (admin's choice). Anti-self-clutter not done
  // here because useUsers() doesn't expose `active`.
  const sas = users ?? [];
  const tams = users ?? [];
  const canPickTam = user?.permissions?.includes("*") ?? false;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (saId === "") {
      setError("Solution Architect is required.");
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
          saId: Number(saId),
          tamId: tamId === "" ? undefined : Number(tamId),
          customerId: Number(customerId),
          status,
        });
        onSaved?.(project.id);
      } else {
        const created = await create.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          saId: Number(saId),
          tamId: tamId === "" ? undefined : Number(tamId),
          customerId: Number(customerId),
          status,
        });
        onSaved?.(created.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed.");
    }
  }

  const submitting = create.isPending || update.isPending;

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
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            autoFocus
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <Field label="Customer" required>
          <select
            value={customerId === "" ? "" : String(customerId)}
            onChange={(e) =>
              setCustomerId(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Solution Architect" required>
            <select
              value={saId === "" ? "" : String(saId)}
              onChange={(e) => setSaId(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select SA…</option>
              {sas.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {canPickTam && (
          <Field label="Technical Account Manager">
            <select
              value={tamId === "" ? "" : String(tamId)}
              onChange={(e) => setTamId(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
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

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container"
          >
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label}
        {required && <span className="ml-1 text-error">*</span>}
      </span>
      {children}
    </label>
  );
}
