// Names of the roles `prisma/seed.ts` creates. The seed cannot be imported
// from here (the production image carries `dist/` and `prisma/` but no `src/`,
// and tsc's rootDir is `src`), so the names live in both places and
// test/adminRoles.test.ts fails if they drift.
export const SEEDED_ROLE_NAMES: ReadonlySet<string> = new Set(["ADMIN", "SA", "SALES", "TAM", "STAKEHOLDER", "PENDING"]);
