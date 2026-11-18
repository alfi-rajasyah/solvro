// withDeadlockRetry (lib/offboarding.ts): a unit test of the retry policy.
// It runs against stubbed callbacks — no query is issued.
import "./env.js";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { withDeadlockRetry } from "../src/lib/offboarding.js";

const knownError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test", meta });

// Every error shape the implementation recognises as a deadlock.
const deadlockShapes: [string, () => unknown][] = [
  ["Prisma P2034 (write conflict / deadlock)", () => knownError("P2034")],
  ["a Prisma error whose meta carries 40P01", () => knownError("P2010", { code: "40P01" })],
  ["an Error whose message carries 40P01", () => new Error("ERROR: 40P01 raised")],
  ["an Error whose message says deadlock detected", () => new Error("deadlock detected")],
];

describe("withDeadlockRetry", () => {
  it("returns the result without a retry when the first run succeeds", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    await expect(withDeadlockRetry(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each(deadlockShapes)("retries once on %s and returns the second result", async (_name, make) => {
    const run = vi.fn().mockRejectedValueOnce(make()).mockResolvedValueOnce("second");
    await expect(withDeadlockRetry(run)).resolves.toBe("second");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after 2 attempts in total and rethrows the second error unchanged", async () => {
    const first = knownError("P2034");
    const second = new Error("deadlock detected (second)");
    const run = vi.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(second).mockResolvedValue("never");
    await expect(withDeadlockRetry(run)).rejects.toBe(second);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a plain Error", () => new Error("connection refused")],
    ["a Prisma unique violation (P2002)", () => knownError("P2002")],
    ["a Prisma FK violation (P2003)", () => knownError("P2003", { field_name: "tam_id" })],
    ["a non-Error throw", () => "deadlock detected"],
  ] as [string, () => unknown][])("does not retry %s", async (_name, make) => {
    const err = make();
    const run = vi.fn().mockRejectedValue(err);
    await expect(withDeadlockRetry(run)).rejects.toBe(err);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
