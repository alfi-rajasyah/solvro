import { describe, expect, it } from "vitest";
import { parseSectionId, sectionNodeId } from "./adapter";

describe("parseSectionId", () => {
  it("round-trips sectionNodeId", () => {
    expect(parseSectionId(sectionNodeId(7))).toBe(7);
    expect(parseSectionId(sectionNodeId(null))).toBeNull();
  });
  it("returns undefined for non-section ids", () => {
    expect(parseSectionId("task-3")).toBeUndefined();
    expect(parseSectionId("section-rollup-3")).toBeUndefined();
    expect(parseSectionId("section-")).toBeUndefined();
  });
});
