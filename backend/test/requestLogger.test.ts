// The request logger must never write a bearer JWT, a webhook secret, a cookie
// or a guest-link token (http/requestLogger.ts, wired in src/app.ts).
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { pino } from "pino";
import { createApp } from "../src/app.js";
import { redactShareTokens } from "../src/http/requestLogger.js";
import { createUserWithRole, seedRoles } from "./testAuth.js";

beforeAll(async () => {
  await seedRoles();
});

function capturingApp() {
  const lines: string[] = [];
  const logger = pino({ level: "info" }, { write: (chunk: string) => void lines.push(chunk) });
  return { app: createApp({ logger }), lines };
}

type LoggedEntry = {
  req: {
    url: string;
    method: string;
    headers: Record<string, string>;
    remoteAddress?: string;
    remotePort?: number;
  };
  res: { statusCode: number };
  clientIp?: string;
};

describe("redactShareTokens", () => {
  it("replaces the token segment of page and API paths", () => {
    expect(redactShareTokens("/public/share/abc_DEF-123?x=1")).toBe("/public/share/[redacted]?x=1");
    expect(redactShareTokens("https://solvro.example/share/abc_DEF-123")).toBe(
      "https://solvro.example/share/[redacted]",
    );
    expect(redactShareTokens("/projects/4/share-links/9")).toBe("/projects/4/share-links/9");
  });
});

describe("request logging", () => {
  it("a /share/<token> path is logged without its token (url and referer)", async () => {
    const { app, lines } = capturingApp();
    const token = "abcDEF123_token-that-must-not-leak";
    // No guest route exists yet: the 404 line still logs url + referer.
    await request(app)
      .get(`/public/share/${token}`)
      .set("Referer", `https://solvro.example/share/${token}`);

    const logged = lines.join("");
    expect(logged).toContain("/public/share/[redacted]");
    expect(logged).toContain("https://solvro.example/share/[redacted]");
    expect(logged).not.toContain(token);
  });

  it("keeps remoteAddress/remotePort and adds clientIp to every line", async () => {
    const { app, lines } = capturingApp();
    await request(app).get("/health");
    const entry = JSON.parse(lines.at(-1)!) as LoggedEntry;
    expect(entry.req.method).toBe("GET");
    expect(entry.req.url).toBe("/health");
    expect(entry.req.remoteAddress).toMatch(/127\.0\.0\.1|::1/);
    expect(typeof entry.req.remotePort).toBe("number");
    expect(entry.clientIp).toMatch(/127\.0\.0\.1|::1/);
  });

  it("an authed request does not log its bearer token, but still logs the request", async () => {
    const { app, lines } = capturingApp();
    const tam = await createUserWithRole("TAM");
    const res = await request(app).get("/projects").set("Authorization", `Bearer ${tam.token}`);
    expect(res.status).toBe(200);

    const logged = lines.join("");
    expect(logged).not.toContain(tam.token);
    expect(logged).not.toContain("Bearer ");
    const entry = JSON.parse(lines.at(-1)!) as LoggedEntry;
    expect(entry.req.method).toBe("GET");
    expect(entry.req.url).toBe("/projects");
    expect(entry.req.headers.authorization).toBe("[redacted]");
    expect(entry.res.statusCode).toBe(200);
  });

  it("masks the webhook secret and cookies, and keeps ordinary headers", async () => {
    const { app, lines } = capturingApp();
    const secret = "test-webhook-secret-must-not-be-logged";
    await request(app)
      .post("/webhook/itop")
      .set("X-Solvro-Webhook-Secret", secret)
      .set("Cookie", `session=${secret}`)
      .set("X-Request-Source", "test")
      .send({});

    const logged = lines.join("");
    expect(logged).not.toContain(secret);
    const entry = JSON.parse(lines.at(-1)!) as LoggedEntry;
    expect(entry.req.headers["x-solvro-webhook-secret"]).toBe("[redacted]");
    expect(entry.req.headers.cookie).toBe("[redacted]");
    expect(entry.req.headers["x-request-source"]).toBe("test");
  });
});
