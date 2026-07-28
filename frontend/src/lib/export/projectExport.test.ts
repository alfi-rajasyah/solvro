import { describe, expect, it } from "vitest";
import { dateToDay, isoFromDay } from "@/lib/dateField";
import type { ProjectSummary, Task } from "@/lib/queries";
import { buildProjectExportMarkdown, exportFileName } from "./projectExport";

/**
 * Overdue-boundary regression.
 *
 * Pre-fix, the overdue check compared an ISO instant (`new Date(t.dueDate)`)
 * against local "now" (`startOfToday()`), so the boundary shifted with host
 * timezone: a task due "today" (UTC midnight) could read as already overdue
 * on an east-of-UTC host before local midnight rolled the calendar day back
 * far enough, or the reverse on other offsets. The fix compares calendar-day
 * STRINGS (`dayFromIso(t.dueDate) < dateToDay(today)`), which is
 * TZ-independent by construction — see `dateField.ts`'s module doc.
 *
 * This suite derives "today"/"yesterday" from the SAME `dateToDay(new
 * Date())` the module under test uses internally, rather than a hardcoded
 * wall-clock date, so it is correct under any host TZ the gate/CI runs in
 * (matches the both-TZ convention `dateField.test.ts` documents).
 */

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 1,
    projectId: 1,
    title: "Task",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    startDate: null,
    dueDate: null,
    isMilestone: false,
    baselineStartDate: null,
    baselineDueDate: null,
    assignedToId: null,
    assignedTo: null,
    parentTaskId: null,
    sectionId: null,
    section: null,
    position: 0,
    labels: [],
    _count: { subtasks: 0, comments: 0 },
    ...overrides,
  };
}

const project: ProjectSummary = {
  id: 1,
  name: "Test Project",
  description: null,
  status: "ACTIVE",
  saId: null,
  tamId: 1,
  customerId: null,
  wipLimits: null,
  excludeFromPortfolio: false,
  baselineLockedAt: null,
  baselineLockedById: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sa: null,
  tam: { id: 1, username: "tam" },
  customer: null,
  _count: { tasks: 0 },
};

function todayDay(): string {
  return dateToDay(new Date())!;
}

function yesterdayDay(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateToDay(d)!;
}

describe("exportFileName — local calendar day", () => {
  it("stamps the local calendar day, not the UTC clock date", () => {
    // Same defect class as the overdue-boundary fix
    // below — `startOfToday().toISOString().slice(0, 10)` reads the UTC
    // date-part of a local-midnight instant, which is "yesterday" east of
    // UTC before the UTC clock rolls over. `dateToDay` derives local Y/M/D
    // directly, so the filename always matches `dateToDay(new Date())`
    // regardless of host TZ.
    const name = exportFileName("Acme Corp");
    expect(name).toBe(`acme-corp_export_${todayDay()}.md`);
  });
});

describe("buildProjectExportMarkdown — overdue boundary", () => {
  it("does not count a task due today as overdue", () => {
    const tasks = [
      makeTask({ id: 1, status: "TODO", dueDate: isoFromDay(todayDay()) }),
    ];
    const md = buildProjectExportMarkdown({
      project,
      tasks,
      risks: [],
      sections: [],
      dependencies: [],
      customerNotes: [],
      generatedAt: new Date(),
    });
    expect(md).toContain("**Overdue:** 0");
  });

  it("counts a task due yesterday as overdue", () => {
    const tasks = [
      makeTask({ id: 1, status: "TODO", dueDate: isoFromDay(yesterdayDay()) }),
    ];
    const md = buildProjectExportMarkdown({
      project,
      tasks,
      risks: [],
      sections: [],
      dependencies: [],
      customerNotes: [],
      generatedAt: new Date(),
    });
    expect(md).toContain("**Overdue:** 1");
  });

  it("never counts a DONE task as overdue regardless of due date", () => {
    const tasks = [
      makeTask({ id: 1, status: "DONE", dueDate: isoFromDay(yesterdayDay()) }),
    ];
    const md = buildProjectExportMarkdown({
      project,
      tasks,
      risks: [],
      sections: [],
      dependencies: [],
      customerNotes: [],
      generatedAt: new Date(),
    });
    expect(md).toContain("**Overdue:** 0");
  });
});

describe("buildProjectExportMarkdown — note visibility guardrail", () => {
  it("never emits an INTERNAL note even if the caller mis-queries customerNotes", () => {
    const md = buildProjectExportMarkdown({
      project,
      tasks: [],
      risks: [],
      sections: [],
      dependencies: [],
      customerNotes: [
        {
          id: 1,
          projectId: 1,
          authorId: 1,
          body: "SECRET internal-only note",
          visibility: "INTERNAL",
          createdAt: new Date().toISOString(),
          author: { id: 1, username: "tam" },
        },
        {
          id: 2,
          projectId: 1,
          authorId: 1,
          body: "customer-visible note",
          visibility: "CUSTOMER_FACING",
          createdAt: new Date().toISOString(),
          author: { id: 1, username: "tam" },
        },
      ],
      generatedAt: new Date(),
    });
    expect(md).not.toContain("SECRET internal-only note");
    expect(md).toContain("customer-visible note");
  });
});
