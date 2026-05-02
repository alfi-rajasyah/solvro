import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

const PAGE_TITLES: Record<string, string> = {
  overview: "Overview",
  projects: "My Projects",
  customers: "Customers",
  tasks: "Tasks",
  reports: "Reports",
};

export function TopBar() {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const segment = location.pathname.split("/").filter(Boolean)[0] ?? "overview";
  const title = PAGE_TITLES[segment] ?? "Solvro";

  const initials = user
    ? user.username
        .split(/[.\s_-]/)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2)
    : "?";

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 ml-16 flex h-16 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-6 font-display">
      <div className="flex items-center gap-8">
        <span className="text-lg font-bold text-on-surface">{title}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            placeholder="Search…"
            className="w-64 rounded border-none bg-surface-container py-1.5 pl-10 pr-4 text-xs text-on-surface focus:ring-1 focus:ring-primary"
          />
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={resolved === "dark" ? "Light mode" : "Dark mode"}
          className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-base">
            {resolved === "dark" ? "light_mode" : "dark_mode"}
          </span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded px-2 py-1 text-xs text-on-surface-variant hover:bg-surface-container"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
              {initials}
            </span>
            <span className="hidden font-medium text-on-surface sm:inline">
              {user?.username ?? "Guest"}
            </span>
            <span className="material-symbols-outlined text-base">expand_more</span>
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
                <div className="border-b border-outline-variant px-3 py-2 text-[11px] text-on-surface-variant">
                  <div className="font-medium text-on-surface">{user?.email}</div>
                  <div className="uppercase tracking-wider">{user?.role}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-on-surface hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined text-sm">settings</span>
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-on-surface hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined text-sm">logout</span>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
