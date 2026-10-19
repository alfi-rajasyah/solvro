import type { TaskStatus } from "@/lib/queries";

/**
 * Client-side task totals. A cancelled task is removed from every total: it
 * is neither done nor outstanding, so it leaves the denominator. An empty (or
 * all-cancelled) list reads 0 of 0 / 0% — never NaN. Mirrors the server's
 * project/epic progress counts.
 */
export function countTasks(tasks: ReadonlyArray<{ status: TaskStatus }>): {
  done: number;
  total: number;
  percent: number;
} {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    if (t.status === "CANCELLED") continue;
    total += 1;
    if (t.status === "DONE") done += 1;
  }
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
