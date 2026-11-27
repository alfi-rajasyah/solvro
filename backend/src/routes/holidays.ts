import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../http/auth.js";
import { validate } from "../http/validate.js";
import { getHolidaysForYear } from "../lib/holidays.js";

// getHolidaysForYear (the date-holidays("ID") instance + its per-year cache)
// moved to lib/holidays.ts (opportunity-flow-redesign, D8) so
// lib/workingDays.ts's `workingDaysBetween` can import the same holiday
// source this route already served — see that file's header comment.

const querySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(1970)
    .max(2100)
    // A function, so the year is read per request, not once at module load
    // (docs/ISSUES.md ISS-209).
    .default(() => new Date().getFullYear()),
});

export const holidaysRouter = Router();

holidaysRouter.use(requireAuth);

holidaysRouter.get("/", validate("query", querySchema), (req, res) => {
  const { year } = req.query as unknown as z.infer<typeof querySchema>;
  res.json(getHolidaysForYear(year));
});
