import { Link, useLocation } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";

/**
 * Catch-all for an unknown URL inside the app shell (the sidebar and top bar
 * stay), instead of silently redirecting to Overview
 * (docs/archive/plans/application-review-2026-10-22.md, F-45).
 */
export function NotFound() {
  const { pathname, search } = useLocation();
  return (
    <div className="mx-auto w-full max-w-xl pt-4 md:pt-12">
      <h1 className="mb-3 font-display text-h1 text-on-surface">Page not found</h1>
      <EmptyState
        icon="explore_off"
        message={
          <>
            Nothing lives at{" "}
            <code className="break-all rounded-sm bg-surface-container px-1.5 py-0.5 font-mono text-data-mono text-on-surface">
              {pathname}
              {search}
            </code>
            . The link may be mistyped, or the page has moved or been deleted.
          </>
        }
        action={
          <Link
            to="/overview"
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold text-on-primary primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">
              dashboard
            </span>
            Go to Overview
          </Link>
        }
      />
    </div>
  );
}
