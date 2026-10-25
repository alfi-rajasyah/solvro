// Regression tests for the backend hardening findings in
// docs/archive/plans/application-review-2026-10-22.md (F-20, F-21, F-22,
// F-23, F-31, F-32) plus malformed-JSON handling (N-05).
import "./env.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { errorHandler } from "../src/http/errors.js";
import { normalizeUsername } from "../src/lib/username.js";
import { KNOWN_PERMISSIONS } from "../src/lib/permissions.js";
import { ROLE_PERMISSIONS as SEED_ROLE_PERMISSIONS } from "../prisma/seed.js";
import {
  baseUsernameFromEmail,
  decideCreateAdmin,
  isForceFlag,
  normalizeUsername as scriptNormalizeUsername,
  resolveUsername,
} from "../scripts/createAdminPolicy.js";
import { createAdminAndToken, createUserWithRole, seedRoles } from "./testAuth.js";

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await seedRoles();
});

function uniq(label: string): string {
  return `${label} ${Date.now()}-${Math.random()}`;
}

async function createCustomer(tamId: number | null) {
  return prisma.customer.create({ data: { name: uniq("Customer"), description: "d", tamId } });
}

const UNKNOWN_USER_ID = 2_000_000_000;

/** Runs errorHandler against a thrown value and returns what it answered. */
function renderError(err: unknown): { status: number; body: Record<string, unknown> } {
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status(s: number) {
      status = s;
      return res;
    },
    json(b: Record<string, unknown>) {
      body = b;
      return res;
    },
    setHeader() {
      return res;
    },
  };
  errorHandler(err, {} as never, res as never, () => undefined);
  return { status, body };
}

describe("F-22 — P2002 answers do not leak Prisma metadata", () => {
  it("renders only { target } from a unique-constraint error", () => {
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "x",
      meta: { modelName: "Label", target: ["project_id", "name"], driverAdapterError: { secret: 1 } },
    });
    const { status, body } = renderError(err);
    expect(status).toBe(409);
    expect(body.code).toBe("conflict");
    expect(body.details).toEqual({ target: ["project_id", "name"] });
    expect(JSON.stringify(body)).not.toContain("Label");
  });

  it("omits details when the target is not a list of strings", () => {
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "x",
      meta: { modelName: "Label", target: "labels_name_key" },
    });
    const { status, body } = renderError(err);
    expect(status).toBe(409);
    expect(body).not.toHaveProperty("details");
  });

  it("a duplicate project label over HTTP leaks no model name", async () => {
    const admin = await createAdminAndToken();
    const customer = await createCustomer(admin.userId);
    const project = await prisma.project.create({
      data: { name: uniq("P"), tamId: admin.userId, customerId: customer.id, status: "ACTIVE" },
    });
    const url = `/projects/${project.id}/labels`;
    const first = await request(app).post(url).set(auth(admin.token)).send({ name: "dup" });
    expect(first.status).toBe(201);
    const second = await request(app).post(url).set(auth(admin.token)).send({ name: "dup" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("conflict");
    expect(JSON.stringify(second.body)).not.toMatch(/Label|modelName|driverAdapterError/);
  });
});

describe("N-05 — malformed and oversized JSON bodies are client errors", () => {
  it("answers 400 invalid_json for a broken body", async () => {
    const admin = await createAdminAndToken();
    const res = await request(app)
      .post("/customers")
      .set(auth(admin.token))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Malformed JSON body", code: "invalid_json" });
  });

  it("answers 413 payload_too_large past the body limit", async () => {
    const admin = await createAdminAndToken();
    const res = await request(app)
      .post("/customers")
      .set(auth(admin.token))
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: "x".repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("payload_too_large");
  });
});

