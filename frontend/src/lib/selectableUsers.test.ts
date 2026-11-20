import { describe, expect, it } from "vitest";
import { selectableUsers } from "./selectableUsers";

const users = [
  { id: 1, active: true },
  { id: 2, active: false },
  { id: 3, active: false },
  { id: 4 },
];

describe("selectableUsers", () => {
  it("hides deactivated users except the current value", () => {
    expect(selectableUsers(users, [null]).map((u) => u.id)).toEqual([1, 4]);
    expect(selectableUsers(users, [2]).map((u) => u.id)).toEqual([1, 2, 4]);
    expect(selectableUsers(users, ["", 3, undefined]).map((u) => u.id)).toEqual([1, 3, 4]);
  });
  it("tolerates a list that has not loaded", () => {
    expect(selectableUsers(undefined, [1])).toEqual([]);
  });
});
