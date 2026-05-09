import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useProjectContext } from "../ProjectDetail";
import { TaskFormModal } from "@/components/TaskFormModal";
import { hasPermission, useAuth } from "@/lib/auth";
import { autoLayout, MILESTONE_HEIGHT, MILESTONE_WIDTH, NODE_HEIGHT, NODE_WIDTH } from "@/lib/diagram/autoLayout";
import { criticalPath } from "@/lib/diagram/criticalPath";
import { phaseColor } from "@/lib/diagram/colorUtils";
import {
  type DependencyType,
  type Task,
  useProjectDependencies,
  useProjectTasks,
  useUpdateTask,
} from "@/lib/queries";

interface TaskNodeData {
  task: Task;
  color: string;
  cpHighlight: boolean;
  selectedHighlight: boolean;
  fadedHighlight: boolean;
  [key: string]: unknown;
}

interface PhaseEdgeData {
  type: DependencyType;
  color: string;
  cpHighlight: boolean;
  selectedHighlight: boolean;
  fadedHighlight: boolean;
  // Parent → subtask edges are auto-derived from `task.parentTaskId`,
  // not from the TaskDependency table. They render in a muted, dotted
  // style and are not user-editable from the diagram.
  isParent?: boolean;
  [key: string]: unknown;
}

export function ProjectDiagram() {
  return (
    <ReactFlowProvider>
      <DiagramInner />
    </ReactFlowProvider>
  );
}

