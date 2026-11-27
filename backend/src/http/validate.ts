import type { RequestHandler } from "express";
import { ZodError, type ZodType } from "zod";
import "../lib/zodConfig.js";

type Source = "body" | "query" | "params";

export function validate(source: Source, schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      // Re-assigning preserves type narrowing for downstream handlers.
      (req as unknown as Record<Source, unknown>)[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) return next(err);
      next(err);
    }
  };
}
