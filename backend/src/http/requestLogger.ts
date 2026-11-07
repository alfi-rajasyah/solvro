import type { IncomingMessage } from "node:http";
import { stdSerializers, type Logger } from "pino";
import { pinoHttp } from "pino-http";

// Request logging with secrets scrubbed. Three things must never reach a log:
//  - the Authorization header (a bearer JWT, valid for JWT_EXPIRES_IN);
//  - any other secret-bearing header: the iTop webhook secret
//    (X-Solvro-Webhook-Secret) and cookies;
//  - a guest-link token (GET /public/share/<token>, and the page URL
//    /share/<token> that shows up in a Referer) — anyone reading the logs
//    could otherwise open the link;
//  - a search query string (GET /search?q=...) — it carries customer names
//    and ticket text typed by the user
//    (docs/archive/plans/application-review-2026-10-22.md, N-04).

const SHARE_TOKEN_IN_PATH = /(\/share\/)[^/?#\s"']+/gi;

// `/search?...` under any prefix (`/api/search?q=`, a Referer page URL).
const SEARCH_QUERY_IN_URL = /(\/search\/?)\?[^\s"'#]*/gi;
// Express serves `/search/` too (non-strict routing).
const SEARCH_PATH_WITH_QUERY = /\/search\/?\?/i;

/** Header names (lower-case, as pino's serializer emits them) whose value is masked. */
const SECRET_HEADERS = ["authorization", "x-solvro-webhook-secret", "cookie", "set-cookie"] as const;

/** Replaces the token segment of any `/share/<token>` (page or API path). */
export function redactShareTokens(text: string): string {
  return text.replace(SHARE_TOKEN_IN_PATH, "$1[redacted]");
}

/** Replaces the whole query string of any `/search?...` URL. */
export function redactSearchQueries(text: string): string {
  return text.replace(SEARCH_QUERY_IN_URL, "$1?[redacted]");
}

/** Share-token and search-query redaction for a logged URL or Referer. */
function redactUrl(text: string): string {
  return redactSearchQueries(redactShareTokens(text));
}

type SerializedReq = ReturnType<typeof stdSerializers.req>;

/**
 * pino-http hands a custom `serializers.req` the request ALREADY run through
 * pino's standard serializer (id, method, url, headers, remoteAddress, …), so
 * this only copies that object and redacts on the copy — serializing again
 * would find no socket and drop remoteAddress/remotePort from every line.
 */
export function redactSerializedRequest(s: SerializedReq): SerializedReq {
  const headers = { ...s.headers } as Record<string, unknown>;
  for (const name of SECRET_HEADERS) {
    if (headers[name] !== undefined) headers[name] = "[redacted]";
  }
  for (const name of ["referer", "referrer"]) {
    const v = headers[name];
    if (typeof v === "string") headers[name] = redactUrl(v);
  }
  const url = String(s.url ?? "");
  const out = { ...s, url: redactUrl(url), headers } as Omit<SerializedReq, "query"> & { query?: unknown };
  // pino-http also emits the parsed `query` object; mask it with the URL.
  if (out.query !== undefined && SEARCH_PATH_WITH_QUERY.test(url)) out.query = "[redacted]";
  return out as SerializedReq;
}

export function createRequestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    serializers: { req: redactSerializedRequest },
    // The address `req.ip` resolves to under TRUST_PROXY — what the public
    // share rate limiter keys on. `remoteAddress` alone is the proxy behind nginx.
    customProps: (req) => ({ clientIp: (req as IncomingMessage & { ip?: string }).ip }),
  });
}
