import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, getToken, setToken } from "./api";

// Built-in role names referenced structurally by backend (project visibility,
// requireAdmin gate). Custom roles created via Admin > Roles tab use other
// strings; the type is `string` to allow them.
export type Role = string;
export const BUILTIN_ROLES = ["SA", "TAM", "ADMIN", "STAKEHOLDER"] as const;
export type BuiltinRole = (typeof BUILTIN_ROLES)[number];

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: Role;
  permissions: string[];
}

/**
 * Permission check used by UI gates. Wildcard "*" grants everything; a
 * specific permission grants just that one. Custom roles created in
 * Admin > Roles can list any permission strings; the built-ins ship
 * with the four standard ones (project:read|write, task:read|write,
 * blueprint:* and report:read).
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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const USER_STORAGE_KEY = "solvro.user";

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

  useEffect(() => {
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_STORAGE_KEY);
  }, [user]);

  // Rehydrate from /auth/me on boot when we have a token. This refreshes the
  // cached user (notably the `permissions` array, which may be missing or
  // stale on bundles upgraded from before that field existed). If the token
  // is invalid/expired the call 401s and we log the user out cleanly.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiRequest<AuthUser>("/auth/me")
      .then((fresh) => {
        if (cancelled) return;
        setUser(fresh);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setTokenState(null);
        setUser(null);
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    setStatus("loading");
    try {
      const res = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      setToken(res.token);
      setTokenState(res.token);
      setUser(res.user);
      setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ user, token, status, login, logout }),
    [user, token, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
