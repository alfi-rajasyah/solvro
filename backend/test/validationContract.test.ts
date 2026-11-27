// The request-validation contract, pinned before the zod 3 to zod 4 upgrade
// (docs/archive/plans/zod-4-upgrade.md, ISS-207). These cases must pass unchanged
// on both versions: the 400 body shape and its default message wording (read
// by frontend/src/lib/formErrors.ts), UUID path params, and env defaults.
import "./env.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { z } from "zod";
import { createApp } from "../src/app.js";
import "../src/lib/zodConfig.js";
import { permissionSchema } from "../src/lib/permissions.js";
import { createAdminAndToken, seedRoles } from "./testAuth.js";

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let admin: { userId: number; token: string };

beforeAll(async () => {
  await seedRoles();
  admin = await createAdminAndToken();
});

describe("400 validation_error body", () => {
  it("names a missing field with the default wording", async () => {
    const res = await request(app).post("/services").set(auth(admin.token)).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid request",
      code: "validation_error",
      details: { formErrors: [], fieldErrors: { name: ["Required"] } },
    });
  });

  it("names a wrong type with the default wording", async () => {
    const res = await request(app).post("/services").set(auth(admin.token)).send({ name: 5 });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual({
      formErrors: [],
      fieldErrors: { name: ["Expected string, received number"] },
    });
  });

  it("names too-short and too-long strings with the default wording", async () => {
    const short = await request(app).post("/services").set(auth(admin.token)).send({ name: "" });
    expect(short.body.details.fieldErrors).toEqual({
      name: ["String must contain at least 1 character(s)"],
    });
    const long = await request(app)
      .post("/services")
      .set(auth(admin.token))
      .send({ name: "x".repeat(101) });
    expect(long.body.details.fieldErrors).toEqual({
      name: ["String must contain at most 100 character(s)"],
    });
  });

  it("names a value outside an enum with the default wording", async () => {
    const res = await request(app)
      .get("/utilization")
      .query({ scope: "everyone" })
      .set(auth(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.scope).toEqual([
      "Invalid enum value. Expected 'me' | 'tam' | 'customer', received 'everyone'",
    ]);
  });
});

