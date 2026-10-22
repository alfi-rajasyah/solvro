// Regression tests for docs/archive/plans/application-review-2026-10-22.md, F-13: `users.email` is
// UNIQUE but case-sensitive, and only the Google sign-in path lower-cased.
// An account created as `Alice@Corp.com` could not sign in with
// `alice@corp.com`, and a later Google sign-in for the same person
// auto-provisioned a second account. Every write path now stores the
// lower-cased form and every lookup normalises first.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { createAdminAndToken, seedRoles } from "./testAuth.js";

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await seedRoles();
});

describe("F-13 — emails are case-insensitive", () => {
  it("stores a mixed-case email lower-cased and signs in with any case", async () => {
    const admin = await createAdminAndToken();
    const stamp = Date.now();
    const typed = `Alice.${stamp}@Corp.Example`;
    const created = await request(app)
      .post("/admin/users")
      .set(auth(admin.token))
      .send({ email: typed, username: `alice-${stamp}`, password: "Password-123", role: "TAM" });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe(typed.toLowerCase());

    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.email).toBe(typed.toLowerCase());

    for (const attempt of [typed, typed.toLowerCase(), typed.toUpperCase(), `  ${typed}  `]) {
      const res = await request(app).post("/auth/login").send({ email: attempt, password: "Password-123" });
      expect(res.status, attempt).toBe(200);
      expect(res.body.user.id).toBe(created.body.id);
    }
  });

  it("refuses a second account that differs only by case", async () => {
    const admin = await createAdminAndToken();
    const stamp = Date.now();
    const first = await request(app)
      .post("/admin/users")
      .set(auth(admin.token))
      .send({ email: `bob.${stamp}@example.com`, username: `bob-${stamp}`, password: "Password-123", role: "TAM" });
    expect(first.status).toBe(201);
    const second = await request(app)
      .post("/admin/users")
      .set(auth(admin.token))
      .send({ email: `BOB.${stamp}@EXAMPLE.COM`, username: `bob2-${stamp}`, password: "Password-123", role: "TAM" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("email_in_use");
  });
});