describe("F-20 / F-23 — foreign-key violations are 400s", () => {
  it("maps an unhandled P2003 to 400 invalid_reference with no Prisma metadata", () => {
    const err = new Prisma.PrismaClientKnownRequestError("fk", {
      code: "P2003",
      clientVersion: "x",
      meta: { modelName: "Task", field_name: "tasks_assigned_to_fkey (index)" },
    });
    const { status, body } = renderError(err);
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Referenced record does not exist", code: "invalid_reference" });
  });

  it("DELETE /admin/users/:id turns a P2003 from the delete into 400 user_in_use", async () => {
    const admin = await createAdminAndToken();
    const target = await createUserWithRole("TAM");
    const targetRow = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });

    // Simulate a row created after the blocker count: the count passes, then
    // the delete trips the RESTRICT foreign key.
    const original = prisma.$transaction.bind(prisma) as (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>) =>
      original((tx) =>
        fn(
          new Proxy(tx as object, {
            get(t, key) {
              const value = (t as Record<string | symbol, unknown>)[key];
              if (key !== "user") return value;
              return new Proxy(value as object, {
                get(u, method) {
                  if (method === "delete") {
                    return async () => {
                      throw new Prisma.PrismaClientKnownRequestError("fk", {
                        code: "P2003",
                        clientVersion: "x",
                      });
                    };
                  }
                  return (u as Record<string | symbol, unknown>)[method];
                },
              });
            },
          }),
        ),
      )) as never);
    try {
      const res = await request(app).delete(`/admin/users/${target.userId}`).set(auth(admin.token));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("user_in_use");
      expect(res.body.error).toBe(
        `Cannot delete ${targetRow.username}: it is still referenced by other records. Reassign or remove these first.`,
      );
    } finally {
      spy.mockRestore();
    }
    // Nothing was deleted.
    expect(await prisma.user.findUnique({ where: { id: target.userId } })).not.toBeNull();
  });

  it("DELETE /admin/users/:id still lists the pre-checked blockers", async () => {
    const admin = await createAdminAndToken();
    const tam = await createUserWithRole("TAM");
    const customer = await createCustomer(tam.userId);
    await prisma.project.create({
      data: { name: uniq("P"), tamId: tam.userId, customerId: customer.id, status: "ACTIVE" },
    });
    const res = await request(app).delete(`/admin/users/${tam.userId}`).set(auth(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("user_in_use");
    expect(res.body.error).toContain("1 project(s) as TAM");
  });

  it("DELETE /admin/users/:id deletes an unreferenced user", async () => {
    const admin = await createAdminAndToken();
    const target = await createUserWithRole("TAM");
    const res = await request(app).delete(`/admin/users/${target.userId}`).set(auth(admin.token));
    expect(res.status).toBe(204);
  });

  describe("project and task writes naming an unknown user", () => {
    async function fixture() {
      const tam = await createUserWithRole("TAM");
      const customer = await createCustomer(tam.userId);
      const project = await prisma.project.create({
        data: { name: uniq("P"), tamId: tam.userId, customerId: customer.id, status: "ACTIVE" },
      });
      return { tam, customer, project };
    }

    it("POST /projects with an unknown tamId or saId is 400, not 500", async () => {
      const { tam, customer } = await fixture();
      const badTam = await request(app)
        .post("/projects")
        .set(auth(tam.token))
        .send({ name: uniq("P"), customerId: customer.id, tamId: UNKNOWN_USER_ID });
      expect(badTam.status).toBe(400);
      expect(badTam.body.code).toBe("tam_not_found");

      const badSa = await request(app)
        .post("/projects")
        .set(auth(tam.token))
        .send({ name: uniq("P"), customerId: customer.id, saId: UNKNOWN_USER_ID });
      expect(badSa.status).toBe(400);
      expect(badSa.body.code).toBe("sa_not_found");
    });

    it("POST /projects refuses an inactive SA", async () => {
      const { tam, customer } = await fixture();
      const sa = await createUserWithRole("SA");
      await prisma.user.update({ where: { id: sa.userId }, data: { active: false } });
      const res = await request(app)
        .post("/projects")
        .set(auth(tam.token))
        .send({ name: uniq("P"), customerId: customer.id, saId: sa.userId });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("sa_not_found");
    });

    it("PATCH /projects/:id with an unknown tamId or saId is 400", async () => {
      const { tam, project } = await fixture();
      const badTam = await request(app)
        .patch(`/projects/${project.id}`)
        .set(auth(tam.token))
        .send({ tamId: UNKNOWN_USER_ID });
      expect(badTam.status).toBe(400);
      expect(badTam.body.code).toBe("tam_not_found");
      const badSa = await request(app)
        .patch(`/projects/${project.id}`)
        .set(auth(tam.token))
        .send({ saId: UNKNOWN_USER_ID });
      expect(badSa.status).toBe(400);
      expect(badSa.body.code).toBe("sa_not_found");
      const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(after.tamId).toBe(tam.userId);
      expect(after.saId).toBeNull();
    });

    it("PATCH /projects/:id re-saving the current TAM is not re-validated", async () => {
      const { tam, project } = await fixture();
      const res = await request(app)
        .patch(`/projects/${project.id}`)
        .set(auth(tam.token))
        .send({ name: uniq("Renamed"), tamId: tam.userId });
      expect(res.status).toBe(200);
    });

    it("creating a task with an unknown assignee is 400; updating one stays a clean 404", async () => {
      const { tam, project } = await fixture();
      const created = await request(app)
        .post(`/projects/${project.id}/tasks`)
        .set(auth(tam.token))
        .send({ title: "t", assignedToId: UNKNOWN_USER_ID });
      expect(created.status).toBe(400);
      expect(created.body.code).toBe("assignee_not_found");

      const task = await prisma.task.create({ data: { title: "t2", projectId: project.id } });
      const updated = await request(app)
        .patch(`/tasks/${task.id}`)
        .set(auth(tam.token))
        .send({ assignedToId: UNKNOWN_USER_ID });
      // PATCH connects the relation, so Prisma reports the missing user as
      // P2025 -> 404 (pinned by taskAssigneeMembers.test.ts); never a 500.
      expect(updated.status).toBe(404);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedToId).toBeNull();
    });

    it("creating and updating an epic with an unknown owner is 400", async () => {
      const { tam, project } = await fixture();
      const created = await request(app)
        .post(`/projects/${project.id}/epics`)
        .set(auth(tam.token))
        .send({ title: "e", ownerId: UNKNOWN_USER_ID });
      expect(created.status).toBe(400);
      expect(created.body.code).toBe("owner_not_found");

      const epic = await prisma.epic.create({ data: { title: "e2", projectId: project.id, position: 0 } });
      const updated = await request(app)
        .patch(`/epics/${epic.id}`)
        .set(auth(tam.token))
        .send({ ownerId: UNKNOWN_USER_ID });
      expect(updated.status).toBe(400);
      expect(updated.body.code).toBe("owner_not_found");
    });
  });
});

