import { describe, expect, it } from "vitest";
import type { DailyReviewCustomer, WeeklyUpdate } from "./queries";
import { buildSyncTable, hasManagerDecision, orderForTab, toHtmlTable, toTsv } from "./weeklySyncTable";

let nextId = 1;

function weeklyUpdate(fields: Partial<WeeklyUpdate> = {}): WeeklyUpdate {
  return {
    id: nextId++,
    weekStart: "2026-08-24T00:00:00.000Z",
    health: null,
    status: "DRAFT",
    doneAt: null,
    category: null,
    highlight: null,
    risk: null,
    action: null,
    achievement: null,
    outstandingIssue: null,
    lessonLearned: null,
    nextWeekFocus: null,
    managerDecision: null,
    midweekSavedAt: null,
    author: { id: 1, username: "alfi" },
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...fields,
  };
}

function customer(name: string, update: Partial<WeeklyUpdate> | null = {}): DailyReviewCustomer {
  return {
    id: nextId++,
    name,
    tam: null,
    projects: [],
    operationsNotes: [],
    weeklyUpdate: update === null ? null : weeklyUpdate(update),
    previousWeeklyUpdate: null,
  };
}

describe("hasManagerDecision", () => {
  it("is false for null, missing, and whitespace-only decisions", () => {
    expect(hasManagerDecision(customer("A", null))).toBe(false);
    expect(hasManagerDecision(customer("B", { managerDecision: null }))).toBe(false);
    expect(hasManagerDecision(customer("C", { managerDecision: "   " }))).toBe(false);
  });

  it("is true for a non-empty decision", () => {
    expect(hasManagerDecision(customer("D", { managerDecision: "Approve budget" }))).toBe(true);
  });
});

describe("orderForTab", () => {
  it("keeps input order unchanged on the mid-week tab", () => {
    const customers = [
      customer("Acme", { managerDecision: "Needs sign-off" }),
      customer("Globex"),
      customer("Initech"),
    ];
    expect(orderForTab("midweek", customers)).toEqual(customers);
  });

  it("pins customers with a non-empty manager decision first on the reflection tab, each group in input order", () => {
    const acme = customer("Acme");
    const globex = customer("Globex", { managerDecision: "Approve extra budget" });
    const initech = customer("Initech");
    const umbrella = customer("Umbrella", { managerDecision: "  " }); // whitespace-only, not pinned
    const soylent = customer("Soylent", { managerDecision: "Escalate to VP" });

    const ordered = orderForTab("reflection", [acme, globex, initech, umbrella, soylent]);

    expect(ordered.map((c) => c.name)).toEqual(["Globex", "Soylent", "Acme", "Initech", "Umbrella"]);
  });

  it("does not mutate the input array", () => {
    const customers = [customer("Acme", { managerDecision: "x" }), customer("Globex")];
    const copy = [...customers];
    orderForTab("reflection", customers);
    expect(customers).toEqual(copy);
  });
});

describe("buildSyncTable", () => {
  it("uses the mid-week header order: Customer, Health, Category, Highlight, Risk, Action", () => {
    const table = buildSyncTable("midweek", []);
    expect(table.header).toEqual(["Customer", "Health", "Category", "Highlight", "Risk", "Action"]);
  });

  it("uses the reflection header order: Customer, then the reflection fields — no Health or Category column", () => {
    const table = buildSyncTable("reflection", []);
    expect(table.header).toEqual([
      "Customer",
      "Weekly achievement",
      "Outstanding issue",
      "Lesson learned",
      "Next week focus",
      "Need manager decision",
    ]);
  });

  it("renders a full mid-week row", () => {
    const table = buildSyncTable("midweek", [
      customer("Acme", {
        category: "Onboarding",
        health: "AMBER",
        highlight: "Kickoff done",
        risk: "Vendor delay",
        action: "Chase vendor",
      }),
    ]);
    expect(table.rows).toEqual([["Acme", "Amber", "Onboarding", "Kickoff done", "Vendor delay", "Chase vendor"]]);
  });

  it("renders a full reflection row with no Health/Category cells even when the customer has them set", () => {
    const table = buildSyncTable("reflection", [
      customer("Acme", {
        category: "Onboarding",
        health: "GREEN",
        achievement: "Shipped v1",
        outstandingIssue: "None",
        lessonLearned: "Start earlier",
        nextWeekFocus: "Phase 2",
        managerDecision: "Approve extra scope",
      }),
    ]);
    expect(table.rows).toEqual([
      ["Acme", "Shipped v1", "None", "Start earlier", "Phase 2", "Approve extra scope"],
    ]);
  });

  it("renders — for null and whitespace-only fields, and for a customer with no update at all", () => {
    const table = buildSyncTable("midweek", [
      customer("Blank", { category: null, health: null, highlight: "   ", risk: "", action: undefined }),
      customer("NoUpdate", null),
    ]);
    expect(table.rows).toEqual([
      ["Blank", "—", "—", "—", "—", "—"],
      ["NoUpdate", "—", "—", "—", "—", "—"],
    ]);
  });

  it("does not reorder — callers pass orderForTab's output when pinning is wanted", () => {
    const globex = customer("Globex");
    const acme = customer("Acme", { managerDecision: "Escalate" });
    const table = buildSyncTable("reflection", [globex, acme]);
    expect(table.rows.map((r) => r[0])).toEqual(["Globex", "Acme"]);
  });
});

describe("toHtmlTable", () => {
  it("wraps header and rows in a real <table><thead>/<tbody>", () => {
    const html = toHtmlTable({ header: ["Customer", "Health"], rows: [["Acme", "Green"]] });
    expect(html).toBe(
      "<table><thead><tr><th>Customer</th><th>Health</th></tr></thead>" +
        "<tbody><tr><td>Acme</td><td>Green</td></tr></tbody></table>",
    );
  });

  it("escapes <, &, \", and ' in both header and cell text", () => {
    const html = toHtmlTable({
      header: ['Risk & "Action"'],
      rows: [["<script>alert('x')</script> & co"]],
    });
    expect(html).toContain("<th>Risk &amp; &quot;Action&quot;</th>");
    expect(html).toContain(
      "<td>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; co</td>",
    );
  });

  it("renders an internal newline as <br>", () => {
    const html = toHtmlTable({ header: ["Notes"], rows: [["Line one\nLine two"]] });
    expect(html).toContain("<td>Line one<br>Line two</td>");
  });
});

describe("toTsv", () => {
  it("joins header + rows with tabs and newlines", () => {
    const tsv = toTsv({ header: ["Customer", "Health"], rows: [["Acme", "Green"], ["Globex", "Amber"]] });
    expect(tsv).toBe("Customer\tHealth\nAcme\tGreen\nGlobex\tAmber");
  });

  it("replaces a tab or newline inside a cell with a space", () => {
    const tsv = toTsv({ header: ["Notes"], rows: [["Line one\nLine two\twith a tab"]] });
    expect(tsv).toBe("Notes\nLine one Line two with a tab");
  });
});
