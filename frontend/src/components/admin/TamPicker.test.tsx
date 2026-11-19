// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TamPicker } from "./TamPicker";

const CANDIDATES = [
  { id: 1, username: "ada", role: "TAM" },
  { id: 2, username: "bob", role: "TAM" },
  { id: 3, username: "cy", role: "SA" },
];

afterEach(cleanup);

const input = () => screen.getByRole("combobox") as HTMLInputElement;
const optionNames = () => screen.queryAllByRole("option").map((o) => o.textContent);

function setup(onPick = vi.fn()) {
  render(<TamPicker label="Apollo" currentId={1} currentName="ada" candidates={CANDIDATES} onPick={onPick} />);
  return onPick;
}

describe("TamPicker", () => {
  it("shows the current TAM as the placeholder and filters while typing", async () => {
    const u = userEvent.setup();
    setup();
    expect(input().placeholder).toBe("ada");
    expect(input().value).toBe("");
    await u.click(input());
    await waitFor(() => expect(optionNames()).toHaveLength(3));
    await u.type(input(), "bo");
    await waitFor(() => expect(optionNames()).toEqual(["bobTAM"]));
  });

  it("picking a user reports it, empties the input, and reopens with the full list", async () => {
    const u = userEvent.setup();
    const onPick = setup();
    await u.click(input());
    await u.type(input(), "bo");
    await u.click(await screen.findByRole("option", { name: /bob/ }));

    expect(onPick).toHaveBeenCalledWith(2);
    await waitFor(() => expect(input().value).toBe(""));
    // The parent has not changed the TAM (a failed reassign): the current one still shows.
    expect(input().placeholder).toBe("ada");

    await u.click(input());
    await waitFor(() => expect(optionNames()).toHaveLength(3));
    expect(input().value).toBe("");
  });

  it("picking the current TAM reports nothing", async () => {
    const u = userEvent.setup();
    const onPick = setup();
    await u.click(input());
    await u.click(await screen.findByRole("option", { name: /ada/ }));
    expect(onPick).not.toHaveBeenCalled();
  });
});
