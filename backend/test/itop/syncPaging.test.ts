// Paged iTop reads and the session-level sync lock
// (docs/archive/plans/application-review-2026-10-22.md, F-28): rows from every
// page are stored, a full sync still prunes what iTop stopped returning, the
// page iterator stops at its guard, and the single-runner lock is released
// after a normal run, a failed run and a run that throws.
import "../env.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { prisma } from "../../src/prisma.js";
import { seal } from "../../src/lib/secretBox.js";
import { bustItopConfigCache } from "../../src/lib/itop/config.js";
import { createItopClient } from "../../src/lib/itop/client.js";
import { syncTickets } from "../../src/lib/itop/sync.js";
import { logger } from "../../src/logger.js";
import { withSyncLock } from "../../src/lib/itop/syncLock.js";
import { seedRoles } from "../testAuth.js";
import { createFakeItop, seedFakeItop, type FakeItopState, type TicketRecord, FAKE_ITOP_TOKENS } from "./fakeItop.js";

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
    data: { name: `Paging test ${itopOrgId}-${Date.now()}-${Math.random()}`, description: "", itopOrgId, itopOrgName: "x" },
  });
}

function extraTicket(id: number): TicketRecord {
  return {
    id,
    class: "UserRequest",
    ref: `R-PAGED-${id}`,
    title: "Paged ticket",
    status: "new",
    operational_status: "normal",
    priority: "3",
    agent_id: "0",
    agent_id_friendlyname: "",
    team_id_friendlyname: "",
    service_id_friendlyname: "",
    caller_id_friendlyname: "",
    org_id: "1",
    start_date: "2026-01-01 00:00:00",
    last_update: "2026-01-01 00:00:00",
    tto: 0,
    ttr: 0,
    tto_escalation_deadline: "",
    ttr_escalation_deadline: "",
    sla_tto_passed: "0",
    sla_ttr_passed: "0",
    resolution_date: "",
    public_log: { entries: [] },
    private_log: { entries: [] },
  };
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

describe("getPages", () => {
  it("yields one page at a time and stops at the page guard", async () => {
    let calls = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      calls += 1;
      const body = new URLSearchParams(String(init?.body));
      const payload = JSON.parse(body.get("json_data") ?? "{}") as { page: number; limit: number };
      const objects: Record<string, unknown> = {};
      // Every page is full and carries brand-new keys: only the guard can stop it.
      for (let i = 0; i < payload.limit; i++) {
        const key = (payload.page - 1) * payload.limit + i + 1;
        objects[`UserRequest::${key}`] = { code: 0, message: "", class: "UserRequest", key: String(key), fields: { ref: `R-${key}` } };
      }
      return new Response(JSON.stringify({ code: 0, message: "", objects }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createItopClient({ baseUrl: "http://example.invalid", token: "x", fetchImpl });
    const sizes: number[] = [];
    await expect(
      (async () => {
        for await (const page of client.getPages("UserRequest", "SELECT UserRequest", "ref", { pageSize: 2 })) {
          sizes.push(page.length);
        }
      })(),
    ).rejects.toMatchObject({ name: "ItopError", code: "paging" });
    expect(sizes).toHaveLength(500);
    expect(sizes.every((n) => n === 2)).toBe(true);
    expect(calls).toBe(500);
  });
});

describe("syncTickets over several pages", () => {
  it("stores rows from every page, and a full sync prunes a ticket iTop stopped returning", async () => {
    const state = seedFakeItop();
    for (let i = 0; i < 250; i++) {
      const id = state.nextId++;
      state.tickets.set(id, extraTicket(id));
    }
    const baseUrl = await startFake(state);
    await configureItop(baseUrl);
    await createMappedCustomer(1);
    await createMappedCustomer(2);

    const first = await syncTickets({ full: true });
    expect(first.ran).toBe(true);
    expect(first.error).toBeUndefined();
    const pagedIds = [...state.tickets.values()].filter((t) => t.ref.startsWith("R-PAGED-")).map((t) => t.id);
    expect(pagedIds).toHaveLength(250);
    expect(await prisma.itopTicket.count({ where: { id: { in: pagedIds } } })).toBe(250);

    // A ticket from the last page disappears upstream.
    const gone = pagedIds[pagedIds.length - 1];
    state.tickets.delete(gone);
    const second = await syncTickets({ full: true });
    expect(second.removed).toBe(1);
    expect(await prisma.itopTicket.findUnique({ where: { id: gone } })).toBeNull();
    expect(await prisma.itopTicket.count({ where: { id: { in: pagedIds } } })).toBe(249);
  });
});

describe("sync lock", () => {
  async function readyFake(): Promise<void> {
    const baseUrl = await startFake(seedFakeItop());
    await configureItop(baseUrl);
    await createMappedCustomer(1);
    await createMappedCustomer(2);
  }

  it("lets exactly one of two simultaneous syncs run, and is free again afterwards", async () => {
    await readyFake();
    const [a, b] = await Promise.all([syncTickets({ full: true }), syncTickets({ full: true })]);
    expect([a, b].filter((s) => s.ran)).toHaveLength(1);

    const third = await syncTickets({ full: true });
    expect(third.ran).toBe(true);
  });

  it("withSyncLock refuses while held and releases when the holder throws", async () => {
    let inner: unknown;
    await expect(
      withSyncLock(async () => {
        inner = await withSyncLock(async () => "nested");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(inner).toEqual({ acquired: false });
    expect(await withSyncLock(async () => "again")).toEqual({ acquired: true, value: "again" });
  });

  const holderPid = async () =>
    (
      await prisma.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND granted AND objid = (hashtext('itop_sync'))::oid`
    )[0]?.pid;

  it("keeps the lock on its original session across a long idle stretch (default long lifetimes)", async () => {
    let pidAtStart: number | undefined;
    let pidAtEnd: number | undefined;
    let released: boolean | undefined;
    const result = await withSyncLock(
      async () => {
        pidAtStart = await holderPid();
        await new Promise((resolve) => setTimeout(resolve, 3500));
        pidAtEnd = await holderPid();
        return "done";
      },
      { heartbeatMs: 300, onUnlock: (r) => (released = r) },
    );
    expect(result).toEqual({ acquired: true, value: "done" });
    expect(pidAtStart).toBeTypeOf("number");
    expect(pidAtEnd).toBe(pidAtStart);
    expect(released).toBe(true);
    expect(await holderPid()).toBeUndefined();
  });

  it("the heartbeat reports a lost lock session (connection recycled after 1 s) and the run still completes", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    let released: boolean | undefined;
    const result = await withSyncLock(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return "done";
      },
      { heartbeatMs: 300, extraParams: { max_idle_connection_lifetime: "1" }, onUnlock: (r) => (released = r) },
    );
    expect(result).toEqual({ acquired: true, value: "done" });
    expect(errorSpy.mock.calls.some((c) => String(c[1]).includes("lock session was lost"))).toBe(true);
    expect(released).toBe(false);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("unlock returned false"))).toBe(true);
    // Disconnecting released the orphaned lock.
    expect(await holderPid()).toBeUndefined();
  });

  it("a failure on the second page is recorded and the lock is released", async () => {
    const state = seedFakeItop();
    for (let i = 0; i < 250; i++) {
      const id = state.nextId++;
      state.tickets.set(id, extraTicket(id));
    }
    const baseUrl = await startFake(state);
    await configureItop(baseUrl);
    await createMappedCustomer(1);
    await createMappedCustomer(2);

    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const body = String(init?.body ?? "");
      if (body.includes("SELECT") && body.includes("UserRequest") && decodeURIComponent(body).includes('"page":2')) {
        throw new Error("simulated network failure on page 2");
      }
      return realFetch(input, init);
    });

    const failed = await syncTickets({ full: true });
    expect(failed.ran).toBe(true);
    expect(failed.error).toContain("simulated network failure");
    const config = await prisma.itopConfig.findUniqueOrThrow({ where: { id: "default" } });
    expect(config.lastSyncOk).toBe(false);
    expect(config.lastSyncError).toContain("simulated network failure");
    expect(config.lastSyncAt).toBeNull();

    vi.restoreAllMocks();
    const next = await syncTickets({ full: true });
    expect(next.ran).toBe(true);
    expect(next.error).toBeUndefined();
  });

  it("releases the lock when the run itself throws out of syncTickets", async () => {
    await readyFake();
    vi.spyOn(prisma.itopConfig, "update").mockRejectedValue(new Error("config write failed"));
    await expect(syncTickets({ full: true })).rejects.toThrow("config write failed");
    vi.restoreAllMocks();
    const next = await syncTickets({ full: true });
    expect(next.ran).toBe(true);
  });
});
