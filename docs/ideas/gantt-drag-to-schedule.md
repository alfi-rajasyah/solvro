# Gantt Drag-to-Schedule (Phase 2 of "Gantt without dates")

Refined 2026-07-21 from a TAM bug report ("Gantt not showing up even if list
already filled out"). Phase 1 — rendering the Gantt frame when zero tasks have
dates — shipped on `feat/gantt-ux-fixes` (`GanttFrame.tsx` today-centered
chart-window fallback). This doc scopes the follow-up interaction.

## Problem Statement

How might we let a TAM schedule an undated task directly on the Gantt canvas,
instead of round-tripping through the task editor modal?

## Recommended Direction

Asana-style drag-to-create: on an undated task's empty canvas row, mouse-down
and drag horizontally draws a ghost bar; release commits `startDate`/`dueDate`
via the existing `handleCommit` path (`GanttFrame.tsx`), which already does
UTC-midnight normalization and error surfacing. Snapping follows the current
view mode's column grid (`positionFor`/`dateForPosition` in
`lib/gantt/geometry.ts`).

The interaction only arms on rows where `kind !== "section"` and both
`start`/`end` are null — dated bars keep their existing move/resize handles
untouched. `GanttBar` already returns null for date-less rows, so the ghost
bar is a new, separate overlay in the row band, not a change to `GanttBar`.

## Key Assumptions to Validate

- [ ] The empty row band can receive pointer events without fighting the
      horizontal scroller or the @dnd-kit sensors used for section drag —
      prototype with a plain pointerdown/pointermove handler before reaching
      for dnd-kit.
- [ ] Week/Month/Quarter snapping feels right for a first-draft schedule
      (day-level precision can come from the editor afterwards).
- [ ] TAMs actually want gesture scheduling — Phase 1 (click row → editor)
      may prove sufficient in practice. Check after two weeks of real use.

## MVP Scope

- Drag-to-create on undated task/subtask rows, snapped to view-mode columns.
- Commit through `handleCommit`; optimistic UI comes free from the existing
  mutation pattern.
- Cursor affordance (`cursor: crosshair`) + faint "drag to schedule" hint on
  row hover.

## Not Doing (and Why)

- **Drag-to-create for sections** — section bars are derived from their
  tasks' range (`rangeFor` in `geometry.ts`); giving sections independent
  dates would break that invariant.
- **Auto-assigning default dates to undated tasks** — fabricates schedule
  data the TAM never chose; baseline/variance math would ingest fiction.
- **Touch support** — Gantt is desktop-only (`hidden md:block`); the mobile
  fallback is `<ProjectList />`.
- **Dependency-aware placement** (snap after predecessor) — depends on
  critical-path work, which is deferred per CLAUDE.md.

## Open Questions

- Should dragging on a *dated* task's empty space (outside its bar) do
  nothing, or start a pan? Today it scrolls; keep that.
- Minimum drag distance before a bar commits (avoid accidental 1-day tasks
  from a stray click)? Suggest ~half a column.
