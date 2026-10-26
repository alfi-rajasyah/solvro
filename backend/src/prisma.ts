import { PrismaClient } from "@prisma/client";

import { env } from "./env.js";

export const prisma = new PrismaClient({
  log: ["error", "warn"],
});

/**
 * A separate PrismaClient whose pool holds a single connection, for work that
 * must stay on one database session (a Postgres session advisory lock —
 * lib/itop/syncLock.ts). `extraParams` are appended to the connection URL
 * (e.g. `max_idle_connection_lifetime`). The caller owns the client and must
 * `$disconnect()` it. Everything else uses the shared `prisma` above.
 */
export function createDedicatedClient(options: { extraParams?: Record<string, string> } = {}): PrismaClient {
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set("connection_limit", "1");
  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return new PrismaClient({ datasources: { db: { url: url.toString() } }, log: ["error", "warn"] });
}
