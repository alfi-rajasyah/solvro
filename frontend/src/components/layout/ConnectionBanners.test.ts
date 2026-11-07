import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ConnectionAnnouncer,
  LiveAnnouncement,
  OfflineBanner,
  OfflineNotice,
  UpdateBanner,
  UpdateNotice,
} from "@/components/layout/ConnectionBanners";

const SHIFT = "md:ml-sidebar";

describe("OfflineNotice", () => {
  const html = renderToStaticMarkup(createElement(OfflineNotice, { shift: SHIFT }));

  it("states the consequence and uses the warning tone, not the error tone", () => {
    expect(html).toContain("You are offline. Changes cannot be saved until the connection returns.");
    expect(html).toContain("bg-chip-amber-bg");
    expect(html).not.toContain("error");
  });

  it("is shifted past the fixed sidebar and left to the live region to announce", () => {
    expect(html).toContain(SHIFT);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="status"');
  });
});

describe("UpdateNotice", () => {
  const html = renderToStaticMarkup(
    createElement(UpdateNotice, { shift: SHIFT, onReload: () => {}, onDismiss: () => {} }),
  );

  it("offers Reload and a labelled dismiss, shifted past the sidebar", () => {
    expect(html).toContain("A new version of Solvro is available.");
    expect(html).toContain(">Reload</button>");
    expect(html).toContain('aria-label="Dismiss update notice"');
    expect(html).toContain(SHIFT);
    expect(html).not.toContain('role="status"');
  });
});

describe("connected banners on first render", () => {
  it("render nothing while online and no update is pending", () => {
    expect(renderToStaticMarkup(createElement(OfflineBanner, { shift: SHIFT }))).toBe("");
    expect(renderToStaticMarkup(createElement(UpdateBanner, { shift: SHIFT }))).toBe("");
  });
});

describe("live announcements", () => {
  it("renders an empty but mounted sr-only status region when idle", () => {
    expect(renderToStaticMarkup(createElement(ConnectionAnnouncer))).toBe('<div role="status" class="sr-only"></div>');
  });

  it("carries the message text when there is one", () => {
    const html = renderToStaticMarkup(createElement(LiveAnnouncement, { message: "You are offline." }));
    expect(html).toBe('<div role="status" class="sr-only">You are offline.</div>');
  });
});
