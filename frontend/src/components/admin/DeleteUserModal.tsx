// Admin "Delete user" dialog. A user who owns customers is deleted only
// together with a new owner for each of them, because an unowned customer is
// claimable by any TAM (docs/archive/plans/user-delete-customer-owner.md).
import { useEffect, useId, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { PersonSelect } from "@/components/admin/HandoverModal";
import { handoverReceivers } from "@/lib/handover";
import { useAdminDeleteUser, useUsers, type AdminUser } from "@/lib/queries";
import {
  buildDeleteUserBody,
  deleteUserErrorFrom,
  isOwnerDraftComplete,
  ownerDraftFor,
  type DeleteUserError,
  type OwnedCustomer,
  type OwnerDraft,
} from "@/lib/userDelete";

interface Props {
  user: AdminUser;
  /** The customers the user owns, from the handover preview. */
  customers: OwnedCustomer[];
  onClose: () => void;
  onDeleted: () => void;
  /** The server says the owned customers changed; the parent reloads them and resolves true on success. */
  onStale: () => Promise<boolean>;
}

export function DeleteUserModal({ user, customers, onClose, onDeleted, onStale }: Props) {
  const uid = useId();
  const { data: allUsers, isPending: usersLoading, isError: usersFailed, refetch: refetchUsers } = useUsers();
  const deleteUser = useAdminDeleteUser();
  const [draft, setDraft] = useState<OwnerDraft>(() => ownerDraftFor(customers));
  const [error, setError] = useState<DeleteUserError | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);

  // A reloaded list keeps the owners already chosen for customers still on it.
  useEffect(() => {
    setDraft((prev) => ownerDraftFor(customers, prev));
  }, [customers]);

  const receivers = handoverReceivers(allUsers ?? [], user.id);
  const complete = isOwnerDraftComplete(customers, draft);
  const busy = deleteUser.isPending;

  async function submit() {
    if (!complete || busy) return;
    setError(null);
    setReloadFailed(false);
    try {
      await deleteUser.mutateAsync({ id: user.id, ...buildDeleteUserBody(customers, draft) });
      onDeleted();
    } catch (err) {
      const mapped = deleteUserErrorFrom(err);
      setError(mapped);
      if (mapped.stale) setReloadFailed(!(await onStale()));
    }
  }

  const generalError = error && error.customerId === undefined ? error.message : null;

  const body = (
    <div className="space-y-4" data-testid="delete-user-modal">
      <p>
        Permanently delete {user.username} ({user.email})? This cannot be undone.
      </p>

      {customers.length > 0 && (
        <section aria-labelledby={`${uid}-customers`} className="space-y-3">
          <h3 id={`${uid}-customers`} className="font-display text-sm font-semibold text-on-surface">
            Customers
          </h3>
          <p className="text-on-surface-variant">
            {user.username} owns {customers.length === 1 ? "1 customer" : `${customers.length} customers`}.
            Choose a new owner for each one. The new owner gets full access to the customer and its
            projects.
          </p>
          {usersLoading && (
            <p className="text-on-surface-variant" role="status">
              Loading people
            </p>
          )}
          {usersFailed && (
            <Alert variant="destructive" data-testid="delete-user-people-error">
              <AlertDescription>
                <span>Could not load the people list. </span>
                <button type="button" onClick={() => void refetchUsers()} className="font-semibold underline">
                  Try again
                </button>
              </AlertDescription>
            </Alert>
          )}
          {customers.map((c) => {
            const errId = `${uid}-c${c.id}-err`;
            const err = error?.customerId === c.id ? error.message : undefined;
            return (
              <div
                key={c.id}
                data-testid={`delete-user-customer-${c.id}`}
                className="rounded-sm border border-outline-variant bg-surface-container-lowest p-3"
              >
                <PersonSelect
                  label={`${c.name} owner`}
                  value={draft[c.id] ?? null}
                  onChange={(v) => setDraft((d) => ({ ...d, [c.id]: v }))}
                  users={receivers}
                  emptyLabel="Choose an owner"
                  required
                  invalid={!!err}
                  describedBy={err ? errId : undefined}
                  disabled={busy || usersLoading || usersFailed}
                  testId={`delete-user-owner-${c.id}`}
                />
                {err && (
                  <p id={errId} role="alert" className="mt-1 text-xs text-error">
                    {err}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {generalError && (
        <Alert variant="destructive" data-testid="delete-user-error">
          <AlertDescription>{generalError}</AlertDescription>
        </Alert>
      )}
      {reloadFailed && (
        <Alert variant="destructive">
          <AlertDescription>Could not reload the customer list. Close this dialog and try again.</AlertDescription>
        </Alert>
      )}
    </div>
  );

  return (
    <ConfirmModal
      open
      onClose={onClose}
      onConfirm={() => void submit()}
      title="Delete user"
      body={body}
      confirmLabel={customers.length > 0 ? "Move customers and delete" : "Delete"}
      confirmTone="danger"
      busy={busy}
      confirmDisabled={!complete}
      confirmTestId="delete-user-confirm"
    />
  );
}
