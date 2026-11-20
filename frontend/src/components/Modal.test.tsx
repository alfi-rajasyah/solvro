// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "@/components/Modal";

afterEach(cleanup);

describe("Modal onCloseButton", () => {
  it("sends the header X to onCloseButton and Escape to onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCloseButton = vi.fn();
    render(
      <Modal open onClose={onClose} onCloseButton={onCloseButton} title="Demo">
        <p>body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Demo" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onCloseButton).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to onClose for the X without the prop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Demo">
        <p>body</p>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
