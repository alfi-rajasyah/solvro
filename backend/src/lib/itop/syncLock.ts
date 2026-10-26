// Single-runner lock for the iTop sync, held for the whole run on ONE
// dedicated database session (docs/archive/plans/application-review-2026-10-22.md, F-28).
//
// A Postgres session advisory lock belongs to the connection that took it,
// and the shared Prisma client pools connections, so lock and unlock issued
// through it could land on different sessions. This module uses its own
// client (`createDedicatedClient`, `connection_limit=1`): the pool has one
// slot, so lock and unlock go through the same slot. Prisma can still recycle
// that slot's connection once it passes `max_idle_connection_lifetime`
// (default 300 s) or `max_connection_lifetime` — measured in practice as
// connection AGE, not inactivity: a busy heartbeat does not reset it. The
// statements would then silently move to a new session while the lock stays
// on the old, orphaned one. So: (1) both lifetimes are set to 24 h on the lock
// URL, far beyond any sync run, which is what actually prevents recycling;
// (2) a heartbeat every `heartbeatMs` compares the backend pid with the one
// that took the lock and checks `pg_locks`, logging at error if the session
// was lost anyway (the sync keeps running — its writes are idempotent upserts
// and aborting half-way would leave the snapshot worse); it also keeps the
// session from tripping server-side or network idle timeouts; (3)
// `$disconnect()` in `finally` is the backstop: closing the session always
// releases the lock, including after a crash.
//
// Requires a direct or session-pooled Postgres connection. A transaction-mode
// pooler (PgBouncer) breaks session advisory locks.
import { createDedicatedClient } from "../../prisma.js";
import { env } from "../../env.js";
import { logger } from "../../logger.js";

const ADVISORY_LOCK_KEY = "itop_sync";
const DEFAULT_HEARTBEAT_MS = 30_000;
// 24 h, in the units Prisma expects (seconds).
const LONG_LIFETIME_SECONDS = String(24 * 60 * 60);

export type SyncLockResult<T> = { acquired: false } | { acquired: true; value: T };

export interface SyncLockOptions {
  /** Heartbeat period; injectable for tests. */
  heartbeatMs?: number;
  /** Extra connection-URL params for the lock client; tests use this to provoke idle recycling. */
  extraParams?: Record<string, string>;
  /** Test hook: receives the boolean `pg_advisory_unlock` returned. */
  onUnlock?: (released: boolean) => void;
}

/**
 * Runs `fn` while holding the iTop sync advisory lock. Returns
 * `{ acquired: false }` immediately (without running `fn`) when another
 * run — in this or any other process — holds it. `fn`'s errors propagate
 * after the lock has been released.
 */
export async function withSyncLock<T>(fn: () => Promise<T>, options: SyncLockOptions = {}): Promise<SyncLockResult<T>> {
  if (/pgbouncer=true/i.test(env.DATABASE_URL)) {
    logger.warn("iTop sync: DATABASE_URL has pgbouncer=true — session advisory locks do not work through a transaction-mode pooler");
  }
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const lockClient = createDedicatedClient({
    extraParams: {
      max_idle_connection_lifetime: LONG_LIFETIME_SECONDS,
      max_connection_lifetime: LONG_LIFETIME_SECONDS,
      ...options.extraParams,
    },
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    const rows = await lockClient.$queryRaw<
      Array<{ locked: boolean; pid: number }>
    >`SELECT pg_try_advisory_lock(hashtext(${ADVISORY_LOCK_KEY})) AS locked, pg_backend_pid() AS pid`;
    if (!rows[0]?.locked) return { acquired: false };
    const lockPid = rows[0].pid;

    let heartbeatBusy = false;
    timer = setInterval(() => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      void (async () => {
        try {
          const beat = await lockClient.$queryRaw<
            Array<{ pid: number; held: boolean }>
          >`SELECT pg_backend_pid() AS pid, EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted AND pid = ${lockPid}::int AND objid = (hashtext(${ADVISORY_LOCK_KEY}))::oid) AS held`;
          if (beat[0] && (beat[0].pid !== lockPid || !beat[0].held)) {
            logger.error(
              { lockPid, currentPid: beat[0].pid, held: beat[0].held },
              "iTop sync: the advisory lock session was lost mid-run — another sync could overlap until this run ends",
            );
          }
        } catch (err) {
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, "iTop sync: lock heartbeat failed");
        } finally {
          heartbeatBusy = false;
        }
      })();
    }, heartbeatMs);
    timer.unref();

    try {
      return { acquired: true, value: await fn() };
    } finally {
      clearInterval(timer);
      timer = undefined;
      try {
        const res = await lockClient.$queryRaw<
          Array<{ released: boolean }>
        >`SELECT pg_advisory_unlock(hashtext(${ADVISORY_LOCK_KEY})) AS released`;
        options.onUnlock?.(res[0]?.released ?? false);
        if (res[0]?.released === false) {
          logger.warn("iTop sync: advisory unlock returned false (the lock session changed during the run); disconnecting releases it");
        }
      } catch (err) {
        // Disconnecting below closes the session, which releases the lock anyway.
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "iTop sync: explicit unlock failed");
      }
    }
  } finally {
    if (timer) clearInterval(timer);
    await lockClient.$disconnect();
  }
}
