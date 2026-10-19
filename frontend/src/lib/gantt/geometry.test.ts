import { describe, expect, it } from "vitest";
import { progressForTask } from "@/lib/gantt/geometry";
import type { Task, TaskStatus } from "@/lib/queries";

function t(id: number, status: TaskStatus, parentTaskId: number | null = null): Task {
  return { id, status, parentTaskId } as Task;
}

function childrenOf(parent: Task, kids: Task[]): Map<number, Task[]> {
  return new Map([[parent.id, kids]]);
}

describe("progressForTask", () => {
  it("DONE is 100, a leaf that is not DONE is 0", () => {
    expect(progressForTask(t(1, "DONE"), new Map())).toBe(100);
    expect(progressForTask(t(1, "TODO"), new Map())).toBe(0);
  });

  it("a parent reads done/total across its direct children", () => {
    const p = t(1, "IN_PROGRESS");
    const kids = [t(2, "DONE", 1), t(3, "TODO", 1)];
    expect(progressForTask(p, childrenOf(p, kids))).toBe(50);
  });

  it("cancelled children leave the denominator", () => {
    const p = t(1, "IN_PROGRESS");
    const kids = [t(2, "DONE", 1), t(3, "DONE", 1), t(4, "CANCELLED", 1)];
    expect(progressForTask(p, childrenOf(p, kids))).toBe(100);
  });

  it("all-cancelled children read 0, never NaN", () => {
    const p = t(1, "IN_PROGRESS");
    const kids = [t(2, "CANCELLED", 1), t(3, "CANCELLED", 1)];
    expect(progressForTask(p, childrenOf(p, kids))).toBe(0);
  });
});
