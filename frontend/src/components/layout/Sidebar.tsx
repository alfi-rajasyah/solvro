import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useSidebar } from "./SidebarContext";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/overview", label: "Overview", icon: "dashboard" },
  { to: "/projects", label: "Projects", icon: "assignment" },
  { to: "/customers", label: "Customers", icon: "business" },
  { to: "/tasks", label: "Tasks", icon: "checklist" },
  { to: "/reports", label: "Reports", icon: "bar_chart" },
  { to: "/admin", label: "Admin", icon: "admin_panel_settings", adminOnly: true },
];

export function Sidebar() {
  const { open, toggle, close } = useSidebar();
  const { user } = useAuth();
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || user?.role === "ADMIN");

  return (
    <>
      {open && (
        <button
          type="button"
          onClick={close}
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 z-50 h-screen flex-col overflow-hidden border-r border-slate-800 bg-slate-950 font-display transition-[width] duration-200 ease-out",
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary">
                <span
                  className="material-symbols-outlined text-lg text-white"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  terminal
                </span>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold tracking-tighter text-white">
                  Solvro
                </h1>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded text-slate-300 hover:bg-slate-800 hover:text-white"
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
                  "flex items-center rounded transition-colors duration-150",
                  open ? "gap-3 px-3 py-2.5" : "h-10 w-10 justify-center",
                  isActive
                    ? "bg-primary/15 text-inverse-primary"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
                ].join(" ")
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {open && <span className="text-sm">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-800 p-3">
          <div
            className={[
              "flex items-center gap-3 rounded text-xs text-emerald-400",
              open ? "px-3 py-2" : "h-10 w-10 justify-center",
            ].join(" ")}
            title={open ? undefined : "Backend: UP"}
          >
            <span className="material-symbols-outlined text-sm">cloud_done</span>
            {open && (
              <span>
                Backend: <span className="font-bold">UP</span>
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