describe("UUID path params", () => {
  // Hex in UUID layout, but its version and variant digits are not RFC 9562
  // values. It is well formed, so the API answers 404, never validation_error.
  const guid = "12345678-1234-1234-1234-123456789abc";
  const cases: Array<[string, () => request.Test]> = [
    ["GET /opportunities/:id", () => request(app).get(`/opportunities/${guid}`)],
    ["DELETE /opportunities/:id", () => request(app).delete(`/opportunities/${guid}`)],
    [
      "GET /opportunities/:opportunityId/activities",
      () => request(app).get(`/opportunities/${guid}/activities`),
    ],
    [
      "DELETE /opportunities/:opportunityId/links/:linkId",
      () => request(app).delete(`/opportunities/${guid}/links/${guid}`),
    ],
    ["DELETE /projects/:id/links/:linkId", () => request(app).delete(`/projects/999999999/links/${guid}`)],
    ["DELETE /tasks/:id/links/:linkId", () => request(app).delete(`/tasks/999999999/links/${guid}`)],
    [
      "DELETE /customers/:id/links/:linkId",
      () => request(app).delete(`/customers/999999999/links/${guid}`),
    ],
  ];

  it.each(cases)("%s accepts a non-RFC GUID", async (_name, send) => {
    const res = await send().set(auth(admin.token));
    expect(res.body.code).not.toBe("validation_error");
    expect(res.status).toBe(404);
  });

  it("still rejects a value that is not a GUID", async () => {
    const res = await request(app).get("/opportunities/not-a-uuid").set(auth(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_error");
  });
});

describe("env defaults", () => {
  async function loadEnv(overrides: Record<string, string | undefined>) {
    vi.resetModules();
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(overrides)) {
      previous[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      const { env } = await import("../src/env.js");
      return env;
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  afterEach(() => {
    vi.resetModules();
  });

  it("applies the defaults of unset variables through their transforms", async () => {
    const env = await loadEnv({ TRUST_PROXY: undefined, ITOP_SYNC_DISABLED: undefined, PORT: undefined });
    expect(env.TRUST_PROXY).toBe(1);
    expect(env.ITOP_SYNC_DISABLED).toBe(false);
    expect(env.PORT).toBe(3000);
  });

  it("reads the boolean-ish spellings of ITOP_SYNC_DISABLED", async () => {
    expect((await loadEnv({ ITOP_SYNC_DISABLED: "1" })).ITOP_SYNC_DISABLED).toBe(true);
    expect((await loadEnv({ ITOP_SYNC_DISABLED: " Yes " })).ITOP_SYNC_DISABLED).toBe(true);
    expect((await loadEnv({ ITOP_SYNC_DISABLED: "0" })).ITOP_SYNC_DISABLED).toBe(false);
  });
});

describe("default messages keep the zod 3 wording", () => {
  // Expected strings were captured from zod 3.25.76 on 2026-11-27.
  const cases: Array<[string, z.ZodType, unknown, string]> = [
    ["missing value", z.string(), undefined, "Required"],
    ["wrong type", z.string(), 5, "Expected string, received number"],
    ["null", z.string(), null, "Expected string, received null"],
    ["array expected", z.array(z.string()), {}, "Expected array, received object"],
    ["NaN", z.coerce.number(), "abc", "Expected number, received nan"],
    ["non-integer", z.number().int(), 1.5, "Expected integer, received float"],
    ["enum", z.enum(["a", "b"]), "c", "Invalid enum value. Expected 'a' | 'b', received 'c'"],
    ["email", z.email(), "x", "Invalid email"],
    ["trimmed email", z.string().trim().toLowerCase().pipe(z.email()), " x ", "Invalid email"],
    ["url", z.url(), "x", "Invalid url"],
    ["guid", z.guid(), "x", "Invalid uuid"],
    ["regex", z.string().regex(/^a$/), "x", "Invalid"],
    ["number min", z.number().min(1), 0, "Number must be greater than or equal to 1"],
    ["number positive", z.number().positive(), 0, "Number must be greater than 0"],
    ["number max", z.number().max(1), 2, "Number must be less than or equal to 1"],
    ["array min", z.array(z.string()).min(1), [], "Array must contain at least 1 element(s)"],
    ["array max", z.array(z.string()).max(1), ["a", "b"], "Array must contain at most 1 element(s)"],
    ["exact length", z.string().length(2), "a", "String must contain exactly 2 character(s)"],
    ["strict object", z.object({}).strict(), { a: 1 }, "Unrecognized key(s) in object: 'a'"],
    ["union", z.union([z.string(), z.number()]), true, "Invalid input"],
    ["invalid date", z.coerce.date(), "x", "Invalid date"],
    ["refine without message", z.string().refine(() => false), "x", "Invalid input"],
    ["schema message wins", z.string().min(3, "Too short"), "a", "Too short"],
    ["refine error param wins", z.string().refine(() => false, { error: "Must be one line" }), "x", "Must be one line"],
    ["enum missing", z.object({ f: z.enum(["a", "b"]) }), {}, "Required"],
    ["enum null", z.enum(["a", "b"]), null, "Expected 'a' | 'b', received null"],
    ["enum boolean", z.enum(["a", "b"]), true, "Expected 'a' | 'b', received boolean"],
    ["object enum missing", z.object({ f: z.enum({ A: "A", B: "B" }) }), {}, "Required"],
    ["object enum null", z.enum({ A: "A", B: "B" }), null, "Expected 'A' | 'B', received null"],
    ["object enum number", z.enum({ A: "A", B: "B" }), 5, "Invalid enum value. Expected 'A' | 'B', received '5'"],
    ["object enum string", z.enum({ A: "A", B: "B" }), "C", "Invalid enum value. Expected 'A' | 'B', received 'C'"],
    ["numeric object enum", z.enum({ X: 1, Y: 2 }), 3, "Invalid enum value. Expected 1 | 2, received '3'"],
    [
      "bad discriminator",
      z.discriminatedUnion("kind", [z.object({ kind: z.literal("a") }), z.object({ kind: z.literal("b") })]),
      { kind: "c" },
      "Invalid discriminator value. Expected 'a' | 'b'",
    ],
    [
      "missing discriminator",
      z.discriminatedUnion("kind", [z.object({ kind: z.literal("a") }), z.object({ kind: z.literal("b") })]),
      {},
      "Invalid discriminator value. Expected 'a' | 'b'",
    ],
    ["Infinity on an int", z.coerce.number().int(), "Infinity", "Expected integer, received float"],
  ];

  it.each(cases)("%s", (_name, schema, input, message) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it("names an unknown permission", () => {
    const result = permissionSchema.safeParse("nope");
    expect(result.error?.issues[0]?.message).toMatch(/^Unknown permission "nope"; expected one of: /);
  });
});