function DiagramInner() {
  const { project } = useProjectContext();
  const { user } = useAuth();
  const canEdit = hasPermission(user, "task:write");

  const tasksQuery = useProjectTasks(project.id);
  const depsQuery = useProjectDependencies(project.id);
  const updateTask = useUpdateTask(project.id);

  const [criticalPathOn, setCriticalPathOn] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // React Flow keeps node positions in its own state so dragging is
  // smooth between drag-end persistence calls. We seed it from server data
  // (or dagre when coordinates are missing) and patch the server on
  // drag-stop only.
  const [nodes, setNodes] = useState<Node<TaskNodeData>[]>([]);
  const seededRef = useRef<string>("");

  const tasks = tasksQuery.data ?? [];
  const dependencies = depsQuery.data ?? [];

  const cp = useMemo(
    () => (criticalPathOn ? criticalPath(tasks, dependencies) : { taskIds: new Set<number>(), edgeIds: new Set<number>() }),
    [tasks, dependencies, criticalPathOn],
  );

  // Build the highlight Sets driven by the currently selected node.
  const selectionHighlight = useMemo(() => {
    const taskHi = new Set<number>();
    const edgeHi = new Set<number>();
    if (selectedNodeId === null) return { taskHi, edgeHi, active: false };
    taskHi.add(selectedNodeId);
    // Walk forwards (downstream) and backwards (upstream).
    const succAdj = new Map<number, { taskId: number; edgeId: number }[]>();
    const predAdj = new Map<number, { taskId: number; edgeId: number }[]>();
    for (const d of dependencies) {
      const fwd = succAdj.get(d.predecessorTaskId) ?? [];
      fwd.push({ taskId: d.successorTaskId, edgeId: d.id });
      succAdj.set(d.predecessorTaskId, fwd);
      const back = predAdj.get(d.successorTaskId) ?? [];
      back.push({ taskId: d.predecessorTaskId, edgeId: d.id });
      predAdj.set(d.successorTaskId, back);
    }
    const visit = (start: number, adj: typeof succAdj) => {
      const stack = [start];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        for (const next of adj.get(cur) ?? []) {
          edgeHi.add(next.edgeId);
          if (!taskHi.has(next.taskId)) {
            taskHi.add(next.taskId);
            stack.push(next.taskId);
          }
        }
      }
    };
    visit(selectedNodeId, succAdj);
    visit(selectedNodeId, predAdj);
    return { taskHi, edgeHi, active: true };
  }, [selectedNodeId, dependencies]);

  // Seed/refresh nodes when tasks change. Keyed on a fingerprint of the
  // task ids + their server positions so re-renders from unrelated
  // mutations don't blow away in-flight drag positions.
  useEffect(() => {
    if (tasks.length === 0) {
      setNodes([]);
      seededRef.current = "";
      return;
    }
    const fingerprint = tasks
      .map((t) => `${t.id}:${t.diagramX ?? "n"}:${t.diagramY ?? "n"}:${t.isMilestone}`)
      .join(",");
    if (fingerprint === seededRef.current) return;
    seededRef.current = fingerprint;

    const needsAuto = tasks.some((t) => t.diagramX === null || t.diagramY === null);
    const auto = needsAuto ? autoLayout(tasks, dependencies) : new Map();

    setNodes(
      tasks.map((t) => {
        const auto1 = auto.get(t.id);
        const x = t.diagramX ?? auto1?.x ?? 0;
        const y = t.diagramY ?? auto1?.y ?? 0;
        return {
          id: String(t.id),
          type: t.isMilestone ? "milestone" : "task",
          position: { x, y },
          width: t.isMilestone ? MILESTONE_WIDTH : NODE_WIDTH,
          height: t.isMilestone ? MILESTONE_HEIGHT : NODE_HEIGHT,
          draggable: canEdit,
          data: {
            task: t,
            color: phaseColor(t.section),
            cpHighlight: false,
            selectedHighlight: false,
            fadedHighlight: false,
          },
        };
      }),
    );
  }, [tasks, dependencies, canEdit]);

  // Repaint highlights without rebuilding the position state.
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const id = Number(n.id);
        const cpHi = cp.taskIds.has(id);
        const selHi = selectionHighlight.active && selectionHighlight.taskHi.has(id);
        const faded = selectionHighlight.active && !selHi;
        return {
          ...n,
          data: { ...n.data, cpHighlight: cpHi, selectedHighlight: selHi, fadedHighlight: faded },
        };
      }),
    );
  }, [cp.taskIds, selectionHighlight]);

  const edges: Edge<PhaseEdgeData>[] = useMemo(() => {
    if (tasks.length === 0) return [];
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const out: Edge<PhaseEdgeData>[] = dependencies.map((d) => {
      const source = taskById.get(d.predecessorTaskId);
      const color = phaseColor(source?.section ?? null);
      const cpHi = cp.edgeIds.has(d.id);
      const selHi = selectionHighlight.active && selectionHighlight.edgeHi.has(d.id);
      const faded = selectionHighlight.active && !selHi;
      // Use stored handle IDs when present so vertically-drawn edges
      // re-render through their original sides. Fall back to LR routing
      // for legacy rows that pre-date the handle columns.
      return {
        id: String(d.id),
        source: String(d.predecessorTaskId),
        sourceHandle: d.sourceHandle ?? "right-source",
        target: String(d.successorTaskId),
        targetHandle: d.targetHandle ?? "left-target",
        type: "phase",
        markerEnd: { type: MarkerType.ArrowClosed, color: cpHi ? "var(--cp-stroke, #0058be)" : color },
        data: {
          type: d.type,
          color,
          cpHighlight: cpHi,
          selectedHighlight: selHi,
          fadedHighlight: faded,
        },
      };
    });

    // Auto-derived parent → subtask edges. Distinct from TaskDependency:
    // muted dotted line, no arrowhead, vertical default (parent bottom →
    // child top). Edge id `parent-<childId>` so it doesn't collide with
    // numeric dependency ids; double-click delete is guarded against it.
    for (const t of tasks) {
      if (t.parentTaskId === null) continue;
      const parent = taskById.get(t.parentTaskId);
      if (!parent) continue;
      const selHi =
        selectionHighlight.active &&
        (selectionHighlight.taskHi.has(t.id) || selectionHighlight.taskHi.has(parent.id));
      const faded = selectionHighlight.active && !selHi;
      out.push({
        id: `parent-${t.id}`,
        source: String(parent.id),
        sourceHandle: "bottom-source",
        target: String(t.id),
        targetHandle: "top-target",
        type: "phase",
        // No marker — parent edges are containment lines, not arrows.
        data: {
          type: "SOFT", // unused, but TS requires the field
          color: "transparent",
          cpHighlight: false,
          selectedHighlight: selHi,
          fadedHighlight: faded,
          isParent: true,
        },
      });
    }
    return out;
  }, [tasks, dependencies, cp.edgeIds, selectionHighlight]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev) as Node<TaskNodeData>[]);
  }, []);

  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      if (!canEdit) return;
      updateTask.mutate({
        id: Number(node.id),
        patch: { diagramX: node.position.x, diagramY: node.position.y },
      });
    },
    [updateTask, canEdit],
  );

  const onNodeClick = useCallback((_e: unknown, node: Node) => {
    setSelectedNodeId(Number(node.id));
  }, []);

  const onNodeDoubleClick = useCallback(
    (_e: unknown, node: Node) => {
      const t = tasks.find((x) => x.id === Number(node.id));
      if (t) setEditTask(t);
    },
    [tasks],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const runAutoLayout = useCallback(() => {
    const auto = autoLayout(tasks, dependencies);
    setNodes((prev) =>
      prev.map((n) => {
        const pos = auto.get(Number(n.id));
        return pos ? { ...n, position: pos } : n;
      }),
    );
    // Persist new positions for every task that had a non-null x/y.
    if (canEdit) {
      for (const [taskId, pos] of auto) {
        updateTask.mutate({ id: taskId, patch: { diagramX: pos.x, diagramY: pos.y } });
      }
    }
  }, [tasks, dependencies, updateTask, canEdit]);

  if (tasksQuery.isLoading || depsQuery.isLoading) {
    return <div className="h-[60vh] animate-pulse rounded-xl bg-surface-container-low shadow-card" />;
  }

  if (tasksQuery.isError || depsQuery.isError) {
    const e = tasksQuery.error ?? depsQuery.error;
    return (
      <div className="rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
        Could not load diagram data: {(e as Error).message}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center rounded-xl bg-surface-container-lowest shadow-card text-center">
        <span className="material-symbols-outlined mb-2 text-4xl text-on-surface-variant">hub</span>
        <p className="text-sm font-semibold text-on-surface">No tasks to diagram</p>
        <p className="text-xs text-on-surface-variant">Add tasks in the List or Kanban view first.</p>
      </div>
    );
  }

  return (
    <>
      <div className="diagram-canvas relative h-[calc(100vh-260px)] overflow-hidden rounded-xl shadow-card">
        <ReactFlow
          nodes={nodes}
          edges={edges as Edge[]}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          // The diagram is read-only for dependencies — create them in the
          // Gantt view by dragging from a bar's right-edge handle. Nodes
          // are still draggable so users can arrange the canvas layout.
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--diagram-grid)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(n) => (n.data as TaskNodeData).color} />
          <Panel position="top-left">
            <div className="flex items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest/95 p-1.5 shadow-card backdrop-blur">
              <button
                type="button"
                onClick={() => setCriticalPathOn((v) => !v)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                  criticalPathOn
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-container",
                ].join(" ")}
                title="Highlight the longest dependency chain"
              >
                <span className="material-symbols-outlined text-[16px]">bolt</span>
                Critical Path
              </button>
              <span className="mx-1 h-5 w-px bg-outline-variant" />
              <button
                type="button"
                onClick={runAutoLayout}
                disabled={!canEdit}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                title="Re-run dagre layout (overwrites manual positions)"
              >
                <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                Auto-layout
              </button>
            </div>
          </Panel>
          <Panel position="top-right">
            <PhaseLegend tasks={tasks} />
          </Panel>
        </ReactFlow>
      </div>

      {editTask && (
        <TaskFormModal
          mode="edit"
          open={editTask !== null}
          onClose={() => setEditTask(null)}
          projectId={project.id}
          task={editTask}
        />
      )}
    </>
  );
}

