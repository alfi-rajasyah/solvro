// A ticket page is stored all-or-nothing (ISS-132), and a mapping saved while
// a full sync is running keeps the next sync full (ISS-186).
import "../env.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { prisma } from "../../src/prisma.js";
import { seal } from "../../src/lib/secretBox.js";
import { bustItopConfigCache } from "../../src/lib/itop/config.js";
import { syncTickets } from "../../src/lib/itop/sync.js";
import { seedRoles } from "../testAuth.js";
import { createFakeItop, seedFakeItop, type FakeItopState, FAKE_ITOP_TOKENS } from "./fakeItop.js";

let fakeServer: Server | undefined;

async function startFake(state: FakeItopState): Promise<string> {
  const { listen } = createFakeItop(state);
  const { server, baseUrl } = await listen(0);
  fakeServer = server;
  return baseUrl;
}

async function configureItop(baseUrl: string): Promise<void> {
  await prisma.itopConfig.upsert({
    where: { id: "default" },
    create: { id: "default", baseUrl, appTokenEnc: seal(FAKE_ITOP_TOKENS.app), timezone: "UTC" },
    update: {
      baseUrl,
      appTokenEnc: seal(FAKE_ITOP_TOKENS.app),
      timezone: "UTC",
      lastSyncAt: null,
      lastSyncOk: null,
      lastSyncError: null,
      lastFullSyncAt: null,
    },
  });
  bustItopConfigCache();
}

async function createMappedCustomer(itopOrgId: number): Promise<void> {
  await prisma.customer.create({
    data: { name: `Atomic test ${itopOrgId}-${Date.now()}-${Math.random()}`, description: "", itopOrgId, itopOrgName: "x" },
  });
}

beforeAll(async () => {
  await seedRoles();
});

beforeEach(async () => {
  await prisma.itopTimeEntry.deleteMany();
  await prisma.itopTicket.deleteMany();
  await prisma.customer.deleteMany({ where: { itopOrgId: { not: null } } });
  await prisma.itopConfig.deleteMany({ where: { id: "default" } });
  bustItopConfigCache();
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (fakeServer) {
    const server = fakeServer;
    fakeServer = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("syncTickets page atomicity (ISS-132)", () => {
  it("keeps none of a page when the transaction fails after its rows were written, and records the run as failed", async () => {
    const baseUrl = await startFake(seedFakeItop());
    await configureItop(baseUrl);
    await createMappedCustomer(1);
    await createMappedCustomer(2);

    // Fail the first page's transaction after every upsert ran but before it commits.
    const original = prisma.$transaction.bind(prisma) as (fn: unknown, opts?: unknown) => Promise<unknown>;
    const spy = vi.spyOn(prisma, "$transaction") as unknown as {
      mockImplementationOnce: (impl: (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => Promise<unknown>) => void;
    };
    spy.mockImplementationOnce((fn, opts) =>
      original(async (tx: unknown) => {
        await fn(tx);
        expect(await (tx as typeof prisma).itopTicket.count()).toBeGreaterThan(0);
        throw new Error("connection lost before commit");
      }, opts),
    );

    const summary = await syncTickets({ full: true });
    expect(summary.ran).toBe(true);
    expect(summary.error).toMatch(/connection lost before commit/);
    expect(await prisma.itopTicket.count()).toBe(0);

    const config = await prisma.itopConfig.findUniqueOrThrow({ where: { id: "default" } });
    expect(config.lastSyncOk).toBe(false);
    expect(config.lastFullSyncAt).toBeNull();
  });

  it("still skips a single unreadable row and stores the rest of its page", async () => {
    const state = seedFakeItop();
    const bad = [...state.tickets.values()].find((t) => t.class === "UserRequest")!;
    bad.last_update = "not a date";
    const baseUrl = await startFake(state);
    await configureItop(baseUrl);
    await createMappedCustomer(1);
    await createMappedCustomer(2);

    const summary = await syncTickets({ full: true });
    expect(summary.error).toBeUndefined();
    expect(summary.skipped).toBe(1);
    expect(await prisma.itopTicket.findUnique({ where: { id: bad.id } })).toBeNull();
    expect(await prisma.itopTicket.count()).toBe(state.tickets.size - 1);
  });
});

describe("syncTickets and a mapping saved mid-run (ISS-186)", () => {
  it("does not record a full sync when the config row changed after the run began", async () => {
    const baseUrl = await startFake(seedFakeItop());
    await configureItop(baseUrl);
    await createMappedCustomer(1);
    await createMappedCustomer(2);

    // The mapping route clears lastFullSyncAt in the same transaction that
    // saves the mapping; do that right after the run has read the customers.
    const original = prisma.customer.findMany.bind(prisma.customer);
    vi.spyOn(prisma.customer, "findMany").mockImplementationOnce(((args: never) =>
      original(args).then(async (rows) => {
        await prisma.itopConfig.updateMany({ where: { id: "default" }, data: { lastFullSyncAt: null } });
        return rows;
      })) as never);

    const summary = await syncTickets({ full: true });
    expect(summary.error).toBeUndefined();

    const config = await prisma.itopConfig.findUniqueOrThrow({ where: { id: "default" } });
    expect(config.lastSyncOk).toBe(true);
    expect(config.lastFullSyncAt).toBeNull();
  });

  it("records the full sync when nothing touched the config row", async () => {
    const baseUrl = await startFake(seedFakeItop());
    await configureItop(baseUrl);
    await createMappedCustomer(1);
    await createMappedCustomer(2);

    await syncTickets({ full: true });
    const config = await prisma.itopConfig.findUniqueOrThrow({ where: { id: "default" } });
    expect(config.lastFullSyncAt).not.toBeNull();
  });
});

describe("syncTickets and an org unmapped mid-run (ISS-202)", () => {
  it("stores the tickets of an org unmapped after the snapshot without a customer", async () => {
    const baseUrl = await startFake(seedFakeItop());
    await configureItop(baseUrl);
    await createMappedCustomer(1);
    await createMappedCustomer(2);

    // Unmap org 1's customer right after the run has read its customer snapshot.
    const original = prisma.customer.findMany.bind(prisma.customer);
    vi.spyOn(prisma.customer, "findMany").mockImplementationOnce(((args: never) =>
      original(args).then(async (rows) => {
        await prisma.customer.updateMany({ where: { itopOrgId: 1 }, data: { itopOrgId: null, itopOrgName: null } });
        return rows;
      })) as never);

    const summary = await syncTickets({ full: true });
    expect(summary.error).toBeUndefined();

    const org1 = await prisma.itopTicket.findMany({ where: { orgId: 1 } });
    expect(org1.length).toBeGreaterThan(0);
    expect(org1.every((t) => t.customerId === null)).toBe(true);
    const org2 = await prisma.itopTicket.findMany({ where: { orgId: 2 } });
    expect(org2.length).toBeGreaterThan(0);
    expect(org2.every((t) => t.customerId !== null)).toBe(true);
  });
});
