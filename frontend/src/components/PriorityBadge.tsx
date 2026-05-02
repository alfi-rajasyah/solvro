import type { Priority } from "@/lib/queries";

const TONE: Record<Priority, { dot: string; text: string; bg: string }> = {
  LOW:    { dot: "bg-slate-400",   text: "text-slate-600",  bg: "bg-slate-100" },
  MEDIUM: { dot: "bg-slate-500",   text: "text-slate-700",  bg: "bg-surface-container" },
  HIGH:   { dot: "bg-amber-500",   text: "text-amber-800",  bg: "bg-amber-100" },
  URGENT: { dot: "bg-error",       text: "text-on-error-container", bg: "bg-error-container" },
};

const LABEL: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Med",
  HIGH: "High",
  URGENT: "Urgent",
};

export function PriorityBadge({ priority, compact = false }: { priority: Priority; compact?: boolean }) {
  const t = TONE[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded ${t.bg} ${t.text} font-display text-[10px] font-bold uppercase tracking-wider ${compact ? "px-1 py-0.5" : "px-1.5 py-0.5"}`}
      title={`Priority: ${LABEL[priority]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {LABEL[priority]}
    </span>
  );
}
