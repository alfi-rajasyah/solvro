import { PipelineStage, type Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Serialises pipeline stage re-packs. Takes a transaction-scoped advisory lock
 * per given stage (`pipeline_stage:<stage>`), in sorted stage order, so two
 * transactions that need overlapping stages queue instead of deadlocking.
 *
 * Guarantee: every transaction that re-packs a stage's stageOrder (create,
 * import row, move, delete) or reassigns open deals in bulk (offboarding)
 * calls this BEFORE taking any opportunity row lock, and always in sorted
 * order. A holder of a stage lock therefore never waits for a row lock that
 * another stage-lock holder owns.
 *
 * Offboarding takes the stage locks (all stages) after its project and
 * customer locks but BEFORE the leaver's user row lock: a deal write holds its
 * stage lock and then takes FOR KEY SHARE on the user row it references (PIC,
 * activity actor), which would otherwise wait on offboarding's FOR UPDATE
 * while offboarding waits on the stage lock. No stage-lock holder takes a
 * project lock. Single-row writes that take no stage lock
 * (PIC or field edits) lock one row at a time and cannot form a cycle.
 */
export async function lockStages(tx: Tx, ...stages: PipelineStage[]): Promise<void> {
  for (const stage of [...new Set(stages)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pipeline_stage:${stage}`}))`;
  }
}

/**
 * Every stage, for a bulk writer whose deals may sit in any stage and move
 * between stages while it waits (offboarding). Locking the whole set avoids
 * having to guess the leaver's stages before the lock is held.
 */
export const ALL_PIPELINE_STAGES: PipelineStage[] = Object.values(PipelineStage);
