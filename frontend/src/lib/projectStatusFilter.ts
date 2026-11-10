import type { ProjectStatus } from "@/lib/queries";

// Workflow order — also the canonical order written back to the URL, so the
// same selection always serialises to the same `?status=` string.
export const PROJECT_STATUS_ORDER: readonly ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];

/** Parse `?status=ACTIVE,ON_HOLD`. Unknown values are dropped silently; duplicates collapse. */
export function parseStatusParam(raw: string | null | undefined): ProjectStatus[] {
  if (!raw) return [];
  const wanted = new Set(raw.split(",").map((s) => s.trim()));
  return PROJECT_STATUS_ORDER.filter((s) => wanted.has(s));
}

/** Serialise a selection for the URL; `null` means "no filter" (remove the parameter). */
export function serialiseStatusParam(statuses: readonly string[]): string | null {
  const wanted = new Set(statuses);
  const known = PROJECT_STATUS_ORDER.filter((s) => wanted.has(s));
  return known.length > 0 ? known.join(",") : null;
}
