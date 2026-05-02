import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { RoleName } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";

export const adminRouter = Router();

// Strict admin gate for the entire tree. requireAuth populates req.user;
// requireAdmin rejects anything that isn't role === "ADMIN".
adminRouter.use(requireAuth, requireAdmin);

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

// ---- Users ----------------------------------------------------------------

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { username: "asc" }],
    select: {
      id: true,
      username: true,
      email: true,
      active: true,
      createdAt: true,
      role: { select: { roleName: true } },
      _count: { select: { projectsAsTAM: true, projectsAsSA: true } },
    },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      active: u.active,
      role: u.role.roleName,
      createdAt: u.createdAt,
      projectsAsTAM: u._count.projectsAsTAM,
      projectsAsSA: u._count.projectsAsSA,
    })),
  );
});

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(50),
  password: z.string().min(8).max(200),
  role: z.nativeEnum(RoleName),
});

adminRouter.post(
  "/users",
  validate("body", createUserSchema),
  async (req, res) => {
    const { email, username, password, role } = req.body as z.infer<
      typeof createUserSchema
    >;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, "email_in_use", "A user with that email already exists");
    }

    const targetRole = await prisma.role.findUniqueOrThrow({
      where: { roleName: role },
    });
    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: { email, username, passwordHash, roleId: targetRole.id },
      select: {
        id: true,
        username: true,
        email: true,
        active: true,
        createdAt: true,
        role: { select: { roleName: true } },
      },
    });

    res.status(201).json({
      id: created.id,
      username: created.username,
      email: created.email,
      active: created.active,
      role: created.role.roleName,
      createdAt: created.createdAt,
      projectsAsTAM: 0,
      projectsAsSA: 0,
    });
  },
);

const updateRoleSchema = z.object({ role: z.nativeEnum(RoleName) });

adminRouter.patch(
  "/users/:id/role",
  validate("params", idParamSchema),
  validate("body", updateRoleSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { role } = req.body as z.infer<typeof updateRoleSchema>;

    if (req.user!.sub === id) {
      throw new HttpError(400, "self_demote", "Admins cannot change their own role");
    }
    const target = await prisma.role.findUniqueOrThrow({ where: { roleName: role } });
    const updated = await prisma.user.update({
      where: { id },
      data: { roleId: target.id },
      select: {
        id: true,
        username: true,
        email: true,
        active: true,
        role: { select: { roleName: true } },
      },
    });
    res.json({
      id: updated.id,
      username: updated.username,
      email: updated.email,
      active: updated.active,
      role: updated.role.roleName,
    });
  },
);

const deactivateSchema = z.object({ active: z.boolean() });

adminRouter.patch(
  "/users/:id/deactivate",
  validate("params", idParamSchema),
  validate("body", deactivateSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { active } = req.body as z.infer<typeof deactivateSchema>;

    if (req.user!.sub === id && active === false) {
      throw new HttpError(400, "self_deactivate", "Admins cannot deactivate themselves");
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { active },
      select: { id: true, username: true, email: true, active: true },
    });
    res.json(updated);
  },
);

adminRouter.post(
  "/users/:id/reset-password",
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    // 12-char URL-safe temp password. Returned ONCE in the response so the
    // admin can relay it to the user out-of-band (no mail infra in dev).
    const tempPassword = randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    res.json({ tempPassword });
  },
);

// ---- Projects (admin scope: all projects, all TAMs) -----------------------

adminRouter.get("/projects", async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      sa: { select: { id: true, username: true } },
      tam: { select: { id: true, username: true } },
      customer: { select: { id: true, name: true } },
      _count: { select: { tasks: true } },
    },
  });
  res.json(projects);
});

const reassignSchema = z.object({
  projectId: z.number().int().positive(),
  newTamId: z.number().int().positive(),
});

adminRouter.put(
  "/projects/reassign",
  validate("body", reassignSchema),
  async (req, res) => {
    const { projectId, newTamId } = req.body as z.infer<typeof reassignSchema>;

    const tam = await prisma.user.findUnique({
      where: { id: newTamId },
      include: { role: true },
    });
    if (!tam) throw new HttpError(404, "tam_not_found", "Target user not found");
    if (!tam.active) {
      throw new HttpError(400, "tam_inactive", "Target user is deactivated");
    }
    if (tam.role.roleName !== "TAM" && tam.role.roleName !== "ADMIN") {
      throw new HttpError(
        400,
        "tam_invalid_role",
        "Target user must have TAM or ADMIN role",
      );
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { tamId: newTamId },
      include: {
        sa: { select: { id: true, username: true } },
        tam: { select: { id: true, username: true } },
        customer: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });
    res.json(updated);
  },
);
