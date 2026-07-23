import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title?: string;
  message: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  icon = "inbox",
  title,
  message,
  action,
}: EmptyStateProps) {
  return (
    <div className="rounded-sm border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center">
      <span className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant">
        {icon}
      </span>
      {title && (
        <p className="mb-1 font-display text-sm font-semibold text-on-surface">
          {title}
        </p>
      )}
      <p className="mb-4 text-sm text-on-surface-variant">{message}</p>
      {action}
    </div>
  );
}
