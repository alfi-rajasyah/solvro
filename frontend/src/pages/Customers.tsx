import { useState } from "react";
import { Link } from "react-router-dom";
import { CustomerFormModal } from "@/components/CustomerFormModal";
import { EmptyState } from "@/components/EmptyState";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  type CustomerSummary,
  useCustomers,
  useDeleteCustomer,
} from "@/lib/queries";

export function Customers() {
  const { user } = useAuth();
  const { data: customers, isLoading, isError, error } = useCustomers();
  const deleteCustomer = useDeleteCustomer();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canMutate = user?.role === "TAM" || user?.role === "ADMIN";

  async function handleDelete(c: CustomerSummary) {
    if (!confirm(`Delete customer "${c.name}"? Linked projects keep their tasks but lose the customer link.`)) return;
    setDeleteError(null);
    try {
      await deleteCustomer.mutateAsync(c.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-h1 text-on-surface">Customers</h1>
          <p className="text-sm text-on-surface-variant">
            Customer database. Every project is mapped to a customer for cross-account
            visibility and reporting.
          </p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-display text-xs font-bold text-on-primary transition-colors hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Customer
          </button>
        )}
      </div>

      {deleteError && (
        <div className="mb-4 rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          {deleteError}
        </div>
      )}

      {isLoading && <SkeletonGrid />}

      {isError && (
        <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
          Could not load customers: {(error as Error).message}
        </div>
      )}

      {customers && customers.length === 0 && (
        <EmptyState
          icon="business"
          message="No customers yet."
          action={
            canMutate ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-display text-xs font-bold text-on-primary hover:bg-primary-container"
              >
                <span className="material-symbols-outlined text-base">add</span>
                Add your first customer
              </button>
            ) : null
          }
        />
      )}

      {customers && customers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {customers.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              canMutate={canMutate}
              onEdit={() => setEditing(c)}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}

      <CustomerFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <CustomerFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        customer={editing}
      />
    </div>
  );
}

function CustomerCard({
  customer,
  canMutate,
  onEdit,
  onDelete,
}: {
  customer: CustomerSummary;
  canMutate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Link
      to={`/customers/${customer.id}`}
      className="flex flex-col gap-3 rounded border border-outline-variant bg-surface-container-lowest p-5 transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10 font-display text-sm font-bold text-primary">
          {customer.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
          chevron_right
        </span>
      </div>

      <div>
        <h3 className="text-sm font-semibold leading-tight text-on-surface">{customer.name}</h3>
        <div className="mt-1 space-y-0.5">
          {customer.accountManager && (
            <p className="text-[11px] text-on-surface-variant">
              <span className="font-display font-bold uppercase tracking-wider">AM:</span>{" "}
              {customer.accountManager}
            </p>
          )}
          {customer.solutionArchitect && (
            <p className="text-[11px] text-on-surface-variant">
              <span className="font-display font-bold uppercase tracking-wider">SA:</span>{" "}
              {customer.solutionArchitect}
            </p>
          )}
        </div>
      </div>

      {customer.description && (
        <p className="line-clamp-2 text-[11px] text-on-surface-variant">
          {customer.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-outline-variant pt-3">
        <span
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[11px] text-on-surface-variant"
        >
          <Link
            to={`/projects?customerId=${customer.id}`}
            className="hover:text-primary"
          >
            {customer._count.projects} project
            {customer._count.projects === 1 ? "" : "s"}
          </Link>
        </span>
      </div>

      {canMutate && (
        <div
          className="flex items-center gap-1 border-t border-outline-variant pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onEdit();
            }}
            className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-primary"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="rounded px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
          >
            Delete
          </button>
        </div>
      )}
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded border border-outline-variant bg-surface-container-low"
        />
      ))}
    </div>
  );
}
