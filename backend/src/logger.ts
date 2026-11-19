import { pino } from "pino";
import { env } from "./env.js";

// Defence in depth: no code path logs these today, but a stray `log.info({ body })`
// must not leak a token. Matches the keys at the top level, under `req.body`
// and `body`, and in request/response headers (pino-http `req.headers`).
// (ISS-007) Keep in step with the header masking in http/requestLogger.ts.
const TOKEN_KEYS = [
  "token",
  "authToken",
  "auth_token",
  "Auth-Token",
  "auth-token",
  "x-auth-token",
  "itopToken",
  "itopTokenEnc",
  "appToken",
  "appTokenEnc",
  "personalToken",
  "password",
  "passwordHash",
  "secret",
];
const SCOPES = ["", "body.", "req.body.", "req.headers.", "res.headers.", "headers.", "err.config.", "data."];

export const REDACT_PATHS: string[] = SCOPES.flatMap((scope) =>
  TOKEN_KEYS.map((key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? `${scope}${key}` : `${scope}["${key}"]`)),
);

export const REDACT_CENSOR = "[redacted]";

export const loggerOptions = {
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino/file",
          options: { destination: 1 },
        },
      }
    : {}),
};

export const logger = pino(loggerOptions);
