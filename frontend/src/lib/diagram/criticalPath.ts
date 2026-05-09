import type { Task, TaskDependency } from "@/lib/queries";

/**
 * Compute the critical path through the project's task DAG.
 *
 * Algorithm: Kahn topological sort, then a single forward pass relaxing
 * `earliestFinish[v] = max(earliestFinish[u]) + effort(v)` for each
 * predecessor u. The node with the largest earliestFinish is the project
 * end; we walk back through the predecessor map to recover the path.
 *
 * Effort is taken as the integer number of days between startDate and
 * dueDate (clamped to ≥ 1). Tasks with neither date contribute effort 1
 * so they still appear on the path if they're the only chain.
 *
 * Returns a `Set<taskId>` of every task on the critical chain plus a
 * `Set<edgeId>` of every dependency edge whose endpoints are both on it.
 */
export interface CriticalPathResult {
  taskIds: Set<number>;
  edgeIds: Set<number>;
}

export function criticalPath(
  tasks: Task[],
  dependencies: TaskDependency[],
): CriticalPathResult {
  if (tasks.length === 0) return { taskIds: new Set(), edgeIds: new Set() };

  const effort = new Map<number, number>();
  for (const t of tasks) effort.set(t.id, taskEffortDays(t));

  const inDegree = new Map<number, number>();
  const adj = new Map<number, number[]>();
  for (const t of tasks) {
    inDegree.set(t.id, 0);
    adj.set(t.id, []);
  }
  for (const d of dependencies) {
    if (!inDegree.has(d.predecessorTaskId) || !inDegree.has(d.successorTaskId)) continue;
    inDegree.set(d.successorTaskId, (inDegree.get(d.successorTaskId) ?? 0) + 1);
    adj.get(d.predecessorTaskId)!.push(d.successorTaskId);
  }

  const order: number[] = [];
  const queue: number[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }
  // If we didn't visit every task, the graph has a cycle — bail out.
  // The backend rejects cycles on insert, so this only fires on bad data.
  if (order.length !== tasks.length) return { taskIds: new Set(), edgeIds: new Set() };

  const earliestFinish = new Map<number, number>();
  const predOnPath = new Map<number, number | null>();
  for (const id of order) {
    let bestPred: number | null = null;
    let bestPredFinish = 0;
    // Find the predecessor with the largest earliestFinish.
    for (const d of dependencies) {
      if (d.successorTaskId !== id) continue;
      const f = earliestFinish.get(d.predecessorTaskId) ?? 0;
      if (f >= bestPredFinish) {
        bestPredFinish = f;
        bestPred = d.predecessorTaskId;
      }
    }
    earliestFinish.set(id, bestPredFinish + (effort.get(id) ?? 1));
    predOnPath.set(id, bestPred);
  }

  // The end of the critical path is the task with the largest earliestFinish.
  let endId: number | null = null;
  let endFinish = -Infinity;
  for (const [id, f] of earliestFinish) {
    if (f > endFinish) {
      endFinish = f;
      endId = id;
    }
  }
  if (endId === null) return { taskIds: new Set(), edgeIds: new Set() };

  const taskIds = new Set<number>();
  let cur: number | null = endId;
  while (cur !== null) {
    taskIds.add(cur);
    cur = predOnPath.get(cur) ?? null;
  }

  const edgeIds = new Set<number>();
  for (const d of dependencies) {
    if (taskIds.has(d.predecessorTaskId) && taskIds.has(d.successorTaskId)) {
      edgeIds.add(d.id);
    }
  }
  return { taskIds, edgeIds };
}

function taskEffortDays(t: Task): number {
  if (!t.startDate || !t.dueDate) return 1;
  const ms = new Date(t.dueDate).getTime() - new Date(t.startDate).getTime();
  const days = Math.ceil(ms / 86400000);
  return Math.max(1, days);
}
