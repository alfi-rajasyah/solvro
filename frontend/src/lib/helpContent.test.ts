import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP_GUIDES, HELP_TOPICS, filterHelpGuides, filterHelpTopics } from "./helpContent";
import { NAV_COMMANDS } from "./navCommands";

const none = () => false;
const wildcard = () => true; // admin: hasPermission(user, anything) === true
const execOnly = (p: string) => p === "report:executive";
const projectRead = (p: string) => p === "project:read";
const pipelineOnly = (p: string) => p === "pipeline:view";

describe("filterHelpTopics", () => {
  it("hides Executive, Admin, Pipeline, and the TAM topics from a user with no permissions", () => {
    const ids = filterHelpTopics(none, "").map((t) => t.id);
    for (const gated of [
      "executive",
      "admin",
      "pipeline",
      "opportunities",
      "overview",
      "projects",
      "project-views",
      "tasks",
      "risks",
      "customers",
      "daily-review",
      "weekly-sync",
      "utilization",
      "itop",
    ]) {
      expect(ids).not.toContain(gated);
    }
    expect(ids).toContain("getting-started");
    expect(ids).toContain("settings");
  });

  it("shows the TAM topics for project:read, but not Pipeline", () => {
    const ids = filterHelpTopics(projectRead, "").map((t) => t.id);
    for (const id of ["overview", "projects", "tasks", "customers", "daily-review", "weekly-sync", "utilization", "itop"]) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain("pipeline");
    expect(ids).not.toContain("opportunities");
  });

  it("shows Pipeline and Opportunities for pipeline:view, but not Executive, Admin, or the TAM topics", () => {
    const ids = filterHelpTopics(pipelineOnly, "").map((t) => t.id);
    expect(ids).toContain("pipeline");
    expect(ids).toContain("opportunities");
    expect(ids).not.toContain("executive");
    expect(ids).not.toContain("admin");
    expect(ids).not.toContain("projects");
  });

  it("shows every topic to a wildcard (admin) user", () => {
    expect(filterHelpTopics(wildcard, "")).toHaveLength(HELP_TOPICS.length);
  });

  it("shows Executive but not Admin for report:executive without wildcard", () => {
    const ids = filterHelpTopics(execOnly, "").map((t) => t.id);
    expect(ids).toContain("executive");
    expect(ids).not.toContain("admin");
  });

  it("matches the query against titles and body text, case-insensitively", () => {
    expect(filterHelpTopics(projectRead, "RISK REGISTER").map((t) => t.id)).toEqual(["projects"]);
    expect(filterHelpTopics(none, "zzz-no-match")).toEqual([]);
  });

  it("never lets the query reveal a gated topic", () => {
    expect(filterHelpTopics(none, "Project Override")).toEqual([]);
    expect(filterHelpTopics(none, "Waiting Sales input")).toEqual([]);
    expect(filterHelpTopics(projectRead, "Waiting Sales input")).toEqual([]);
    expect(filterHelpTopics(pipelineOnly, "Waiting Sales input").map((t) => t.id)).toEqual(["pipeline", "opportunities"]);
  });
});

describe("HELP_TOPICS", () => {
  it("has unique anchor ids", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gates each page topic exactly like the sidebar entry it links to", () => {
    for (const t of HELP_TOPICS.filter((t) => t.route)) {
      const nav = NAV_COMMANDS.find((c) => c.to === t.route);
      expect(nav, `${t.id} links to a sidebar page`).toBeDefined();
      expect(t.requires).toBe(nav?.requires);
    }
  });

  it("has a topic for every sidebar page", () => {
    const routes = HELP_TOPICS.map((t) => t.route);
    for (const nav of NAV_COMMANDS) {
      expect(routes, `help topic for ${nav.to}`).toContain(nav.to);
    }
  });
});

