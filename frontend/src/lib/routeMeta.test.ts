import { describe, expect, it } from "vitest";
import appSource from "@/App.tsx?raw";
import { buildCrumbs, documentTitle, matchRoute, routeTitle } from "./routeMeta";

/**
 * Every concrete path App.tsx declares, read from the source so a new route
 * that forgets its title fails here. `projects/:id` owns the nested routes up
 * to its closing tag; `/login` and `/share/:token` (outside the shell) and the `*`
 * catch-all (the NotFound page) are not top-bar pages.
 */
function appPaths(): string[] {
  const paths: string[] = [];
  const parentIdx = appSource.indexOf('path="projects/:id"');
  const parentEnd = appSource.indexOf("</Route>", parentIdx);
  for (const m of appSource.matchAll(/path="([^"]+)"/g)) {
    const raw = m[1];
    if (raw === "/login" || raw === "*" || raw.startsWith("/share/")) continue;
    const nested = m.index > parentIdx && m.index < parentEnd;
    const full = nested ? `/projects/:id/${raw}` : `/${raw}`;
    paths.push(full.replace(":id", "7"));
  }
  return paths;
}

describe("routeMeta over App.tsx", () => {
  const paths = appPaths();

  it("finds the routes (guards against a broken parser)", () => {
    expect(paths).toContain("/projects");
    expect(paths).toContain("/projects/7");
    expect(paths).toContain("/projects/7/gantt");
    expect(paths).toContain("/customers/7");
    expect(paths).toContain("/admin");
    expect(paths.length).toBeGreaterThanOrEqual(18);
  });

  it.each(appPaths())("%s resolves to a real title and non-empty crumbs", (path) => {
    const crumbs = buildCrumbs(path);
    expect(crumbs.length).toBeGreaterThan(0);
    for (const crumb of crumbs) {
      expect(crumb.label.trim()).not.toBe("");
      expect(crumb.label).not.toBe("Solvro");
    }
    expect(routeTitle(path)).not.toBe("Solvro");
    // A declared route must never read as the catch-all (keeps PROJECT_VIEWS
    // and STATIC_TITLES in step with App.tsx).
    expect(matchRoute(path).kind).not.toBe("notFound");
  });
});

describe("static pages", () => {
  it("titles match the page H1s and sidebar labels", () => {
    expect(routeTitle("/overview")).toBe("Overview");
    expect(routeTitle("/projects")).toBe("Projects");
    expect(routeTitle("/customers")).toBe("Customers");
    expect(routeTitle("/daily-review")).toBe("Daily Review");
    expect(routeTitle("/weekly-sync")).toBe("Weekly Sync");
    expect(routeTitle("/utilization")).toBe("Utilization");
    expect(routeTitle("/work-logs")).toBe("Utilization");
    expect(routeTitle("/executive")).toBe("Executive");
    expect(routeTitle("/settings")).toBe("Settings");
    expect(routeTitle("/admin")).toBe("Admin");
    expect(routeTitle("/help")).toBe("Help");
    expect(routeTitle("/pipeline")).toBe("Pipeline");
    expect(routeTitle("/tasks")).toBe("Tasks");
  });

  it("is a single, unlinked crumb", () => {
    expect(buildCrumbs("/projects")).toEqual([{ label: "Projects" }]);
  });

  it("reads the bare root as Overview (it redirects there), never Solvro", () => {
    expect(routeTitle("/")).toBe("Overview");
  });
});

describe("unknown paths (the NotFound page)", () => {
  it.each(["/no-such-page", "/nope/never", "/overview/extra", "/projects/12/board", "/projects/12/list/x", "/customers/5/edit", "/pipeline/abc/x", "/constructor"])(
    "%s is Not found",
    (path) => {
      expect(matchRoute(path)).toMatchObject({ kind: "notFound", title: "Not found" });
      expect(buildCrumbs(path)).toEqual([{ label: "Not found" }]);
      expect(routeTitle(path)).toBe("Not found");
    },
  );

  it("matches case-insensitively like the router, keeping the opportunity id's casing", () => {
    expect(routeTitle("/Overview")).toBe("Overview");
    expect(matchRoute("/Projects/12/Gantt")).toMatchObject({ kind: "project", projectId: 12 });
    expect(matchRoute("/projects/12/Gantt").kind).toBe("project");
    expect(matchRoute("/Customers/5").kind).toBe("customer");
    expect(matchRoute("/Pipeline/AbC-1")).toMatchObject({ kind: "opportunity", opportunityId: "AbC-1" });
    expect(documentTitle("/Daily-Review")).toBe("Daily Review · Solvro");
    // a real unknown path stays Not found whatever its casing
    expect(matchRoute("/No-Such-Page").kind).toBe("notFound");
    expect(matchRoute("/Projects/12/Board").kind).toBe("notFound");
  });

  it("still resolves every project view and a trailing slash", () => {
    expect(matchRoute("/projects/12/risks").kind).toBe("project");
    expect(matchRoute("/projects/12/").kind).toBe("project");
    expect(matchRoute("/overview/").kind).toBe("static");
  });
});

