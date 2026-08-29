// GET /daily-review — one payload for the Daily Review page (spec §5.1,
// §9). Fixtures write directly via `prisma` rather than through
// routes/projects.ts / routes/customers.ts, both of which are being built
// out in parallel by sibling tasks this suite must not depend on.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { ProjectStatus } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { createAdminAndToken, createUserWithRole, seedRoles } from "./testAuth.js";

const app = createApp();

beforeAll(async () => {
  await seedRoles();
});

const WEEK = "2026-W35"; // Mon 2026-08-24 .. Sun 2026-08-30
const TODAY = "2026-08-28";
// The wire contract for `@db.Date` columns: Prisma serialises them as
// UTC-midnight instants (docs/plans/date-contract-utc-midnight.md), while
// `week.days`/`week.start`/`today` are plain "yyyy-MM-dd" day strings — the
// two shapes must never be confused by a frontend consumer.
const DAY_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;
function dayInstant(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function uniq(label: string): string {
  return `${label} ${Date.now()}-${Math.random()}`;
}

async function createCustomer(overrides: { name?: string; tamId?: number | null } = {}) {
  return prisma.customer.create({
    data: {
      name: overrides.name ?? uniq("Customer"),
      description: "d",
      tamId: overrides.tamId ?? null,
    },
  });
}

async function createProject(overrides: {
  tamId: number;
  customerId?: number | null;
  status?: ProjectStatus;
  name?: string;
  baselineLockedAt?: Date | null;
}) {
  return prisma.project.create({
    data: {
      name: overrides.name ?? uniq("Project"),
      tamId: overrides.tamId,
      customerId: overrides.customerId ?? null,
      status: overrides.status ?? "ACTIVE",
      baselineLockedAt: overrides.baselineLockedAt ?? null,
    },
  });
}

function get(token: string, query: Record<string, string>) {
  return request(app)
    .get("/daily-review")
    .query(query)
    .set("Authorization", `Bearer ${token}`);
}

function allProjectDtos(body: any): any[] {
  return [
    ...body.unassignedProjects,
    ...body.customers.flatMap((c: any) => c.projects),
  ];
}

describe("GET /daily-review — scope (Decisions 13-14)", () => {
  it("a TAM sees only its own ACTIVE projects, excludes PLANNING and other TAMs' projects, and sees its own customers", async () => {
    const tam = await createUserWithRole("TAM");
    const otherTam = await createUserWithRole("TAM");
    const customer = await createCustomer({ tamId: tam.userId });
    await createProject({ tamId: tam.userId, customerId: customer.id, status: "ACTIVE", name: "Mine Active" });
    await createProject({ tamId: tam.userId, customerId: customer.id, status: "PLANNING", name: "Mine Planning" });
    await createProject({ tamId: otherTam.userId, status: "ACTIVE", name: "Other TAM Active" });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);

    const names = allProjectDtos(res.body).map((p) => p.name);
    expect(names).toContain("Mine Active");
    expect(names).not.toContain("Mine Planning");
    expect(names).not.toContain("Other TAM Active");
    expect(res.body.customers.map((c: any) => c.id)).toContain(customer.id);
  });

  it("ADMIN (wildcard) sees every ACTIVE project", async () => {
    const admin = await createAdminAndToken();
    const tam = await createUserWithRole("TAM");
    await createProject({ tamId: tam.userId, status: "ACTIVE", name: "Visible To Admin" });

    const res = await get(admin.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    expect(allProjectDtos(res.body).map((p) => p.name)).toContain("Visible To Admin");
  });

  it("STAKEHOLDER (project:view-all) sees all ACTIVE projects and every tamId-set customer", async () => {
    const stakeholder = await createUserWithRole("STAKEHOLDER");
    const tam = await createUserWithRole("TAM");
    const customer = await createCustomer({ tamId: tam.userId, name: uniq("Stakeholder Customer") });
    await createProject({ tamId: tam.userId, status: "ACTIVE", customerId: customer.id, name: "Stakeholder Visible" });
    // A customer with a TAM set but no active project must still show for a
    // view-all user (Decision 14's "union every customer with tamId set").
    const orphanCustomer = await createCustomer({ tamId: tam.userId, name: uniq("Orphan Customer") });

    const res = await get(stakeholder.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    const customerIds = res.body.customers.map((c: any) => c.id);
    expect(customerIds).toContain(customer.id);
    expect(customerIds).toContain(orphanCustomer.id);
    expect(allProjectDtos(res.body).map((p: any) => p.name)).toContain("Stakeholder Visible");
  });
});

describe("GET /daily-review — week/today validation", () => {
  it.each(["2025-W53", "2026-W00", "2026-W54", "2026-35"])(
    "400 invalid_week for %s",
    async (week) => {
      const tam = await createUserWithRole("TAM");
      const res = await get(tam.token, { week, today: TODAY });
      expect(res.status).toBe(400);
    },
  );

  it("400 when today is missing", async () => {
    const tam = await createUserWithRole("TAM");
    const res = await request(app)
      .get("/daily-review")
      .query({ week: WEEK })
      .set("Authorization", `Bearer ${tam.token}`);
    expect(res.status).toBe(400);
  });

  it("400 when today is invalid", async () => {
    const tam = await createUserWithRole("TAM");
    const res = await get(tam.token, { week: WEEK, today: "not-a-day" });
    expect(res.status).toBe(400);
  });

  it("accepts 2026-W53 (a valid 53rd ISO week)", async () => {
    const tam = await createUserWithRole("TAM");
    const res = await get(tam.token, { week: "2026-W53", today: "2026-12-29" });
    expect(res.status).toBe(200);
    expect(res.body.week.key).toBe("2026-W53");
    expect(res.body.week.days).toHaveLength(7);
  });

  it("week.days, week.start, and today are bare yyyy-MM-dd day strings, not instants", async () => {
    const tam = await createUserWithRole("TAM");
    const res = await get(tam.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.today).toBe(TODAY);
    expect(res.body.today).toMatch(DAY_STRING_RE);
    expect(res.body.week.start).toMatch(DAY_STRING_RE);
    expect(res.body.week.days).toHaveLength(7);
    for (const day of res.body.week.days) {
      expect(day).toMatch(DAY_STRING_RE);
    }
  });
});

describe("GET /daily-review — unassigned projects", () => {
  it("a customerId:null project lands in unassignedProjects, not under any customer", async () => {
    const tam = await createUserWithRole("TAM");
    const project = await createProject({ tamId: tam.userId, status: "ACTIVE", customerId: null, name: "No Customer Proj" });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.unassignedProjects.some((p: any) => p.id === project.id)).toBe(true);
    for (const c of res.body.customers) {
      expect(c.projects.some((p: any) => p.id === project.id)).toBe(false);
    }
  });
});

describe("GET /daily-review — coverage (Decision 20: per customer)", () => {
  it("counts a customer once even when two of its projects are noted the same day, and emits all 7 days", async () => {
    const tam = await createUserWithRole("TAM");
    const customer = await createCustomer({ tamId: tam.userId, name: uniq("Coverage Customer") });
    const p1 = await createProject({ tamId: tam.userId, customerId: customer.id, status: "ACTIVE", name: uniq("P1") });
    const p2 = await createProject({ tamId: tam.userId, customerId: customer.id, status: "ACTIVE", name: uniq("P2") });
    const day = "2026-08-25";
    await prisma.projectNote.create({
      data: { projectId: p1.id, authorId: tam.userId, body: "n1", noteDate: new Date(dayInstant(day)) },
    });
    await prisma.projectNote.create({
      data: { projectId: p1.id, authorId: tam.userId, body: "n1b", noteDate: new Date(dayInstant(day)) },
    });
    await prisma.projectNote.create({
      data: { projectId: p2.id, authorId: tam.userId, body: "n2", noteDate: new Date(dayInstant(day)) },
    });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.coverage)).toHaveLength(7);
    // One customer, both projects noted the same day → counts once, not twice.
    expect(res.body.coverage[day]).toEqual({ withNote: 1, total: 1 });
    expect(res.body.coverage["2026-08-24"]).toEqual({ withNote: 0, total: 1 });

    // Pin the wire shape: a ProjectNote's `noteDate` ships as the
    // UTC-midnight instant of the day it was written for, not the bare day
    // string used for `week.days`/`today`.
    const cust = res.body.customers.find((c: any) => c.id === customer.id);
    const p1Dto = cust.projects.find((p: any) => p.id === p1.id);
    expect(p1Dto.notes).toHaveLength(2);
    for (const note of p1Dto.notes) {
      expect(note.noteDate).toBe(dayInstant(day));
    }
  });

  it("counts a customer via an operations note alone, with no project note", async () => {
    const tam = await createUserWithRole("TAM");
    const customer = await createCustomer({ tamId: tam.userId, name: uniq("Ops Only Customer") });
    const day = "2026-08-26";
    await prisma.customerNote.create({
      data: {
        customerId: customer.id,
        authorId: tam.userId,
        body: "ops",
        title: "Ops issue",
        noteDate: new Date(dayInstant(day)),
      },
    });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.coverage[day]).toEqual({ withNote: 1, total: 1 });
  });

  it("does not count a note on an unassigned (customerId: null) project", async () => {
    const tam = await createUserWithRole("TAM");
    const day = "2026-08-27";
    const project = await createProject({ tamId: tam.userId, status: "ACTIVE", customerId: null, name: uniq("Unassigned") });
    await prisma.projectNote.create({
      data: { projectId: project.id, authorId: tam.userId, body: "n", noteDate: new Date(dayInstant(day)) },
    });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    // No customer at all in this TAM's scope, so total is 0 and the
    // unassigned project's note contributes nothing to withNote.
    expect(res.body.coverage[day]).toEqual({ withNote: 0, total: 0 });
  });

  it("total is the number of customers on the page, not the number of projects", async () => {
    const tam = await createUserWithRole("TAM");
    const c1 = await createCustomer({ tamId: tam.userId, name: uniq("C1") });
    const c2 = await createCustomer({ tamId: tam.userId, name: uniq("C2") });
    // c1 gets two projects, c2 gets none — c2 still counts toward total
    // (Decision 20: total is customers on the page, not customers with
    // projects).
    await createProject({ tamId: tam.userId, customerId: c1.id, status: "ACTIVE", name: uniq("P1") });
    await createProject({ tamId: tam.userId, customerId: c1.id, status: "ACTIVE", name: uniq("P2") });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.coverage[TODAY].total).toBe(2);
  });
});

