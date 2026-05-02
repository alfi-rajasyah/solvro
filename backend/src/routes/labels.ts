import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../http/auth.js";
import { validate } from "../http/validate.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const updateLabelSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const labelsRouter = Router();

labelsRouter.use(requireAuth);

labelsRouter.patch(
  "/:id",
  requireRole("TAM", "ADMIN"),
  validate("params", idParamSchema),
  validate("body", updateLabelSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const updated = await prisma.label.update({
      where: { id },
      data: req.body as z.infer<typeof updateLabelSchema>,
    });
    res.json(updated);
  },
);

labelsRouter.delete(
  "/:id",
  requireRole("TAM", "ADMIN"),
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    await prisma.label.delete({ where: { id } });
    res.status(204).end();
  },
);
