// State of the open offboarding handover dialog, and the one way its preview
// is reloaded. A reload that finishes after the dialog closed (a window-focus
// refetch racing a successful submit) is dropped instead of reopening it.
import { useCallback, useRef, useState } from "react";
import type { AdminUser, HandoverPreview } from "@/lib/queries";

export interface HandoverSession {
  user: AdminUser;
  preview: HandoverPreview;
}

export function useHandoverSession(fetchPreview: (userId: number) => Promise<HandoverPreview>) {
  const [session, setSession] = useState<HandoverSession | null>(null);
  const fetchRef = useRef(fetchPreview);
  fetchRef.current = fetchPreview;
  const openId = useRef<number | null>(null);
  openId.current = session?.user.id ?? null;

  const open = useCallback((user: AdminUser, preview: HandoverPreview) => {
    setSession({ user, preview });
  }, []);
  const close = useCallback(() => setSession(null), []);

  /** Resolves true once the dialog has a fresh preview; false when there is none to refresh or the fetch failed. */
  const reload = useCallback(async (): Promise<boolean> => {
    const id = openId.current;
    if (id === null) return false;
    try {
      const preview = await fetchRef.current(id);
      // Functional update: only a still-open dialog for the same user takes the result.
      setSession((prev) => (prev && prev.user.id === id ? { user: prev.user, preview } : prev));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { session, open, close, reload };
}
