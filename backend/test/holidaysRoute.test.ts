// GET /holidays: the default year follows the clock at request time, not the
// year the server started in (docs/ISSUES.md ISS-209).
import "./env.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUserWithRole, seedRoles } from "./testAuth.js";

const app = createApp();
beforeAll(async () => {
  await seedRoles();
});

afterEach(() => {
  vi.useRealTimers();
});

async function holidayYears(query: string): Promise<Set<string>> {
  // Signed under the current (possibly faked) clock, so the token is not expired.
  const { token } = await createUserWithRole("TAM");
  const res = await request(app).get(`/holidays${query}`).set({ Authorization: `Bearer ${token}` });
  expect(res.status).toBe(200);
  const list = res.body as Array<{ date: string }>;
  expect(list.length).toBeGreaterThan(0);
  return new Set(list.map((h) => h.date.slice(0, 4)));
}

describe("GET /holidays", () => {
  it("defaults to the current year, read when the request arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-06-15T12:00:00Z"));
    expect(await holidayYears("")).toEqual(new Set(["2031"]));
    vi.setSystemTime(new Date("2032-01-02T12:00:00Z"));
    expect(await holidayYears("")).toEqual(new Set(["2032"]));
  });

  it("uses an explicit ?year=", async () => {
    expect(await holidayYears("?year=2030")).toEqual(new Set(["2030"]));
  });
});
