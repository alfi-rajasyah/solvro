// Static catalogue of page destinations shared by the sidebar nav
// (Sidebar.tsx derives its render list from NAV_COMMANDS directly) and the
// ⌘K palette (CommandPalette.tsx). Single source of truth: this file stays a
// pure module — the permission check is injected so it never imports React
// and stays unit-testable in the node-env Vitest config.
export type NavGroup = "Workspace" | "Cadence" | "Sales" | "Insights" | "System";

// Render order of the sidebar's group sections. NAV_COMMANDS is already
// ordered group-by-group; the sidebar buckets by `group` in this order. The ⌘K
// palette ignores the field and keeps its flat list.
export const NAV_GROUPS: readonly NavGroup[] = ["Workspace", "Cadence", "Sales", "Insights", "System"];

export interface NavCommand {
  to: string;
  label: string;
  icon: string;
  /** Sidebar section this page is listed under. */
  group: NavGroup;
  /** Permission required to list this page; "*" restricts to admin wildcard. */
  requires?: string;
}

// The TAM pages (Overview … Weekly Sync) are listed only to roles that can read
// projects, so a Pipeline-only role (e.g. SALES) sees just Pipeline and Settings.
// This gates the sidebar and palette only — the routes themselves stay open, so
// a user who lands on /overview after sign-in still gets a page.
export const NAV_COMMANDS: readonly NavCommand[] = [
  { to: "/overview", label: "Overview", icon: "dashboard", group: "Workspace", requires: "project:read" },
  { to: "/projects", label: "Projects", icon: "folder_managed", group: "Workspace", requires: "project:read" },
  { to: "/customers", label: "Customers", icon: "groups", group: "Workspace", requires: "project:read" },
  { to: "/daily-review", label: "Daily Review", icon: "edit_note", group: "Cadence", requires: "project:read" },
  { to: "/weekly-sync", label: "Weekly Sync", icon: "table_chart", group: "Cadence", requires: "project:read" },
  // The Pipeline (sales opportunities) is its own sidebar group: it is a work
  // surface for the SA and Sales roles, distinct from the TAM delivery pages.
  { to: "/pipeline", label: "Pipeline", icon: "monetization_on", group: "Sales", requires: "pipeline:view" },
  // Utilization (Utilization.tsx) replaced the old Work Logs placeholder; gated on
  // project:read — meaningless without project access (port decision I-7,
  // docs/archive/plans/solvro-cust-port-plan.md §10).
  { to: "/utilization", label: "Utilization", icon: "schedule", group: "Insights", requires: "project:read" },
  {
    to: "/executive",
    label: "Executive",
    icon: "leaderboard",
    group: "Insights",
    requires: "report:executive",
  },
  { to: "/settings", label: "Settings", icon: "settings", group: "System" },
  { to: "/admin", label: "Admin", icon: "admin_panel_settings", group: "System", requires: "*" },
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
