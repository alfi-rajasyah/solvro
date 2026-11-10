import { describe, expect, it } from "vitest";
import { parseStatusParam, serialiseStatusParam } from "@/lib/projectStatusFilter";

describe("parseStatusParam", () => {
  it("reads a comma-separated list", () => {
    expect(parseStatusParam("ACTIVE,ON_HOLD")).toEqual(["ACTIVE", "ON_HOLD"]);
  });
  it("drops unknown values and duplicates silently", () => {
    expect(parseStatusParam("ACTIVE,BOGUS,active,ACTIVE,,")).toEqual(["ACTIVE"]);
  });
  it("returns no filter for missing or all-unknown input", () => {
    expect(parseStatusParam(null)).toEqual([]);
    expect(parseStatusParam("")).toEqual([]);
    expect(parseStatusParam("NOPE")).toEqual([]);
  });
});

describe("serialiseStatusParam", () => {
  it("writes canonical workflow order", () => {
    expect(serialiseStatusParam(["ON_HOLD", "ACTIVE"])).toBe("ACTIVE,ON_HOLD");
  });
  it("returns null (remove the parameter) when nothing valid is selected", () => {
    expect(serialiseStatusParam([])).toBeNull();
    expect(serialiseStatusParam(["BOGUS"])).toBeNull();
  });
  it("round-trips", () => {
    expect(serialiseStatusParam(parseStatusParam("CANCELLED,PLANNING"))).toBe("PLANNING,CANCELLED");
  });
});
