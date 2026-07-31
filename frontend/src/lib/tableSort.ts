import type { SortingFn } from "@tanstack/react-table";

// Shared DataGrid sortingFn helper (reui-data-grid.md Checkpoint B, decision
// 7): TanStack's sortingFn auto-detection samples `flatRows.slice(10)` — from
// index 10 onward, not the first ten — so any table with <=10 rows (a
// customer's project list, the admin user list, ...) never gets sampled and
// silently falls back to "basic" (raw codepoint compare). That pushes
// accented characters and uppercase-first names to the wrong place — e.g. an
// uppercase "Z..." name would sort before every lowercase name instead of
// landing alphabetically near the end, where a human reader expects it.
// Every person-name column (TAM/SA usernames, admin usernames/emails, ...)
// declares this sortingFn explicitly instead of relying on auto-detection.
//
// Column-agnostic via `row.getValue(columnId)` rather than a hardcoded
// `row.original.field` accessor — one export usable by any string-valued
// column, regardless of its row type or accessor shape (contrast with
// Tasks.tsx's/Admin.tsx's "alphanumeric" columns, a deliberate different
// choice for non-person data where natural number ordering beats locale
// collation — see those files' own column comments).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const personNameSortingFn: SortingFn<any> = (rowA, rowB, columnId) =>
  (rowA.getValue(columnId) as string).localeCompare(rowB.getValue(columnId) as string);