// Each side of a node stacks a source AND a target handle at the same
// coords, so any side can either initiate or receive a connection.
// React Flow requires unique handle IDs when a node has multiple
// handles of the same type — eight IDs below cover four sides × two
// types. Connections are still TaskDependency rows; vertical handles
// just make subtask layouts (parent above, child below) draw cleanly.
function BidirectionalHandles() {
  return (
    <>
      <Handle id="left-target"   type="target" position={Position.Left}   className="diagram-handle" />
      <Handle id="left-source"   type="source" position={Position.Left}   className="diagram-handle" />
      <Handle id="right-target"  type="target" position={Position.Right}  className="diagram-handle" />
      <Handle id="right-source"  type="source" position={Position.Right}  className="diagram-handle" />
      <Handle id="top-target"    type="target" position={Position.Top}    className="diagram-handle" />
      <Handle id="top-source"    type="source" position={Position.Top}    className="diagram-handle" />
      <Handle id="bottom-target" type="target" position={Position.Bottom} className="diagram-handle" />
      <Handle id="bottom-source" type="source" position={Position.Bottom} className="diagram-handle" />
    </>
  );
}

// ─── Custom node: Task ───
function TaskCardNode({ data }: NodeProps) {
  const d = data as TaskNodeData;
  const t = d.task;
  return (
    <div
      className="diagram-task-node"
      data-cp={d.cpHighlight ? "1" : undefined}
      data-selected={d.selectedHighlight ? "1" : undefined}
      data-faded={d.fadedHighlight ? "1" : undefined}
      style={{ ["--phase" as string]: d.color }}
    >
      <BidirectionalHandles />
      <div className="diagram-task-id">T-{String(t.id).padStart(3, "0")}</div>
      <div className="diagram-task-title" title={t.title}>{t.title}</div>
      <div className="diagram-task-meta">
        <span className="diagram-task-meta-label">Start</span>
        <span>{fmtDate(t.startDate)}</span>
      </div>
      <div className="diagram-task-meta">
        <span className="diagram-task-meta-label">End</span>
        <span>{fmtDate(t.dueDate)}</span>
      </div>
      <div className="diagram-task-meta">
        <span className="diagram-task-meta-label">Effort</span>
        <span>{effortLabel(t.startDate, t.dueDate)}</span>
      </div>
    </div>
  );
}

