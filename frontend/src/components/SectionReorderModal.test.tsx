// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SectionReorderModal } from "@/components/SectionReorderModal";
import { queryKeys, type Section } from "@/lib/queries";

const apiRequest = vi.fn();
let permissions = ["project:write"];
// The real Sortable's pointer/keyboard sensors do not run in jsdom, so the
// stub exposes the same callbacks the modal wires up as plain buttons.
let sortableProps: {
  value: Section[];
  onDragStart?: () => void;
  onValueCommit?: (v: Section[], meta: { previousValue: Section[]; activeIndex: number; overIndex: number }) => void;
};

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
vi.mock("@/components/reui/sortable", () => ({
  Sortable: (props: typeof sortableProps & { children: React.ReactNode }) => {
    sortableProps = props;
    return <div>{props.children}</div>;
  },
  SortableItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SortableItemHandle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const sec = (id: number, name: string, position: number): Section =>
  ({ id, projectId: 1, name, position, color: "#888888" }) as Section;
const SERVER = [sec(1, "Alpha", 0), sec(2, "Beta", 1), sec(3, "Gamma", 2)];

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(queryKeys.projectSections(1), SERVER);
  const utils = render(
    <QueryClientProvider client={qc}>
      <SectionReorderModal projectId={1} open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...utils, onClose, qc };
}

beforeEach(() => {
  apiRequest.mockReset();
  permissions = ["project:write"];
});
afterEach(cleanup);

describe("SectionReorderModal", () => {
  it("renders nothing without project:write (ISS-111)", () => {
    permissions = ["project:read"];
    renderModal();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes from the header X even when a drag never ended (ISS-113)", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    act(() => sortableProps.onDragStart?.());
    // Escape is still held back mid-drag.
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("re-seeds its order from the server after a failed save (ISS-192)", async () => {
    apiRequest.mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") return Promise.reject(new Error("save failed"));
      if (path === "/projects/1/sections") return Promise.resolve(SERVER);
      return Promise.resolve(null);
    });
    renderModal();
    // Local order after a drag that moved Alpha to the end.
    const dragged = [SERVER[1], SERVER[2], SERVER[0]];
    act(() => {
      sortableProps.onValueCommit?.(dragged, { previousValue: SERVER, activeIndex: 0, overIndex: 2 });
    });
    await screen.findByRole("alert");
    await waitFor(() => {
      expect(sortableProps.value.map((s) => s.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    });
  });

  it("keeps following the cache after a failure, so a later move shows (ISS-192)", async () => {
    apiRequest.mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") return Promise.reject(new Error("save failed"));
      if (path === "/projects/1/sections") return Promise.resolve(SERVER);
      return Promise.resolve(null);
    });
    const { qc } = renderModal();
    act(() => {
      sortableProps.onValueCommit?.([SERVER[1], SERVER[2], SERVER[0]], {
        previousValue: SERVER,
        activeIndex: 0,
        overIndex: 2,
      });
    });
    await screen.findByRole("alert");
    // A second drop's optimistic write lands in the cache.
    act(() => {
      qc.setQueryData(queryKeys.projectSections(1), [sec(2, "Beta", 0), sec(1, "Alpha", 1), sec(3, "Gamma", 2)]);
    });
    await waitFor(() => {
      expect(sortableProps.value.map((s) => s.name)).toEqual(["Beta", "Alpha", "Gamma"]);
    });
  });
});
