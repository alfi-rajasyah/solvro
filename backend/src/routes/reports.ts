import { Router } from "express";
import { requireAuth, requirePermission } from "../http/auth.js";
import { computePortfolioRows } from "../lib/portfolio.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

// Intentionally ORG-WIDE: this is the Executive/Manager portfolio roll-up.
// The `report:executive` permission itself is the org-wide read grant, so we
// deliberately do NOT apply projectVisibilityFilter here.
reportsRouter.get(
  "/executive",
  requirePermission("report:executive"),
  async (_req, res) => {
    const rows = await computePortfolioRows({});
    res.json({ projects: rows, generatedAt: new Date().toISOString() });
  },
);