describe("F-21 — create-admin decisions", () => {
  it("decides create / reset-admin / promote / refuse", () => {
    expect(decideCreateAdmin(null, false)).toBe("create");
    expect(decideCreateAdmin(null, true)).toBe("create");
    expect(decideCreateAdmin({ isAdmin: true }, false)).toBe("reset-admin");
    expect(decideCreateAdmin({ isAdmin: true }, true)).toBe("reset-admin");
    expect(decideCreateAdmin({ isAdmin: false }, false)).toBe("refuse");
    expect(decideCreateAdmin({ isAdmin: false }, true)).toBe("promote");
  });

  it("reads FORCE_ADMIN strictly", () => {
    expect(isForceFlag("1")).toBe(true);
    expect(isForceFlag(" TRUE ")).toBe(true);
    expect(isForceFlag("0")).toBe(false);
    expect(isForceFlag("")).toBe(false);
    expect(isForceFlag(undefined)).toBe(false);
  });

  it("derives the username from the email local part through the username rule", () => {
    expect(baseUsernameFromEmail("alice@example.com")).toBe("alice");
    expect(baseUsernameFromEmail("al.ice+ops@example.com")).toBe("al.ice-ops");
    expect(baseUsernameFromEmail("@example.com")).toBeNull();
  });

  it("appends -2, -3 … while the (case-insensitive) name is taken", async () => {
    const taken = new Set(["alice", "alice-2"]);
    const free = await resolveUsername("Alice", async (c) => taken.has(c.toLowerCase()));
    expect(free).toBe("Alice-3");
    expect(await resolveUsername("bob", async () => false)).toBe("bob");
  });

  it("keeps a suffixed name within the length limit", async () => {
    const base = "a".repeat(50);
    const name = await resolveUsername(base, async (c) => c === base);
    expect(name).toBe("a".repeat(48) + "-2");
    expect(name.length).toBeLessThanOrEqual(50);
  });

  it("the script's copy of the username rule agrees with src/lib/username.ts", () => {
    const samples = [
      "alice", "Zoë", "o'brien", "a b", "  spaced  ", "", "x".repeat(51), "x".repeat(50),
      "аlice", // Cyrillic "а"
      "ａｌｉｃｅ", // full-width
      "dotless-ı", "a+b", "tab\tname", "emoji😀", "Łukasz",
    ];
    for (const s of samples) {
      expect(scriptNormalizeUsername(s)).toBe(normalizeUsername(s));
    }
  });
});

