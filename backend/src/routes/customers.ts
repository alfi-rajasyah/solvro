import { Router } from "express";
import { z } from "zod";
import { Prisma, WeeklyHealth, WeeklyStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requirePermission, hasPermission } from "../http/auth.js";
// services router lives in ./services.ts; this file owns the customer-side mapping.
import { HttpError } from "../http/errors.js";
import { validate } from "../http/validate.js";
import { isValidDayString, utcMidnightOf, utcMidnightOfDayString } from "../lib/dateBoundary.js";
import { isMonday } from "../lib/isoWeek.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  accountManager: z.string().max(200).optional(),
  solutionArchitect: z.string().max(200).optional(),
  description: z.string().min(1, "Description is required").max(5000),
  // TAM ownership gate is `project:write` (Decision 8) — the same permission
  // this router already requires for writes; there is no `customer:write`.
  tamId: z.number().int().positive().nullable().optional(),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  accountManager: z.string().max(200).optional(),
  solutionArchitect: z.string().max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  tamId: z.number().int().positive().nullable().optional(),
});

/** 400 `tam_not_found` instead of a raw P2003 → 500 on a bogus tamId. */
async function assertTamExists(tamId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: tamId }, select: { id: true } });
  if (!user) {
    throw new HttpError(400, "tam_not_found", "Assigned TAM does not exist");
  }
}

/** Customer routes have no visibility filter — 404 on an unknown id only. */
async function assertCustomerExists(id: number): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!customer) {
    throw new HttpError(404, "customer_not_found", "Customer not found");
  }
}

const dayStringSchema = z
  .string()
  .refine(isValidDayString, { message: "Invalid date (expected yyyy-MM-dd)" });

const customerNoteListQuerySchema = z.object({
  from: dayStringSchema.optional(),
  to: dayStringSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const titleSchema = z.string().trim().min(1).max(120);

const createCustomerNoteSchema = z.object({
  body: z.string().min(1).max(4000),
  noteDate: dayStringSchema.optional(),
  title: titleSchema,
});

const updateCustomerNoteSchema = z.object({
  body: z.string().min(1).max(4000).optional(),
  title: titleSchema.optional(),
});

const customerNoteParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  noteId: z.coerce.number().int().positive(),
});

const customerNoteInclude = {
  author: { select: { id: true, username: true } },
} as const;

const weeklyUpdateListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(52).optional(),
});

const weeklyUpdateParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  weekStart: dayStringSchema,
});

const saveWeeklyUpdateSchema = z.object({
  body: z.string().max(8000),
  health: z.nativeEnum(WeeklyHealth).nullable().optional(),
  status: z.nativeEnum(WeeklyStatus),
});

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get("/", async (_req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      tam: { select: { id: true, username: true } },
      _count: { select: { projects: true } },
    },
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
  tam: { select: { id: true, username: true } },
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
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", assignServicesSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { assignments } = req.body as z.infer<typeof assignServicesSchema>;

    // Replace the whole assignment set in a single transaction:
    // - delete rows whose serviceId is no longer in the list
    // - upsert each desired (serviceId, tools)
    const desiredIds = assignments.map((a) => a.serviceId);
    const uniqueIds = [...new Set(desiredIds)];
    if (uniqueIds.length > 0) {
      const found = await prisma.service.count({ where: { id: { in: uniqueIds } } });
      if (found !== uniqueIds.length) {
        throw new HttpError(400, "service_not_found", "One or more services do not exist");
      }
    }
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
  requirePermission("project:write"),
  validate("body", createCustomerSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof createCustomerSchema>;
    if (body.tamId != null) {
      await assertTamExists(body.tamId);
    }
    const data: Prisma.CustomerCreateInput = {
      name: body.name,
      accountManager: body.accountManager || null,
      solutionArchitect: body.solutionArchitect || null,
      description: body.description,
    };
    if (body.tamId != null) {
      data.tam = { connect: { id: body.tamId } };
    }
    const customer = await prisma.customer.create({
      data,
      include: { tam: { select: { id: true, username: true } } },
    });
    res.status(201).json(customer);
  },
);

