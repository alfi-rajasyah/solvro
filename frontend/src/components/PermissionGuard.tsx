import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { hasPermission, useAuth } from "@/lib/auth";

/**
 * Route guard for a single permission string — the generic form of
 * ExecutiveGuard/AdminGuard for pages whose nav entry carries `requires`
 * (frontend/src/lib/navCommands.ts). Keeps the sidebar rule and the route
 * rule in one place: a page hidden from the catalogue is also unreachable
 * by URL. Redirects to /overview like the other guards.
 */
export function PermissionGuard({ permission, children }: { permission: string; children: ReactNode }) {
  const { user, status } = useAuth();
  // While the session is still resolving there is no user to judge yet —
  // render nothing instead of bouncing a deep link to /overview.
  if (status === "loading" || (status === "authenticated" && user == null)) return null;
  if (!hasPermission(user, permission)) {
    return <Navigate to="/overview" replace />;
  }
  return <>{children}</>;
}
