// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallBanner } from "@/components/InstallBanner";

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

function firePrompt() {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("InstallBanner", () => {
  it("renders install and dismiss as sibling buttons, never nested", () => {
    render(<InstallBanner />);
    firePrompt();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(b.querySelector("button, [role=button]")).toBeNull();
    expect(buttons[0].contains(buttons[1])).toBe(false);
  });

  it("dismiss hides the banner without triggering the install prompt", async () => {
    const user = userEvent.setup();
    render(<InstallBanner />);
    const event = firePrompt();
    await user.click(screen.getByRole("button", { name: "Dismiss install banner" }));
    expect(event.prompt).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(localStorage.getItem("solvro:install-banner-dismissed")).toBe("1");
  });

  it("the install button triggers the deferred prompt", async () => {
    const user = userEvent.setup();
    render(<InstallBanner />);
    const event = firePrompt();
    await user.click(screen.getByRole("button", { name: /Install Solvro/ }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });
});
