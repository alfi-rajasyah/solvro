import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { hasPermission, requireAuth } from "../http/auth.js";
import { validate } from "../http/validate.js";
import { projectVisibilityFilter } from "../lib/visibility.js";
import {
  isValidDayString,
  overdueBoundary,
  utcMidnightOfDayString,
} from "../lib/dateBoundary.js";
import { parseWeekKey } from "../lib/isoWeek.js";

// One-request payload for the Daily Review page (spec §5.1). Every
// sub-collection is fetched with a single batched `findMany` keyed by an
// `in` list of ids computed from the in-scope project/customer set — never
// a per-project or per-customer query — so the request stays O(1) queries
// regardless of how many active projects/customers are in scope (backend
// NFR: sub-200ms).

const WEEK_KEY_FORMAT = /^\d{4}-W\d{2}$/;

const dailyReviewQuerySchema = z.object({
  week: z
    .string()
    .refine((w) => WEEK_KEY_FORMAT.test(w), { message: "invalid_week" })
    .refine((w) => parseWeekKey(w) !== null, { message: "invalid_week" }),
  today: z.string().refine(isValidDayString, { message: "invalid_today" }),
});

// --- Ports of frontend/src/pages/DailyReview.tsx's currentPhase() /
// scheduleSignal() (lines 254-292 as of the v1 page), computed server-side
// so the payload ships the finished value instead of raw task lists.

interface PhaseTask {
  status: string;
  section: { id: number; name: string; position: number } | null;
}

// Earliest section (by position) that still has a non-DONE task. Mirrors
// currentPhase() in the frontend exactly, including the two terminal
// strings ("All phases complete" when every section is done, "—" when the
// project has no sections at all).
function currentPhase(tasks: PhaseTask[]): string {
  const bySection = new Map<
    number,
    { name: string; pos: number; total: number; done: number }
  >();
  for (const t of tasks) {
    if (!t.section) continue;
    const e =
      bySection.get(t.section.id) ??
      { name: t.section.name, pos: t.section.position, total: 0, done: 0 };
    e.total++;
    if (t.status === "DONE") e.done++;
    bySection.set(t.section.id, e);
  }
  const ordered = [...bySection.values()].sort((a, b) => a.pos - b.pos);
  const cur = ordered.find((s) => s.done < s.total);
  if (cur) return cur.name;
  return ordered.length > 0 ? "All phases complete" : "—";
}

interface SlipTask {
  dueDate: Date | null;
  baselineDueDate: Date | null;
}

