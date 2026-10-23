import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Where the boundary sits — printed with the error so logs say which subtree failed. */
  scope?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render-time exception so one bad row or one failed lazy chunk
 * shows a recoverable panel instead of unmounting the whole app to a blank
 * page (docs/archive/plans/application-review-2026-10-22.md, F-07). Mounted
 * twice: around the root in main.tsx, and around the routed page inside the
 * Shell (keyed on the path, so it resets on navigation) so the sidebar and
 * top bar survive a page-level failure.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Solvro] render error in ${this.props.scope ?? "app"}`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="m-4 rounded-sm border border-error/40 bg-error-container/40 p-6 text-on-surface"
      >
        <p className="font-display text-lg font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          This part of the page could not be displayed. Reload to try again; if it keeps happening,
          tell an admin what you were doing.
        </p>
        <p className="mt-2 font-mono text-meta text-on-surface-variant">{this.state.error.message}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded-sm bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
          <button
            type="button"
            className="rounded-sm border border-outline-variant px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
