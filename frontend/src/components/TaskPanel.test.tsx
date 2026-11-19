// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { TaskPanel } from "@/components/TaskPanel";

const apiRequest = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({ user: { id: 1, username: "a", email: "a@x.test", role: "ADMIN", permissions: ["*"] } }),
  };
});

const TASK = {
  id: 7,
  projectId: 1,
  title: "Parent task",
  description: null,
  status: "TODO",
  priority: "MEDIUM",
  position: 0,
  parentTaskId: null,
  sectionId: null,
  section: null,
  epicId: null,
  assigneeId: null,
  startDate: null,
  dueDate: null,
  labels: [],
  updatedAt: "2026-11-01T10:00:00.000Z",
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TaskPanel projectId={1} taskId={7} onOpenTask={vi.fn()} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequest.mockReset();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("TaskPanel load failure (ISS-067)", () => {
  it("shows an error with a retry instead of loading forever, and retries the fetch", async () => {
    const user = userEvent.setup();
    let calls = 0;
    apiRequest.mockImplementation((path: string) => {
      if (path === "/projects/1/tasks") {
        calls += 1;
        return calls === 1 ? Promise.reject(new ApiError(500, "boom", null)) : Promise.resolve([TASK]);
      }
      return Promise.reject(new ApiError(500, "boom", null));
    });
    renderPanel();
    expect(await screen.findByText("Could not load the task.")).toBeTruthy();
    expect(screen.queryByText("Loading task…")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Parent task")).toBeTruthy();
  });
});

describe("TaskPanel header-menu failure (ISS-061)", () => {
  it("renders the duplicate error outside the scrolling content", async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/projects/1/tasks") return Promise.resolve([TASK]);
      if (opts?.method === "POST" && path.includes("duplicate")) {
        return Promise.reject(new ApiError(403, "Duplicate refused", null));
      }
      return Promise.reject(new ApiError(500, "boom", null));
    });
    renderPanel();
    await screen.findByText("Parent task");
    await user.click(screen.getByRole("button", { name: "Task options" }));
    await user.click(await screen.findByRole("button", { name: /Duplicate/ }));
    const message = await screen.findByText("Duplicate refused");
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(message.closest(".overflow-y-auto")).toBeNull();
  });
});
