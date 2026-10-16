import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { ensureCustomerVisible } from "../lib/visibility.js";
import { createLinkSchema, updateLinkSchema } from "../lib/linkSchemas.js";

// Label + http(s) URL document links on a customer (docs/archive/plans/project-customer-links.md).
// Anyone who can see the customer and holds `project:write` may add, edit or
// remove them (the customer-notes rule) — not owner-only. The activity log has
// no customer scope, so these writes record no event. Links are internal.
// Mounted on /customers next to customersRouter.

const customerParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const linkParamsSchema = customerParamsSchema.extend({ linkId: z.string().uuid() });

// Visibility 404 before any body validation, so a hidden customer cannot be
// told apart from a missing one by a 400.
async function requireVisible(req: Request, _res: Response, next: NextFunction) {
  const { id } = req.params as unknown as z.infer<typeof customerParamsSchema>;
  await ensureCustomerVisible(req.user!, id);
  next();
}

export const customerLinksRouter = Router();

customerLinksRouter.use(requireAuth);

customerLinksRouter.get(
  "/:id/links",
  requirePermission("project:read"),
  validate("params", customerParamsSchema),
  requireVisible,
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof customerParamsSchema>;
    const links = await prisma.customerLink.findMany({
      where: { customerId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    res.json(links);
  },
);

customerLinksRouter.post(
  "/:id/links",
  requirePermission("project:write"),
  validate("params", customerParamsSchema),
  requireVisible,
  validate("body", createLinkSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof customerParamsSchema>;
    const body = req.body as z.infer<typeof createLinkSchema>;
    const link = await prisma.customerLink.create({
      data: { customerId: id, label: body.label, url: body.url },
    });
    res.status(201).json(link);
  },
);

customerLinksRouter.patch(
  "/:id/links/:linkId",
  requirePermission("project:write"),
  validate("params", linkParamsSchema),
  requireVisible,
  validate("body", updateLinkSchema),
  async (req, res) => {
    const { id, linkId } = req.params as unknown as z.infer<typeof linkParamsSchema>;
    const body = req.body as z.infer<typeof updateLinkSchema>;
    const link = await prisma.customerLink.findFirst({
      where: { id: linkId, customerId: id },
      select: { id: true },
    });
    if (!link) throw new HttpError(404, "not_found", "Link not found");
    const updated = await prisma.customerLink.update({ where: { id: linkId }, data: body });
    res.json(updated);
  },
);

customerLinksRouter.delete(
  "/:id/links/:linkId",
  requirePermission("project:write"),
  validate("params", linkParamsSchema),
  requireVisible,
  async (req, res) => {
    const { id, linkId } = req.params as unknown as z.infer<typeof linkParamsSchema>;
    const link = await prisma.customerLink.findFirst({
      where: { id: linkId, customerId: id },
      select: { id: true },
    });
    if (!link) throw new HttpError(404, "not_found", "Link not found");
    await prisma.customerLink.delete({ where: { id: linkId } });
    res.status(204).end();
  },
);