// Mirrors scheduleSignal()'s slip math, minus the label/tone — the frontend
// derives its own chip from this number. null whenever there is no baseline
// lock, or either side of the comparison has no dated tasks.
function computeSlipDays(baselineLockedAt: Date | null, tasks: SlipTask[]): number | null {
  if (!baselineLockedAt) return null;
  let maxDue: number | null = null;
  let maxBaselineDue: number | null = null;
  for (const t of tasks) {
    if (t.dueDate) {
      const ms = t.dueDate.getTime();
      if (maxDue === null || ms > maxDue) maxDue = ms;
    }
    if (t.baselineDueDate) {
      const ms = t.baselineDueDate.getTime();
      if (maxBaselineDue === null || ms > maxBaselineDue) maxBaselineDue = ms;
    }
  }
  if (maxDue === null || maxBaselineDue === null) return null;
  return Math.round((maxDue - maxBaselineDue) / 86_400_000);
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/** "yyyy-MM-dd" of a `@db.Date` column's UTC-midnight instant. */
function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const dailyReviewRouter = Router();

dailyReviewRouter.use(requireAuth);

dailyReviewRouter.get(
  "/",
  validate("query", dailyReviewQuerySchema),
  async (req, res) => {
    const { week: weekKey, today } = req.query as unknown as z.infer<
      typeof dailyReviewQuerySchema
    >;
    // Already validated non-null by the query schema's second refine.
    const week = parseWeekKey(weekKey)!;
    const user = req.user!;
    // hasPermission treats "*" as satisfying every permission check, so this
    // single predicate also covers wildcard (ADMIN) users — see
    // lib/visibility.ts's projectVisibilityFilter, which the same check
    // gates internally.
    const viewAll = hasPermission(user, "project:view-all");

    const weekStartDate = utcMidnightOfDayString(week.start);
    const weekEndDate = utcMidnightOfDayString(week.days[6]);
    const overdueBoundaryDate = overdueBoundary(today);

    // Decision 13: ACTIVE projects in scope. Non-view-all users are further
    // restricted to their own tamId — never re-derived ad hoc from
    // projectVisibilityFilter alone, since that also admits SA-only matches.
    // AND-composed (not object-spread) so projectVisibilityFilter's own keys
    // can never collide with or be silently overwritten by a sibling
    // condition — same pattern as routes/overview.ts's `scope`.
    const projectWhere: Prisma.ProjectWhereInput = {
      AND: [
        projectVisibilityFilter(user),
        { status: "ACTIVE" },
        ...(viewAll ? [] : [{ tamId: user.sub }]),
      ],
    };

    const projects = await prisma.project.findMany({
      where: projectWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        customerId: true,
        baselineLockedAt: true,
      },
    });
    const projectIds = projects.map((p) => p.id);

    const [tasks, risks, projectNotes, reviews] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: { in: projectIds } },
        select: {
          id: true,
          projectId: true,
          title: true,
          status: true,
          dueDate: true,
          baselineDueDate: true,
          section: { select: { id: true, name: true, position: true } },
        },
      }),
      prisma.risk.findMany({
        where: { projectId: { in: projectIds }, status: "OPEN" },
        select: {
          id: true,
          projectId: true,
          description: true,
          probability: true,
          impact: true,
          status: true,
        },
      }),
      prisma.projectNote.findMany({
        where: {
          projectId: { in: projectIds },
          noteDate: { gte: weekStartDate, lte: weekEndDate },
        },
        orderBy: [{ noteDate: "asc" }, { id: "asc" }],
        select: {
          id: true,
          projectId: true,
          noteDate: true,
          body: true,
          updatedAt: true,
          author: { select: { id: true, username: true } },
        },
      }),
      prisma.projectReview.findMany({
        where: {
          projectId: { in: projectIds },
          userId: user.sub,
          reviewDate: { gte: weekStartDate, lte: weekEndDate },
        },
        select: { projectId: true, reviewDate: true, createdAt: true },
      }),
    ]);

    // Decision 14: customers of the in-scope projects, union customers this
    // user owns as TAM (view-all: union every customer with a TAM set).
    const customerIdsFromProjects = [
      ...new Set(
        projects
          .map((p) => p.customerId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const customerWhere: Prisma.CustomerWhereInput = {
      OR: [
        { id: { in: customerIdsFromProjects } },
        viewAll ? { tamId: { not: null } } : { tamId: user.sub },
      ],
    };

    const customers = await prisma.customer.findMany({
      where: customerWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        tam: { select: { id: true, username: true } },
      },
    });
    const customerIds = customers.map((c) => c.id);

    const [customerNotes, weeklyUpdates] = await Promise.all([
      prisma.customerNote.findMany({
        where: {
          customerId: { in: customerIds },
          noteDate: { gte: weekStartDate, lte: weekEndDate },
        },
        orderBy: [{ noteDate: "asc" }, { id: "asc" }],
        select: {
          id: true,
          customerId: true,
          noteDate: true,
          body: true,
          title: true,
          updatedAt: true,
          author: { select: { id: true, username: true } },
        },
      }),
      prisma.weeklyUpdate.findMany({
        where: { customerId: { in: customerIds }, weekStart: weekStartDate },
        select: {
          id: true,
          customerId: true,
          weekStart: true,
          body: true,
          health: true,
          status: true,
          doneAt: true,
          updatedAt: true,
          author: { select: { id: true, username: true } },
        },
      }),
    ]);

    // --- Assemble per-project DTOs, then bucket them under their customer
    // (or unassignedProjects) and fold in the week's coverage counts.

    const tasksByProject = groupBy(tasks, (t) => t.projectId);
    const risksByProject = groupBy(risks, (r) => r.projectId);
    const notesByProject = groupBy(projectNotes, (n) => n.projectId);
    const reviewsByProject = groupBy(reviews, (r) => r.projectId);

    const projectDtos = projects.map((p) => {
      const projectTasks = tasksByProject.get(p.id) ?? [];
      const projectRisks = risksByProject.get(p.id) ?? [];
      const projectNotesForProject = notesByProject.get(p.id) ?? [];
      const projectReviews = reviewsByProject.get(p.id) ?? [];
      const total = projectTasks.length;
      const done = projectTasks.filter((t) => t.status === "DONE").length;

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        customerId: p.customerId,
        baselineLockedAt: p.baselineLockedAt,
        phase: currentPhase(projectTasks),
        progress: { done, total },
        slipDays: computeSlipDays(p.baselineLockedAt, projectTasks),
        overdueTasks: projectTasks
          .filter(
            (t) =>
              t.status !== "DONE" &&
              t.dueDate !== null &&
              t.dueDate.getTime() < overdueBoundaryDate.getTime(),
          )
          .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status })),
        openRisks: projectRisks.map((r) => ({
          id: r.id,
          description: r.description,
          probability: r.probability,
          impact: r.impact,
          status: r.status,
        })),
        notes: projectNotesForProject.map((n) => ({
          id: n.id,
          noteDate: n.noteDate,
          body: n.body,
          author: n.author,
          updatedAt: n.updatedAt,
        })),
        reviews: projectReviews.map((r) => ({
          reviewDate: r.reviewDate,
          createdAt: r.createdAt,
        })),
      };
    });

    const projectsByCustomerId = groupBy(
      projectDtos.filter((p) => p.customerId !== null),
      (p) => p.customerId as number,
    );
    const unassignedProjects = projectDtos.filter((p) => p.customerId === null);

    const customerNotesByCustomer = groupBy(customerNotes, (n) => n.customerId);
    const weeklyUpdateByCustomer = new Map(weeklyUpdates.map((wu) => [wu.customerId, wu]));

    const customerDtos = customers.map((c) => {
      const weeklyUpdate = weeklyUpdateByCustomer.get(c.id);
      return {
        id: c.id,
        name: c.name,
        tam: c.tam,
        projects: projectsByCustomerId.get(c.id) ?? [],
        operationsNotes: (customerNotesByCustomer.get(c.id) ?? []).map((n) => ({
          id: n.id,
          noteDate: n.noteDate,
          body: n.body,
          title: n.title,
          author: n.author,
          updatedAt: n.updatedAt,
        })),
        weeklyUpdate: weeklyUpdate
          ? {
              id: weeklyUpdate.id,
              weekStart: weeklyUpdate.weekStart,
              body: weeklyUpdate.body,
              health: weeklyUpdate.health,
              status: weeklyUpdate.status,
              doneAt: weeklyUpdate.doneAt,
              author: weeklyUpdate.author,
              updatedAt: weeklyUpdate.updatedAt,
            }
          : null,
      };
    });

    // Decision 20: coverage counts customers, not projects. total = number
    // of customers on the page (customerDtos.length) — the "No customer"
    // group is excluded, since it has no customer entity to count. Built
    // from customerDtos (not projectNotes/customerNotes directly) so only a
    // customer's own projects — already scoped to that customer via
    // projectsByCustomerId — are checked; an unassigned project's note
    // never counts. A customer with two projects both noted the same day
    // still counts once (Set, not a sum).
    const coverage: Record<string, { withNote: number; total: number }> = {};
    for (const day of week.days) coverage[day] = { withNote: 0, total: customerDtos.length };
    for (const c of customerDtos) {
      const daysWithNote = new Set<string>();
      for (const p of c.projects) {
        for (const n of p.notes) daysWithNote.add(dayOf(n.noteDate));
      }
      for (const n of c.operationsNotes) daysWithNote.add(dayOf(n.noteDate));
      for (const day of daysWithNote) {
        if (coverage[day]) coverage[day].withNote++;
      }
    }

    res.json({
      week,
      today,
      coverage,
      customers: customerDtos,
      unassignedProjects,
    });
  },
);
