import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";
import { ApiError } from "@/lib/api";
import {
  type CustomerSummary,
  useCreateCustomer,
  useUpdateCustomer,
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

  const [name, setName] = useState("");
  const [accountManager, setAccountManager] = useState("");
  const [solutionArchitect, setSolutionArchitect] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (customer) {
      setName(customer.name);
      setAccountManager(customer.accountManager ?? "");
      setSolutionArchitect(customer.solutionArchitect ?? "");
      setDescription(customer.description ?? "");
    } else {
      setName("");
      setAccountManager("");
      setSolutionArchitect("");
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
            className="rounded px-3 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="customer-form"
            disabled={submitting}
            className="rounded bg-primary px-4 py-1.5 font-display text-xs font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
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
            className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Account Manager">
            <input
              type="text"
              value={accountManager}
              onChange={(e) => setAccountManager(e.target.value)}
              maxLength={200}
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>
          <Field label="Solution Architect">
            <input
              type="text"
              value={solutionArchitect}
              onChange={(e) => setSolutionArchitect(e.target.value)}
              maxLength={200}
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>
        </div>

        <Field label="Description" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={5000}
            className="w-full resize-y rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        {error && (
          <div
            role="alert"
            className="rounded border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container"
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
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label}
        {required && <span className="ml-1 text-error">*</span>}
      </span>
      {children}
    </label>
  );
}
