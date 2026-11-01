// docs/archive/plans/application-review-2026-10-22.md, F-33: the production
// image must not run the API as root. A static check — CI's image build and
// e2e run are the real test that the app still starts as `node`.
import "./env.js";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOCKERFILE = new URL("../Dockerfile", import.meta.url).pathname;
const HAS_DOCKERFILE = existsSync(DOCKERFILE);

function stage(src: string, name: string): string[] {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^FROM\\s+\\S+\\s+AS\\s+${name}\\s*$`, "i").test(l));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^FROM\s/i.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

describe.skipIf(!HAS_DOCKERFILE)("backend/Dockerfile runtime stage (F-33)", () => {
  const src = HAS_DOCKERFILE ? readFileSync(DOCKERFILE, "utf8") : "";
  const runtime = stage(src, "runtime");

  it("drops to the unprivileged node user after the root-only build steps and before CMD", () => {
    const user = runtime.findIndex((l) => /^USER\s+node$/i.test(l));
    const cmd = runtime.findIndex((l) => /^CMD\s/i.test(l));
    const install = runtime.findIndex((l) => /npm ci --omit=dev/.test(l));
    const copyDist = runtime.findIndex((l) => /^COPY --from=build/.test(l));
    expect(runtime.length).toBeGreaterThan(0);
    expect(user).toBeGreaterThan(install);
    expect(user).toBeGreaterThan(copyDist);
    expect(user).toBeLessThan(cmd);
    expect(runtime.filter((l) => /^USER\s/i.test(l))).toEqual(["USER node"]);
  });

  it("leaves the dev stage alone", () => {
    expect(stage(src, "dev").some((l) => /^USER\s/i.test(l))).toBe(false);
  });
});
