// The request-validation contract, pinned before the zod 3 to zod 4 upgrade
// (docs/archive/plans/zod-4-upgrade.md, ISS-207). These cases must pass unchanged
// on both versions: the 400 body shape and its default message wording (read
// by frontend/src/lib/formErrors.ts), UUID path params, and env defaults.
import "./env.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
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
