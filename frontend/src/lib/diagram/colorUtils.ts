/**
 * Phase color helpers for the Network Diagram.
 *
 * If a Section has no `color` set yet (legacy projects), we derive a
 * deterministic color from the section id so distinct phases still
 * render as distinct tracks. Anything without a sectionId falls back to
 * a neutral slate.
 */

const FALLBACK_PALETTE = [
  "#14b8a6", // teal
  "#ec4899", // magenta
  "#a3e635", // yellow-green
  "#a78bfa", // violet
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#f59e0b", // amber
  "#22c55e", // green
];
const NEUTRAL = "#94a3b8";

export function phaseColor(section: { id: number; color?: string | null } | null): string {
  if (!section) return NEUTRAL;
  if (section.color && /^#[0-9a-fA-F]{6}$/.test(section.color)) return section.color;
  return FALLBACK_PALETTE[section.id % FALLBACK_PALETTE.length];
}
