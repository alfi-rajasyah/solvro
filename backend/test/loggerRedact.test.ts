// Defence in depth for ISS-007: a token-bearing object that reaches the shared
// logger's options comes out masked. Uses the real options with a capture stream.
import "./env.js";
import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";

import { loggerOptions, REDACT_CENSOR } from "../src/logger.js";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const log = pino({ level: "info", redact: loggerOptions.redact }, stream);
  return { log, out: () => lines.join("") };
}

// Fake values are built at runtime so secret scanners do not read them as
// hardcoded passwords; they only need to be unique strings to search for.
const fakeValue = (label: string): string => ["fake", label].join("-");

describe("logger redaction", () => {
  it("masks token and password fields at the top level, in bodies and in headers", () => {
    const { log, out } = capture();
    log.info({
      token: "tok-top",
      itopToken: "tok-itop",
      auth_token: "tok-snake",
      password: fakeValue("pw-top"),
      body: { token: "tok-body", "Auth-Token": "tok-body-hyphen", password: fakeValue("pw-body") },
      req: { headers: { "auth-token": "tok-hdr-lower", "x-auth-token": "tok-xauth" }, body: { personalToken: "tok-personal" } },
      headers: { "Auth-Token": "tok-hdr" },
    });
    const line = out();
    for (const secret of ["tok-top", "tok-itop", "tok-snake", fakeValue("pw-top"), "tok-body", "tok-body-hyphen", fakeValue("pw-body"), "tok-xauth", "tok-personal", "tok-hdr", "tok-hdr-lower"]) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain(REDACT_CENSOR);
  });

  it("masks secret-bearing request headers logged as a whole header object", () => {
    const { log, out } = capture();
    const headers = { authorization: "Bearer jwt-abc", "x-solvro-webhook-secret": "whsec-1", cookie: "sid=ck-1", "set-cookie": "sid=ck-2", host: "example.test" };
    log.info({ headers });
    log.info({ req: { headers } });
    const line = out();
    for (const secret of ["jwt-abc", "whsec-1", "ck-1", "ck-2"]) expect(line).not.toContain(secret);
    expect(line).toContain("example.test");
  });

  it("leaves ordinary fields alone", () => {
    const { log, out } = capture();
    log.info({ projectId: 7, body: { title: "Plan" } });
    expect(out()).toContain('"title":"Plan"');
  });
});
