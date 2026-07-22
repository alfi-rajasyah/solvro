import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Row,
  type ViewMode,
  addDays,
  dateFromX,
  parseISODate,
  positionFor,
  startOfDay,
} from "@/lib/gantt/geometry";
import {
  BAR_HEIGHT,
  MILESTONE_SIZE,
  RESIZE_HANDLE_PX,
  ROW_HEIGHT,
} from "@/lib/gantt/constants";
import {
  PROGRESS_OVERLAY_ALPHA,
  barFillHex,
  type ColorByMode,
} from "@/lib/gantt/palette";

type DragMode = "move" | "resize-start" | "resize-end";

interface GanttBarProps {
  row: Row;
  chartStart: Date;
  viewMode: ViewMode;
  columnWidth: number;
  canEdit: boolean;
  showBaseline: boolean;
  colorBy: ColorByMode;
  onCommit: (taskId: number, startDate: Date, dueDate: Date) => void;
  onClick: (taskId: number) => void;
  /**
   * Fired when the user pointer-downs on one of the bar's connector dots.
   * `side` is which edge the drag started from: "right" = this task is the
   * predecessor (drop target becomes the successor); "left" = this task is
   * the successor (drop target becomes the predecessor). The frame captures
   * the gesture from there and hit-tests the release target on pointer-up.
   */
  onConnectStart?: (
    sourceTaskId: number,
    side: "right" | "left",
    clientX: number,
    clientY: number,
  ) => void;
}

