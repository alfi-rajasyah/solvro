// Regression tests for docs/archive/plans/application-review-2026-10-22.md, F-04: the sign-in routes
// had no brute-force guard, and an unknown email answered without a bcrypt
// compare (faster than a wrong password), so response time revealed which
// accounts exist. Only FAILED attempts count against the limits, so a shared
// office address is never locked out by its own successful sign-ins.
import "./env.js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import {
  LOGIN_FAILURE_LIMIT_PER_ACCOUNT,
  LOGIN_FAILURE_LIMIT_PER_ADDRESS,
  loginAccountLimiter,
  loginAddressLimiter,
} from "../src/routes/auth.js";
import { seedRoles } from "./testAuth.js";

const app = createApp();
const PASSWORD = "Correct-horse-9";

beforeAll(async () => {
  await seedRoles();
});

afterEach(() => {
  loginAccountLimiter.reset();
  loginAddressLimiter.reset();
});

async function createPasswordUser() {
  const role = await prisma.role.findUniqueOrThrow({ where: { roleName: "TAM" } });
  const stamp = `${Date.now()}-${Math.random()}`;
  return prisma.user.create({
    data: {
      username: `ratelimit-${stamp}`,
      email: `ratelimit-${stamp}@example.com`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      roleId: role.id,
      active: true,
    },
  });
}

const login = (email: string, password: string) =>
  request(app).post("/auth/login").send({ email, password });

describe("F-04 — sign-in brute-force guard", () => {
  it("blocks the account after the per-account failure limit, even with the right password", async () => {
    const user = await createPasswordUser();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT_PER_ACCOUNT; i++) {
      const res = await login(user.email, "wrong");
      expect(res.status, `attempt ${i + 1}`).toBe(401);
    }
    // Exactly `limit` failures end the allowance: the next attempt is refused
    // whatever it carries (docs/archive/plans/application-review-2026-10-22.md,
    // QA-03 — before, a correct password on the 11th attempt still got in).
    const blocked = await login(user.email, "wrong");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("rate_limited");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);

    // A correct password does not get through while the block holds — the
    // limiter is checked before the credentials are compared.
    const correct = await login(user.email, PASSWORD);
    expect(correct.status).toBe(429);
  });

  it("refuses the correct password on the attempt right after the limit is reached (QA-03)", async () => {
    const user = await createPasswordUser();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT_PER_ACCOUNT; i++) await login(user.email, "wrong");
    const correct = await login(user.email, PASSWORD);
    expect(correct.status).toBe(429);
    expect(Number(correct.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does not count successful sign-ins, and clears nothing it should not", async () => {
    const user = await createPasswordUser();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT_PER_ACCOUNT + 5; i++) {
      const res = await login(user.email, PASSWORD);
      expect(res.status, `success ${i + 1}`).toBe(200);
    }
    // Failures after many successes still count from zero.
    const fail = await login(user.email, "wrong");
    expect(fail.status).toBe(401);
  });

  it("scopes the per-account limit to the address + email pair", async () => {
    const a = await createPasswordUser();
    const b = await createPasswordUser();
    for (let i = 0; i < LOGIN_FAILURE_LIMIT_PER_ACCOUNT; i++) await login(a.email, "wrong");
    expect((await login(a.email, "wrong")).status).toBe(429);
    // Another account from the same address is unaffected by a's lockout.
    expect((await login(b.email, PASSWORD)).status).toBe(200);
  });

  it("blocks the address after the per-address failure limit across many emails", async () => {
    for (let i = 0; i < LOGIN_FAILURE_LIMIT_PER_ADDRESS; i++) {
      const res = await login(`spray-${i}-${Date.now()}@example.com`, "wrong");
      expect(res.status, `attempt ${i + 1}`).toBe(401);
    }
    const blocked = await login(`spray-last-${Date.now()}@example.com`, "wrong");
    expect(blocked.status).toBe(429);
    // Even a valid account is refused from the sprayed address.
    const user = await createPasswordUser();
    expect((await login(user.email, PASSWORD)).status).toBe(429);
  });

  it("counts a Google-only account's password attempt as a failure", async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName: "TAM" } });
    const stamp = `${Date.now()}-${Math.random()}`;
    const user = await prisma.user.create({
      data: {
        username: `g-only-${stamp}`,
        email: `g-only-${stamp}@example.com`,
        passwordHash: null,
        googleSub: `sub-${stamp}`,
        roleId: role.id,
        active: true,
      },
    });
    for (let i = 0; i < LOGIN_FAILURE_LIMIT_PER_ACCOUNT; i++) {
      expect((await login(user.email, "x")).body.code).toBe("google_only");
    }
    expect((await login(user.email, "x")).status).toBe(429);
  });

  it("answers an unknown email with the same code as a wrong password", async () => {
    const res = await login(`nobody-${Date.now()}@example.com`, "wrong");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });
});
