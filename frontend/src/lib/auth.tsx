import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest, getToken, setToken, UNAUTHENTICATED_EVENT } from "./api";

// Built-in role names referenced structurally by backend (project visibility,
// requireAdmin gate). Custom roles created via Admin > Roles tab use other
// strings; the type is `string` to allow them.
export type Role = string;
export const BUILTIN_ROLES = ["SA", "TAM", "ADMIN", "STAKEHOLDER", "PENDING"] as const;
export type BuiltinRole = (typeof BUILTIN_ROLES)[number];

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: Role;
  permissions: string[];
}

// The permission vocabulary the app actually understands, for the Admin >
// Roles tick-box editor. The backend stores permissions as a free-form
// string array, so this is a curated catalogue (not enforced server-side) —
// keep it in sync with the `requirePermission(...)` / `hasPermission(...)`
// strings used across backend + frontend. "*" is full access (admin).
export interface PermissionDef {
  value: string;
  label: string;
  hint: string;
}
export const PERMISSION_CATALOG: PermissionDef[] = [
  { value: "*", label: "Full access (admin)", hint: "Every permission, including the Admin area. Grant sparingly." },
  { value: "project:view-all", label: "See all projects", hint: "Visibility: see every project, not just the ones you're assigned to as SA/TAM." },
  { value: "project:read", label: "View projects", hint: "See projects, risks, sections, notes." },
  { value: "project:write", label: "Manage projects", hint: "Create/edit projects, risks, sections, baselines." },
  { value: "task:read", label: "View tasks", hint: "See tasks and subtasks." },
  { value: "task:write", label: "Manage tasks", hint: "Create, edit, move, and delete tasks." },
  { value: "pipeline:view", label: "View pipeline", hint: "See the Pipeline board, opportunity details, and Pipeline analytics." },
  { value: "pipeline:create", label: "Create opportunities", hint: "Add new opportunities to the Pipeline board." },
  { value: "pipeline:edit_own", label: "Edit own opportunities", hint: "Edit and change the stage of opportunities you're the PIC for, and assign a PIC to an unassigned opportunity." },
  { value: "pipeline:edit_all", label: "Edit all opportunities", hint: "Edit and change the stage of any opportunity, not just your own." },
  { value: "pipeline:delete_own", label: "Delete own opportunities", hint: "Delete opportunities you're the PIC for." },
  { value: "pipeline:delete_all", label: "Delete all opportunities", hint: "Delete any opportunity, not just your own." },
  { value: "report:executive", label: "Executive dashboard", hint: "See the org-wide Executive portfolio dashboard (all projects across all TAMs) and overdue-projects monitoring. Read-only." },
];

/**
 * Permission check used by UI gates. Wildcard "*" grants everything; a
 * specific permission grants just that one. Custom roles created in
 * Admin > Roles can list any permission strings; the built-in roles'
 * exact grants live in backend/prisma/seed.ts.
 */
export function hasPermission(
  user: AuthUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;
  // Defensive: a user object cached in localStorage from before the
  // permissions field was introduced won't have it. Treat missing as empty
  // so callers don't crash; the user gets fresh permissions on next login.
  const perms = user.permissions ?? [];
  return perms.includes("*") || perms.includes(permission);
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
  /**
   * True once `user` came from the server in this page load (a login
   * response or the boot-time `/auth/me`), false while it is only the
   * localStorage copy — which can be missing (a reload right after login) or
   * stale (permissions changed since). Permission guards must not redirect
   * away on a denial until this is true.
   */
  userVerified: boolean;
  /**
   * Set when the boot-time `/auth/me` call failed for a reason other than a
   * rejected token (server down, timeout). The session is kept — the stored
   * token may well be valid — and the Shell shows a banner with a retry.
   */
  bootError: string | null;
  /** Re-run the boot-time account check after a `bootError`. */
  retryBoot: () => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  /** Swap in a token the server issued mid-session (after a password change). */
  replaceToken: (token: string) => void;
}

const USER_STORAGE_KEY = "solvro.user";

