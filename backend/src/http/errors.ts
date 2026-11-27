import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import { logger } from "../logger.js";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  /** For 429s: seconds until the caller may retry, sent as `Retry-After`. */
  retryAfterSec?: number;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: "Not found", code: "not_found", path: req.originalUrl });
};

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  if (typeof err !== "object" || err === null) return false;
  const { type, status } = err as { type?: unknown; status?: unknown };
  return (
    (type === "entity.parse.failed" && status === 400) ||
    (type === "entity.too.large" && status === 413)
  );
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.retryAfterSec !== undefined) {
      res.setHeader("Retry-After", String(err.retryAfterSec));
    }
    res
      .status(err.status)
      .json({ error: err.message, code: err.code, details: err.details });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      code: "validation_error",
      details: z.flattenError(err),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Record not found", code: "not_found" });
      return;
    }
    if (err.code === "P2002") {
      // Only the violated column list leaves the server — `err.meta` also
      // carries the Prisma model name and driver internals
      // (docs/archive/plans/application-review-2026-10-22.md, F-22).
      const target = err.meta?.target;
      const columns =
        Array.isArray(target) && target.every((t) => typeof t === "string")
          ? (target as string[])
          : undefined;
      res.status(409).json({
        error: "Unique constraint violated",
        code: "conflict",
        ...(columns ? { details: { target: columns } } : {}),
      });
      return;
    }
    if (err.code === "P2003") {
      // Safety net for a foreign-key violation no route pre-checked (an id in
      // a body that points at no row). Routes still pre-check where they can
      // give a field-specific code
      // (docs/archive/plans/application-review-2026-10-22.md, F-20, F-23).
      // Logged at warn: a violation a route did not pre-check may be a bug on
      // this side, not a bad request. Only Prisma's meta reaches the log.
      logger.warn({ meta: err.meta }, "foreign-key violation");
      res.status(400).json({
        error: "Referenced record does not exist",
        code: "invalid_reference",
      });
      return;
    }
  }

  // body-parser (express.json) failures: malformed JSON arrives as a
  // SyntaxError with status 400 / type "entity.parse.failed"; an oversized
  // body as status 413 / type "entity.too.large". Client errors, not 500s.
  if (isBodyParserError(err)) {
    logger.warn({ type: err.type }, "rejected request body");
    if (err.type === "entity.too.large") {
      res.status(413).json({ error: "Request body too large", code: "payload_too_large" });
    } else {
      res.status(400).json({ error: "Malformed JSON body", code: "invalid_json" });
    }
    return;
  }

  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error", code: "internal_error" });
};
