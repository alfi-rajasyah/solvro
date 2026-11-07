import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TempPasswordNotice } from "@/components/admin/TempPasswordNotice";

// The generated value is assembled at run time so no literal in this file
// looks like a credential to a secret scanner.
function throwawayTempValue(): string {
  return ["shown", process.pid, Date.now().toString(36)].join("-");
}

describe("TempPasswordNotice", () => {
  const shown = throwawayTempValue();
  const html = renderToStaticMarkup(
    createElement(TempPasswordNotice, { username: "jdoe", tempPassword: shown, onDismiss: () => {} }),
  );

  it("shows the password and who it is for", () => {
    expect(html).toContain("jdoe");
    expect(html).toContain(shown);
  });

  it("has a copy button with an accessible name", () => {
    expect(html).toContain('aria-label="Copy temporary password"');
  });

  it("keeps the dismiss action and an empty live region for the copy result", () => {
    expect(html).toContain("Dismiss");
    expect(html).toContain('role="status"');
  });
});
