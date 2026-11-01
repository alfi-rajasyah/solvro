import { TableSkeleton } from "@/components/skeletons";

/**
 * Suspense fallback while a lazily loaded page chunk downloads. Reuses the
 * delayed table skeleton, so a chunk that arrives quickly never flashes
 * (docs/archive/plans/application-review-2026-10-22.md, F-16).
 */
export function RouteFallback() {
  return <TableSkeleton rows={6} columns={4} />;
}
