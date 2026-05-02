import type { Label } from "@/lib/queries";

export function LabelChip({ label, compact = false }: { label: Label; compact?: boolean }) {
  const fg = pickContrast(label.color);
  return (
    <span
      className={`inline-flex items-center rounded font-display text-[10px] font-bold uppercase tracking-wider ${compact ? "px-1 py-0.5" : "px-1.5 py-0.5"}`}
      style={{ backgroundColor: label.color, color: fg }}
    >
      {label.name}
    </span>
  );
}

function pickContrast(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  // Perceived brightness — pick black/white for max contrast.
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#191b23" : "#ffffff";
}
