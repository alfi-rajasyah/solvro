import { useSyncExternalStore } from "react";

// "A new version is available" notice, kept framework-light: a module-level
// flag plus a listener set, read through `useSyncExternalStore`.
//
// The PWA is configured `registerType: "autoUpdate"` (vite.config.ts), so the
// generated service worker skips waiting and claims clients at once, and
// `virtual:pwa-register` never calls `onNeedRefresh` in that mode. Its default
// reaction to the new worker taking over is an unannounced
// `window.location.reload()`, which would discard whatever the user was typing.
// main.tsx passes `onNeedReload` instead, which lands here and shows a banner;
// the user reloads when ready. The same banner covers a lazy chunk that fails
// to load because a deploy replaced it (Vite's `vite:preloadError` event)
// (docs/archive/plans/application-review-2026-10-22.md, F-40).

export const UPDATE_MESSAGE = "A new version of Solvro is available.";

type Listener = () => void;

const listeners = new Set<Listener>();
let updateReady = false;
let dismissed = false;

function emit(): void {
  for (const l of [...listeners]) l();
}

export function subscribeSwUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the notice should currently be visible. */
export function getSwUpdateSnapshot(): boolean {
  return updateReady && !dismissed;
}

/** A newer version is installed (or an old chunk is gone): show the notice. */
export function notifyUpdateReady(): void {
  if (updateReady) return;
  updateReady = true;
  emit();
}

/** Hide the notice for the rest of this page's life. */
export function dismissUpdate(): void {
  if (dismissed) return;
  dismissed = true;
  emit();
}

/** Test seam: back to the initial state without touching subscribers. */
export function resetSwUpdateForTests(): void {
  updateReady = false;
  dismissed = false;
  emit();
}

/**
 * Re-check for a new version on an interval. Browsers only look for a new
 * service worker on navigation (and at most daily), so a tab left open for days
 * would never notice a deploy. Failures (offline) are ignored; the next tick retries.
 */
export function scheduleUpdateChecks(
  registration: { update: () => Promise<unknown> } | undefined,
  intervalMs = 30 * 60 * 1000,
): () => void {
  if (!registration) return () => {};
  const id = setInterval(() => {
    registration.update().catch(() => {});
  }, intervalMs);
  return () => clearInterval(id);
}

/**
 * Vite fires `vite:preloadError` when a dynamic import's chunk 404s, which is
 * what an old tab sees after a deploy. Surface the notice; the failing import
 * still rejects, so its own caller reports the error too.
 */
export function listenForPreloadErrors(target: EventTarget): () => void {
  target.addEventListener("vite:preloadError", notifyUpdateReady);
  return () => target.removeEventListener("vite:preloadError", notifyUpdateReady);
}

/** Visible-notice flag for React. */
export function useSwUpdate(): { available: boolean; dismiss: () => void; reload: () => void } {
  const available = useSyncExternalStore(subscribeSwUpdate, getSwUpdateSnapshot, () => false);
  return { available, dismiss: dismissUpdate, reload: () => window.location.reload() };
}
