// Pure builders for the Weekly Sync page's "Copy as table" action
// (docs/plans/weekly-sync-tables.md §4 "Weekly Sync page", D13). No React, no
// network — `WeeklySync.tsx` calls these at click time and the Vitest suite
// below exercises them in isolation.
//
// Column order matches the two meeting tables exactly (plan D2), not the
// on-page layout: Mid-week copies Customer, Health, Category, Highlight,
// Risk, Action. Reflection copies Customer, Weekly achievement, Outstanding
// issue, Lesson learned, Next week focus, Need manager decision — no Health
// or Category column (health is set on Wednesday and read there; the
// Reflection meeting doesn't re-discuss category). Status is never copied
// on either tab (D13: only the sync fields are copied, daily notes never
// are, and Status is a page-only affordance).
import type { DailyReviewCustomer, WeeklyHealth } from "./queries";

export type WeeklySyncTab = "midweek" | "reflection";

export interface SyncTable {
  header: string[];
  rows: string[][];
}

const EM_DASH = "—";

// Title-case health labels — shared with WeeklySync.tsx's on-page Health
// cells (finding 2, phase review) so the page and the clipboard agree on
// casing, even though the page still needs its own "—" wrapper for a null
// health (a plain pill, not a table cell).
export const HEALTH_LABEL: Record<WeeklyHealth, string> = {
  GREEN: "Green",
  AMBER: "Amber",
  RED: "Red",
};

/** True when `customer`'s current-week `managerDecision` is non-empty after trim (D10's pin condition). */
export function hasManagerDecision(customer: DailyReviewCustomer): boolean {
  return Boolean(customer.weeklyUpdate?.managerDecision?.trim());
}

/**
 * The display order for `tab` (D10): on the Reflection tab, customers with a
 * non-empty `managerDecision` sort first, then the rest — each group keeping
 * the input (backend) order. The Mid-week tab has no pinning, so input order
 * passes through unchanged. Does not mutate `customers`.
 */
export function orderForTab(
  tab: WeeklySyncTab,
  customers: DailyReviewCustomer[],
): DailyReviewCustomer[] {
  if (tab === "midweek") return customers;
  const pinned = customers.filter(hasManagerDecision);
  const rest = customers.filter((c) => !hasManagerDecision(c));
  return [...pinned, ...rest];
}

/** Empty-dash fallback for a nullable/whitespace-only text field. Preserves the raw value (including internal newlines) when it has content. */
function cellText(value: string | null | undefined): string {
  if (value == null || value.trim().length === 0) return EM_DASH;
  return value;
}

function cellHealth(health: WeeklyHealth | null | undefined): string {
  return health ? HEALTH_LABEL[health] : EM_DASH;
}

/**
 * Builds the header + rows for `tab` from `customers`, in the order given —
 * callers wanting D10's pinned ordering pass `orderForTab(tab, customers)`
 * first. Never reorders internally, so it stays trivially testable against a
 * fixed input order.
 */
export function buildSyncTable(tab: WeeklySyncTab, customers: DailyReviewCustomer[]): SyncTable {
  if (tab === "midweek") {
    const header = ["Customer", "Health", "Category", "Highlight", "Risk", "Action"];
    const rows = customers.map((c) => {
      const u = c.weeklyUpdate;
      return [
        c.name,
        cellHealth(u?.health),
        cellText(u?.category),
        cellText(u?.highlight),
        cellText(u?.risk),
        cellText(u?.action),
      ];
    });
    return { header, rows };
  }

  const header = [
    "Customer",
    "Weekly achievement",
    "Outstanding issue",
    "Lesson learned",
    "Next week focus",
    "Need manager decision",
  ];
  const rows = customers.map((c) => {
    const u = c.weeklyUpdate;
    return [
      c.name,
      cellText(u?.achievement),
      cellText(u?.outstandingIssue),
      cellText(u?.lessonLearned),
      cellText(u?.nextWeekFocus),
      cellText(u?.managerDecision),
    ];
  });
  return { header, rows };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes a cell's HTML entities, then renders internal newlines as `<br>` (order matters: escaping never touches `\n` itself, so this is safe either way, but stays explicit). */
function escapeCell(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

/**
 * `table` as an HTML `<table>` with `<thead>`/`<tbody>`, every cell escaped —
 * this is the `text/html` clipboard payload so pasting into Google Docs (or
 * any rich-text target) lands as a real table, not plain text.
 */
export function toHtmlTable(table: SyncTable): string {
  const thead = `<thead><tr>${table.header.map((h) => `<th>${escapeCell(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

/** Any tab or newline inside a cell would otherwise corrupt the column/row structure, so each such character is replaced with a single space. */
function tsvCell(s: string): string {
  return s.replace(/[\t\r\n]/g, " ");
}

/**
 * `table` as tab-separated text (header row first) — the `text/plain`
 * clipboard fallback, and the only payload written when `ClipboardItem` is
 * unavailable.
 */
export function toTsv(table: SyncTable): string {
  return [table.header, ...table.rows].map((row) => row.map(tsvCell).join("\t")).join("\n");
}
