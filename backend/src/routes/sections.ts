import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission, type JwtPayload } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { ensureProjectVisible } from "../lib/visibility.js";

// Resolve the section's owning project and 404 if the caller can't see it.
// Permission alone (`project:write`) doesn't scope the caller to a project, so
// without this any writer could mutate sections by guessing the id (IDOR).
async function ensureSectionVisible(
  user: JwtPayload,
  sectionId: number,
): Promise<{ projectId: number }> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });
  if (!section) throw new HttpError(404, "not_found", "Section not found");
  await ensureProjectVisible(user, section.projectId);
  return section;
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const updateSectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().min(0).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/**
 * Insert `sectionId` into its project's section list at `requestedPosition`
 * (clamped to [0, siblings.length]), then re-pack the whole list to dense
 * 0..n-1. Mirrors taskOrdering.ts's `insertAt`: siblings are fetched
 * excluding self, ordered [{position:"asc"},{id:"asc"}] — the same order
 * `GET /projects/:id/sections` reads back, so ties resolve identically.
 * Must run inside a `prisma.$transaction`. Returns the final position
 * assigned to `sectionId`.
 */
async function insertSectionAt(
  tx: Prisma.TransactionClient,
  projectId: number,
  sectionId: number,
  requestedPosition: number,
): Promise<number> {
  const siblings = await tx.section.findMany({
    where: { projectId, id: { not: sectionId } },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  const clamped = Math.max(0, Math.min(requestedPosition, siblings.length));

  const ordered = siblings.map((s) => s.id);
  ordered.splice(clamped, 0, sectionId);

  for (let i = 0; i < ordered.length; i++) {
    await tx.section.update({ where: { id: ordered[i] }, data: { position: i } });
  }

  return clamped;
}

export const sectionsRouter = Router();

sectionsRouter.use(requireAuth);

sectionsRouter.patch(
  "/:id",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", updateSectionSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof updateSectionSchema>;
    const { projectId } = await ensureSectionVisible(req.user!, id);

    if (body.position === undefined) {
      // No ordering change: single update, same as before this task.
      const updated = await prisma.section.update({ where: { id }, data: body });
      res.json(updated);
      return;
    }

    // Ordering patch: apply any name/color change first (excluding
    // position — the re-pack below issues its own position writes for every
    // displaced sibling), then splice this section into the clamped index
    // and re-pack the whole list dense 0..n-1, all inside one transaction so
    // the list is never observed half-moved.
    const { position, ...rest } = body;
    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(rest).length > 0) {
        await tx.section.update({ where: { id }, data: rest });
      }
      // insertSectionAt's re-pack loop already writes id's dense position as
      // part of rewriting every displaced sibling — read the row back
      // instead of issuing a redundant identical write.
      await insertSectionAt(tx, projectId, id, position);
      return tx.section.findUniqueOrThrow({ where: { id } });
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
