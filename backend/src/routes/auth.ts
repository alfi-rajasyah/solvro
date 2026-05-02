import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, signToken } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post("/login", validate("body", loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) {
    throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  }
  if (!user.active) {
    throw new HttpError(403, "account_disabled", "Account has been deactivated");
  }

  const token = signToken({ sub: user.id, role: user.role.roleName });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role.roleName,
    },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.sub },
    include: { role: true },
  });
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role.roleName,
    createdAt: user.createdAt,
  });
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(200),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  });

authRouter.post(
  "/change-password",
  requireAuth,
  validate("body", changePasswordSchema),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<
      typeof changePasswordSchema
    >;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.sub },
    });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new HttpError(
        400,
        "current_password_wrong",
        "Current password is incorrect",
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    res.status(204).end();
  },
);
