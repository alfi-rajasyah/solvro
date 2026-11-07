import { Prisma, type PrismaClient } from "@prisma/client";

// Shared plumbing for the dense-position re-packs (tasks, sections, epics)
// and the project-level lock that serialises them
// (docs/archive/plans/application-review-2026-10-22.md, F-10).

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Lock the project row for the rest of the transaction, so concurrent
 * reorders / dependency writes in one project serialise instead of reading
 * the same sibling positions and writing overlapping re-packs (duplicates,
 * gaps). FOR NO KEY UPDATE, not FOR UPDATE: it excludes other lockers and
 * project UPDATEs but not the FOR KEY SHARE an FK check on tasks/sections/
 * epics inserts takes, so creating rows never blocks behind it.
 *
 * LOCK ORDER: always take this FIRST in a transaction, before any task/epic
 * row lock and before reading sibling positions. Two transactions that each
 * hold a row lock and then wait for the project lock (or the reverse) would
 * deadlock; with the project first, every path acquires project -> row.
 */
export async function lockProject(tx: Tx, projectId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR NO KEY UPDATE`;
}

// Bind parameters are capped at 32767 per statement; two per row.
const CHUNK = 5_000;

/**
 * Write many `position` values with one `UPDATE ... FROM (VALUES ...)`
 * statement (instead of one UPDATE round-trip per row). Callers pass only the
 * rows whose position actually changes; an empty list issues no statement.
 * `epics` also carries an `updated_at` column the Prisma client would have
 * bumped, so it is touched here too.
 */
export async function writePositions(
  tx: Tx,
  table: "tasks" | "sections" | "epics",
  changes: ReadonlyArray<{ id: number; position: number }>,
): Promise<void> {
  const tableSql = Prisma.raw(table);
  // Bound from JS (not now()) so the TIMESTAMP(3) value is UTC like Prisma's
  // @updatedAt, independent of the session time zone.
  const touch = table === "epics" ? Prisma.sql`, updated_at = ${new Date()}` : Prisma.empty;
  for (let i = 0; i < changes.length; i += CHUNK) {
    const values = Prisma.join(
      changes.slice(i, i + CHUNK).map((c) => Prisma.sql`(${c.id}::int, ${c.position}::int)`),
    );
    await tx.$executeRaw`UPDATE ${tableSql} AS t SET position = v.position${touch}
      FROM (VALUES ${values}) AS v(id, position)
      WHERE t.id = v.id`;
  }
}

/**
 * Given the current ordered rows and the desired id order, write dense
 * positions 0..n-1 for only the rows whose stored position differs.
 */
export async function repackToOrder(
  tx: Tx,
  table: "tasks" | "sections" | "epics",
  current: ReadonlyArray<{ id: number; position: number }>,
  orderedIds: ReadonlyArray<number>,
): Promise<void> {
  const before = new Map(current.map((r) => [r.id, r.position]));
  const changes: { id: number; position: number }[] = [];
  orderedIds.forEach((id, index) => {
    if (before.get(id) !== index) changes.push({ id, position: index });
  });
  await writePositions(tx, table, changes);
}
