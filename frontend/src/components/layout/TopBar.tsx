import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ProjectStatusChip } from "@/components/StatusChip";
import { formatElapsed, useRunningItopTimer } from "@/components/itop/useTicketTimer";
import { useAuth } from "@/lib/auth";
import { useCustomer, useOpportunity, useProject } from "@/lib/queries";
import { buildCrumbs, documentTitle, matchRoute } from "@/lib/routeMeta";
import { useTheme } from "@/lib/theme";
import { NotificationBell } from "./NotificationBell";
import { useSidebar } from "./SidebarContext";

export function TopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const { open, toggle: toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Global "a timer is running somewhere" indicator (Task 7.1,
  // docs/archive/plans/itop-integration.md) — read-only. The hook returns
  // nothing unless a timer is stored AND the user holds task:write (logging
  // time is a write), so users who cannot write never see the pill.
  const runningTimer = useRunningItopTimer();

  // Same query keys as ProjectDetail / CustomerDetail, so the bar reads the
  // cache those pages fill and never triggers a second request.
  const route = matchRoute(location.pathname);
  const { data: project } = useProject(route.projectId);
  const { data: customer } = useCustomer(route.customerId);
  const { data: opportunity } = useOpportunity(route.opportunityId);
  const crumbs = buildCrumbs(location.pathname, {
    projectName: project?.name,
    projectCustomer: project?.customer,
    customerName: customer?.name,
    opportunityTitle: opportunity?.title,
  });

  // Per-route browser-tab title, from the same route context as the
  // breadcrumbs (docs/archive/plans/application-review-2026-10-22.md, F-35).
  // Re-runs when the project/customer/opportunity name arrives.
  const title = documentTitle(location.pathname, {
    projectName: project?.name,
    projectCustomer: project?.customer,
    customerName: customer?.name,
    opportunityTitle: opportunity?.title,
  });
  // The user menu is a disclosure: Escape closes it and returns focus to its button.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Declared before the setter so it captures the static title first; leaving
  // the app shell (sign-out → /login) hands the tab back to it instead of
  // leaving the last page's name behind.
  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);
  useEffect(() => {
    document.title = title;
  }, [title]);

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
    <header
      className={`sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-4 font-display transition-[margin] duration-200 ease-out sm:gap-3 md:gap-4 md:px-6 ${
        open ? "md:ml-sidebar" : "md:ml-sidebar-collapsed"
      }`}
    >
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Open navigation"
        className="tap-target flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface md:hidden"
      >
        <span aria-hidden="true" className="material-symbols-outlined">menu</span>
      </button>

      {/* flex-1 below md hands the title all the room the icon cluster leaves
          (docs/archive/plans/application-review-2026-10-22.md, F-42); from md
          up it hugs its content so the status chip stays beside it. */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 md:flex-none">
        <ol className="flex min-w-0 items-center gap-2">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            // Below md only the current page shows, so the bar never
            // overflows at 375px next to the search/help/theme/user cluster.
            return (
              <li
                key={`${i}-${crumb.label}`}
                className={`min-w-0 items-center gap-2 ${last ? "flex" : "hidden md:flex"}`}
              >
                {i > 0 && (
                  <span aria-hidden="true" className="hidden text-on-surface-variant md:inline">
                    /
                  </span>
                )}
                {last ? (
                  <span
                    aria-current="page"
                    title={crumb.label}
                    className="truncate text-sm font-semibold text-on-surface"
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.to ?? "/"}
                    title={crumb.label}
                    className="max-w-40 truncate text-xs text-on-surface-variant hover:text-on-surface"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {route.kind === "project" && project && (
        <span className="hidden shrink-0 md:inline-flex">
          <ProjectStatusChip status={project.status} />
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        {runningTimer && (
          <Link
            to={`/customers/${runningTimer.timer.customerId}?tab=tickets&ticket=${runningTimer.timer.ticketId}`}
            aria-label={`Timer running on ${runningTimer.timer.ref}`}
            title={`Timer running on ${runningTimer.timer.ref}`}
            className="hidden items-center gap-1 rounded-sm border border-outline-variant px-2 py-1 font-mono text-meta text-on-surface-variant hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:flex"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">timer</span>
            {formatElapsed(runningTimer.elapsedSeconds)}
          </Link>
        )}

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Open search"
          className="hidden min-w-[260px] cursor-text items-center gap-2 rounded-sm bg-surface-container px-3 py-1.5 md:flex"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base text-on-surface-variant">
            search
          </span>
          <span className="flex-1 text-left text-xs text-on-surface-variant">
            Search projects, tasks, customers…
          </span>
          <span className="rounded-sm border border-outline-variant bg-surface-container-low px-1.5 py-0.5 font-mono text-meta text-on-surface-variant">
            ⌘K
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Open search"
          className="tap-target flex h-8 w-8 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface md:hidden"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">search</span>
        </button>

        <Link
          to="/help"
          aria-label="Help"
          title="Help"
          className="tap-target flex h-8 w-8 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">help</span>
        </Link>

        <NotificationBell />

        <button
          type="button"
          onClick={toggle}
          aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={resolved === "dark" ? "Light mode" : "Dark mode"}
          className="tap-target flex h-8 w-8 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
            {resolved === "dark" ? "light_mode" : "dark_mode"}
          </span>
        </button>

        <div className="relative">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            // The phone bar shows only the initials circle, which names nothing
            // (docs/archive/plans/application-review-2026-10-22.md, F-34).
            // Includes the visible username and role (WCAG 2.5.3, label in name).
            aria-label={`User menu for ${user?.username ?? "Guest"}${user?.role ? `, ${user.role}` : ""}`}
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            className="tap-target flex items-center gap-2 rounded-sm border-outline-variant text-left hover:opacity-90 sm:border-l sm:pl-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-meta font-bold text-on-primary">
              {initials}
            </span>
            <div className="hidden flex-col items-start sm:flex">
              <span className="text-meta font-semibold leading-tight text-on-surface">
                {user?.username ?? "Guest"}
              </span>
              <span className="text-label-caps uppercase leading-tight text-on-surface-variant">
                {user?.role ?? ""}
              </span>
            </div>
            {/* The icon font's unlayered stylesheet forces display on
                .material-symbols-outlined, beating a `hidden` utility on the
                glyph itself, so the wrapper does the hiding. */}
            <span className="hidden sm:inline-flex">
              <span aria-hidden="true" className="material-symbols-outlined text-base text-on-surface-variant">
                expand_more
              </span>
            </span>
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div id={menuId} className="absolute right-0 top-full z-50 mt-1 w-48 rounded-sm border border-outline-variant bg-surface-container-lowest py-1 shadow-overlay">
                <div className="border-b border-outline-variant px-3 py-2 text-meta text-on-surface-variant">
                  <div className="font-medium text-on-surface">{user?.email}</div>
                  <div className="text-label-caps uppercase">
                    {user?.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-on-surface hover:bg-surface-container"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-base">settings</span>
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
                  <span aria-hidden="true" className="material-symbols-outlined text-base">logout</span>
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