export function GanttBar({
  row,
  chartStart,
  viewMode,
  columnWidth,
  canEdit,
  showBaseline,
  colorBy,
  onCommit,
  onClick,
  onConnectStart,
}: GanttBarProps) {
  const [ghost, setGhost] = useState<{ start: Date; end: Date } | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    pointerId: number;
    originX: number;
    origStart: Date;
    origEnd: Date;
    pxPerDay: number;
    moved: boolean;
  } | null>(null);

  const isMilestone = Boolean(row.isMilestone);
  const color = barFillHex(
    { status: row.status, priority: row.priority, sectionColor: row.sectionColor },
    colorBy,
  );

  // Milestones may only have a dueDate (no startDate) — anchor on whichever
  // is set. Regular bars require both.
  const milestoneDate = row.end ?? row.start ?? null;

  if (row.taskId === undefined) return null;
  if (!isMilestone && (!row.start || !row.end)) return null;
  if (isMilestone && !milestoneDate) return null;

  const start = ghost?.start ?? row.start ?? milestoneDate!;
  const end = ghost?.end ?? row.end ?? milestoneDate!;
  const left = positionFor(start, chartStart, viewMode, columnWidth).x;
  const endPos = positionFor(addDays(end, 1), chartStart, viewMode, columnWidth).x;
  const width = isMilestone ? 0 : Math.max(columnWidth / 7, endPos - left);

  const pxPerDay =
    positionFor(addDays(chartStart, 1), chartStart, viewMode, columnWidth).x;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
      if (!canEdit) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        pointerId: e.pointerId,
        originX: e.clientX,
        origStart: start,
        origEnd: end,
        pxPerDay,
        moved: false,
      };
    },
    [canEdit, start, end, pxPerDay],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const deltaPx = e.clientX - drag.originX;
      if (Math.abs(deltaPx) < 2 && !drag.moved) return;
      const deltaDays = Math.round(deltaPx / drag.pxPerDay);
      drag.moved = drag.moved || deltaDays !== 0;
      let newStart = drag.origStart;
      let newEnd = drag.origEnd;
      if (drag.mode === "move") {
        newStart = addDays(drag.origStart, deltaDays);
        newEnd = addDays(drag.origEnd, deltaDays);
      } else if (drag.mode === "resize-start") {
        newStart = addDays(drag.origStart, deltaDays);
        if (newStart > drag.origEnd) newStart = drag.origEnd;
      } else if (drag.mode === "resize-end") {
        newEnd = addDays(drag.origEnd, deltaDays);
        if (newEnd < drag.origStart) newEnd = drag.origStart;
      }
      setGhost({ start: newStart, end: newEnd });
    },
    [],
  );

  const finishDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) {
        setGhost(null);
        return;
      }
      if (commit && drag.moved && ghost) {
        const startISO = ghost.start;
        const endISO = ghost.end;
        if (
          startISO.getTime() !== drag.origStart.getTime() ||
          endISO.getTime() !== drag.origEnd.getTime()
        ) {
          onCommit(row.taskId!, startISO, endISO);
        }
      }
      setGhost(null);
    },
    [ghost, onCommit, row.taskId],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture may already be released
      }
      const wasDragged = drag.moved;
      finishDrag(true);
      if (!wasDragged && row.taskId !== undefined) {
        onClick(row.taskId);
      }
    },
    [finishDrag, onClick, row.taskId],
  );

  const handlePointerCancel = useCallback(() => {
    finishDrag(false);
  }, [finishDrag]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dragRef.current) {
        finishDrag(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishDrag]);

  const status = row.status ?? "TODO";
  const progress = row.progressPct ?? (status === "DONE" ? 100 : 0);

  const heightPct = row.kind === "subtask" ? 0.8 : 1;
  const barHeight = BAR_HEIGHT * heightPct;
  const top = (ROW_HEIGHT - barHeight) / 2;

  // Baseline rect: only rendered when the toggle is on AND the task has
  // baseline dates recorded. Thin (3px) gray bar under the main bar.
  const baselineStartIso = row.task?.baselineStartDate ?? null;
  const baselineEndIso = row.task?.baselineDueDate ?? null;
  const baselineRect =
    showBaseline && baselineStartIso && baselineEndIso
      ? (() => {
          const bStart = startOfDay(parseISODate(baselineStartIso));
          const bEnd = startOfDay(parseISODate(baselineEndIso));
          const bLeft = positionFor(bStart, chartStart, viewMode, columnWidth).x;
          const bEndPos = positionFor(addDays(bEnd, 1), chartStart, viewMode, columnWidth).x;
          const bWidth = Math.max(columnWidth / 7, bEndPos - bLeft);
          return { left: bLeft, width: bWidth };
        })()
      : null;

  const baselineTooltip =
    baselineRect && baselineStartIso && baselineEndIso
      ? `Baseline: ${baselineStartIso.slice(0, 10)} → ${baselineEndIso.slice(0, 10)}`
      : "";

  if (isMilestone) {
    const cx = left;
    const cy = top + barHeight / 2;
    const half = MILESTONE_SIZE / 2;
    return (
      <>
        {baselineRect && (
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: baselineRect.left,
              width: baselineRect.width,
              top: ROW_HEIGHT / 2 + barHeight / 2 + 2,
              height: 3,
              background: "rgb(136, 135, 128)",
              opacity: 0.6,
              zIndex: 1,
            }}
            title={baselineTooltip}
          />
        )}
        <div
          data-task-id={row.taskId}
          className={[
            "absolute select-none",
            canEdit ? "cursor-pointer" : "cursor-default",
          ].join(" ")}
          style={{
            left: cx - half,
            top: cy - half,
            width: MILESTONE_SIZE,
            height: MILESTONE_SIZE,
            zIndex: 2,
          }}
          onPointerUp={(e) => {
            if (dragRef.current) return;
            e.stopPropagation();
            onClick(row.taskId!);
          }}
          title={`${row.name} · milestone`}
        >
          {/* Milestone = green diamond per the Gantt v2 mockup (not section color) */}
          <svg width={MILESTONE_SIZE} height={MILESTONE_SIZE} viewBox="0 0 12 12">
            <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="rgb(var(--primary))" />
          </svg>
        </div>
        {canEdit && onConnectStart && (
          <>
            <div
              title="Drag from another task to make this milestone depend on it"
              className="pointer-events-none absolute z-[3] h-3 w-3 cursor-crosshair rounded-full border-2 border-white bg-primary opacity-0 shadow transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100"
              style={{
                left: cx - half - 4,
                top: cy,
                transform: "translate(-50%, -50%)",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onConnectStart(row.taskId!, "left", e.clientX, e.clientY);
              }}
            />
            <div
              title="Drag to a task to create a dependency"
              className="pointer-events-none absolute z-[3] h-3 w-3 cursor-crosshair rounded-full border-2 border-white bg-primary opacity-0 shadow transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100"
              style={{
                left: cx + half + 4,
                top: cy,
                transform: "translate(-50%, -50%)",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onConnectStart(row.taskId!, "right", e.clientX, e.clientY);
              }}
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      {baselineRect && (
        <div
          className="pointer-events-none absolute rounded-[1.5px]"
          style={{
            left: baselineRect.left,
            width: baselineRect.width,
            top: top + barHeight + 2,
            height: 3,
            background: "rgb(136, 135, 128)",
            opacity: 0.6,
            zIndex: 1,
          }}
          title={baselineTooltip}
          aria-label={baselineTooltip}
        />
      )}
      <div
        data-task-id={row.taskId}
        className={[
          "group/bar absolute select-none overflow-hidden rounded-[4px]",
          canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          ghost ? "ring-2 ring-primary/60" : "",
        ].join(" ")}
        style={{
          left,
          width,
          top,
          height: barHeight,
          zIndex: 2,
          backgroundColor: color,
          touchAction: canEdit ? "none" : undefined,
        }}
        onPointerDown={(e) => handlePointerDown(e, "move")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        title={`${row.name} · ${status} · ${progress}%`}
      >
        {progress > 0 && progress < 100 && (
          <div
            className="absolute inset-y-0 left-0 rounded-l-[4px]"
            style={{
              width: `${progress}%`,
              backgroundColor: `rgba(0, 0, 0, ${PROGRESS_OVERLAY_ALPHA})`,
            }}
            aria-hidden="true"
          />
        )}
        {canEdit && (
          <>
            <div
              className="absolute inset-y-0 left-0 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
              style={{ width: RESIZE_HANDLE_PX, background: "rgba(255,255,255,0.35)" }}
              onPointerDown={(e) => handlePointerDown(e, "resize-start")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
            <div
              className="absolute inset-y-0 right-0 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
              style={{ width: RESIZE_HANDLE_PX, background: "rgba(255,255,255,0.35)" }}
              onPointerDown={(e) => handlePointerDown(e, "resize-end")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
          </>
        )}
      </div>
      {canEdit && onConnectStart && (
        <>
          <div
            title="Drag from another task to make this task depend on it"
            className="pointer-events-none absolute z-[3] h-3 w-3 cursor-crosshair rounded-full border-2 border-white bg-primary opacity-0 shadow transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100"
            style={{
              left,
              top: top + barHeight / 2,
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onConnectStart(row.taskId!, "left", e.clientX, e.clientY);
            }}
          />
          <div
            title="Drag to a task to create a dependency"
            className="pointer-events-none absolute z-[3] h-3 w-3 cursor-crosshair rounded-full border-2 border-white bg-primary opacity-0 shadow transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:opacity-100"
            style={{
              left: left + width,
              top: top + barHeight / 2,
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onConnectStart(row.taskId!, "right", e.clientX, e.clientY);
            }}
          />
        </>
      )}
    </>
  );
}

export { dateFromX };
