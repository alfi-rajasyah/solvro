import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { fieldErrorsFrom, formErrorMessage } from "@/lib/formErrors";

const validation = (fieldErrors: Record<string, string[]>, formErrors: string[] = []) =>
  new ApiError(400, "Invalid request", {
    error: "Invalid request",
    code: "validation_error",
    details: { formErrors, fieldErrors },
  });

describe("fieldErrorsFrom", () => {
  it("returns the first message per field of a validation error", () => {
    const err = validation({
      title: ["String must contain at least 1 character(s)", "second"],
      dueDate: ["A milestone requires a due date"],
    });
    expect(fieldErrorsFrom(err)).toEqual({
      title: "String must contain at least 1 character(s)",
      dueDate: "A milestone requires a due date",
    });
  });

  it("ignores empty, malformed and non-string entries", () => {
    const err = new ApiError(400, "Invalid request", {
      code: "validation_error",
      details: { fieldErrors: { a: [], b: "nope", c: [42, "ok"], d: undefined } },
    });
    expect(fieldErrorsFrom(err)).toEqual({ c: "ok" });
  });

  it("is empty for anything that is not a validation error", () => {
    expect(fieldErrorsFrom(new ApiError(409, "Conflict", { code: "stale_write" }))).toEqual({});
    expect(fieldErrorsFrom(new ApiError(500, "Boom", null))).toEqual({});
    expect(fieldErrorsFrom(new ApiError(400, "x", { code: "validation_error" }))).toEqual({});
    expect(fieldErrorsFrom(new Error("network"))).toEqual({});
    expect(fieldErrorsFrom(undefined)).toEqual({});
  });
});

describe("formErrorMessage", () => {
  it("is the API message when there are no field errors", () => {
    expect(formErrorMessage(new ApiError(404, "Project not found", { code: "not_found" }), "Save failed.")).toBe(
      "Project not found",
    );
  });

  it("is the fallback for a non-API error", () => {
    expect(formErrorMessage(new TypeError("Failed to fetch"), "Save failed.")).toBe("Save failed.");
  });

  it("leaves fields the form renders out of the alert", () => {
    const err = validation({ title: ["Required"] });
    expect(formErrorMessage(err, "Save failed.", ["title"])).toBe("Invalid request");
  });

  it("lists fields the form does not render as Field: message", () => {
    const err = validation({ title: ["Required"], assignedToId: ["Expected number"], labelIds: ["Too many"] });
    expect(formErrorMessage(err, "Save failed.", ["title"])).toBe(
      "Invalid request — Assigned to id: Expected number; Label ids: Too many",
    );
  });

  it("lists every message for fields that are not on screen, none dropped", () => {
    // e.g. a TAM picker hidden for this user, and two date fields with no inline slot.
    const err = validation({
      tamId: ["Expected number"],
      startDate: ["Invalid date"],
      dueDate: ["A milestone requires a due date"],
    });
    expect(formErrorMessage(err, "Save failed.", ["name"])).toBe(
      "Invalid request — Tam id: Expected number; Start date: Invalid date; Due date: A milestone requires a due date",
    );
  });

  it("includes form-level messages", () => {
    const err = validation({}, ["Provide at least one field"]);
    expect(formErrorMessage(err, "Save failed.")).toBe("Invalid request — Provide at least one field");
  });
});
