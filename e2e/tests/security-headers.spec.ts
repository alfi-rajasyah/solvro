import { test, expect, loginViaUi } from "../fixtures/test";

// Browser security headers sent by the frontend's nginx
// (frontend/security-headers.conf, included from frontend/nginx.conf;
// docs/archive/plans/application-review-2026-10-22.md, F-06 / B-06).
//
// Like pwa.spec.ts this needs the built stack (:8080): the vite dev server
// sends none of these headers. Headers are identical for both viewports, so
// the file runs in the desktop project only.

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Headers do not depend on the viewport");
});

function expectAppHeaders(headers: Record<string, string>, path: string) {
  const csp = headers["content-security-policy"] ?? "";
  expect(csp, `${path}: CSP`).toContain("default-src 'self'");
  expect(csp, `${path}: CSP`).toContain("object-src 'none'");
  expect(csp, `${path}: CSP`).toContain("frame-ancestors 'none'");
  expect(csp, `${path}: CSP`).toContain("base-uri 'self'");
  // The service worker fetches and caches Google Fonts itself
  // (vite.config.ts runtimeCaching), and a worker's fetch() falls under
  // connect-src — without these two hosts the fonts break once it takes over.
  expect(csp, `${path}: CSP`).toMatch(/connect-src [^;]*https:\/\/fonts\.googleapis\.com/);
  expect(csp, `${path}: CSP`).toMatch(/connect-src [^;]*https:\/\/fonts\.gstatic\.com/);
  expect(headers["x-content-type-options"], `${path}: nosniff`).toBe("nosniff");
  expect(headers["x-frame-options"], `${path}: frame options`).toBe("DENY");
  expect(headers["permissions-policy"], `${path}: permissions`).toContain("camera=()");
}

test.describe("security headers", () => {
  test("app pages, the service worker and static files carry the headers", async ({ request }) => {
    const shell = await request.get("/");
    const asset = /src="(\/assets\/[^"]+\.js)"/.exec(await shell.text())?.[1];
    expect(asset, "index.html references a hashed bundle").toBeTruthy();

    for (const path of ["/", "/login", "/projects/1", "/sw.js", "/manifest.webmanifest", asset!]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      const headers = res.headers();
      expectAppHeaders(headers, path);
      expect(headers["referrer-policy"], `${path}: referrer`).toBe("strict-origin-when-cross-origin");
    }
  });

  test("the guest-link page keeps no-referrer and noindex next to the CSP", async ({ request }) => {
    const res = await request.get("/share/not-a-real-token");
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expectAppHeaders(headers, "/share/");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-robots-tag"]).toBe("noindex");
    expect(headers["cache-control"]).toBe("no-store");
  });

  test("API responses keep the backend's single CSP header", async ({ request }) => {
    const res = await request.get("/api/health");
    const csp = res.headersArray().filter((h) => h.name.toLowerCase() === "content-security-policy");
    expect(csp).toHaveLength(1);
    expect(csp[0].value).not.toContain("fonts.googleapis.com");
  });

  test("signing in and opening the main pages reports no CSP violation", async ({ page, seededProject }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        console.log(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    page.on("console", (m) => {
      const text = m.text();
      if (text.startsWith("CSP-VIOLATION") || text.includes("Content Security Policy")) violations.push(text);
    });

    await loginViaUi(page);
    for (const path of [
      "/overview",
      "/projects",
      `/projects/${seededProject.projectId}/kanban`,
      `/projects/${seededProject.projectId}/gantt`,
      "/pipeline",
      "/admin",
    ]) {
      await page.goto(path, { waitUntil: "networkidle" });
    }
    // A reload puts the page under the service worker. Violations inside the
    // worker itself (its Google Fonts fetches) do not reach the page console;
    // the connect-src assertions in the first test guard those.
    await page.reload({ waitUntil: "networkidle" });

    expect(violations).toEqual([]);
  });
});
