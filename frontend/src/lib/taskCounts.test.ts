import { describe, expect, it } from "vitest";
import { countTasks } from "@/lib/taskCounts";

describe("countTasks", () => {
  it("excludes cancelled tasks from the denominator", () => {
    const tasks = [
      ...Array.from({ length: 11 }, () => ({ status: "DONE" as const })),
      { status: "CANCELLED" as const },
    ];
    expect(countTasks(tasks)).toEqual({ done: 11, total: 11, percent: 100 });
  });

  it("counts open work in the total", () => {
    expect(
      countTasks([{ status: "DONE" }, { status: "TODO" }, { status: "IN_PROGRESS" }, { status: "CANCELLED" }]),
    ).toEqual({ done: 1, total: 3, percent: 33 });
  });

  it("reads 0 of 0 without NaN when empty or all cancelled", () => {
    expect(countTasks([])).toEqual({ done: 0, total: 0, percent: 0 });
    expect(countTasks([{ status: "CANCELLED" }, { status: "CANCELLED" }])).toEqual({
      done: 0,
      total: 0,
      percent: 0,
    });
  });
});
