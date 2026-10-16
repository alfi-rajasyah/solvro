import { Router } from "express";
import { prisma } from "../prisma.js";
import { permissionsOf, requireAnyPermission, requireAuth } from "../http/auth.js";

export const usersRouter = Router();

// The in-app people directory (assignee, member, PIC and @mention pickers).
// Gate (pentest finding M2, 2026-10-06): a caller needs `project:read` or
// `pipeline:view` — a PENDING account (no permissions) used to list every
// user here. The response carries what the pickers need and no access map:
// `pipelineAccess` replaces the role's full permission list.
usersRouter.use(requireAuth, requireAnyPermission("project:read", "pipeline:view"));

usersRouter.get("/", async (_req, res) => {
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
  res.json(
    users.map((u) => {
      const permissions = permissionsOf(u.role.permissions);
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        active: u.active,
        avatarUrl: u.avatarUrl,
        role: u.role.roleName,
        /** Can open the Pipeline — the only permission fact the UI needs (deal @mentions). */
        pipelineAccess: permissions.includes("*") || permissions.includes("pipeline:view"),
      };
    }),
  );
});
