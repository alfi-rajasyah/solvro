import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { hasPermission, type JwtPayload } from "../http/auth.js";
import { HttpError } from "../http/errors.js";

// Project-scoping is permission-based, NOT role-name based. `project:view-all`
// (which "*" also satisfies via hasPermission) grants global visibility;
// everyone else sees the projects they're attached to as the assigned TAM
// or SA on the project row, every project of a customer they own as TAM
// (`Customer.tamId` — user decision 2026-08-31, so the Daily Review's
// owned-customer groups are actionable, not read-only), and every project
// they were added to as a member (`ProjectMember` — adopted 2026-10-05 from
// the customer edition, docs/archive/plans/collaboration-and-sharing.md;
// members get the same full access as the TAM, and task assignment adds one
// automatically). Two levels: "see" (all four arms) and "own" (TAM or
// customer owner only — the SA and members are never owners; user decision
// 2026-10-02, docs/archive/plans/solvro-cust-port-plan.md §10). Admin grants
// broader access by adding "project:view-all" (or "*") to a role's
// permissions in Admin > Roles.
//
// The result's only top-level key is `OR`. AND-compose (never object-spread)
// when combining it with a sibling `OR` condition.
//
// These helpers live here (not in a route file) so any router can import them
// without taking a dependency on routes/projects.ts — avoiding the circular
// import that arises when projects.ts itself needs to import sibling routes.
//
// The access level picks the arms: "see" is the default; "own" drops the SA
// and member arms and is the rule for actions that SA or membership alone must
// not allow (changing a project's TAM, SA or customer, deleting a project,
// changing/deleting a customer — see the *OwnerAccess helpers below).
export type ProjectAccess = "see" | "own";
//
// TWO REPRESENTATIONS OF THE SAME RULE live side by side below:
// `projectVisibilityFilter` (a Prisma `where`, used by every route) and
// `canUserSeeProject` (the same arms as a pure predicate over already-loaded
// project facts, used where many users are checked against ONE project in a
// fixed number of queries — lib/notifications.ts). Any change to the arms
// (a new way to see a project) must be made in BOTH; test/notifications.test.ts
// compares them for every arm, the saId arm included, so extend that test
// with any new arm.

export function projectVisibilityFilter(
  user: JwtPayload,
  access: ProjectAccess = "see",
): Prisma.ProjectWhereInput {
  if (hasPermission(user, "project:view-all")) return {};
  const arms: Prisma.ProjectWhereInput[] = [
    { tamId: user.sub },
    { customer: { tamId: user.sub } },
  ];
  if (access === "see") {
    // "see" level only: the SA arm and the member arm grant visibility,
    // never ownership.
    arms.push({ saId: user.sub });
    arms.push({ members: { some: { userId: user.sub } } });
  }
  return { OR: arms };
}

// Pure twins of the filter for callers that already hold the project's facts
// (notifications/activity scoping): they must agree with the filter above.
export interface ProjectVisibilityFacts {
  tamId: number | null;
  saId: number | null;
  customerTamId: number | null;
  memberIds: ReadonlySet<number>;
}

export function canUserSeeProject(
  user: JwtPayload,
  p: ProjectVisibilityFacts,
): boolean {
  return (
    hasPermission(user, "project:view-all") ||
    p.tamId === user.sub ||
    p.saId === user.sub ||
    p.customerTamId === user.sub ||
    p.memberIds.has(user.sub)
  );
}

export function canUserOwnProject(
  user: JwtPayload,
  p: ProjectVisibilityFacts,
): boolean {
  return (
    hasPermission(user, "project:view-all") ||
    p.tamId === user.sub ||
    p.customerTamId === user.sub
  );
}

// 404-if-not-visible preamble for project-nested routes. Extracted so new
// project-scoped routes can't accidentally skip the visibility check while
// still passing the permission gate. Returns 404 (not 403) on purpose — don't
// tell the caller a project exists if they shouldn't see it.
export async function ensureProjectVisible(
  user: JwtPayload,
  projectId: number,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...projectVisibilityFilter(user) },
    select: { id: true },
  });
  if (!project) throw new HttpError(404, "not_found", "Project not found");
}

