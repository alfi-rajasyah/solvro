// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ProjectList } from "@/pages/views/ProjectList";

const apiRequest = vi.fn();
let permissions: string[] = [];

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({ user: { id: 1, username: "a", email: "a@x.test", role: "TAM", permissions } }),
  };
});
vi.mock("@/pages/ProjectDetail", () => ({
  useProjectContext: () => ({ project: { id: 1, name: "P" } }),
}));

const SECTIONS = [
  { id: 1, projectId: 1, name: "Alpha", position: 0, color: "#888888" },
  { id: 2, projectId: 1, name: "Beta", position: 1, color: "#888888" },
];
const TASK = {
  id: 10, projectId: 1, title: "A task", description: null, status: "TODO", priority: "MEDIUM",
  position: 0, parentTaskId: null, sectionId: 1, section: SECTIONS[0], epicId: null,
  assignedToId: null, assignee: null, startDate: null, dueDate: null, labels: [],
  updatedAt: "2026-11-01T10:00:00.000Z",
};

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation((path: string) => {
    if (path === "/projects/1/tasks") return Promise.resolve([TASK]);
    if (path === "/projects/1/sections") return Promise.resolve(SECTIONS);
    return Promise.resolve([]);
  });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("ProjectList permission gates", () => {
  it("shows task actions but no section actions to a task:write-only user (ISS-062)", async () => {
    permissions = ["project:read", "task:read", "task:write"];
    renderList();
    await screen.findAllByText("A task");
    expect(screen.getAllByRole("button", { name: /Add task/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Reorder sections" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();
    expect(screen.queryByTitle("Rename section")).toBeNull();
    expect(screen.queryByTitle("Delete section")).toBeNull();
    expect(screen.queryByRole("button", { name: "Duplicate section" })).toBeNull();
  });

  it("shows section actions to a project:write user", async () => {
    permissions = ["project:read", "project:write", "task:read", "task:write"];
    renderList();
    await screen.findAllByText("A task");
    expect(screen.getByRole("button", { name: "Reorder sections" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add section" })).toBeTruthy();
    expect(screen.getAllByTitle("Rename section").length).toBeGreaterThan(0);
  });
});
