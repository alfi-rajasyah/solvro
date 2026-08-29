import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { ApiError } from "@/lib/api";
import {
  type CustomerSummary,
  useCreateCustomer,
  useUpdateCustomer,
  useUsers,
} from "@/lib/queries";

interface Props {
  open: boolean;
  onClose: () => void;
  customer?: CustomerSummary | null;
}

export function CustomerFormModal({ open, onClose, customer }: Props) {
  const isEdit = Boolean(customer);
  const create = useCreateCustomer();
  const update = useUpdateCustomer(customer?.id ?? 0);
  const { data: users } = useUsers();

  const [name, setName] = useState("");
  const [accountManager, setAccountManager] = useState("");
  const [solutionArchitect, setSolutionArchitect] = useState("");
  const [tam, setTam] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Solution Architect dropdown lists all users — role names no longer
  // gate eligibility. Account Manager is a free-text field — AMs may
  // not have user accounts in this system at all (external sales
  // contacts, etc.). TAM shares the same options list (`useUsers()` — no
  // `active` flag on `UserSummary` today, so there's nothing to filter).
  const solutionArchitectOptions = useMemo(
    () => users ?? [],
    [users],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (customer) {
      setName(customer.name);
      setAccountManager(customer.accountManager ?? "");
      setSolutionArchitect(customer.solutionArchitect ?? "");
      setTam(customer.tamId != null ? String(customer.tamId) : "");
      setDescription(customer.description ?? "");
    } else {
      setName("");
      setAccountManager("");
      setSolutionArchitect("");
      setTam("");
      setDescription("");
    }
  }, [open, customer]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    const payload = {
      name: name.trim(),
      accountManager: accountManager.trim() || undefined,
      solutionArchitect: solutionArchitect.trim() || undefined,
      // Always sent (never omitted) so clearing the select back to
      // "— none —" actually unassigns the TAM instead of being dropped.
      tamId: tam ? Number(tam) : null,
      description: description.trim(),
    };
    try {
      if (isEdit && customer) {
        await update.mutateAsync(payload);
      } else {
        await create.mutateAsync(payload);
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
      title={isEdit ? "Edit customer" : "New customer"}
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
            form="customer-form"
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-on-primary hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create customer"}
          </button>
        </>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            autoFocus
            className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Account Manager">
            <input
              type="text"
              value={accountManager}
              onChange={(e) => setAccountManager(e.target.value)}
              maxLength={200}
              placeholder="Free text — anyone, internal or external"
              className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
            />
          </Field>
          <Field label="Solution Architect">
            <select
              value={solutionArchitect}
              onChange={(e) => setSolutionArchitect(e.target.value)}
              className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— None —</option>
              {solutionArchitectOptions.map((u) => (
                <option key={u.id} value={u.username}>
                  {u.username} ({u.role})
                </option>
              ))}
              {solutionArchitect &&
                !solutionArchitectOptions.some((u) => u.username === solutionArchitect) && (
                  <option value={solutionArchitect}>{solutionArchitect} (current)</option>
                )}
            </select>
          </Field>
          <Field label="TAM">
            <select
              value={tam}
              onChange={(e) => setTam(e.target.value)}
              className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— none —</option>
              {solutionArchitectOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={5000}
            className="w-full resize-y rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
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
  children: ReactNode;
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
