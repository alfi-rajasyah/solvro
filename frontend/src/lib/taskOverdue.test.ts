import { describe, expect, it } from "vitest";
import { isTaskShownOverdue, showsPlainDue } from "./taskOverdue";

const TODAY = "2026-08-03";
const PAST = "2026-08-01T00:00:00.000Z";

describe("isTaskShownOverdue", () => {
  it("is overdue for an open past-due task in a live project", () => {
    for (const s of ["PLANNING", "ACTIVE", "COMPLETED", undefined] as const) {
      expect(isTaskShownOverdue("TODO", PAST, TODAY, s)).toBe(true);
    }
  });

  it("is never overdue while the project is on hold or cancelled", () => {
    expect(isTaskShownOverdue("TODO", PAST, TODAY, "ON_HOLD")).toBe(false);
    expect(isTaskShownOverdue("IN_PROGRESS", PAST, TODAY, "ON_HOLD")).toBe(false);
    expect(isTaskShownOverdue("TODO", PAST, TODAY, "CANCELLED")).toBe(false);
  });

  it("keeps the plain rules for closed, undated and today-due tasks", () => {
    expect(isTaskShownOverdue("DONE", PAST, TODAY, "ACTIVE")).toBe(false);
    expect(isTaskShownOverdue("CANCELLED", PAST, TODAY, "ACTIVE")).toBe(false);
    expect(isTaskShownOverdue("TODO", null, TODAY, "ACTIVE")).toBe(false);
    expect(isTaskShownOverdue("TODO", "2026-08-03T00:00:00.000Z", TODAY, "ACTIVE")).toBe(false);
  });
});

describe("showsPlainDue", () => {
  it("reads as a plain date for finished tasks and on-hold projects", () => {
    expect(showsPlainDue("DONE", "ACTIVE")).toBe(true);
    expect(showsPlainDue("CANCELLED", undefined)).toBe(true);
    expect(showsPlainDue("TODO", "ON_HOLD")).toBe(true);
    expect(showsPlainDue("TODO", "CANCELLED")).toBe(true);
  });
  it("keeps relative wording for open tasks elsewhere", () => {
    expect(showsPlainDue("TODO", "ACTIVE")).toBe(false);
    expect(showsPlainDue("IN_PROGRESS", undefined)).toBe(false);
  });
});
