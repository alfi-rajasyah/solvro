import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ServiceMappingList } from "@/components/services/ServiceMappingList";
import { hasPermission, type AuthUser } from "@/lib/auth";

const user = (permissions: string[]): AuthUser => ({
  id: 1,
  username: "u",
  email: "u@example.com",
  role: "TAM",
  permissions,
});

// Mirrors the call sites (ProjectServices, CustomerDetail): picking existing
// services needs project:write, adding a catalogue entry needs admin ("*").
function render(u: AuthUser): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ServiceMappingList, {
        assignments: [],
        onSave: async () => undefined,
        canMutate: hasPermission(u, "project:write"),
        canCreateService: hasPermission(u, "*"),
        saving: false,
        title: "Services",
        description: "d",
      }),
    ),
  );
}

describe("ServiceMappingList add-service form", () => {
  it("is hidden for a project:write user who is not an admin", () => {
    expect(render(user(["project:read", "project:write"]))).not.toContain("Add service");
  });

  it("is shown for an admin", () => {
    expect(render(user(["*"]))).toContain("Add service");
  });
});
