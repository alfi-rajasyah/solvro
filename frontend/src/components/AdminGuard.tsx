import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") {
    return <Navigate to="/overview" replace />;
  }
  return <>{children}</>;
}
