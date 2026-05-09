import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission } from "../http/auth.js";
import { validate } from "../http/validate.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const updateSectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().min(0).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const sectionsRouter = Router();

sectionsRouter.use(requireAuth);

sectionsRouter.patch(
  "/:id",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", updateSectionSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const updated = await prisma.section.update({
      where: { id },
      data: req.body as z.infer<typeof updateSectionSchema>,
    });
    res.json(updated);
  },
);

sectionsRouter.delete(
  "/:id",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    // Tasks in this section have sectionId set to NULL via onDelete: SetNull.
    await prisma.section.delete({ where: { id } });
    res.status(204).end();
  },
);