describe("GET /daily-review — overdue boundary", () => {
  it("uses `today`: due yesterday is overdue, due today is not, DONE is never overdue", async () => {
    const tam = await createUserWithRole("TAM");
    const project = await createProject({ tamId: tam.userId, status: "ACTIVE", name: "Overdue Proj" });
    const yesterdayTask = await prisma.task.create({
      data: { projectId: project.id, title: "Yesterday", status: "TODO", dueDate: new Date("2026-08-27T00:00:00.000Z") },
    });
    const todayTask = await prisma.task.create({
      data: { projectId: project.id, title: "Today", status: "TODO", dueDate: new Date("2026-08-28T00:00:00.000Z") },
    });
    const doneYesterdayTask = await prisma.task.create({
      data: { projectId: project.id, title: "DoneYesterday", status: "DONE", dueDate: new Date("2026-08-27T00:00:00.000Z") },
    });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    expect(res.status).toBe(200);
    const dto = res.body.unassignedProjects.find((p: any) => p.id === project.id);
    const overdueIds = dto.overdueTasks.map((t: any) => t.id);
    expect(overdueIds).toContain(yesterdayTask.id);
    expect(overdueIds).not.toContain(todayTask.id);
    expect(overdueIds).not.toContain(doneYesterdayTask.id);
  });
});

