import { describe, expect, it } from "vitest";
import {
  createConfirmGate,
  dialogToShow,
  localHoldDays,
  parseShiftDays,
  statusChangeDialogFor,
} from "./projectStatusChange";

describe("statusChangeDialogFor", () => {
  it("asks to confirm any move into CANCELLED", () => {
    for (const from of ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"] as const) {
      expect(statusChangeDialogFor(from, "CANCELLED")).toBe("cancel");
    }
  });
  it("offers the timeline dialog only for ON_HOLD to ACTIVE or PLANNING", () => {
    expect(statusChangeDialogFor("ON_HOLD", "ACTIVE")).toBe("reactivate");
    expect(statusChangeDialogFor("ON_HOLD", "PLANNING")).toBe("reactivate");
    expect(statusChangeDialogFor("ON_HOLD", "COMPLETED")).toBeNull();
    expect(statusChangeDialogFor("ACTIVE", "PLANNING")).toBeNull();
    expect(statusChangeDialogFor("CANCELLED", "ACTIVE")).toBeNull();
  });
  it("needs nothing when the status is unchanged", () => {
    expect(statusChangeDialogFor("CANCELLED", "CANCELLED")).toBeNull();
    expect(statusChangeDialogFor("ON_HOLD", "ON_HOLD")).toBeNull();
  });
});

describe("dialogToShow", () => {
  it("skips the cancel dialog with zero open tasks", () => {
    expect(dialogToShow("ACTIVE", "CANCELLED", { openTasks: 0, doneTasks: 4, pastDueOpenTasks: 0 })).toBeNull();
    expect(dialogToShow("ACTIVE", "CANCELLED", { openTasks: 2, doneTasks: 0, pastDueOpenTasks: 0 })).toBe("cancel");
  });
  it("skips the reactivation dialog with no past-due open tasks", () => {
    expect(dialogToShow("ON_HOLD", "ACTIVE", { openTasks: 5, doneTasks: 0, pastDueOpenTasks: 0 })).toBeNull();
    expect(dialogToShow("ON_HOLD", "ACTIVE", { openTasks: 5, doneTasks: 0, pastDueOpenTasks: 1 })).toBe("reactivate");
  });
});

describe("localHoldDays", () => {
  it("counts local calendar days, minimum 1", () => {
    const now = new Date(2026, 10, 10, 9, 0); // local 10 Nov
    expect(localHoldDays(new Date(2026, 10, 3, 23, 30).toISOString(), now)).toBe(7);
    expect(localHoldDays(new Date(2026, 10, 10, 1, 0).toISOString(), now)).toBe(1);
    expect(localHoldDays(null, now)).toBe(1);
    expect(localHoldDays("garbage", now)).toBe(1);
  });
  it("does not let a late-evening stamp round up a whole day", () => {
    const now = new Date(2026, 10, 10, 0, 5);
    expect(localHoldDays(new Date(2026, 10, 9, 23, 59).toISOString(), now)).toBe(1);
  });
});

describe("parseShiftDays", () => {
  it("accepts whole days in 1..3650 only", () => {
    expect(parseShiftDays("7")).toBe(7);
    expect(parseShiftDays("3650")).toBe(3650);
    expect(parseShiftDays("0")).toBeNull();
    expect(parseShiftDays("3651")).toBeNull();
    expect(parseShiftDays("1.5")).toBeNull();
    expect(parseShiftDays("")).toBeNull();
    expect(parseShiftDays("-2")).toBeNull();
  });
});

describe("createConfirmGate", () => {
  it("refuses a second confirm while one runs", () => {
    const gate = createConfirmGate();
    const first = gate.begin();
    expect(first).not.toBeNull();
    expect(gate.begin()).toBeNull();
    gate.end(first!);
    expect(gate.begin()).not.toBeNull();
  });
  it("cancel invalidates the running confirm and frees the gate", () => {
    const gate = createConfirmGate();
    const first = gate.begin()!;
    gate.cancel();
    expect(gate.isCurrent(first)).toBe(false);
    const second = gate.begin()!;
    expect(second).not.toBe(first);
    gate.end(first); // a stale end must not free the newer confirm
    expect(gate.isCurrent(second)).toBe(true);
  });
});

describe("localHoldDays across a UTC offset", () => {
  it("counts local days even when the UTC day differs", () => {
    // Built from local fields, so in any zone east of UTC+0:30 (or west of
    // UTC-23:30 never) the UTC day differs from the local day; the count must
    // follow the local day. In a UTC container this still pins the local rule.
    const since = new Date(2026, 10, 3, 23, 30);
    const now = new Date(2026, 10, 4, 0, 10);
    expect(localHoldDays(since.toISOString(), now)).toBe(1);
    expect(localHoldDays(since.toISOString(), new Date(2026, 10, 10, 12, 0))).toBe(7);
  });
});