customersRouter.patch(
  "/:id",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", updateCustomerSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof updateCustomerSchema>;
    const data: Prisma.CustomerUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.accountManager !== undefined)
      data.accountManager = body.accountManager || null;
    if (body.solutionArchitect !== undefined)
      data.solutionArchitect = body.solutionArchitect || null;
    if (body.description !== undefined) data.description = body.description;
    if (body.tamId !== undefined) {
      if (body.tamId === null) {
        data.tam = { disconnect: true };
      } else {
        await assertTamExists(body.tamId);
        data.tam = { connect: { id: body.tamId } };
      }
    }
    const updated = await prisma.customer.update({
      where: { id },
      data,
      include: { tam: { select: { id: true, username: true } } },
    });
    res.json(updated);
  },
);

customersRouter.delete(
  "/:id",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    // onDelete: SetNull on Project.customerId — projects survive, customer link clears.
    await prisma.customer.delete({ where: { id } });
    res.status(204).end();
  },
);

// ---- Operations notes (customer-scoped, no project) ------------------------
// Same author-only edit / wildcard-delete rule as ProjectNote (Decision 9).

customersRouter.get(
  "/:id/notes",
  requirePermission("project:read"),
  validate("params", idParamSchema),
  validate("query", customerNoteListQuerySchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { from, to, limit } = req.query as unknown as z.infer<
      typeof customerNoteListQuerySchema
    >;
    await assertCustomerExists(id);

    const noteDateFilter: Prisma.DateTimeFilter = {};
    if (from) noteDateFilter.gte = utcMidnightOfDayString(from);
    if (to) noteDateFilter.lte = utcMidnightOfDayString(to);

    const notes = await prisma.customerNote.findMany({
      where: {
        customerId: id,
        ...((from || to) && { noteDate: noteDateFilter }),
      },
      orderBy: [{ noteDate: "desc" }, { id: "desc" }],
      take: limit ?? 50,
      include: customerNoteInclude,
    });
    res.json(notes);
  },
);

customersRouter.post(
  "/:id/notes",
  requirePermission("project:write"),
  validate("params", idParamSchema),
  validate("body", createCustomerNoteSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof createCustomerNoteSchema>;
    await assertCustomerExists(id);

    const note = await prisma.customerNote.create({
      data: {
        customerId: id,
        authorId: req.user!.sub,
        noteDate: body.noteDate ? utcMidnightOfDayString(body.noteDate) : utcMidnightOf(Date.now()),
        body: body.body,
        title: body.title,
      },
      include: customerNoteInclude,
    });
    res.status(201).json(note);
  },
);

customersRouter.patch(
  "/:id/notes/:noteId",
  requirePermission("project:write"),
  validate("params", customerNoteParamSchema),
  validate("body", updateCustomerNoteSchema),
  async (req, res) => {
    const { id, noteId } = req.params as unknown as z.infer<
      typeof customerNoteParamSchema
    >;
    const body = req.body as z.infer<typeof updateCustomerNoteSchema>;
    await assertCustomerExists(id);

    const existing = await prisma.customerNote.findUnique({ where: { id: noteId } });
    if (!existing || existing.customerId !== id) {
      throw new HttpError(404, "note_not_found", "Note not found");
    }
    // Edit is author-only, full stop — even a wildcard user cannot edit
    // another author's note (Decision 9). Only DELETE special-cases wildcard.
    if (existing.authorId !== req.user!.sub) {
      throw new HttpError(403, "not_note_author", "Only the author may edit this note");
    }

    const data: Prisma.CustomerNoteUpdateInput = {};
    if (body.body !== undefined) data.body = body.body;
    if (body.title !== undefined) data.title = body.title;

    const updated = await prisma.customerNote.update({
      where: { id: noteId },
      data,
      include: customerNoteInclude,
    });
    res.json(updated);
  },
);

