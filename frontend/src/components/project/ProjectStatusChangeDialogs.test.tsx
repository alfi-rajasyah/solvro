// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api";
import { useProjectStatusChange, type StatusChangeDecision } from "./ProjectStatusChangeDialogs";
import type { ProjectLifecyclePreview, ProjectStatus } from "@/lib/queries";

const api = vi.mocked(apiRequest);

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

const preview = (over: Partial<ProjectLifecyclePreview> = {}): ProjectLifecyclePreview => ({
  openTasks: 4,
  doneTasks: 1,
  cancelledTasks: 0,
  onHoldSince: daysAgo(10),
  holdDays: 10,
  pastDueOpenTasks: 2,
  ...over,
});

function Harness({ from, to, onHoldSince }: { from: ProjectStatus; to: ProjectStatus; onHoldSince: string | null }) {
  const { confirm, dialogs } = useProjectStatusChange({ id: 5, onHoldSince });
  const [decision, setDecision] = useState<StatusChangeDecision | null>(null);
  return (
    <>
      <button type="button" onClick={() => void confirm(from, to).then(setDecision)}>
        Save status
      </button>
      <output data-testid="decision">{decision ? JSON.stringify(decision) : "pending"}</output>
      {dialogs}
    </>
  );
}

function renderHarness(from: ProjectStatus, to: ProjectStatus, onHoldSince: string | null = daysAgo(10)) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Harness from={from} to={to} onHoldSince={onHoldSince} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const decisionText = () => screen.getByTestId("decision").textContent;

beforeEach(() => api.mockReset());
afterEach(cleanup);

describe("reactivating a project that was on hold", () => {
  it("names a hold longer than a day and proposes shifting open dates by that many days", async () => {
    api.mockResolvedValue(preview());
    const u = userEvent.setup();
    renderHarness("ON_HOLD", "ACTIVE");
    await u.click(screen.getByRole("button", { name: "Save status" }));

    const dialog = await screen.findByRole("dialog", { name: "Update the timeline?" });
    expect(dialog.textContent).toContain("on hold for 10 days");
    expect(dialog.textContent).toContain("2 open tasks are now past due");
    const input = screen.getByLabelText("Days to shift open dates") as HTMLInputElement;
    expect(input.value).toBe("10");

    await u.click(screen.getByRole("button", { name: "Shift open dates by 10 days" }));
    await waitFor(() => expect(decisionText()).not.toBe("pending"));
    expect(JSON.parse(decisionText()!)).toEqual({ proceed: true, shiftOpenDatesByDays: 10 });
  });

  it("lets the user change the number of days, and refuses a value outside 1 to 3650", async () => {
    api.mockResolvedValue(preview());
    const u = userEvent.setup();
    renderHarness("ON_HOLD", "PLANNING");
    await u.click(screen.getByRole("button", { name: "Save status" }));
    const input = (await screen.findByLabelText("Days to shift open dates")) as HTMLInputElement;

    await u.clear(input);
    await u.type(input, "0");
    expect(screen.getByText("Enter a whole number from 1 to 3650.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Shift open dates by N days" }) as HTMLButtonElement).disabled).toBe(true);

    await u.clear(input);
    await u.type(input, "3");
    await u.click(screen.getByRole("button", { name: "Shift open dates by 3 days" }));
    await waitFor(() => expect(decisionText()).not.toBe("pending"));
    expect(JSON.parse(decisionText()!)).toEqual({ proceed: true, shiftOpenDatesByDays: 3 });
  });

  it("counts a same-day hold as 1 day, in the singular", async () => {
    api.mockResolvedValue(preview({ pastDueOpenTasks: 1, onHoldSince: new Date().toISOString() }));
    const u = userEvent.setup();
    renderHarness("ON_HOLD", "ACTIVE", new Date().toISOString());
    await u.click(screen.getByRole("button", { name: "Save status" }));
    const dialog = await screen.findByRole("dialog", { name: "Update the timeline?" });
    expect(dialog.textContent).toContain("on hold for 1 day.");
    expect(dialog.textContent).toContain("1 open task is now past due");
    expect(screen.getByRole("button", { name: "Shift open dates by 1 day" })).toBeTruthy();
  });

  it("opens the timeline instead when the user chooses to update it themselves, and backs out on Cancel", async () => {
    api.mockResolvedValue(preview());
    const u = userEvent.setup();
    renderHarness("ON_HOLD", "ACTIVE");
    await u.click(screen.getByRole("button", { name: "Save status" }));
    await u.click(await screen.findByRole("button", { name: "I'll update the timeline myself" }));
    await waitFor(() => expect(decisionText()).not.toBe("pending"));
    expect(JSON.parse(decisionText()!)).toEqual({ proceed: true, openTimelineAfter: true });

    cleanup();
    renderHarness("ON_HOLD", "ACTIVE");
    await u.click(screen.getByRole("button", { name: "Save status" }));
    await u.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(decisionText()).not.toBe("pending"));
    expect(JSON.parse(decisionText()!)).toEqual({ proceed: false });
  });

  it("skips the dialog when nothing is past due", async () => {
    api.mockResolvedValue(preview({ pastDueOpenTasks: 0 }));
    const u = userEvent.setup();
    renderHarness("ON_HOLD", "ACTIVE");
    await u.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(decisionText()).not.toBe("pending"));
    expect(JSON.parse(decisionText()!)).toEqual({ proceed: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("cancelling a project", () => {
  it("confirms with the open and completed task counts", async () => {
    api.mockResolvedValue(preview({ openTasks: 4, doneTasks: 1 }));
    const u = userEvent.setup();
    renderHarness("ACTIVE", "CANCELLED");
    await u.click(screen.getByRole("button", { name: "Save status" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("4 open tasks will be marked Cancelled");
    expect(dialog.textContent).toContain("1 completed task stays as it is");
    await u.click(screen.getByRole("button", { name: "Cancel project" }));
    await waitFor(() => expect(decisionText()).not.toBe("pending"));
    expect(JSON.parse(decisionText()!)).toEqual({ proceed: true });
  });

  it("makes no request for an ordinary status change", async () => {
    const u = userEvent.setup();
    renderHarness("ACTIVE", "ON_HOLD");
    await u.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(decisionText()).not.toBe("pending"));
    expect(api).not.toHaveBeenCalled();
  });
});