describe("documentTitle", () => {
  it("is '<page> · Solvro' for static pages", () => {
    expect(documentTitle("/overview")).toBe("Overview · Solvro");
    expect(documentTitle("/daily-review")).toBe("Daily Review · Solvro");
    expect(documentTitle("/work-logs")).toBe("Utilization · Solvro");
    expect(documentTitle("/pipeline")).toBe("Pipeline · Solvro");
    expect(documentTitle("/no-such-page")).toBe("Not found · Solvro");
  });

  it("uses the loaded entity name, with the placeholder while loading", () => {
    expect(documentTitle("/projects/12/gantt", { projectName: "Migration" })).toBe("Migration · Solvro");
    expect(documentTitle("/projects/12")).toBe("Project · Solvro");
    expect(documentTitle("/customers/5", { customerName: "Acme" })).toBe("Acme · Solvro");
    expect(documentTitle("/pipeline/x", { opportunityTitle: "Rollout" })).toBe("Rollout · Solvro");
  });

  it("falls back to plain Solvro when the title is blank", () => {
    // A whitespace-only project name is truthy, so it reaches the builder as the label.
    expect(documentTitle("/projects/12", { projectName: "   " })).toBe("Solvro");
  });
});

describe("project routes", () => {
  const ctx = {
    projectName: "Migration",
    projectCustomer: { id: 3, name: "Acme" },
  };

  it("matches the id on every sub-view", () => {
    expect(matchRoute("/projects/12/kanban")).toMatchObject({ kind: "project", projectId: 12 });
    expect(matchRoute("/projects/12")).toMatchObject({ kind: "project", projectId: 12 });
  });

  it("builds Projects / customer / project", () => {
    expect(buildCrumbs("/projects/12/gantt", ctx)).toEqual([
      { label: "Projects", to: "/projects" },
      { label: "Acme", to: "/customers/3" },
      { label: "Migration" },
    ]);
  });

  it("omits the customer crumb for a project without one", () => {
    expect(buildCrumbs("/projects/12", { projectName: "Solo", projectCustomer: null })).toEqual([
      { label: "Projects", to: "/projects" },
      { label: "Solo" },
    ]);
  });

  it("uses a placeholder while the project is loading", () => {
    expect(buildCrumbs("/projects/12")).toEqual([
      { label: "Projects", to: "/projects" },
      { label: "Project" },
    ]);
  });

  it("does not treat a non-numeric id as a project", () => {
    expect(matchRoute("/projects/abc").kind).toBe("static");
  });
});

describe("customer detail", () => {
  it("builds Customers / name", () => {
    expect(buildCrumbs("/customers/5", { customerName: "Acme" })).toEqual([
      { label: "Customers", to: "/customers" },
      { label: "Acme" },
    ]);
    expect(matchRoute("/customers/5")).toMatchObject({ kind: "customer", customerId: 5 });
  });

  it("uses a placeholder while loading", () => {
    expect(buildCrumbs("/customers/5")[1]).toEqual({ label: "Customer" });
  });

  it("the list page stays a static Customers title", () => {
    expect(matchRoute("/customers").kind).toBe("static");
  });
});

describe("pipeline routes", () => {
  it("the list page is a single Pipeline crumb", () => {
    expect(buildCrumbs("/pipeline")).toEqual([{ label: "Pipeline" }]);
    expect(matchRoute("/pipeline").kind).toBe("static");
  });

  it("builds Pipeline / deal title on an opportunity", () => {
    expect(matchRoute("/pipeline/abc-123")).toMatchObject({
      kind: "opportunity",
      opportunityId: "abc-123",
    });
    expect(buildCrumbs("/pipeline/abc-123", { opportunityTitle: "Acme rollout" })).toEqual([
      { label: "Pipeline", to: "/pipeline" },
      { label: "Acme rollout" },
    ]);
  });

  it("uses a placeholder while the opportunity is loading", () => {
    expect(buildCrumbs("/pipeline/abc-123")[1]).toEqual({ label: "Opportunity" });
  });
});
