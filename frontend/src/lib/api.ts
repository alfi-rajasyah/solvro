const BASE_URL = "/api";

const TOKEN_STORAGE_KEY = "solvro.token";

/** Fired on `window` when an authenticated request is answered with 401. */
export const UNAUTHENTICATED_EVENT = "solvro:unauthenticated";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON-encoded, except a `Blob` (or `File`), which is sent as raw bytes. */
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
  /** Per-request override of the default timeout, in ms (0 disables it). */
  timeoutMs?: number;
}

/**
 * Every request gives up after this long (docs/archive/plans/application-review-2026-10-22.md, F-15):
 * before, only the boot-time `/auth/me` call had a timeout, so a backend that
 * accepted the connection and never answered left every page on its loading
 * skeleton forever — no error state, nothing to retry.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * React Query retry rule for queries: one retry, and never for a 4xx — a
 * 404 or 403 is a definite answer, and retrying it only delayed the
 * not-found state behind a skeleton
 * (docs/archive/plans/application-review-2026-10-22.md, QA-04).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

/**
 * The signal `fetch` gets: the caller's own signal (React Query cancellation)
 * combined with the timeout. Exported for the unit test.
 */
export function requestSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): AbortSignal | undefined {
  if (timeoutMs <= 0) return callerSignal;
  const timeout = timeoutSignal(timeoutMs);
  if (!callerSignal) return timeout;
  return anySignal([callerSignal, timeout]);
}

// `AbortSignal.timeout` (Safari 16+) and `AbortSignal.any` (Safari 17.4+,
// Chrome 116+, Firefox 124+) are not polyfilled by the build. Older browsers
// — an iPhone on iOS 17.3 opening the PWA — must not lose every request to a
// TypeError, so both fall back to a plain AbortController.
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException("signal timed out", "TimeoutError")), ms);
  return controller.signal;
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await apiRequestWithHeaders<T>(path, options)).data;
}

/**
 * Same as `apiRequest`, but also returns the response headers, for the few
 * endpoints that carry data in one (e.g. `X-Total-Count` on `GET /tasks`).
 */
export async function apiRequestWithHeaders<T>(
  path: string,
  { method = "GET", body, signal, auth = true, timeoutMs }: RequestOptions = {},
): Promise<{ data: T; headers: Headers }> {
  const headers: Record<string, string> = {};
  const raw = body instanceof Blob;
  if (body !== undefined) headers["Content-Type"] = raw ? "application/octet-stream" : "application/json";

  const token = auth ? getToken() : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      signal: requestSignal(signal, timeoutMs),
    });
    // Reading the body is covered by the same signal — a timeout can also
    // strike while a slow response streams in.
    text = await res.text();
  } catch (err) {
    // A timeout surfaces as a DOMException named "TimeoutError"; give it a
    // message a page can show as-is. A caller-side abort passes through
    // unchanged so React Query keeps treating it as a cancellation.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, "The server did not answer in time. Check your connection and try again.", null);
    }
    // `fetch` rejects with a TypeError when the network itself fails (offline,
    // DNS, connection refused). Give pages a readable message instead of
    // "Failed to fetch" (docs/archive/plans/application-review-2026-10-22.md, QA-01).
    if (err instanceof TypeError) {
      throw new ApiError(
        0,
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "You are offline. Check your connection and try again."
          : "Could not reach the server. Check your connection and try again.",
        null,
      );
    }
    throw err;
  }

  const parsed: unknown = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const message =
      isErrorBody(parsed) && typeof parsed.error === "string"
        ? parsed.error
        : `Request failed with status ${res.status}`;
    // A 401 on an authenticated request means the session is over: the
    // token expired, or the server revoked it (password change, admin
    // reset, deactivation — the account check runs on every request since
    // 2026-10-06). AuthProvider listens and signs the user out.
    // Only when the rejected token is still the current one: a late 401
    // from a previous session must not sign out a fresh login.
    if (res.status === 401 && token && getToken() === token) {
      window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    }
    throw new ApiError(res.status, message, parsed);
  }

  return { data: parsed as T, headers: res.headers };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isErrorBody(value: unknown): value is { error?: unknown } {
  return typeof value === "object" && value !== null;
}
