// Must be imported before anything that touches src/env.ts (which parses
// process.env at import time). Points the whole test run at the disposable
// Postgres container described in the task instructions.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://solvro:test@localhost:5433/solvro?schema=public";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-at-least-32-characters-long";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "8h";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";
