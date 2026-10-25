import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NotFound } from "@/pages/NotFound";

function render(url: string): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [url] }, createElement(NotFound)),
  );
}

describe("NotFound", () => {
  it("says the page was not found and names the attempted path", () => {
    const html = render("/no-such-page");
    expect(html).toContain("Page not found");
    expect(html).toContain("/no-such-page");
  });

  it("keeps the query string in the shown address", () => {
    expect(render("/projects/12/board?task=3")).toContain("/projects/12/board?task=3");
  });

  it("escapes the path rather than injecting markup", () => {
    const html = render("/%3Cimg%20src=x%3E");
    expect(html).not.toContain("<img");
  });

  it("links back to Overview", () => {
    expect(render("/x")).toMatch(/<a [^>]*href="\/overview"[^>]*>[\s\S]*Go to Overview/);
  });
});
