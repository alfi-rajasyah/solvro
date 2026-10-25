import { describe, expect, it, vi } from "vitest";
import { OFFLINE_MESSAGE, readOnline, subscribeOnlineStatus } from "@/lib/onlineStatus";

describe("readOnline", () => {
  it("is false only when the browser reports offline", () => {
    expect(readOnline({ onLine: false })).toBe(false);
    expect(readOnline({ onLine: true })).toBe(true);
  });

  it("treats an unknown signal as online", () => {
    expect(readOnline({})).toBe(true);
    expect(readOnline(undefined)).toBe(true);
  });
});

describe("subscribeOnlineStatus", () => {
  it("notifies on online and offline events and stops after unsubscribe", () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    const unsubscribe = subscribeOnlineStatus(target, onChange);

    target.dispatchEvent(new Event("offline"));
    target.dispatchEvent(new Event("online"));
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    target.dispatchEvent(new Event("offline"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("ignores unrelated events", () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    subscribeOnlineStatus(target, onChange);
    target.dispatchEvent(new Event("focus"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("OFFLINE_MESSAGE", () => {
  it("names the consequence for writes", () => {
    expect(OFFLINE_MESSAGE).toBe("You are offline. Changes cannot be saved until the connection returns.");
  });
});
