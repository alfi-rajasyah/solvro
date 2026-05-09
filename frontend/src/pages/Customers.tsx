import { useState } from "react";
import { Link } from "react-router-dom";
import { CustomerFormModal } from "@/components/CustomerFormModal";
import { EmptyState } from "@/components/EmptyState";
import { ApiError } from "@/lib/api";
import { hasPermission, useAuth } from "@/lib/auth";
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

  const canMutate = hasPermission(user, "project:write");

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
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-on-surface">Customers</h1>
          <p className="text-sm text-on-surface-variant">
            Customer database. Every project is mapped to a customer for cross-account
            visibility and reporting.
          </p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New customer
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
  const init = customer.name.slice(0, 2).toUpperCase();
  return (
    <Link
      to={`/customers/${customer.id}`}
      className="group flex flex-col rounded border border-outline-variant bg-surface-container-lowest p-4 shadow-card transition-colors hover:border-primary"
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded font-display text-base font-bold text-white"
          style={{ background: avatarColor(customer.name) }}
        >
          {init}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-bold leading-tight text-on-surface group-hover:text-primary">
            {customer.name}
          </h3>
          {customer.accountManager && (
            <p className="truncate text-[11px] text-on-surface-variant">
              AM: {customer.accountManager}
            </p>
          )}
        </div>
      </div>

      {customer.description && (
        <p className="mb-3 line-clamp-2 text-[12px] leading-snug text-on-surface-variant">
          {customer.description}
        </p>
      )}

      {/* Metric grid */}
      <div className="mt-auto grid grid-cols-2 gap-y-1 text-[12px]">
        <span className="text-on-surface-variant">Projects</span>
        <span className="text-right font-mono tabular-nums">{customer._count.projects}</span>
        {customer.solutionArchitect && (
          <>
            <span className="text-on-surface-variant">SA lead</span>
            <span className="truncate text-right font-mono text-[11px]" title={customer.solutionArchitect}>
              {customer.solutionArchitect}
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center justify-between border-t border-outline-variant pt-2">
        <Link
          to={`/projects?customerId=${customer.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-on-surface-variant hover:text-primary"
        >
          View projects →
        </Link>
        {canMutate && (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onEdit();
              }}
              className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container hover:text-primary"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              className="rounded px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </Link>
  );
}

const AVATAR_PALETTE = ["#0d9488", "#7c3aed", "#dc2626", "#0ea5e9", "#9333ea", "#a78bfa", "#f59e0b", "#10b981", "#0058be"];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
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
