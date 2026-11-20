import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION_COLOR,
  SECTION_COLOR_PRESETS,
  resolveSectionColor,
  resolveSectionColors,
} from "./palette";

describe("resolveSectionColor", () => {
  const sections = [
    { id: 10, position: 0, color: DEFAULT_SECTION_COLOR },
    { id: 11, position: 1, color: "#123456" },
    { id: 12, position: 2, color: DEFAULT_SECTION_COLOR.toUpperCase() },
  ];
  const colors = resolveSectionColors(sections);

  it("gives an uncustomized section its board-order preset, not the slate sentinel", () => {
    expect(resolveSectionColor(colors, sections[0])).toBe(SECTION_COLOR_PRESETS[0]);
    expect(resolveSectionColor(colors, sections[2])).toBe(SECTION_COLOR_PRESETS[2]);
  });

  it("keeps an explicit pick", () => {
    expect(resolveSectionColor(colors, sections[1])).toBe("#123456");
  });

  it("falls back to the stored colour, then the neutral default, for an unknown section", () => {
    expect(resolveSectionColor(colors, { id: 99, color: "#abcdef" })).toBe("#abcdef");
    expect(resolveSectionColor(colors, { id: 99, color: "  " })).toBe(DEFAULT_SECTION_COLOR);
    expect(resolveSectionColor(colors, { id: 99 })).toBe(DEFAULT_SECTION_COLOR);
  });
});
