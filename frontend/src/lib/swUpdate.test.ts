import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissUpdate,
  getSwUpdateSnapshot,
  listenForPreloadErrors,
  notifyUpdateReady,
  resetSwUpdateForTests,
  scheduleUpdateChecks,
  subscribeSwUpdate,
} from "@/lib/swUpdate";

beforeEach(() => resetSwUpdateForTests());

describe("swUpdate store", () => {
  it("is hidden until an update is announced", () => {
    expect(getSwUpdateSnapshot()).toBe(false);
    notifyUpdateReady();
    expect(getSwUpdateSnapshot()).toBe(true);
  });

  it("notifies subscribers once per change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSwUpdate(listener);

    notifyUpdateReady();
    notifyUpdateReady(); // repeat announcement is a no-op
    expect(listener).toHaveBeenCalledTimes(1);

    dismissUpdate();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSwUpdateSnapshot()).toBe(false);

    unsubscribe();
    resetSwUpdateForTests();
    notifyUpdateReady();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stays hidden after dismissal even if the update is announced again", () => {
    notifyUpdateReady();
    dismissUpdate();
    notifyUpdateReady();
    expect(getSwUpdateSnapshot()).toBe(false);
  });
});

describe("listenForPreloadErrors", () => {
  it("shows the notice when a chunk fails to preload", () => {
    const target = new EventTarget();
    const stop = listenForPreloadErrors(target);
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(getSwUpdateSnapshot()).toBe(true);

    resetSwUpdateForTests();
    stop();
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(getSwUpdateSnapshot()).toBe(false);
  });
});

describe("scheduleUpdateChecks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks the registration for a new service worker on every tick", () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const stop = scheduleUpdateChecks({ update }, 1000);
    vi.advanceTimersByTime(3000);
    expect(update).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(3000);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("survives a failed check (offline) and tries again", async () => {
    const update = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    scheduleUpdateChecks({ update }, 1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a registration", () => {
    expect(() => scheduleUpdateChecks(undefined)()).not.toThrow();
  });
});
