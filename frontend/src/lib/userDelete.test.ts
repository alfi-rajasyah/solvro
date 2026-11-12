import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  buildDeleteUserBody,
  deleteUserErrorFrom,
  isOwnerDraftComplete,
  ownerDraftFor,
} from "@/lib/userDelete";

const customers = [
  { id: 1, name: "Acme" },
  { id: 2, name: "Globex" },
];

describe("userDelete", () => {
  it("starts with no owner chosen and is incomplete", () => {
    const draft = ownerDraftFor(customers);
    expect(draft).toEqual({ 1: null, 2: null });
    expect(isOwnerDraftComplete(customers, draft)).toBe(false);
  });

  it("is complete once every customer has an owner", () => {
    expect(isOwnerDraftComplete(customers, { 1: 5, 2: 6 })).toBe(true);
    expect(isOwnerDraftComplete([], {})).toBe(true);
  });

  it("keeps earlier choices for customers still listed after a reload", () => {
    const next = ownerDraftFor([{ id: 2, name: "Globex" }, { id: 3, name: "Initech" }], { 1: 5, 2: 6 });
    expect(next).toEqual({ 2: 6, 3: null });
  });

  it("builds the request body from the chosen owners", () => {
    expect(buildDeleteUserBody(customers, { 1: 5, 2: 6 })).toEqual({
      customers: [
        { customerId: 1, newOwnerId: 5 },
        { customerId: 2, newOwnerId: 6 },
      ],
    });
  });

  it("maps the server errors", () => {
    const stale = new ApiError(409, "x", { code: "customer_owner_required", details: { customers: [] } });
    expect(deleteUserErrorFrom(stale).stale).toBe(true);
    const owner = new ApiError(400, "x", { code: "owner_not_found", details: { customerId: 2 } });
    expect(deleteUserErrorFrom(owner)).toMatchObject({ customerId: 2 });
    const inUse = new ApiError(400, "Cannot delete bob: still has 1 project(s) as TAM.", { code: "user_in_use" });
    expect(deleteUserErrorFrom(inUse).message).toBe("Cannot delete bob: still has 1 project(s) as TAM.");
    expect(deleteUserErrorFrom(new Error("boom")).message).toBe("Could not delete this user.");
  });
});
