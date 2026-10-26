// docs/archive/plans/application-review-2026-10-22.md, F-41
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TIMER_MS,
  SESSION_WARNING_LEAD_MS,
  decodeTokenExpiryMs,
  isSessionWarningDue,
  scheduleAt,
  sessionWarningAtMs,
} from "@/lib/sessionExpiry";

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
const tokenWith = (claims: unknown) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.signature`;

describe("decodeTokenExpiryMs", () => {
  it("reads exp (seconds) as milliseconds", () => {
    expect(decodeTokenExpiryMs(tokenWith({ sub: 1, ver: 0, exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it("returns null for a missing, null or malformed token", () => {
    expect(decodeTokenExpiryMs(null)).toBeNull();
    expect(decodeTokenExpiryMs(undefined)).toBeNull();
    expect(decodeTokenExpiryMs("")).toBeNull();
    expect(decodeTokenExpiryMs("not-a-jwt")).toBeNull();
    expect(decodeTokenExpiryMs("a.b.c")).toBeNull();
    expect(decodeTokenExpiryMs(`${b64url({})}.!!!.sig`)).toBeNull();
  });

  it("returns null when exp is absent or not a usable number", () => {
    expect(decodeTokenExpiryMs(tokenWith({ sub: 1 }))).toBeNull();
    expect(decodeTokenExpiryMs(tokenWith({ exp: "soon" }))).toBeNull();
    expect(decodeTokenExpiryMs(tokenWith({ exp: -5 }))).toBeNull();
    expect(decodeTokenExpiryMs(tokenWith(["exp"]))).toBeNull();
    expect(decodeTokenExpiryMs(tokenWith(null))).toBeNull();
  });
});

describe("sessionWarningAtMs / isSessionWarningDue", () => {
  const exp = 1_800_000_000;
  const token = tokenWith({ exp });

  it("warns five minutes before expiry", () => {
    expect(SESSION_WARNING_LEAD_MS).toBe(300_000);
    expect(sessionWarningAtMs(token)).toBe(exp * 1000 - 300_000);
  });

  it("is due from the warning time on, not before", () => {
    const at = exp * 1000 - 300_000;
    expect(isSessionWarningDue(token, at - 1)).toBe(false);
    expect(isSessionWarningDue(token, at)).toBe(true);
    expect(isSessionWarningDue(token, exp * 1000 + 1)).toBe(true);
  });

  it("never warns for a malformed token or no token", () => {
    expect(isSessionWarningDue("garbage", Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(isSessionWarningDue(null, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(sessionWarningAtMs("garbage")).toBeNull();
  });
});

describe("scheduleAt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires at the target time", () => {
    const fn = vi.fn();
    scheduleAt(Date.now() + 1000, fn);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-arms a delay beyond the setTimeout limit instead of firing early", () => {
    const fn = vi.fn();
    scheduleAt(Date.now() + MAX_TIMER_MS + 5000, fn);
    vi.advanceTimersByTime(MAX_TIMER_MS);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled, and runs at once for a time already past", () => {
    const fn = vi.fn();
    scheduleAt(Date.now() + 1000, fn)();
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
    scheduleAt(Date.now() - 1, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