describe("F-31 — input bounds", () => {
  it("rejects a dealValue beyond Number.MAX_SAFE_INTEGER on create and update with 400 validation_error", async () => {
    const admin = await createAdminAndToken();
    const create = await request(app)
      .post("/opportunities")
      .set(auth(admin.token))
      .send({ title: uniq("Deal"), customerName: "Acme", dealValue: 1e30 });
    expect(create.status).toBe(400);
    expect(create.body.code).toBe("validation_error");

    const ok = await request(app)
      .post("/opportunities")
      .set(auth(admin.token))
      .send({ title: uniq("Deal"), customerName: "Acme", dealValue: Number.MAX_SAFE_INTEGER });
    expect(ok.status).toBe(201);

    const update = await request(app)
      .patch(`/opportunities/${ok.body.id}`)
      .set(auth(admin.token))
      .send({ dealValue: 1e30 });
    expect(update.status).toBe(400);
    expect(update.body.code).toBe("validation_error");
  });

  it("rejects more than 50 labelIds on task create with 400", async () => {
    const tam = await createUserWithRole("TAM");
    const project = await prisma.project.create({
      data: { name: uniq("Project"), tamId: tam.userId, status: "ACTIVE" },
    });
    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set(auth(tam.token))
      .send({ title: "Too many labels", labelIds: Array.from({ length: 51 }, (_, i) => i + 1) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_error");
  });

  it("rejects more than 50 tools on one service assignment for projects and customers", async () => {
    const admin = await createAdminAndToken();
    const customer = await createCustomer(admin.userId);
    const project = await prisma.project.create({
      data: { name: uniq("Project"), tamId: admin.userId, status: "ACTIVE" },
    });
    const service = await prisma.service.create({ data: { name: uniq("Service") } });
    const tools = Array.from({ length: 51 }, (_, i) => `Tool ${i}`);

    for (const path of [`/projects/${project.id}/services`, `/customers/${customer.id}/services`]) {
      const tooMany = await request(app)
        .put(path)
        .set(auth(admin.token))
        .send({ assignments: [{ serviceId: service.id, tools }] });
      expect(tooMany.status, path).toBe(400);
      expect(tooMany.body.code).toBe("validation_error");

      const ok = await request(app)
        .put(path)
        .set(auth(admin.token))
        .send({ assignments: [{ serviceId: service.id, tools: tools.slice(0, 50) }] });
      expect(ok.status, path).toBe(200);
    }
  });

  it("pins the 13 known permission values (the frontend's auth.test.ts pins the same list)", () => {
    expect([...KNOWN_PERMISSIONS]).toEqual([
      "*",
      "project:view-all",
      "project:read",
      "project:write",
      "task:read",
      "task:write",
      "pipeline:view",
      "pipeline:create",
      "pipeline:edit_own",
      "pipeline:edit_all",
      "pipeline:delete_own",
      "pipeline:delete_all",
      "report:executive",
    ]);
  });

  it("POST /admin/roles rejects an unknown permission string and names it", async () => {
    const admin = await createAdminAndToken();
    const res = await request(app)
      .post("/admin/roles")
      .set(auth(admin.token))
      .send({ roleName: `TYPO_${Date.now()}`, permissions: ["project:wrte"] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_error");
    expect(JSON.stringify(res.body.details)).toContain("project:wrte");
  });

  it("PATCH /admin/roles/:id rejects an unknown permission, and accepts every known one", async () => {
    const admin = await createAdminAndToken();
    const roleName = `CUSTOM_${Date.now()}`;
    const created = await request(app)
      .post("/admin/roles")
      .set(auth(admin.token))
      .send({ roleName, permissions: ["project:read"] });
    expect(created.status).toBe(201);
    const roleId = created.body.id as number;

    const bad = await request(app)
      .patch(`/admin/roles/${roleId}`)
      .set(auth(admin.token))
      .send({ permissions: ["project:read", "admin"] });
    expect(bad.status).toBe(400);

    const good = await request(app)
      .patch(`/admin/roles/${roleId}`)
      .set(auth(admin.token))
      .send({ permissions: [...KNOWN_PERMISSIONS] });
    expect(good.status).toBe(200);
  });

  it("the permission vocabulary covers every literal the backend checks and every seeded grant", () => {
    const known = new Set<string>(KNOWN_PERMISSIONS);
    const srcDir = new URL("../src/", import.meta.url);
    const used = new Set<string>();
    for (const entry of readdirSync(srcDir, { recursive: true }) as string[]) {
      if (!entry.endsWith(".ts")) continue;
      const text = readFileSync(new URL(entry, srcDir), "utf8");
      for (const m of text.matchAll(/"((?:project|task|pipeline|report)):([a-z_-]+)"/g)) {
        used.add(`${m[1]}:${m[2]}`);
      }
    }
    // lib/pipelineAccess.ts builds `pipeline:${action}_all|_own` from a template.
    for (const action of ["edit", "delete"]) {
      used.add(`pipeline:${action}_all`);
      used.add(`pipeline:${action}_own`);
    }
    expect(used.size).toBeGreaterThan(5);
    for (const permission of used) expect(known.has(permission), permission).toBe(true);

    for (const [role, permissions] of Object.entries(SEED_ROLE_PERMISSIONS)) {
      for (const permission of permissions) expect(known.has(permission), `${role}: ${permission}`).toBe(true);
    }
  });
});

describe("F-32 — foreign-key indexes", () => {
  it("indexes the three actor / creator / adder columns", async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'activity_events_actor_id_idx',
          'share_links_created_by_id_idx',
          'project_members_added_by_id_idx'
        )`;
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      "activity_events_actor_id_idx",
      "project_members_added_by_id_idx",
      "share_links_created_by_id_idx",
    ]);
  });
});
