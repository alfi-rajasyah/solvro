import type { Prisma, PrismaClient } from "@prisma/client";
import { recordActivity, shortLabel, type ActivityChanges } from "./activity.js";
import { notifyForEvent } from "./notifications.js";

type Tx = Prisma.TransactionClient | PrismaClient;

/** The TAM / SA seats of a project as the activity log tracks them. */
export type SeatHolder = { id: number; username: string };
export type ProjectSeats = { tam: SeatHolder; sa: SeatHolder | null };

/** Prisma `select` fragment that loads a project's seats for `diffProjectSeats`. */
export const projectSeatsSelect = {
  tam: { select: { id: true, username: true } },
  sa: { select: { id: true, username: true } },
} satisfies Prisma.ProjectSelect;

/**
 * `changes.tam` / `changes.sa` (`{ from, to }`, ids and usernames only) for
 * the seats that differ between `before` and the row now stored; empty when
 * nothing moved, so a re-save records nothing. Shared by `PATCH /projects/:id`
 * and the admin reassign route so a handover reads the same in the feed and
 * notifies the new holder either way
 * (docs/archive/plans/application-review-2026-10-22.md, F-25).
 */
export async function diffProjectSeats(
  tx: Tx,
  before: ProjectSeats,
  after: { tamId: number; saId: number | null },
): Promise<ActivityChanges> {
  const changes: ActivityChanges = {};
  for (const [key, beforeId, afterId] of [
    ["tam", before.tam.id, after.tamId],
    ["sa", before.sa?.id ?? null, after.saId],
  ] as const) {
    if (beforeId === afterId) continue;
    const to =
      afterId === null
        ? null
        : await tx.user.findUnique({ where: { id: afterId }, select: { id: true, username: true } });
    changes[key] = { from: key === "tam" ? before.tam : before.sa, to } as Prisma.InputJsonObject;
  }
  return changes;
}

/**
 * Records the project `updated` event and notifies the new TAM / SA
 * (`changes.tam` / `changes.sa` `to`) with an `assigned` notification; the
 * actor and inactive users are skipped inside `notifyForEvent`. Call it in the
 * same transaction as the write. An empty `changes` records nothing.
 */
export async function recordProjectUpdate(
  tx: Tx,
  input: { projectId: number; actorId: number; name: string; changes: ActivityChanges },
): Promise<void> {
  const event = await recordActivity(tx, {
    projectId: input.projectId,
    actorId: input.actorId,
    entityType: "project",
    entityId: input.projectId,
    action: "updated",
    entityLabel: shortLabel(input.name),
    changes: input.changes,
  });
  await notifyForEvent(tx, event);
}