// Written synchronously on login (not only from the effect below), so a
// full page load immediately after login already finds the cached user
// next to the token that `setToken` stored synchronously.
function persistUser(user: AuthUser | null) {
  if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_STORAGE_KEY);
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<AuthContextValue["status"]>(
    token ? "authenticated" : "unauthenticated",
  );
  const [userVerified, setUserVerified] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  // Server-state cache. Cleared on sign-out and when a different account
  // signs in (docs/archive/plans/application-review-2026-10-22.md, F-08): before, a user who signed in
  // on a shared browser within React Query's 5-minute gc window saw the
  // previous user's projects, overview and notifications served from cache
  // until the background refetch landed — and queries with `staleTime`
  // never refetched at all.
  const queryClient = useQueryClient();

  useEffect(() => {
    persistUser(user);
  }, [user]);

  // Rehydrate from /auth/me on boot when we have a token. This refreshes the
  // cached user (notably the `permissions` array, which may be missing or
  // stale on bundles upgraded from before that field existed). If the token
  // is invalid/expired the call 401s and we log the user out cleanly.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setBootError(null);
    // Timed out so a request that never settles ends in the catch below
    // instead of leaving the permission guards on "Loading…" forever.
    apiRequest<AuthUser>("/auth/me", { timeoutMs: 15_000 })
      .then((fresh) => {
        if (cancelled) return;
        setUser(fresh);
        setUserVerified(true);
        setStatus("authenticated");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Only a 401 says the stored token is bad: end the session.
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          setTokenState(null);
          setUser(null);
          setUserVerified(false);
          setStatus("unauthenticated");
          return;
        }
        // Any other failure — a timeout, a network error, the API behind a
        // restarting container — says nothing about the token
        // (docs/archive/plans/application-review-2026-10-22.md, F-14).
        // Before, it also flipped the status to
        // "unauthenticated", which bounced a validly signed-in user to the
        // login page, where signing in failed for the same reason. Keep the
        // session and the cached user, leave `userVerified` false so the
        // permission guards keep waiting, and surface a retry banner.
        setBootError(
          err instanceof Error && err.message
            ? err.message
            : "Could not reach the server to confirm your session.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token, bootAttempt]);

  const retryBoot = useCallback(() => setBootAttempt((n) => n + 1), []);

  const login = useCallback(async (email: string, password: string) => {
    setStatus("loading");
    try {
      const res = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      // A different account than the one whose data may still sit in the
      // cache (a sign-out does clear it, but a 401-driven sign-out followed
      // by another person's login on the same tab must not show stale rows).
      if (user && user.id !== res.user.id) queryClient.clear();
      setToken(res.token);
      persistUser(res.user);
      setTokenState(res.token);
      setUser(res.user);
      setUserVerified(true);
      setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      throw err;
    }
  }, [queryClient, user]);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    setStatus("loading");
    try {
      const res = await apiRequest<LoginResponse>("/auth/google", {
        method: "POST",
        body: { idToken },
        auth: false,
      });
      if (user && user.id !== res.user.id) queryClient.clear();
      setToken(res.token);
      persistUser(res.user);
      setTokenState(res.token);
      setUser(res.user);
      setUserVerified(true);
      setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      throw err;
    }
  }, [queryClient, user]);

  const replaceToken = useCallback((next: string) => {
    setToken(next);
    setTokenState(next);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setUserVerified(false);
    setBootError(null);
    setStatus("unauthenticated");
    // Everything fetched for this account leaves with it — no cached list for
    // the next person who signs in on this browser.
    queryClient.clear();
    // A running iTop timer is user-scoped (components/itop/useTicketTimer.ts) and must not leak into the next login on this browser.
    Object.keys(localStorage)
      .filter((k) => k.startsWith("solvro.itopTimer."))
      .forEach((k) => localStorage.removeItem(k));
  }, [queryClient]);

  // Any authenticated request answered with 401 (lib/api.ts) ends the
  // session here too — the server now revokes tokens (password change,
  // admin reset, deactivation), and a revoked session must not keep
  // showing cached pages behind failing requests.
  useEffect(() => {
    window.addEventListener(UNAUTHENTICATED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, logout);
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      token,
      status,
      userVerified,
      bootError,
      retryBoot,
      login,
      loginWithGoogle,
      logout,
      replaceToken,
    }),
    [user, token, status, userVerified, bootError, retryBoot, login, loginWithGoogle, logout, replaceToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
