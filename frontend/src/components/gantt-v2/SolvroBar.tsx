import { useLayoutEffect, useRef, useState } from "react";
import type { GanttRenderEventProps } from "@/components/reui/gantt/gantt";
import { DEFAULT_SECTION_COLOR, PROGRESS_OVERLAY_ALPHA } from "@/lib/gantt/palette";
import type { Task } from "@/lib/queries";
import { cn } from "@/lib/utils";

// Solvro's `renderEvent` content renderer for the ReUI-engined Gantt (Plan B
// Task 4). Wired in via SolvroGantt.tsx's `<Gantt renderEvent={(p) =>
// <SolvroBar {...p} />} classNames={{ event: "overflow-visible bg-transparent
// hover:bg-transparent data-selected:bg-transparent" }} barLabel="inside">`.
//
// gantt-bar.tsx hands the bar's WRAPPER (position, drag/resize, a11y, selection,
// tooltip) to the engine and only the INNER content to us (gantt-bar.tsx:100-104,
// 186-194) — setting `renderEvent` makes the bar "consumer-owned," so the
// built-in 20%-opacity fill/progress tint/done-mark are suppressed or made
// irrelevant and this component owns 100% of what a bar looks like.
//
// `classNames.event` neutralizes the built-in `bg-(--gantt-event-color)/20`
// track (base + hover + selected variants — three separate conflict groups
// in tailwind-merge, all three must be overridden or the ghost look flashes
// back on hover/select) AND flips the bar's `overflow-hidden` to
// `overflow-visible`. That second part is what makes the "outside label"
// below possible at all: renderEvent's return value nests INSIDE the bar
// button (gantt-bar.tsx's `children: (<>{progress}{content}{resize}</>)`),
// so without `overflow-visible` nothing we render could ever escape the
// button's box to sit visually beside it.

// ---- GH #58: label placement is a real measurement, not a width guess ----
// ReUI's own `barLabel="auto"` flip (constant at gantt-view.tsx:202,
// AUTO_LABEL_MIN_REM = 7; the comparison itself at gantt-view.tsx:3210-3216)
// compares the bar's RENDERED WIDTH against a flat rem threshold — never the
// title text itself. A short bar with a short title can flip outside just as
// easily as a long bar with a long title stays inside and gets clipped.
// That's the "width-threshold, not measured-fit" case task-4-brief.md
// predicted, confirmed by reading the source rather than guessing.
//
// This component doesn't use ReUI's flip at all. SolvroGantt.tsx passes
// `barLabel="inside"` (already the engine default, made explicit) so
// gantt-view.tsx's row never computes its own outside placement or renders
// its own outside `<span>` sibling — that whole mechanism is disabled/
// replaced, not tuned. Placement is decided here, 100%, every render.
//
// The old engine (frontend/src/components/gantt/GanttBar.tsx:34-74) measured
// fit with an offscreen canvas (measureText + a hardcoded font string + a
// width cache) because it was handed the bar's pixel width directly as
// explicit geometry. ReUI's renderEvent gets no such number — `occurrence`/
// `segment` carry dates, not pixels — so this version measures the real
// rendered DOM instead: an invisible `nowrap` measurer span reports the
// title's true rendered width (immune to the old approach's font-string/
// sub-pixel-drift risk, since it IS the actual node in the actual font),
// and a ResizeObserver on the content row reports the actual available
// width as it changes across zoom/scale/tree-panel-resize. Whichever is
// bigger decides fit — no font string, no cache, no guessed threshold.
const INSIDE_LABEL_PADDING_PX = 12; // slack, same semantics as the old constant of the same name
const OUTSIDE_LABEL_MAX_WIDTH = 240; // px — matches the old engine's OUTSIDE_LABEL_MAX_WIDTH

// Standard relative-luminance approximation, ported verbatim from
// GanttBar.tsx:56-74 — decides whether a bar's resolved fill needs light or
// dark label text to stay readable.
const LABEL_LUMINANCE_THRESHOLD = 0.6;

function hexLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function insideLabelTextColor(hex: string): string {
  return hexLuminance(hex) > LABEL_LUMINANCE_THRESHOLD ? "rgba(0, 0, 0, 0.75)" : "#ffffff";
}

/**
 * Measures whether `title`, rendered at the label's real font/size, fits the
 * live width of the returned `containerRef` box (minus slack). Re-checks on
 * container resize (zoom/scale/tree-panel changes), on title change, and
 * once webfonts finish loading — "Source Sans 3" is not guaranteed
 * synchronously available on first paint. Safe to call unconditionally
 * (Rules of Hooks) even for bar kinds that never attach the refs — the
 * effect just no-ops when there's nothing mounted to measure.
 */
function useLabelFits(title: string) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const check = () => {
      setFits(measure.scrollWidth + INSIDE_LABEL_PADDING_PX <= container.clientWidth);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) check();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [title]);

  return { containerRef, measureRef, fits };
}

const LABEL_TEXT_CLASSNAME = "truncate text-[11px] font-medium leading-none";