// Every `path="…"` in the router file; nested project views are relative there,
// so a link matches either "/<path>" or "/projects/:id/<path>".
const routerSource = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const routePaths = new Set([...routerSource.matchAll(/path="([^"*]+)"/g)].map((m) => m[1]));
const isRealRoute = (to: string) => {
  const pathname = to.split(/[?#]/)[0];
  return [...routePaths].some((p) => `/${p}` === pathname);
};

describe("HELP_GUIDES", () => {
  const topicIds = new Set(HELP_TOPICS.map((t) => t.id));

  it("has anchor ids unique across guides and reference topics", () => {
    const ids = [...HELP_GUIDES.map((g) => g.id), ...HELP_TOPICS.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no empty guide, step, or reference topic", () => {
    for (const g of HELP_GUIDES) {
      expect(g.title.trim(), g.id).not.toBe("");
      expect(g.summary.trim(), g.id).not.toBe("");
      expect(g.steps.length, `${g.id} has steps`).toBeGreaterThan(0);
      for (const st of g.steps) {
        expect(st.title.trim(), g.id).not.toBe("");
        expect(st.points.length, `${g.id} › ${st.title} has points`).toBeGreaterThan(0);
        for (const p of st.points) expect(p.trim(), `${g.id} › ${st.title}`).not.toBe("");
      }
    }
    for (const t of HELP_TOPICS.filter((t) => !t.shortcuts)) {
      expect(t.entries.length, `${t.id} has entries`).toBeGreaterThan(0);
      for (const e of t.entries) expect(e.points.length, `${t.id} › ${e.title}`).toBeGreaterThan(0);
    }
  });

  it("relates only to existing reference topics", () => {
    for (const g of HELP_GUIDES) {
      for (const id of g.related) expect(topicIds.has(id), `${g.id} relates to unknown topic ${id}`).toBe(true);
    }
  });

  it("links only to real in-app routes", () => {
    const links = [
      ...HELP_GUIDES.flatMap((g) => (g.links ?? []).map((l) => ({ id: g.id, to: l.to }))),
      ...HELP_TOPICS.filter((t) => t.route).map((t) => ({ id: t.id, to: t.route as string })),
    ];
    for (const { id, to } of links) {
      expect(to.startsWith("/"), `${id}: ${to} starts with /`).toBe(true);
      expect(isRealRoute(to), `${id}: ${to} matches a route in App.tsx`).toBe(true);
    }
  });

  it("covers the eight task-oriented guides, in order", () => {
    expect(HELP_GUIDES.map((g) => g.title)).toEqual([
      "Start your day",
      "Run a project",
      "Keep tasks moving",
      "Handle a risk",
      "Prepare the Weekly Sync",
      "Work a deal",
      "Track hours and tickets",
      "Offboard a teammate",
    ]);
  });
});

describe("filterHelpGuides", () => {
  it("never shows the offboarding guide to a non-admin", () => {
    for (const has of [none, projectRead, pipelineOnly, execOnly]) {
      expect(filterHelpGuides(has, "").map((g) => g.id)).not.toContain("guide-offboard-teammate");
      expect(filterHelpGuides(has, "Hand over and deactivate")).toEqual([]);
    }
    expect(filterHelpGuides(wildcard, "").map((g) => g.id)).toContain("guide-offboard-teammate");
  });

  it("gates the deal guide on pipeline:view", () => {
    expect(filterHelpGuides(projectRead, "").map((g) => g.id)).not.toContain("guide-work-a-deal");
    expect(filterHelpGuides(pipelineOnly, "").map((g) => g.id)).toEqual(["guide-work-a-deal"]);
  });

  it("finds the project and deal guides when searching for hold", () => {
    const ids = filterHelpGuides(wildcard, "hold").map((g) => g.id);
    expect(ids).toContain("guide-run-a-project");
    expect(ids).toContain("guide-work-a-deal");
  });

  it("matches the lifecycle UI labels in the project guide", () => {
    for (const label of [
      "Cancel project and its open tasks?",
      "Keep project",
      "Update the timeline?",
      "Days to shift open dates",
      "I'll update the timeline myself",
    ]) {
      expect(filterHelpGuides(projectRead, label).map((g) => g.id), label).toContain("guide-run-a-project");
    }
  });
});
