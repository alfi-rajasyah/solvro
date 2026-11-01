import { afterEach, describe, expect, it } from "vitest";
import { addDays, parseISO } from "date-fns";
import type { GanttEvent } from "@/components/reui/gantt/gantt-types";
import type { Task } from "@/lib/queries";
import { eventPatch } from "./adapter";
import { addDaysToDay, eventDays, nudgeFromKey, nudgeRange, proposedUpdate } from "./keyboardNudge";

const key = (k: string, mods: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
  key: k,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

describe("nudgeFromKey", () => {
  it("maps plain arrows to a one-day move", () => {
    expect(nudgeFromKey(key("ArrowLeft"))).toEqual({ kind: "move", days: -1 });
    expect(nudgeFromKey(key("ArrowRight"))).toEqual({ kind: "move", days: 1 });
  });

  it("Shift makes the step a week", () => {
    expect(nudgeFromKey(key("ArrowRight", { shiftKey: true }))).toEqual({ kind: "move", days: 7 });
    expect(nudgeFromKey(key("ArrowLeft", { shiftKey: true }))).toEqual({ kind: "move", days: -7 });
  });

  it("Alt switches to resizing the end edge", () => {
    expect(nudgeFromKey(key("ArrowRight", { altKey: true }))).toEqual({ kind: "resize", days: 1 });
    expect(nudgeFromKey(key("ArrowLeft", { altKey: true, shiftKey: true }))).toEqual({
      kind: "resize",
      days: -7,
    });
  });

  it("ignores Ctrl/Meta combos and non-horizontal keys", () => {
    expect(nudgeFromKey(key("ArrowRight", { ctrlKey: true }))).toBeNull();
    expect(nudgeFromKey(key("ArrowLeft", { metaKey: true }))).toBeNull();
    expect(nudgeFromKey(key("ArrowUp"))).toBeNull();
    expect(nudgeFromKey(key("Enter"))).toBeNull();
    expect(nudgeFromKey(key("a"))).toBeNull();
  });
});

describe("addDaysToDay", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDaysToDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToDay("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToDay("2026-03-29", 7)).toBe("2026-04-05");
  });

  it("is unaffected by DST transitions", () => {
    expect(addDaysToDay("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDaysToDay("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("returns malformed input unchanged", () => {
    expect(addDaysToDay("nope", 3)).toBe("nope");
  });
});

describe("nudgeRange", () => {
  const range = { start: "2026-11-03", end: "2026-11-07" };

  it("move shifts both edges and keeps the duration", () => {
    expect(nudgeRange(range, { kind: "move", days: 1 }, { canResize: true })).toEqual({
      start: "2026-11-04",
      end: "2026-11-08",
    });
    expect(nudgeRange(range, { kind: "move", days: -7 }, { canResize: true })).toEqual({
      start: "2026-10-27",
      end: "2026-10-31",
    });
  });

  it("move works for single-day bars and milestones (canResize false)", () => {
    expect(
      nudgeRange({ start: "2026-11-03", end: "2026-11-03" }, { kind: "move", days: 1 }, { canResize: false }),
    ).toEqual({ start: "2026-11-04", end: "2026-11-04" });
  });

  it("resize moves only the end edge", () => {
    expect(nudgeRange(range, { kind: "resize", days: 1 }, { canResize: true })).toEqual({
      start: "2026-11-03",
      end: "2026-11-08",
    });
    expect(nudgeRange(range, { kind: "resize", days: -1 }, { canResize: true })).toEqual({
      start: "2026-11-03",
      end: "2026-11-06",
    });
  });

  it("resize clamps so the end never precedes the start", () => {
    expect(nudgeRange(range, { kind: "resize", days: -7 }, { canResize: true })).toEqual({
      start: "2026-11-03",
      end: "2026-11-03",
    });
  });

  it("resize that cannot shrink further is a no-op", () => {
    expect(
      nudgeRange({ start: "2026-11-03", end: "2026-11-03" }, { kind: "resize", days: -1 }, { canResize: true }),
    ).toBeNull();
  });

  it("resize is refused when the bar is not resizable", () => {
    expect(nudgeRange(range, { kind: "resize", days: 1 }, { canResize: false })).toBeNull();
  });

  it("rejects malformed days", () => {
    expect(nudgeRange({ start: "x", end: "2026-11-03" }, { kind: "move", days: 1 }, { canResize: true })).toBeNull();
  });
});

// The bar <-> calendar-day conversion goes through LOCAL-time Dates
// (adapter.ts's taskToEvent builds `parseISO(day)` / `addDays(.., 1)`), so it
// is the part a DST shift or an east-of-UTC zone could skew by a day. The
// suite runs under TZ=UTC and TZ=Asia/Jakarta in CI; these cases set the zone
// themselves (Node re-reads process.env.TZ on assignment) so the US and EU
// transitions are covered either way.
describe("eventDays / proposedUpdate across time zones", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  const zones = ["UTC", "America/New_York", "Europe/Warsaw", "Asia/Jakarta", "Pacific/Auckland"];
  const ranges: Array<[string, string]> = [
    ["2026-03-07", "2026-03-09"], // US spring-forward is 2026-03-08
    ["2026-10-31", "2026-11-02"], // US fall-back is 2026-11-01
    ["2026-03-28", "2026-03-30"], // EU spring-forward is 2026-03-29
    ["2026-10-24", "2026-10-26"], // EU fall-back is 2026-10-25
    ["2026-12-30", "2027-01-02"],
  ];

  // Built exactly like adapter.ts's taskToEvent.
  const eventFor = (start: string, end: string): GanttEvent<Task> => ({
    id: "task-1",
    title: "T",
    start: parseISO(start),
    end: addDays(parseISO(end), 1),
    allDay: true,
    resourceId: "task-1",
    data: { id: 1 } as Task,
  });

  for (const tz of zones) {
    for (const [start, end] of ranges) {
      it(`${tz}: ${start}..${end} round-trips to the same days`, () => {
        process.env.TZ = tz;
        const ev = eventFor(start, end);
        expect(eventDays(ev)).toEqual({ start, end });
        const upd = proposedUpdate(ev, { start, end });
        expect(eventPatch(upd)).toEqual({ id: 1, patch: { startDate: start, dueDate: end } });
      });

      it(`${tz}: a +1 day nudge across ${start}..${end} writes the shifted days`, () => {
        process.env.TZ = tz;
        const ev = eventFor(start, end);
        const next = nudgeRange(eventDays(ev), { kind: "move", days: 1 }, { canResize: true })!;
        expect(eventPatch(proposedUpdate(ev, next))?.patch).toEqual({
          startDate: addDaysToDay(start, 1),
          dueDate: addDaysToDay(end, 1),
        });
      });
    }
  }
});

// The preview/flush/discard sequencing lives in a React hook
// (useGanttKeyboardNudge); the node-only vitest environment has no DOM or
// renderHook, so that part is covered by e2e/tests/gantt-keyboard.spec.ts.
