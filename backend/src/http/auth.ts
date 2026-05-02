import type { RequestHandler } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { RoleName } from "@prisma/client";
import { env } from "../env.js";
import { HttpError } from "./errors.js";

export interface JwtPayload {
  sub: number;
  role: RoleName;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: JwtPayload;
  }
}

export function signToken(payload: JwtPayload): string {
  const opts: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string") {
    throw new HttpError(401, "invalid_token", "Invalid token");
  }
  const sub = decoded.sub;
  const role = (decoded as { role?: unknown }).role;
  if (typeof sub !== "number" || typeof role !== "string" || !(role in RoleName)) {
    throw new HttpError(401, "invalid_token", "Invalid token payload");
  }
  return { sub, role: role as RoleName };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "unauthenticated", "Missing bearer token"));
  }
  try {
    req.user = verifyToken(header.slice("Bearer ".length).trim());
    next();
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError(401, "unauthenticated", "Invalid or expired token"));
  }
};

export function requireRole(...roles: RoleName[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "unauthenticated", "Not authenticated"));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, "forbidden", "Insufficient role"));
    }
    next();
  };
}

// Strict admin gate — must run AFTER requireAuth. Rejects everything except
// JWTs whose role claim is exactly "ADMIN". Use as a router-level middleware
// for the entire /admin tree, not per-route.
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, "unauthenticated", "Not authenticated"));
  if (req.user.role !== "ADMIN") {
    return next(new HttpError(403, "forbidden", "Admin role required"));
  }
  next();
};
