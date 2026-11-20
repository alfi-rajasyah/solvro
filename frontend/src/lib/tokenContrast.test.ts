import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIGHT_PREVIEW_VARS } from "./themePreview";

// Pins WCAG AA (≥ 4.5:1, the small-text threshold — chips and buttons are
// 12–15px) for the colour pairs the app renders as text on a fill, in both
// themes. The values are parsed from index.css, so a token edit that drops a
// pair below AA fails here (docs/archive/plans/design-drift-fixes-spec.md, F-1).

const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

type Rgb = [number, number, number];

function block(selector: ":root" | ".dark"): Record<string, Rgb> {
  // Match the rule line itself (line start, own line) — comments in index.css
  // also mention `:root { … }`.
  const escaped = selector.replace(".", "\\.");
  const match = new RegExp(`^[ \\t]*${escaped} \\{[ \\t]*$`, "m").exec(css);
  if (!match) throw new Error(`${selector} block not found in index.css`);
  const start = match.index;
  const body = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, Rgb> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return tokens;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text token, fill token]
const PAIRS: [string, string][] = [
  ["emerald-text", "emerald-bg"],
  ["amber-text", "amber-bg"],
  ["rose-text", "rose-bg"],
  ["violet-text", "violet-bg"],
  ["on-primary", "primary"],
  ["on-warning", "warning-solid"],
  ["on-error", "error"],
  ["on-error-container", "error-container"],
  // The chip text tones double as the success / warning / danger text colours
  // on plain surfaces (e.g. Project Overview accents, Admin icons).
  ["emerald-text", "surface-container-lowest"],
  ["amber-text", "surface-container-lowest"],
  ["rose-text", "surface-container-lowest"],
];

describe.each([":root", ".dark"] as const)("token contrast in %s", (selector) => {
  const tokens = block(selector);

  it.each(PAIRS)("%s on %s is at least 4.5:1", (text, fill) => {
    expect(tokens[text], `--${text} missing`).toBeDefined();
    expect(tokens[fill], `--${fill} missing`).toBeDefined();
    expect(contrast(tokens[text], tokens[fill])).toBeGreaterThanOrEqual(4.5);
  });
});

// `text-primary` (links, counts, active labels) sits on the page and inside
// cards, panels and hovered rows, so it is pinned against every surface it is
// allowed on, in both themes. Tuning it for white alone left it at 3.8:1 on
// the hover tint (docs/archive/plans/antislop-audit-001-2026-11-10.md, item 1).
const PRIMARY_TEXT_SURFACES = [
  "background",
  "surface",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  // Hovered rows and tinted cards. Dark Elitery Green was #3aae51 (4.4986:1
  // here, ISS-090) until its green channel moved up one step.
  "surface-container-high",
];

describe.each([":root", ".dark"] as const)("primary as text in %s", (selector) => {
  const tokens = block(selector);

  it.each(PRIMARY_TEXT_SURFACES)("--primary on --%s is at least 4.5:1", (surface) => {
    expect(tokens[surface], `--${surface} missing`).toBeDefined();
    expect(contrast(tokens.primary, tokens[surface])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Settings light theme preview", () => {
  it("re-declares the same values as :root", () => {
    const light = block(":root");
    for (const [name, value] of Object.entries(LIGHT_PREVIEW_VARS)) {
      expect(value, name).toBe(light[name.slice(2)].join(" "));
    }
  });
});
