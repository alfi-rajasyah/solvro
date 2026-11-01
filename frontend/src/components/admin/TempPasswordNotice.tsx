import { CopyTextButton } from "@/components/CopyTextButton";

/**
 * Result panel shown once after an admin resets a user's password: the
 * generated temporary password, with a copy button so it need not be selected
 * by hand (docs/archive/plans/application-review-2026-10-22.md, F-38).
 */
export function TempPasswordNotice({
  username,
  tempPassword,
  onDismiss,
}: {
  username: string;
  tempPassword: string;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-sm border border-tertiary/40 bg-tertiary/10 px-3 py-3 text-sm text-on-surface">
      <p className="font-display text-label-caps uppercase text-tertiary">
        Temporary password generated
      </p>
      <p className="mt-1">
        For <strong>{username}</strong>:{" "}
        <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-data-mono">{tempPassword}</code>{" "}
        <CopyTextButton label="Copy temporary password" getText={() => tempPassword} />
      </p>
      <p className="mt-1 text-on-surface-variant">
        Share this with the user via a secure channel. It will not be shown again.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 font-display text-sm text-on-surface-variant hover:text-on-surface font-semibold"
      >
        Dismiss
      </button>
    </div>
  );
}
