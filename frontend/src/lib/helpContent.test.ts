import { describe, expect, it } from "vitest";
import { HELP_TOPICS, filterHelpTopics } from "./helpContent";
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
