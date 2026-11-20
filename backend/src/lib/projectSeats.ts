import type { Prisma, PrismaClient } from "@prisma/client";
import { recordActivity, shortLabel, type ActivityChanges } from "./activity.js";
import { utcMidnightOf } from "./dateBoundary.js";
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
  /** Holders already loaded by the caller; when given, no user is queried. */
  holders?: ReadonlyMap<number, SeatHolder>,
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
        : holders
          ? (holders.get(afterId) ?? null)
          : await tx.user.findUnique({ where: { id: afterId }, select: { id: true, username: true } });
    changes[key] = { from: key === "tam" ? before.tam : before.sa, to } as Prisma.InputJsonObject;
  }
  return changes;
}

/**
 * One sentence per seat in `changes` (`diffProjectSeats` output): "Changed TAM
 * from alice to bob", "Set SA to bob", "Removed SA alice". `via` names the surface when it is
 * not the project's own form ("Project Override").
 */
export function seatChangeSentences(changes: ActivityChanges, via?: string): string[] {
  const suffix = via ? ` (${via})` : "";
  const sentences: string[] = [];
  for (const [key, label] of [
    ["tam", "TAM"],
    ["sa", "SA"],
  ] as const) {
    const change = changes[key] as { from: SeatHolder | null; to: SeatHolder | null } | undefined;
    if (!change) continue;
    const { from, to } = change;
    if (to === null) sentences.push(`Removed ${label}${from ? ` ${from.username}` : ""}${suffix}`);
    else if (from === null) sentences.push(`Set ${label} to ${to.username}${suffix}`);
    else sentences.push(`Changed ${label} from ${from.username} to ${to.username}${suffix}`);
  }
  return sentences;
}

/**
 * Writes a TAM / SA change into the project's notes, authored by the actor, so
 * a handover is readable where the team reads the project's history (user
 * decision 2026-11-12). Call it in the same transaction as the seat write.
 */
export async function recordSeatChangeNotes(
  tx: Tx,
  input: {
    projectId: number;
    actorId: number;
    changes: ActivityChanges;
    via?: string;
    /** Defaults to today (UTC); pass it to date the note with a sibling write. */
    noteDate?: Date;
  },
): Promise<void> {
  for (const body of seatChangeSentences(input.changes, input.via)) {
    await tx.projectNote.create({
      data: {
        projectId: input.projectId,
        authorId: input.actorId,
        body,
        noteDate: input.noteDate ?? utcMidnightOf(new Date()),
      },
    });
  }
}

/**
 * Records the project `updated` event and notifies the new TAM / SA
 * (`changes.tam` / `changes.sa` `to`) with an `assigned` notification; the
 * actor and inactive users are skipped inside `notifyForEvent`. Call it in the
 * same transaction as the write. An empty `changes` records nothing. A changed
 * seat is also written into the project's notes (`recordSeatChangeNotes`).
 */
export async function recordProjectUpdate(
  tx: Tx,
  input: { projectId: number; actorId: number; name: string; changes: ActivityChanges; via?: string },
): Promise<void> {
  await recordSeatChangeNotes(tx, input);
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
