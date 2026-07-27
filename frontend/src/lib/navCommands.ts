// Static catalogue of page destinations for the ⌘K palette. Mirrors the
// sidebar's NAV_ITEMS (Sidebar.tsx) including its permission gating, but as
// a pure module: the permission check is injected so this file never imports
// React and stays unit-testable in the node-env Vitest config.
export interface NavCommand {
  to: string;
  label: string;
  icon: string;
  /** Permission required to list this page; "*" restricts to admin wildcard. */
  requires?: string;
}

export const NAV_COMMANDS: NavCommand[] = [
  { to: "/overview", label: "Overview", icon: "dashboard" },
  { to: "/projects", label: "Projects", icon: "folder_managed" },
  { to: "/customers", label: "Customers", icon: "groups" },
  { to: "/daily-review", label: "Daily Review", icon: "edit_note" },
  { to: "/reports", label: "Reports", icon: "analytics" },
  { to: "/executive", label: "Executive", icon: "leaderboard", requires: "report:executive" },
  { to: "/settings", label: "Settings", icon: "settings" },
  { to: "/admin", label: "Admin", icon: "admin_panel_settings", requires: "*" },
];

export function filterNavCommands(
  has: (permission: string) => boolean,
  query: string,
): NavCommand[] {
  const q = query.trim().toLowerCase();
  return NAV_COMMANDS.filter(
    (c) => (!c.requires || has(c.requires)) && (q === "" || c.label.toLowerCase().includes(q)),
  );
}
