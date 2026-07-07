import { execSync } from "node:child_process";

// Runs once before the whole test run (vitest `globalSetup`). Applies every
// migration (including 20260707013113_add_task_position) to the disposable
// Postgres container so the schema matches prisma/schema.prisma exactly —
// same as a fresh deploy would.
export default async function setup() {
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://solvro:test@localhost:5433/solvro?schema=public";
  execSync("npx prisma migrate deploy", {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