// Owner-only gate (user decision 2026-09-30, docs/archive/plans/collaboration-and-sharing.md):
// membership or the SA arm alone must not allow changing a project's TAM, SA
// or customer or deleting it. Visibility first (404, as everywhere), then 403
// `owner_only` when the caller can see the project but does not own it.
export async function ensureProjectOwnerAccess(
  user: JwtPayload,
  projectId: number,
): Promise<void> {
  await ensureProjectVisible(user, projectId);
  const owned = await prisma.project.findFirst({
    where: { id: projectId, ...projectVisibilityFilter(user, "own") },
    select: { id: true },
  });
  if (!owned) {
    throw new HttpError(403, "owner_only", "Only the project's TAM or the customer's owner can do this");
  }
}

// Same idea for routes that key off a task id and need to verify the caller can
// see the parent project (tasks.ts PATCH/DELETE/comments).
export async function ensureTaskVisible(
  user: JwtPayload,
  taskId: number,
): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: projectVisibilityFilter(user) },
    select: { id: true },
  });
  if (!task) throw new HttpError(404, "not_found", "Task not found");
}

// Customer-scoping (docs/plans/customer-visibility-spec.md §3, Decisions 1-2):
// `project:view-all` (or "*") sees every customer. Everyone else sees a
// customer when they own it (`Customer.tamId`), when nobody owns it
// (`tamId: null` — unowned customers stay visible to all, as before the
// rule existed), or when at least one of its projects is visible to them
// via projectVisibilityFilter — so a project's TAM, SA or member can always
// reach the customer behind a project they can open. Hidden = owned by another
// TAM with no project of the caller's.
//
// The result's only top-level key is `OR`. AND-compose (never object-spread)
// when combining it with a sibling `OR` condition, or the visibility arms
// are silently overwritten with no type error.
//
// The third arm reuses projectVisibilityFilter as the single source of the
// project rule. Its own owned-customer arm is redundant here (a project whose
// customer is this customer, owned by me, is already arm 1) — kept for one
// source of truth over one saved join.
export function customerVisibilityFilter(
  user: JwtPayload,
  access: ProjectAccess = "see",
): Prisma.CustomerWhereInput {
  if (hasPermission(user, "project:view-all")) return {};
  return {
    OR: [
      { tamId: user.sub },
      { tamId: null },
      { projects: { some: projectVisibilityFilter(user, access) } },
    ],
  };
}

// Boolean primitive: does this customer exist AND fall inside the caller's
// visibility? Routes that take a customerId as a body field (POST /projects,
// PATCH /projects/:id, the opportunity handoff) use it directly and answer
// 400 `customer_not_found` — a bad field, not a missing resource.
//
// Attaching a project to a customer is an owner-level act on that customer
// (the new project's TAM would otherwise satisfy the "own" arm and could then
// take the customer over), so those three call sites pass `"own"`.
export async function isCustomerVisible(
  user: JwtPayload,
  customerId: number,
  access: ProjectAccess = "see",
): Promise<boolean> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...customerVisibilityFilter(user, access) },
    select: { id: true },
  });
  return customer !== null;
}

// 404-if-not-visible preamble for customer-keyed routes (notes, weekly
// updates, services, PATCH/DELETE). Same 404-not-403 reasoning as
// ensureProjectVisible. Keeps the `customer_not_found` code the customer
// routes have always returned on an unknown id (asserted in
// backend/test/customerNotes.test.ts).
export async function ensureCustomerVisible(
  user: JwtPayload,
  customerId: number,
): Promise<void> {
  if (!(await isCustomerVisible(user, customerId))) {
    throw new HttpError(404, "customer_not_found", "Customer not found");
  }
}

// Owner-only gate for customers: changing a customer's owner or deleting it
// needs ownership-level access (owner, unowned customer, a project the caller
// is TAM of, or `project:view-all`) — a customer reached only as a project's
// SA or member does not qualify. 404 first, then 403 `owner_only`.
export async function ensureCustomerOwnerAccess(
  user: JwtPayload,
  customerId: number,
): Promise<void> {
  await ensureCustomerVisible(user, customerId);
  const owned = await prisma.customer.findFirst({
    where: { id: customerId, ...customerVisibilityFilter(user, "own") },
    select: { id: true },
  });
  if (!owned) {
    throw new HttpError(403, "owner_only", "Only the customer's owner can do this");
  }
}
