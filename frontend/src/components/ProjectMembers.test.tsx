// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectMembersButton } from "@/components/ProjectMembers";
import type { ProjectDetail } from "@/lib/queries";

vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  return { ...actual, useProjectMembers: () => ({ data: [] }), useUsers: () => ({ data: [] }) };
});
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, useAuth: () => ({ user: { id: 1, username: "a", email: "a@x.test", role: "TAM", permissions: [] } }) };
});

const base = { id: 1, tam: { id: 1, username: "tam", email: "t@x.test" } };
const mount = (sa: unknown) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ProjectMembersButton project={{ ...base, sa } as unknown as ProjectDetail} canManage={false} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("ProjectMembersButton", () => {
  it("says the SA is not counted when the project has one", () => {
    mount({ id: 2, username: "sa", email: "s@x.test" });
    const btn = screen.getByTestId("project-members-button");
    expect(btn.getAttribute("title")).toContain("The SA is not counted");
    expect(btn.getAttribute("aria-label")).toContain("The SA is not counted");
  });
  it("shows the SA sentence in the dialog, visible to touch and keyboard users", async () => {
    mount({ id: 2, username: "sa", email: "s@x.test" });
    await userEvent.setup().click(screen.getByTestId("project-members-button"));
    expect(screen.getByTestId("project-members-sa-note").textContent).toContain("not added as a member or counted on the button");
  });
  it("omits the dialog sentence without an SA", async () => {
    mount(null);
    await userEvent.setup().click(screen.getByTestId("project-members-button"));
    expect(screen.queryByTestId("project-members-sa-note")).toBeNull();
  });
  it("keeps the plain title without an SA", () => {
    mount(null);
    expect(screen.getByTestId("project-members-button").getAttribute("title")).toBe("Project members");
  });
});
