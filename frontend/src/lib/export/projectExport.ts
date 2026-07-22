// Reports export packet — pure, framework-free markdown builder.
//
// Mirrors the Gantt export layer's discipline: heavy/optional export code
// stays out of the main bundle and is pulled in via dynamic `import()` at
// the call site (see Reports.tsx). This module does no network and holds
// no React — it takes already-fetched data and returns a string.

import type {
  ProjectNote,
  ProjectStatus,
  ProjectSummary,
  Risk,
  Section,
  Task,
  TaskDependency,
} from "@/lib/queries";

export interface ProjectExportInput {
  project: ProjectSummary;
  tasks: Task[];
  risks: Risk[];
  sections: Section[];
  dependencies: TaskDependency[];
  /**
   * Should be pre-filtered to CUSTOMER_FACING by the caller. The builder
   * re-filters defensively so an INTERNAL note can never reach the export
   * even if the caller mis-queries — this invariant is load-bearing.
   */
  customerNotes: ProjectNote[];
  generatedAt: Date;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const DAY_MS = 86_400_000;
const NOTE_WINDOW_DAYS = 14;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function maxDate(values: (string | null)[]): Date | null {
  let max: number | null = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (max === null || t > max) max = t;
  }
  return max === null ? null : new Date(max);
}

/** Collapse whitespace so a multi-line note/description stays one bullet. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function exportFileName(projectName: string): string {
  const slug =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "project";
  return `${slug}_export_${startOfToday().toISOString().slice(0, 10)}.md`;
}

export function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildProjectExportMarkdown(input: ProjectExportInput): string {
  const {
    project,
    tasks,
    risks,
    sections,
    dependencies,
    customerNotes,
    generatedAt,
  } = input;

  // ── Health: progress ──────────────────────────────────────────
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // ── Health: schedule variance vs. baseline ────────────────────
  let scheduleLine: string;
  if (!project.baselineLockedAt) {
    scheduleLine = "No baseline locked — schedule variance unavailable";
  } else {
    const baselineEnd = maxDate(tasks.map((t) => t.baselineDueDate));
    const currentEnd = maxDate(tasks.map((t) => t.dueDate));
    if (!baselineEnd || !currentEnd) {
      scheduleLine =
        "Baseline locked but task dates incomplete — variance unavailable";
    } else {
      const slip = Math.round(
        (currentEnd.getTime() - baselineEnd.getTime()) / DAY_MS,
      );
      scheduleLine =
        slip === 0
          ? "On schedule (0 days vs. baseline)"
          : slip > 0
            ? `${slip} day${slip === 1 ? "" : "s"} behind baseline`
            : `${-slip} day${slip === -1 ? "" : "s"} ahead of baseline`;
    }
  }

  // ── Phase breakdown + current phase ───────────────────────────
  // "Current phase" = earliest (lowest-position) section that still has
  // unfinished work. No first-class phase concept exists in the model, so
  // this is derived from section ordering + task completion.
  const ordered = [...sections].sort((a, b) => a.position - b.position);
  const sectionStats = ordered.map((s) => {
    const inSec = tasks.filter((t) => t.sectionId === s.id);
    return {
      name: s.name,
      total: inSec.length,
      done: inSec.filter((t) => t.status === "DONE").length,
    };
  });
  const unsectioned = tasks.filter((t) => t.sectionId === null);
  const currentPhase =
    sectionStats.find((s) => s.total > 0 && s.done < s.total)?.name ??
    (sectionStats.length > 0 ? "All phases complete" : "—");

  // ── Task signals ──────────────────────────────────────────────
  const today = startOfToday();
  const overdue = tasks.filter(
    (t) => t.status !== "DONE" && t.dueDate && new Date(t.dueDate) < today,
  ).length;

  // Blocked = a non-done task with at least one not-done predecessor.
  const statusById = new Map<number, Task["status"]>();
  for (const t of tasks) statusById.set(t.id, t.status);
  const blockedIds = new Set<number>();
  for (const dep of dependencies) {
    const succ = statusById.get(dep.successorTaskId);
    const pred = statusById.get(dep.predecessorTaskId);
    if (succ && succ !== "DONE" && pred && pred !== "DONE") {
      blockedIds.add(dep.successorTaskId);
    }
  }

  // ── Open risks (score = probability × impact, highest first) ───
  const openRisks = risks
    .filter((r) => r.status === "OPEN")
    .map((r) => ({ ...r, score: r.probability * r.impact }))
    .sort((a, b) => b.score - a.score);

  // ── Customer-facing notes, last 14 days, chronological ────────
  const cutoff = generatedAt.getTime() - NOTE_WINDOW_DAYS * DAY_MS;
  const notes = customerNotes
    .filter(
      (n) =>
        n.visibility === "CUSTOMER_FACING" &&
        new Date(n.createdAt).getTime() >= cutoff,
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  // ── Assemble ──────────────────────────────────────────────────
  const L: string[] = [];
  L.push(`# Project Export — ${project.name}`);
  L.push("");
  L.push(
    `_Generated ${generatedAt.toISOString()} · structured for external AI summarisation. INTERNAL notes are intentionally excluded._`,
  );
  L.push("");

  L.push("## Identity");
  L.push(`- **Project:** ${project.name}`);
  L.push(`- **Customer:** ${project.customer?.name ?? "—"}`);
  if (project.sa) L.push(`- **Solution Architect:** ${project.sa.username}`);
  L.push(`- **Technical Account Manager:** ${project.tam.username}`);
  L.push(`- **Status:** ${STATUS_LABEL[project.status]}`);
  L.push(`- **Current phase:** ${currentPhase}`);
  L.push("");

  L.push("## Health");
  L.push(`- **Progress:** ${pct}% (${done}/${total} tasks complete)`);
  L.push(`- **Schedule:** ${scheduleLine}`);
  L.push("");

  L.push("## Phase breakdown");
  if (sectionStats.length === 0 && unsectioned.length === 0) {
    L.push("_No phases defined._");
  } else {
    for (const s of sectionStats) {
      const p = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100);
      L.push(`- **${s.name}** — ${p}% (${s.done}/${s.total})`);
    }
    if (unsectioned.length > 0) {
      const d = unsectioned.filter((t) => t.status === "DONE").length;
      const p = Math.round((d / unsectioned.length) * 100);
      L.push(`- **(Unsectioned)** — ${p}% (${d}/${unsectioned.length})`);
    }
  }
  L.push("");

  L.push("## Task signals");
  L.push(`- **Overdue:** ${overdue}`);
  L.push(
    `- **Blocked:** ${blockedIds.size} _(not-done tasks with an unfinished dependency)_`,
  );
  L.push(
    `- **Completed:** ${done} _(cumulative — task records carry no completion timestamp, so this is not windowed)_`,
  );
  L.push("");

  L.push(`## Open risks (${openRisks.length})`);
  if (openRisks.length === 0) {
    L.push("_No open risks._");
  } else {
    for (const r of openRisks) {
      L.push(
        `- **Score ${r.score}** (P${r.probability}×I${r.impact}) · ${r.category} · ${
          r.mitigationPlan ? "mitigation documented" : "no mitigation plan"
        } — ${oneLine(r.description)}`,
      );
    }
  }
  L.push("");

  L.push("## Customer-facing notes — last 14 days");
  if (notes.length === 0) {
    L.push("_No customer-facing notes in the last 14 days._");
  } else {
    for (const n of notes) {
      L.push(
        `- **${n.createdAt.slice(0, 10)}** (${n.author.username}): ${oneLine(n.body)}`,
      );
    }
  }
  L.push("");

  return L.join("\n");
}