customersRouter.delete(
  "/:id/notes/:noteId",
  requirePermission("project:write"),
  validate("params", customerNoteParamSchema),
  async (req, res) => {
    const { id, noteId } = req.params as unknown as z.infer<
      typeof customerNoteParamSchema
    >;
    await assertCustomerExists(id);

    const existing = await prisma.customerNote.findUnique({ where: { id: noteId } });
    if (!existing || existing.customerId !== id) {
      throw new HttpError(404, "note_not_found", "Note not found");
    }
    if (existing.authorId !== req.user!.sub && !hasPermission(req.user!, "*")) {
      throw new HttpError(
        403,
        "not_note_author",
        "Only the author or a wildcard-permission user may delete this note",
      );
    }

    await prisma.customerNote.delete({ where: { id: noteId } });
    res.status(204).end();
  },
);

// ---- Weekly updates (per customer, Decision 2) ------------------------------

customersRouter.get(
  "/:id/weekly-updates",
  requirePermission("project:read"),
  validate("params", idParamSchema),
  validate("query", weeklyUpdateListQuerySchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { limit } = req.query as unknown as z.infer<typeof weeklyUpdateListQuerySchema>;
    await assertCustomerExists(id);

    const updates = await prisma.weeklyUpdate.findMany({
      where: { customerId: id },
      orderBy: { weekStart: "desc" },
      take: limit ?? 12,
      include: { author: { select: { id: true, username: true } } },
    });
    res.json(updates);
  },
);

customersRouter.put(
  "/:id/weekly-updates/:weekStart",
  requirePermission("project:write"),
  validate("params", weeklyUpdateParamSchema),
  validate("body", saveWeeklyUpdateSchema),
  async (req, res) => {
    const { id, weekStart } = req.params as unknown as z.infer<
      typeof weeklyUpdateParamSchema
    >;
    const body = req.body as z.infer<typeof saveWeeklyUpdateSchema>;
    await assertCustomerExists(id);

    // weekStart is already a valid day string (dayStringSchema, param
    // validation) — isMonday only needs to check the ISO weekday now.
    if (!isMonday(weekStart)) {
      throw new HttpError(
        400,
        "week_start_not_monday",
        "weekStart must be an ISO Monday (yyyy-MM-dd)",
      );
    }

    const weekStartDate = utcMidnightOfDayString(weekStart);
    const existing = await prisma.weeklyUpdate.findUnique({
      where: { customerId_weekStart: { customerId: id, weekStart: weekStartDate } },
      select: { id: true, status: true, doneAt: true, health: true },
    });

    // An omitted `health` leaves the stored value unchanged (explicit
    // `null` still clears it) — so the DONE completeness check looks at
    // the EFFECTIVE health: what the body sends, else what's already there.
    const effectiveHealth = body.health !== undefined ? body.health : (existing?.health ?? null);
    if (body.status === "DONE" && (body.body.trim().length === 0 || effectiveHealth == null)) {
      throw new HttpError(
        400,
        "weekly_update_incomplete",
        "Marking a weekly update done requires a non-empty body and a health value",
      );
    }

    // doneAt is stamped once, on the transition INTO done — re-saving an
    // already-DONE row (e.g. a body edit) must not bump it. Any non-DONE
    // status always clears it.
    const doneAt =
      body.status === "DONE" ? (existing?.status === "DONE" ? existing.doneAt : new Date()) : null;

    const updated = await prisma.weeklyUpdate.upsert({
      where: { customerId_weekStart: { customerId: id, weekStart: weekStartDate } },
      create: {
        customerId: id,
        weekStart: weekStartDate,
        authorId: req.user!.sub,
        body: body.body,
        health: body.health ?? null,
        status: body.status,
        doneAt,
      },
      update: {
        authorId: req.user!.sub,
        body: body.body,
        ...(body.health !== undefined && { health: body.health }),
        status: body.status,
        doneAt,
      },
      include: { author: { select: { id: true, username: true } } },
    });
    res.status(existing ? 200 : 201).json(updated);
  },
);
