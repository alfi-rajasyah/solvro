import { describe, expect, it } from "vitest";
import { NAV_COMMANDS, NAV_GROUPS, filterNavCommands } from "./navCommands";

const none = () => false;
const wildcard = () => true; // admin: hasPermission(user, anything) === true
const execOnly = (p: string) => p === "report:executive";

describe("filterNavCommands", () => {
  it("returns only Settings for a user with no permissions", () => {
    expect(filterNavCommands(none, "").map((c) => c.label)).toEqual(["Settings"]);
  });

  it("lists the TAM pages and Utilization for project:read, but not Pipeline", () => {
    const projectRead = (p: string) => p === "project:read";
    expect(filterNavCommands(projectRead, "").map((c) => c.label)).toEqual([
      "Overview",
      "Projects",
      "Customers",
      "Daily Review",
      "Weekly Sync",
      "Utilization",
      "Settings",
    ]);
  });

  it("lists only Pipeline and Settings for pipeline:view without project:read", () => {
    const pipelineOnly = (p: string) => p === "pipeline:view";
    expect(filterNavCommands(pipelineOnly, "").map((c) => c.label)).toEqual(["Pipeline", "Settings"]);
  });

  it("shows Utilization only with project:read", () => {
    expect(filterNavCommands(none, "").map((c) => c.label)).not.toContain("Utilization");
    const projectRead = (p: string) => p === "project:read";
    expect(filterNavCommands(projectRead, "").map((c) => c.label)).toContain("Utilization");
  });

  it("includes Executive and Admin for a wildcard (admin) user", () => {
    const labels = filterNavCommands(wildcard, "").map((c) => c.label);
    expect(labels).toContain("Executive");
    expect(labels).toContain("Admin");
    expect(labels).toHaveLength(NAV_COMMANDS.length);
  });

  it("includes Executive but not Admin for report:executive without wildcard", () => {
    const labels = filterNavCommands(execOnly, "").map((c) => c.label);
    expect(labels).toContain("Executive");
    expect(labels).not.toContain("Admin");
  });

  it("filters by label, case-insensitively", () => {
    const projectRead = (p: string) => p === "project:read";
    expect(filterNavCommands(projectRead, "cust").map((c) => c.label)).toEqual(["Customers"]);
    expect(filterNavCommands(projectRead, "CUSTOMERS").map((c) => c.label)).toEqual(["Customers"]);
    expect(filterNavCommands(projectRead, "zzz")).toEqual([]);
  });

  it("pins the catalogue's route list", () => {
    expect(NAV_COMMANDS.map((c) => c.to)).toEqual([
      "/overview",
      "/projects",
      "/customers",
      "/daily-review",
      "/weekly-sync",
      "/pipeline",
      "/utilization",
      "/executive",
      "/settings",
      "/admin",
    ]);
  });

  it("hides Pipeline without pipeline:view and shows it with the permission", () => {
    expect(filterNavCommands(none, "").map((c) => c.label)).not.toContain("Pipeline");
    const pipelineOnly = (p: string) => p === "pipeline:view";
    expect(filterNavCommands(pipelineOnly, "").map((c) => c.label)).toContain("Pipeline");
  });

  it("assigns every page to a sidebar group, contiguous and in group order", () => {
    expect(NAV_COMMANDS.map((c) => [c.label, c.group])).toEqual([
      ["Overview", "Workspace"],
      ["Projects", "Workspace"],
      ["Customers", "Workspace"],
      ["Daily Review", "Cadence"],
      ["Weekly Sync", "Cadence"],
      ["Pipeline", "Sales"],
      ["Utilization", "Insights"],
      ["Executive", "Insights"],
      ["Settings", "System"],
      ["Admin", "System"],
    ]);
    expect(NAV_GROUPS).toEqual(["Workspace", "Cadence", "Sales", "Insights", "System"]);
  });

  it("keeps /tasks out of the catalogue", () => {
    expect(NAV_COMMANDS.some((c) => c.to === "/tasks")).toBe(false);
  });
});
