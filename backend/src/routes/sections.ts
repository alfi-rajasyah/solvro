import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission, type JwtPayload } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { ensureProjectVisible } from "../lib/visibility.js";

// Resolve the section's owning project and 404 if the caller can't see it.
// Permission alone (`project:write`) doesn't scope the caller to a project, so
// without this any writer could mutate sections by guessing the id (IDOR).
async function ensureSectionVisible(user: JwtPayload, sectionId: number) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });
  if (!section) throw new HttpError(404, "not_found", "Section not found");
  await ensureProjectVisible(user, section.projectId);
}

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
    await ensureSectionVisible(req.user!, id);
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
    await ensureSectionVisible(req.user!, id);
    // Tasks in this section have sectionId set to NULL via onDelete: SetNull.
    await prisma.section.delete({ where: { id } });
    res.status(204).end();
  },
);
