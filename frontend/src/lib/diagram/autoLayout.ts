import dagre from "dagre";
import type { Task, TaskDependency } from "@/lib/queries";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 96;
export const MILESTONE_WIDTH = 180;
export const MILESTONE_HEIGHT = 72;

export interface NodePosition {
  x: number;
  y: number;
}

const SUBTASK_VGAP = 24; // gap between a parent's bottom edge and its first subtask

function nodeSize(t: Task): { w: number; h: number } {
  return t.isMilestone
    ? { w: MILESTONE_WIDTH, h: MILESTONE_HEIGHT }
    : { w: NODE_WIDTH, h: NODE_HEIGHT };
}

/**
 * Run dagre over the dependency graph to assign canvas coordinates.
 *
 * Returns a `taskId → {x,y}` map. Coordinates are top-left of the node
 * (matching React Flow's convention), not centroid — dagre returns
 * centroids so we offset by half the node dimensions before returning.
 *
 * Two-phase:
 *   1. Dagre lays out **top-level tasks** (parentTaskId === null) using
 *      the dependency graph. Subtasks are excluded so they don't get
 *      pushed to the next horizontal rank.
 *   2. Subtasks are then stacked directly **below** their parent,
 *      horizontally centered, in id order. Multiple subtasks per parent
 *      stack vertically with `SUBTASK_VGAP` spacing.
 */
export function autoLayout(
  tasks: Task[],
  dependencies: TaskDependency[],
): Map<number, NodePosition> {
  const taskIds = new Set(tasks.map((t) => t.id));
  const isSubtask = (t: Task) =>
    t.parentTaskId !== null && taskIds.has(t.parentTaskId);
  const topLevel = tasks.filter((t) => !isSubtask(t));
  const subtasks = tasks.filter(isSubtask);
  const topIds = new Set(topLevel.map((t) => t.id));

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",       // left-to-right flow, like OmniPlan
    nodesep: 60,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const t of topLevel) {
    const { w, h } = nodeSize(t);
    g.setNode(String(t.id), { width: w, height: h });
  }
  for (const d of dependencies) {
    if (topIds.has(d.predecessorTaskId) && topIds.has(d.successorTaskId)) {
      g.setEdge(String(d.predecessorTaskId), String(d.successorTaskId));
    }
  }

  dagre.layout(g);

  const out = new Map<number, NodePosition>();
  for (const t of topLevel) {
    const n = g.node(String(t.id));
    if (!n) continue;
    const { w, h } = nodeSize(t);
    out.set(t.id, { x: n.x - w / 2, y: n.y - h / 2 });
  }

  // Group subtasks by parent so multiple kids of the same parent stack
  // vertically rather than overlap.
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const kidsByParent = new Map<number, Task[]>();
  for (const s of subtasks) {
    const arr = kidsByParent.get(s.parentTaskId!) ?? [];
    arr.push(s);
    kidsByParent.set(s.parentTaskId!, arr);
  }
  for (const [parentId, kids] of kidsByParent) {
    const parentPos = out.get(parentId);
    const parent = taskById.get(parentId);
    if (!parentPos || !parent) continue;
    const parentSize = nodeSize(parent);
    let cursorY = parentPos.y + parentSize.h + SUBTASK_VGAP;
    // Stable order so the layout is deterministic across runs.
    kids.sort((a, b) => a.id - b.id);
    for (const k of kids) {
      const kSize = nodeSize(k);
      out.set(k.id, {
        x: parentPos.x + (parentSize.w - kSize.w) / 2,
        y: cursorY,
      });
      cursorY += kSize.h + SUBTASK_VGAP;
    }
  }

  return out;
}