describe("GET /daily-review — phase, progress, slipDays", () => {
  it("phase is the lowest-position unfinished section; slipDays is null without a baseline lock, then the day delta once locked", async () => {
    const tam = await createUserWithRole("TAM");
    const project = await createProject({ tamId: tam.userId, status: "ACTIVE", name: "Phase Proj" });
    const design = await prisma.section.create({ data: { projectId: project.id, name: "Design", position: 0 } });
    const build = await prisma.section.create({ data: { projectId: project.id, name: "Build", position: 1 } });
    await prisma.task.create({ data: { projectId: project.id, sectionId: design.id, title: "t1", status: "DONE" } });
    const t2 = await prisma.task.create({ data: { projectId: project.id, sectionId: build.id, title: "t2", status: "TODO" } });
    await prisma.task.create({ data: { projectId: project.id, sectionId: build.id, title: "t3", status: "DONE" } });

    let res = await get(tam.token, { week: WEEK, today: TODAY });
    let dto = res.body.unassignedProjects.find((p: any) => p.id === project.id);
    expect(dto.phase).toBe("Build");
    expect(dto.progress).toEqual({ done: 2, total: 3 });
    expect(dto.slipDays).toBeNull();

    await prisma.project.update({ where: { id: project.id }, data: { baselineLockedAt: new Date() } });
    await prisma.task.update({
      where: { id: t2.id },
      data: {
        baselineDueDate: new Date("2026-08-20T00:00:00.000Z"),
        dueDate: new Date("2026-08-25T00:00:00.000Z"),
      },
    });

    res = await get(tam.token, { week: WEEK, today: TODAY });
    dto = res.body.unassignedProjects.find((p: any) => p.id === project.id);
    expect(dto.slipDays).toBe(5);
  });

  it("phase is 'All phases complete' when every section is done, and '—' when there are no sections", async () => {
    const tam = await createUserWithRole("TAM");
    const noSections = await createProject({ tamId: tam.userId, status: "ACTIVE", name: "No Sections" });
    await prisma.task.create({ data: { projectId: noSections.id, title: "loose", status: "TODO" } });

    const allDone = await createProject({ tamId: tam.userId, status: "ACTIVE", name: "All Done" });
    const onlySection = await prisma.section.create({ data: { projectId: allDone.id, name: "Only", position: 0 } });
    await prisma.task.create({ data: { projectId: allDone.id, sectionId: onlySection.id, title: "t", status: "DONE" } });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    const noSectionsDto = res.body.unassignedProjects.find((p: any) => p.id === noSections.id);
    const allDoneDto = res.body.unassignedProjects.find((p: any) => p.id === allDone.id);
    expect(noSectionsDto.phase).toBe("—");
    expect(allDoneDto.phase).toBe("All phases complete");
  });
});

