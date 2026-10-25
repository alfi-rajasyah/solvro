import { OFFLINE_MESSAGE, useOnlineStatus } from "@/lib/onlineStatus";
import { UPDATE_MESSAGE, useSwUpdate } from "@/lib/swUpdate";

// Full-width notices in Shell's top rows, next to the boot-error banner. They
// are in normal flow, so each takes the same `shift` margin as <main>: without
// it the fixed sidebar covers their first words.
// Warning tone, not error: offline is a state to wait out, not a failure.
// Screen readers: a live region that mounts already holding its text is
// announced unreliably, so the banners carry no live role of their own;
// `ConnectionAnnouncer` is one always-mounted region whose text changes
// (docs/archive/plans/application-review-2026-10-22.md, F-39 and F-40).

const ROW =
  "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-sm text-on-surface transition-[margin] duration-200 ease-out";

export function OfflineNotice({ shift }: { shift: string }) {
  return (
    // aria-hidden: pure text, announced by ConnectionAnnouncer instead.
    <div aria-hidden="true" className={`${ROW} border-chip-amber-text/40 bg-chip-amber-bg ${shift}`}>
      <span className="material-symbols-outlined text-lg text-chip-amber-text" aria-hidden="true">
        cloud_off
      </span>
      <span className="min-w-0 flex-1">{OFFLINE_MESSAGE}</span>
    </div>
  );
}

/** Shows while the browser reports no connection; removes itself when it returns. */
export function OfflineBanner({ shift }: { shift: string }) {
  const online = useOnlineStatus();
  if (online) return null;
  return <OfflineNotice shift={shift} />;
}

export function UpdateNotice({
  shift,
  onReload,
  onDismiss,
}: {
  shift: string;
  onReload: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={`${ROW} border-outline-variant bg-surface-container-high ${shift}`}>
      <span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">
        system_update_alt
      </span>
      <span className="min-w-0 flex-1">{UPDATE_MESSAGE}</span>
      <button
        type="button"
        onClick={onReload}
        className="rounded-sm bg-primary px-2.5 py-0.5 text-sm font-semibold text-on-primary hover:bg-primary-container hover:text-on-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss update notice"
        className="inline-flex items-center justify-center rounded-sm text-on-surface-variant hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  );
}

/** Dismissible; appears when a newer build is installed or an old chunk is gone. */
export function UpdateBanner({ shift }: { shift: string }) {
  const { available, dismiss, reload } = useSwUpdate();
  if (!available) return null;
  return <UpdateNotice shift={shift} onReload={reload} onDismiss={dismiss} />;
}

/** Visually hidden live region; empty (but mounted) when there is nothing to say. */
export function LiveAnnouncement({ message }: { message: string }) {
  return (
    <div role="status" className="sr-only">
      {message}
    </div>
  );
}

/** Mount once in Shell: speaks the offline and update notices as they appear. */
export function ConnectionAnnouncer() {
  const online = useOnlineStatus();
  const { available } = useSwUpdate();
  const message = [online ? "" : OFFLINE_MESSAGE, available ? UPDATE_MESSAGE : ""].filter(Boolean).join(" ");
  return <LiveAnnouncement message={message} />;
}
