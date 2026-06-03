import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { hasPermission, type JwtPayload } from "../http/auth.js";
import { HttpError } from "../http/errors.js";

// Project-scoping is permission-based, NOT role-name based. `project:view-all`
// (which "*" also satisfies via hasPermission) grants global visibility;
// everyone else sees only the projects they're attached to as the assigned TAM
// or SA on the project row. Admin grants broader access by adding
// "project:view-all" (or "*") to a role's permissions in Admin > Roles.
//
// These helpers live here (not in a route file) so any router can import them
// without taking a dependency on routes/projects.ts — avoiding the circular
// import that arises when projects.ts itself needs to import sibling routes.
export function projectVisibilityFilter(user: JwtPayload): Prisma.ProjectWhereInput {
  if (hasPermission(user, "project:view-all")) return {};
  return { OR: [{ tamId: user.sub }, { saId: user.sub }] };
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
