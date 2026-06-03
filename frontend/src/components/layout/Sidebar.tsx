import { NavLink } from "react-router-dom";
import { hasPermission, useAuth } from "@/lib/auth";
import { useSidebar } from "./SidebarContext";
import { BrandMark } from "@/components/BrandMark";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/overview", label: "Overview", icon: "dashboard" },
  { to: "/projects", label: "Projects", icon: "folder_managed" },
  { to: "/customers", label: "Customers", icon: "groups" },
  { to: "/daily-review", label: "Daily Review", icon: "edit_note" },
  // Work Logs (WorkLogs.tsx) is an unbuilt placeholder (iTop API integration),
  // so it's intentionally NOT in the sidebar. Route stays registered in
  // App.tsx — mirror of how Tasks is kept routable but hidden. This also keeps
  // the nav in CLAUDE.md's canonical order (no Work Logs entry).
  { to: "/reports", label: "Reports", icon: "analytics" },
  { to: "/settings", label: "Settings", icon: "settings" },
  { to: "/admin", label: "Admin", icon: "admin_panel_settings", adminOnly: true },
];

// DESIGN.md: sidebar is charcoal #232321 in both themes (stays dark in light
// mode). Token defined in tailwind.config.ts — no theme-flipping `dark:` variant.
const SIDEBAR_BG = "bg-sidebar";

export function Sidebar() {
  const { open, toggle, close } = useSidebar();
  const { user } = useAuth();
  const items = NAV_ITEMS.filter(
    (i) => !i.adminOnly || hasPermission(user, "*"),
  );

  return (
    <>
      {open && (
        <button
          type="button"
          onClick={close}
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:hidden"
        />
      )}

      <aside
        className={[
          // `dark` is pinned so the rail renders dark in both themes (fixed
          // brand element per DESIGN.md): token-based accents like `bg-primary`
          // resolve to their `.dark` values even when the app is in light mode.
          "dark fixed left-0 top-0 z-50 h-screen flex-col overflow-hidden border-r border-black/30 font-display text-slate-300 transition-[width] duration-200 ease-out",
          SIDEBAR_BG,
          open ? "flex w-sidebar" : "hidden w-16 md:flex",
        ].join(" ")}
      >
        <div
          className={[
            "flex items-center",
            open ? "justify-between gap-3 px-4 py-5" : "justify-center px-2 py-5",
          ].join(" ")}
        >
          {open && (
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark className="h-8 w-8 shrink-0" />
              <h1 className="truncate text-lg font-extrabold tracking-tight text-white">
                Solvro
              </h1>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-white/5 hover:text-slate-100"
          >
            <span className="material-symbols-outlined text-lg">
              {open ? "menu_open" : "menu"}
            </span>
          </button>
        </div>

        <nav
          className={["mt-2 flex-1 space-y-1", open ? "px-3" : "px-2"].join(" ")}
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={close}
              title={open ? undefined : item.label}
              className={({ isActive }) =>
                [
                  "group flex items-center rounded transition-colors duration-150",
                  open ? "gap-2.5 px-3 py-2 text-[13px]" : "h-10 w-10 justify-center",
                  isActive
                    ? "bg-primary/20 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      "material-symbols-outlined text-[20px]",
                      isActive ? "text-primary" : "",
                    ].join(" ")}
                  >
                    {item.icon}
                  </span>
                  {open && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/5 p-3">
          <div
            className={[
              "flex items-center gap-2.5 rounded text-[12px] text-emerald-400",
              open ? "px-3 py-2" : "h-10 w-10 justify-center",
            ].join(" ")}
            title={open ? undefined : "Backend: UP"}
          >
            <span className="material-symbols-outlined text-[16px]">cloud_done</span>
            {open && (
              <span>
                Backend: <span className="font-semibold">UP</span>
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
