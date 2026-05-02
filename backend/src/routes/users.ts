import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../http/auth.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: { select: { roleName: true } },
    },
    orderBy: { username: "asc" },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role.roleName,
    })),
  );
});
