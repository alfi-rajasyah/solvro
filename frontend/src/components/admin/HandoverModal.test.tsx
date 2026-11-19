// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api";
import { HandoverModal } from "./HandoverModal";
import type { AdminUser, HandoverPreview, UserSummary } from "@/lib/queries";

const api = vi.mocked(apiRequest);

const user = (id: number, username: string, over: Partial<UserSummary> = {}): UserSummary => ({
  id,
  username,
  email: `${username}@example.com`,
  role: "TAM",
  pipelineAccess: false,
  active: true,
  avatarUrl: null,
  ...over,
});

const LEAVER = 1;
const DIRECTORY: UserSummary[] = [
  user(LEAVER, "leaver"),
  user(2, "ada", { pipelineAccess: true }),
  user(3, "bob"),
  user(4, "pending-pat", { role: "PENDING" }),
  user(5, "gone-gail", { active: false }),
];

const leaver = { id: LEAVER, username: "leaver" } as AdminUser;

const project = (id: number, over: Partial<HandoverPreview["projects"][number]> = {}) => ({
  id,
  name: `Project ${id}`,
  status: "ACTIVE" as const,
  customerName: null,
  isTam: false,
  isSa: false,
  openTasks: 2,
  openEpics: 0,
  ...over,
});

function renderModal(preview: HandoverPreview, props: { onDone?: () => void; onStale?: () => Promise<boolean> } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onDone = props.onDone ?? vi.fn();
  const onStale = props.onStale ?? vi.fn().mockResolvedValue(true);
  render(
    <QueryClientProvider client={qc}>
      <HandoverModal open user={leaver} preview={preview} onClose={vi.fn()} onDone={onDone} onStale={onStale} />
    </QueryClientProvider>,
  );
  return { onDone, onStale };
}

const optionNames = (select: HTMLElement) =>
  within(select).getAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path: string) => {
    if (path === "/users") return DIRECTORY;
    return { id: LEAVER, username: "leaver", email: "l@example.com", active: false };
  });
});
afterEach(cleanup);

describe("HandoverModal", () => {
  it("offers only active, non-pending people other than the leaver as receivers", async () => {
    renderModal({ projects: [project(10, { isTam: true })], customers: [], openDeals: 0 });
    const tam = await screen.findByTestId("handover-tam-10");
    await waitFor(() => expect(optionNames(tam)).toContain("ada"));
    expect(optionNames(tam)).toEqual(["Choose a TAM…", "ada", "bob"]);
  });

  it("makes the new TAM required and keeps submit disabled until one is chosen", async () => {
    const u = userEvent.setup();
    const { onDone } = renderModal({ projects: [project(10, { isTam: true })], customers: [], openDeals: 0 });
    const tam = await screen.findByTestId("handover-tam-10");
    await waitFor(() => expect(optionNames(tam)).toContain("ada"));
    const submit = screen.getByTestId("handover-submit") as HTMLButtonElement;

    expect(tam.getAttribute("aria-required")).toBe("true");
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/Choose a new TAM for every project leaver leads/)).toBeTruthy();

    await u.selectOptions(tam, "bob");
    expect(submit.disabled).toBe(false);
    await u.click(submit);

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith("/admin/users/1/offboard", {
      method: "POST",
      body: { projects: [{ projectId: 10, assignTasksTo: null, newTamId: 3 }], customers: [] },
    });
  });

  it("shows the SA section only on a project where the leaver holds the SA seat, defaulting to no SA", async () => {
    const u = userEvent.setup();
    renderModal({
      projects: [project(10, { isSa: true }), project(11)],
      customers: [],
      openDeals: 0,
    });
    const sa = await screen.findByTestId("handover-sa-10");
    expect(screen.queryByTestId("handover-sa-11")).toBeNull();
    expect(screen.queryByTestId("handover-tam-10")).toBeNull();
    expect((sa as HTMLSelectElement).value).toBe("");
    expect(sa.getAttribute("aria-required")).toBeNull();
    // An SA seat needs no choice: submit is enabled straight away.
    expect((screen.getByTestId("handover-submit") as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => expect(optionNames(sa)).toContain("bob"));
    await u.selectOptions(sa, "bob");
    expect((sa as HTMLSelectElement).value).toBe("3");
  });

  it("shows the PIC section for open deals and lists only people with Pipeline access", async () => {
    renderModal({ projects: [], customers: [{ id: 7, name: "Acme" }], openDeals: 3 });
    const pic = await screen.findByTestId("handover-deals-pic");
    expect(screen.getByText("PIC for 3 open deals")).toBeTruthy();
    await waitFor(() => expect(optionNames(pic)).toContain("ada"));
    expect(optionNames(pic)).toEqual(["Unassigned", "ada"]);
  });

  it("omits the PIC section when there are no open deals", async () => {
    renderModal({ projects: [project(10)], customers: [], openDeals: 0 });
    await screen.findByTestId("handover-project-10");
    expect(screen.queryByTestId("handover-deals-pic")).toBeNull();
  });

  it("refetches the preview when the window regains focus while open", async () => {
    const { onStale } = renderModal({ projects: [project(10)], customers: [], openDeals: 0 });
    await screen.findByTestId("handover-project-10");
    expect(onStale).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("shows a notice instead of closing when the preview has emptied", async () => {
    renderModal({ projects: [], customers: [], openDeals: 0 });
    expect(await screen.findByTestId("handover-empty")).toBeTruthy();
    expect(screen.getByTestId("handover-modal")).toBeTruthy();
  });
});