describe("GET /daily-review — weeklyUpdate", () => {
  it("is null when no row exists for the week, and reflects the row once saved", async () => {
    const tam = await createUserWithRole("TAM");
    const customer = await createCustomer({ tamId: tam.userId, name: uniq("WU Customer") });
    await createProject({ tamId: tam.userId, status: "ACTIVE", customerId: customer.id, name: "WU Proj" });

    let res = await get(tam.token, { week: WEEK, today: TODAY });
    let cust = res.body.customers.find((c: any) => c.id === customer.id);
    expect(cust.weeklyUpdate).toBeNull();

    await prisma.weeklyUpdate.create({
      data: {
        customerId: customer.id,
        weekStart: new Date("2026-08-24T00:00:00.000Z"),
        authorId: tam.userId,
        body: "Weekly text",
        status: "DRAFT",
      },
    });

    res = await get(tam.token, { week: WEEK, today: TODAY });
    cust = res.body.customers.find((c: any) => c.id === customer.id);
    expect(cust.weeklyUpdate).not.toBeNull();
    expect(cust.weeklyUpdate.body).toBe("Weekly text");
    expect(cust.weeklyUpdate.status).toBe("DRAFT");
    // Pin the wire shape: weekStart ships as the UTC-midnight instant of
    // week.start's day, not the bare "yyyy-MM-dd" string week.start itself is.
    expect(cust.weeklyUpdate.weekStart).toBe(dayInstant(res.body.week.start));
  });
});

describe("GET /daily-review — operationsNotes", () => {
  it("carry the note's title, and the customer DTO has no services key", async () => {
    const tam = await createUserWithRole("TAM");
    const customer = await createCustomer({ tamId: tam.userId, name: uniq("Ops Customer") });
    const noteDay = "2026-08-26";
    await prisma.customerNote.create({
      data: {
        customerId: customer.id,
        authorId: tam.userId,
        noteDate: new Date(dayInstant(noteDay)),
        body: "ops note",
        title: "Backup restore ticket",
      },
    });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    const cust = res.body.customers.find((c: any) => c.id === customer.id);
    expect(cust.operationsNotes).toHaveLength(1);
    expect(cust.operationsNotes[0].title).toBe("Backup restore ticket");
    // Pin the wire shape: noteDate ships as the UTC-midnight instant of the
    // day the note was written for.
    expect(cust.operationsNotes[0].noteDate).toBe(dayInstant(noteDay));
    // The service select is gone (Decision 4) — the customer DTO no longer
    // carries a `services` list at all.
    expect(cust.services).toBeUndefined();
  });
});

describe("GET /daily-review — reviews", () => {
  it("only include the requesting user's own review rows for the week", async () => {
    const tam = await createUserWithRole("TAM");
    const otherTam = await createUserWithRole("TAM");
    const project = await createProject({ tamId: tam.userId, status: "ACTIVE", name: "Review Proj" });
    const reviewDay = "2026-08-26";
    await prisma.projectReview.create({
      data: { projectId: project.id, userId: tam.userId, reviewDate: new Date(dayInstant(reviewDay)) },
    });
    await prisma.projectReview.create({
      data: { projectId: project.id, userId: otherTam.userId, reviewDate: new Date(dayInstant(reviewDay)) },
    });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    const dto = res.body.unassignedProjects.find((p: any) => p.id === project.id);
    expect(dto.reviews).toHaveLength(1);
    // Pin the wire shape: reviewDate ships as the UTC-midnight instant of
    // the day reviewed, not a bare "yyyy-MM-dd" string.
    expect(dto.reviews[0].reviewDate).toBe(dayInstant(reviewDay));
  });
});

describe("GET /daily-review — customer ordering", () => {
  it("sorts customers by name ascending", async () => {
    const tam = await createUserWithRole("TAM");
    const custB = await createCustomer({ tamId: tam.userId, name: uniq("B-Customer") });
    const custA = await createCustomer({ tamId: tam.userId, name: uniq("A-Customer") });
    await createProject({ tamId: tam.userId, status: "ACTIVE", customerId: custB.id, name: "P-B" });
    await createProject({ tamId: tam.userId, status: "ACTIVE", customerId: custA.id, name: "P-A" });

    const res = await get(tam.token, { week: WEEK, today: TODAY });
    const names: string[] = res.body.customers.map((c: any) => c.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
