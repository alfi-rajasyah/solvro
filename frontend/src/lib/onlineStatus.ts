import { useSyncExternalStore } from "react";

// Browser connectivity as an external store. `navigator.onLine` is only a hint
// (true means "a network interface exists", not "the API answers"), but its
// `false` is reliable, and that is the case the app must name: the API is
// NetworkOnly in the service worker, so with the network down every read fails
// with a generic message
// (docs/archive/plans/application-review-2026-10-22.md, F-39).
// The logic takes its environment as parameters so it can be unit-tested in
// the node environment; the hook below binds it to `window`/`navigator`.

export const OFFLINE_MESSAGE = "You are offline. Changes cannot be saved until the connection returns.";

/** Treat an unknown `navigator.onLine` (non-browser, very old engines) as online. */
export function readOnline(nav: { onLine?: boolean } | undefined): boolean {
  return nav?.onLine !== false;
}

/** Subscribe to the `online`/`offline` events on `target`; returns the unsubscribe. */
export function subscribeOnlineStatus(target: EventTarget, onChange: () => void): () => void {
  target.addEventListener("online", onChange);
  target.addEventListener("offline", onChange);
  return () => {
    target.removeEventListener("online", onChange);
    target.removeEventListener("offline", onChange);
  };
}

function subscribe(onChange: () => void): () => void {
  return subscribeOnlineStatus(window, onChange);
}

function getSnapshot(): boolean {
  return readOnline(navigator);
}

// Server render (tests, any future SSR) has no connectivity signal: online.
function getServerSnapshot(): boolean {
  return true;
}

/** `true` while the browser reports a connection; re-renders on change. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