// ─── Custom node: Milestone ───
function MilestoneNode({ data }: NodeProps) {
  const d = data as TaskNodeData;
  const t = d.task;
  return (
    <div
      className="diagram-milestone-node"
      data-cp={d.cpHighlight ? "1" : undefined}
      data-selected={d.selectedHighlight ? "1" : undefined}
      data-faded={d.fadedHighlight ? "1" : undefined}
      style={{ ["--phase" as string]: d.color }}
    >
      <BidirectionalHandles />
      <div className="diagram-milestone-title">
        <span className="diagram-task-id mr-1.5">T-{String(t.id).padStart(3, "0")}</span>
        {t.title}
      </div>
      <div className="diagram-milestone-date">{fmtDate(t.dueDate ?? t.startDate)}</div>
    </div>
  );
}

// ─── Custom edge: Phase ───
function PhaseEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps) {
  const d = data as PhaseEdgeData;
  const [path] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 8,
  });
  // Parent → subtask edges: muted dotted line, no arrowhead, distinct
  // from real dependencies. Critical-path tinting and arrowheads do not
  // apply to them.
  if (d.isParent) {
    // Distinct teal-ish hue + thicker dotted stroke so the containment
    // line is visible at a glance, even when parent and subtask are far
    // apart on the canvas.
    return (
      <g className="diagram-edge" data-parent="1">
        <path
          id={id}
          d={path}
          stroke="#0d9488"
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
          opacity={d.fadedHighlight ? 0.25 : 0.85}
          fill="none"
        />
      </g>
    );
  }
  const stroke = d.cpHighlight ? "var(--cp-stroke, #0058be)" : d.color;
  const opacity = d.fadedHighlight ? 0.2 : d.selectedHighlight ? 1 : 0.85;
  const strokeWidth = d.cpHighlight || d.selectedHighlight ? 2.4 : 1.6;
  return (
    <g className="diagram-edge" data-cp={d.cpHighlight ? "1" : undefined} data-soft={d.type === "SOFT" ? "1" : undefined}>
      <path
        id={id}
        d={path}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={d.type === "SOFT" ? "6 4" : undefined}
        opacity={opacity}
        fill="none"
        markerEnd={markerEnd}
      />
    </g>
  );
}

const nodeTypes: NodeTypes = { task: TaskCardNode, milestone: MilestoneNode };
const edgeTypes: EdgeTypes = { phase: PhaseEdge };

function PhaseLegend({ tasks }: { tasks: Task[] }) {
  const seen = new Map<number, { name: string; color: string }>();
  for (const t of tasks) {
    if (t.section && !seen.has(t.section.id)) {
      seen.set(t.section.id, { name: t.section.name, color: phaseColor(t.section) });
    }
  }
  if (seen.size === 0) return null;
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest/95 px-3 py-2 shadow-card backdrop-blur text-xs">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Phases
      </div>
      <div className="flex flex-col gap-1 text-on-surface">
        {[...seen.values()].map((p) => (
          <span key={p.name} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function effortLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const days = Math.max(1, Math.ceil(ms / 86400000));
  return `${days}d`;
}
