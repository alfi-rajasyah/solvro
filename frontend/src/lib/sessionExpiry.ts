// Session-end warning (docs/archive/plans/application-review-2026-10-22.md, F-41).
// The session token is a JWT valid for a fixed time; the first 401 after it
// ends the session and loses a form in progress. The client reads the token's
// own `exp` claim (no signature check — the server is the authority, this is
// only a courtesy notice) and warns shortly before.

/** The warning appears this long before the token expires. */
export const SESSION_WARNING_LEAD_MS = 5 * 60_000;

/** Longest delay `setTimeout` accepts (a larger one fires at once). */
export const MAX_TIMER_MS = 2 ** 31 - 1;

export const SESSION_EXPIRY_MESSAGE =
  "Your session ends in a few minutes. Save your work, then sign in again.";

/** The token's `exp` claim as epoch milliseconds, or null if absent or malformed. */
export function decodeTokenExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof claims !== "object" || claims === null) return null;
    const exp = (claims as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** When the warning should appear (epoch ms), or null for a token without a usable `exp`. */
export function sessionWarningAtMs(
  token: string | null | undefined,
  leadMs: number = SESSION_WARNING_LEAD_MS,
): number | null {
  const exp = decodeTokenExpiryMs(token);
  return exp === null ? null : exp - leadMs;
}

/** True once the warning time has passed. A token without a usable `exp` never warns. */
export function isSessionWarningDue(
  token: string | null | undefined,
  nowMs: number,
  leadMs: number = SESSION_WARNING_LEAD_MS,
): boolean {
  const at = sessionWarningAtMs(token, leadMs);
  return at !== null && nowMs >= at;
}

/**
 * Runs `fn` at `atMs` (epoch ms). A delay beyond what `setTimeout` accepts is
 * re-armed in steps rather than firing early. Returns a cancel function.
 */
export function scheduleAt(atMs: number, fn: () => void, now: () => number = Date.now): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const arm = () => {
    if (cancelled) return;
    const remaining = atMs - now();
    if (remaining <= 0) {
      fn();
      return;
    }
    timer = setTimeout(arm, Math.min(remaining, MAX_TIMER_MS));
  };
  arm();
  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
