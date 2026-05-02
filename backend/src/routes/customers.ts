import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../http/auth.js";
// services router lives in ./services.ts; this file owns the customer-side mapping.
import { validate } from "../http/validate.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  accountManager: z.string().max(200).optional(),
  solutionArchitect: z.string().max(200).optional(),
  description: z.string().min(1, "Description is required").max(5000),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  accountManager: z.string().max(200).optional(),
  solutionArchitect: z.string().max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
});

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", async (_req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { projects: true } } },
  });
  res.json(customers);
});

const customerInclude = {
  projects: {
    orderBy: { updatedAt: "desc" } as const,
    include: {
      tam: { select: { id: true, username: true } },
      sa: { select: { id: true, username: true } },
      _count: { select: { tasks: true } },
    },
  },
  services: {
    orderBy: { service: { name: "asc" } } as const,
    include: { service: true },
  },
  _count: { select: { projects: true } },
} as const;

customersRouter.get("/:id", validate("params", idParamSchema), async (req, res) => {
  const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id },
    include: customerInclude,
  });
  res.json(customer);
});

const assignServicesSchema = z.object({
  assignments: z.array(
    z.object({
      serviceId: z.number().int().positive(),
      tools: z.array(z.string().trim().min(1).max(100)).default([]),
    }),
  ),
});

customersRouter.put(
  "/:id/services",
  requireRole("TAM", "ADMIN"),
  validate("params", idParamSchema),
  validate("body", assignServicesSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { assignments } = req.body as z.infer<typeof assignServicesSchema>;

    // Replace the whole assignment set in a single transaction:
    // - delete rows whose serviceId is no longer in the list
    // - upsert each desired (serviceId, tools)
    const desiredIds = assignments.map((a) => a.serviceId);
    await prisma.$transaction([
      prisma.customerService.deleteMany({
        where: {
          customerId: id,
          ...(desiredIds.length > 0 && { serviceId: { notIn: desiredIds } }),
        },
      }),
      ...assignments.map((a) =>
        prisma.customerService.upsert({
          where: {
            customerId_serviceId: { customerId: id, serviceId: a.serviceId },
          },
          create: { customerId: id, serviceId: a.serviceId, tools: a.tools },
          update: { tools: a.tools },
        }),
      ),
    ]);

    const updated = await prisma.customer.findUniqueOrThrow({
      where: { id },
      include: customerInclude,
    });
    res.json(updated);
  },
);

customersRouter.post(
  "/",
  requireRole("TAM", "ADMIN"),
  validate("body", createCustomerSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof createCustomerSchema>;
    const customer = await prisma.customer.create({
      data: {
        name: body.name,
        accountManager: body.accountManager || null,
        solutionArchitect: body.solutionArchitect || null,
        description: body.description,
      },
    });
    res.status(201).json(customer);
  },
);

customersRouter.patch(
  "/:id",
  requireRole("TAM", "ADMIN"),
  validate("params", idParamSchema),
  validate("body", updateCustomerSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof updateCustomerSchema>;
    const data: Record<string, string | null> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.accountManager !== undefined)
      data.accountManager = body.accountManager || null;
    if (body.solutionArchitect !== undefined)
      data.solutionArchitect = body.solutionArchitect || null;
    if (body.description !== undefined) data.description = body.description;
    const updated = await prisma.customer.update({ where: { id }, data });
    res.json(updated);
  },
);

customersRouter.delete(
  "/:id",
  requireRole("TAM", "ADMIN"),
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    // onDelete: SetNull on Project.customerId — projects survive, customer link clears.
    await prisma.customer.delete({ where: { id } });
    res.status(204).end();
  },
);
