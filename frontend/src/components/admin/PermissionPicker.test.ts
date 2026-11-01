import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PermissionPicker } from "@/components/admin/PermissionPicker";
import { roleSaveErrorMessage } from "@/components/admin/roleErrors";
import { ApiError } from "@/lib/api";

const render = (value: string[]) =>
  renderToStaticMarkup(createElement(PermissionPicker, { value, onChange: () => {} }));

describe("PermissionPicker", () => {
  it("shows a value missing from the catalogue as a ticked, labelled row", () => {
    const html = render(["project:read", "report:read"]);
    expect(html).toContain("report:read");
    expect(html).toContain("no longer in the catalogue");
    // The stale row is checked (so it can be unticked).
    const row = html.slice(html.indexOf("report:read") - 200, html.indexOf("report:read"));
    expect(row).toContain('checked=""');
  });

  it("adds no extra row when every value is in the catalogue", () => {
    expect(render(["project:read", "task:write"])).not.toContain("no longer in the catalogue");
  });
});

describe("roleSaveErrorMessage", () => {
  const validation = new ApiError(400, "Invalid request", {
    error: "Invalid request",
    code: "validation_error",
    details: {
      formErrors: [],
      fieldErrors: { permissions: ['Unknown permission "report:read"; expected one of: *'] },
    },
  });

  it("names the rejected permission from the validation details", () => {
    expect(roleSaveErrorMessage(validation, "Could not save role.")).toContain("report:read");
  });

  it("falls back to the API message, then to the generic text", () => {
    expect(roleSaveErrorMessage(new ApiError(409, "Role exists", { code: "conflict" }), "x")).toBe("Role exists");
    expect(roleSaveErrorMessage(new Error("boom"), "Could not save role.")).toBe("Could not save role.");
  });
});