/** Solvro's bar content — see the file-level comment for the full picture. */
export function SolvroBar({ occurrence, segment, isSelected }: GanttRenderEventProps<Task>) {
  const event = occurrence.event;
  const title = event.title;
  // Hook called unconditionally, before any branch/early-return, so every
  // bar kind (rollup included) keeps a stable hook order across re-renders.
  const { containerRef, measureRef, fits } = useLabelFits(title);

  // Section rollup pill (point 6): synthetic events from buildRollupEvents
  // carry no `data` — the id prefix is the only signal, and is also what
  // e2e specs and this component agree on instead of a shared type guard.
  if (event.id.startsWith("section-rollup-")) {
    return (
      <span
        data-rollup
        aria-hidden
        className="mx-auto h-1.5 w-full rounded-full bg-(--gantt-event-color)"
      />
    );
  }

  const task = event.data;
  if (!task) return null;

  const color = event.color ?? DEFAULT_SECTION_COLOR;
  const textColor = insideLabelTextColor(color);

  const rawProgress = typeof event.progress === "number" ? event.progress : null;
  const progress =
    rawProgress === null ? null : Math.min(Math.max(Math.round(rawProgress), 0), 100);
  const showProgressOverlay = progress !== null && progress > 0 && progress < 100;

  // Dormant until the Secure Ingestion Port ships (CLAUDE.md "not yet
  // built"): every blueprint-generated task gets an amber "AI Breakdown"
  // ring once `Task.blueprintId` exists. No such field on Task today, so
  // this is always false in production — the conditional stays live on
  // purpose so the hook activates with zero further changes once it ships.
  const isAiBreakdown = (task as { blueprintId?: number }).blueprintId != null;

  // Selection affordance uses `outline` rather than `ring` specifically so
  // it can coexist with the AI-glow `ring` below without the two fighting
  // over the same tailwind-merge conflict group (both are "ring-color" —
  // outline is a separate CSS property/utility group entirely).
  const selectedOutline = isSelected && "outline outline-2 outline-offset-1 outline-on-surface/70";

  if (task.isMilestone) {
    return (
      <span
        data-task-id={task.id}
        data-milestone
        data-ai-breakdown={isAiBreakdown || undefined}
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-sm",
          isAiBreakdown && "ring-2 ring-chip-amber-text",
          selectedOutline,
        )}
      >
        {/* Primary green, not `--gantt-event-color` — parity with the old
            engine (GanttBar.tsx:318-320), which hardcodes the milestone
            diamond to primary with an explicit "not section color" comment.
            The brief's skeleton using the event color was the error; this
            reverts to shipped behavior across all colorBy modes (Plan B
            Task 4 review finding). */}
        <span
          aria-hidden
          className="bg-primary inline-block size-2.5 shrink-0 rotate-45"
        />
        {/* Decorative — the button's own aria-label (gantt-bar.tsx) already
            announces the title, so this visual duplicate stays out of the a11y tree. */}
        <span aria-hidden className={LABEL_TEXT_CLASSNAME} style={{ color: textColor }}>
          {title}
        </span>
      </span>
    );
  }

  // Solid fill: rendered by us (not classNames.event) so it can stay OFF
  // for rollup/milestone bars while still being the full-bleed backdrop for
  // regular bars. `inset-0` anchors to the button (the nearest positioned
  // ancestor — our own wrapper below is deliberately left non-positioned so
  // this reaches the button's true edges, padding included, rather than
  // stopping at our wrapper's inset content box). Rounding mirrors the
  // button's own continues-before/after squaring (gantt-bar.tsx's
  // `segment.continuesBefore/After` classes) so a bar split across the
  // visible range's edge doesn't show mismatched corners between the
  // button's shape and our backdrop's.
  const backdrop = (
    <span
      aria-hidden
      data-slot="solvro-bar-fill"
      className={cn(
        "pointer-events-none absolute inset-0 bg-(--gantt-event-color)",
        "group-hover/gantt-bar-group:brightness-110",
        segment.continuesBefore ? "rounded-s-none" : "rounded-s-sm",
        segment.continuesAfter ? "rounded-e-none" : "rounded-e-sm",
        isAiBreakdown && "ring-2 ring-chip-amber-text",
        selectedOutline,
      )}
    />
  );

  return (
    <span
      ref={containerRef}
      data-task-id={task.id}
      data-ai-breakdown={isAiBreakdown || undefined}
      data-label-outside={!fits || undefined}
      className="flex h-full min-w-0 flex-1 items-center"
    >
      {backdrop}
      {showProgressOverlay && (
        <span
          aria-hidden
          data-slot="solvro-bar-progress"
          className="pointer-events-none absolute inset-y-0 start-0 rounded-s-sm"
          style={{
            width: `${progress}%`,
            backgroundColor: `rgba(0, 0, 0, ${PROGRESS_OVERLAY_ALPHA})`,
          }}
        />
      )}
      {/* Invisible measurer: same font/size as the real label, never
          truncated, removed from flow so it never affects layout — its
          scrollWidth is the title's true rendered width (see useLabelFits). */}
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute whitespace-nowrap text-[11px] font-medium"
      >
        {title}
      </span>
      {fits ? (
        // Decorative — see the milestone branch's identical note: the
        // button's own aria-label already carries the title.
        <span
          aria-hidden
          className={cn("relative min-w-0 px-0.5", LABEL_TEXT_CLASSNAME)}
          style={{ color: textColor }}
        >
          {title}
        </span>
      ) : (
        <span
          aria-hidden
          data-slot="solvro-bar-label-outside"
          className="text-on-surface pointer-events-none absolute start-full top-1/2 z-10 ms-1.5 flex -translate-y-1/2 items-center gap-1"
          style={{ maxWidth: OUTSIDE_LABEL_MAX_WIDTH }}
        >
          <span
            aria-hidden
            className="h-[3px] w-[3px] shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className={LABEL_TEXT_CLASSNAME}>{title}</span>
        </span>
      )}
    </span>
  );
}
