import { Router } from "express";
import { prisma } from "../prisma.js";
import { hasPermission, permissionsOf, requireAnyPermission, requireAuth } from "../http/auth.js";

export const usersRouter = Router();

// The in-app people directory (assignee, member, PIC and @mention pickers).
// Gate (pentest finding M2, 2026-10-06): a caller needs `project:read` or
// `pipeline:view` — a PENDING account (no permissions) used to list every
// user here. The response carries what the pickers need and no access map:
// `pipelineAccess` replaces the role's full permission list.
usersRouter.use(requireAuth, requireAnyPermission("project:read", "pipeline:view"));

usersRouter.get("/", async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      active: true,
      avatarUrl: true,
      role: { select: { roleName: true, permissions: true } },
    },
    orderBy: { username: "asc" },
  });
  // An account with no permissions (PENDING, awaiting a role) is kept out of
  // the pickers: it cannot be a member, assignee, PIC or mention target
  // (docs/archive/plans/application-review-2026-10-22.md, F-03). Admins still see everyone here; Admin > Users is
  // the place such accounts are promoted.
  const isAdmin = hasPermission(req.user!, "*");
  const listed = isAdmin
    ? users
    : users.filter((u) => permissionsOf(u.role.permissions).length > 0);
  res.json(
    listed.map((u) => {
      const permissions = permissionsOf(u.role.permissions);
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        active: u.active,
        avatarUrl: u.avatarUrl,
        role: u.role.roleName,
        /** Can open the Pipeline — the only permission fact the UI needs (deal @mentions). */
        /** The role grants at least one permission: the one receiver rule for handover and reassign pickers. */
        hasAccess: permissions.length > 0,
        pipelineAccess: permissions.includes("*") || permissions.includes("pipeline:view"),
      };
    }),
  );
});
