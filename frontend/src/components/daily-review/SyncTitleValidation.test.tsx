// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MidweekSyncModal } from "@/components/daily-review/MidweekSyncModal";
import { ReflectionSyncModal } from "@/components/daily-review/ReflectionSyncModal";
import type { DailyReviewCustomer } from "@/lib/queries";

const customer = {
  id: 1,
  name: "Acme",
  tam: null,
  projects: [],
  operationsNotes: [],
  weeklyUpdate: null,
  previousWeeklyUpdate: null,
} as DailyReviewCustomer;
const week = { key: "2026-W47", start: "2026-11-16", days: [] as string[] };

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(cleanup);

describe("blocked save marks the card missing its title", () => {
  it("mid-week: error border, aria-invalid and focus on the untitled highlight, cleared on typing", async () => {
    const user = userEvent.setup();
    wrap(<MidweekSyncModal customer={customer} week={week} onClose={() => {}} />);
    await user.type(screen.getByLabelText("Highlight 1 risk for Acme"), "Vendor slipping");
    await user.click(screen.getByRole("button", { name: "Save mid-week" }));

    const title = screen.getByLabelText("Highlight 1 title for Acme");
    expect(screen.getByText("Every highlight needs a title.")).toBeTruthy();
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(title);
    expect(screen.getByTestId("midweek-highlight-1").className).toContain("border-error");

    await user.type(title, "x");
    expect(title.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByTestId("midweek-highlight-1").className).not.toContain("border-error");
  });

  it("reflection: error border, aria-invalid and focus on the untitled achievement", async () => {
    const user = userEvent.setup();
    wrap(<ReflectionSyncModal customer={customer} week={week} onClose={() => {}} />);
    await user.type(screen.getByLabelText("Achievement 1 outstanding issue for Acme"), "Waiting on sign-off");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const title = screen.getByLabelText("Achievement 1 title for Acme");
    expect(screen.getByText("Every achievement needs a title.")).toBeTruthy();
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(title);
    expect(screen.getByTestId("reflection-achievement-1").className).toContain("border-error");
  });
});
