// PUBLIC_BASE_URL validation in src/env.ts: blank/unset is allowed, anything else
// must be an absolute http(s) URL without a trailing slash, query or fragment.
import "./env.js";
import { afterEach, describe, expect, it, vi } from "vitest";

async function load(value: string | undefined) {
  vi.resetModules();
  const previous = process.env.PUBLIC_BASE_URL;
  if (value === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = value;
  const exit = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("exit");
  }) as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { env } = await import("../src/env.js");
    return { value: env.PUBLIC_BASE_URL, exited: false };
  } catch {
    return { value: undefined, exited: exit.mock.calls.length > 0 };
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("PUBLIC_BASE_URL", () => {
  it.each([undefined, "", "   "])("treats %j as unset", async (raw) => {
    expect(await load(raw)).toEqual({ value: undefined, exited: false });
  });

  it.each(["https://solvro.example.com", "http://10.0.0.5:8080", " https://solvro.example.com "])(
    "accepts %j",
    async (raw) => {
      const result = await load(raw);
      expect(result.exited).toBe(false);
      expect(result.value).toBe(raw.trim());
    },
  );

  it.each(["solvro.example.com", "ftp://solvro.example.com", "https://solvro.example.com/", "https://x.example/?a=1", "https://x.example/#top", "not a url"])(
    "rejects %j and stops startup",
    async (raw) => {
      expect((await load(raw)).exited).toBe(true);
    },
  );
});
