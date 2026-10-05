import { Router } from "express";
import { z } from "zod";
import { hasPermission, requireAuth, requirePermission } from "../http/auth.js";
import { validate } from "../http/validate.js";
import { ensureProjectVisible } from "../lib/visibility.js";
import { listActivityPage } from "../lib/activity.js";

// Project activity feed (docs/archive/plans/collaboration-and-sharing.md, C5a). Events
// are written by lib/activity.ts#recordActivity inside each write's own
// transaction; this router only reads them. Mounted on /projects next to
// projectsRouter (kept out of that file). A deal's feed, GET
// /opportunities/:opportunityId/activity, lives in routes/opportunityItems.ts
// (mounted on /opportunities) and shares `listActivityPage`.

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.number().int().positive().optional(),
  actorId: z.coerce.number().int().positive().optional(),
});

export const activityRouter = Router();

activityRouter.use(requireAuth);

activityRouter.get(
  "/:id/activity",
  requirePermission("project:read"),
  validate("params", paramsSchema),
  validate("query", querySchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof paramsSchema>;
    const { limit, before, actorId } = req.query as unknown as z.infer<typeof querySchema>;
    await ensureProjectVisible(req.user!, id);

    res.json(
      await listActivityPage(
        { projectId: id },
        { limit, before, actorId },
        hasPermission(req.user!, "pipeline:view"),
      ),
    );
  },
);
