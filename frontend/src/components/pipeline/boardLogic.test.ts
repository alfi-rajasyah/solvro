import { describe, expect, it } from "vitest";
import type { AuthUser } from "@/lib/auth";
import {
  canAssignDeal,
  canCloseDeal,
  canDeleteDeal,
  canDragDeal,
  canEditDealFields,
  canHandoffDeal,
  canReopenDeal,
} from "./boardLogic";

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    username: "sa.one",
    email: "sa.one@example.com",
    role: "SA",
    permissions: [],
    ...overrides,
  };
}

describe("canDragDeal", () => {
  it("denies a user with no pipeline permissions", () => {
    expect(canDragDeal(user({ permissions: [] }), { picId: 1, outcome: null })).toBe(false);
  });

  it("allows edit_all regardless of ownership", () => {
    expect(
      canDragDeal(user({ id: 1, permissions: ["pipeline:edit_all"] }), { picId: 2, outcome: null }),
    ).toBe(true);
  });

  it("allows edit_own only when the deal's picId matches the user", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_own"] });
    expect(canDragDeal(u, { picId: 1, outcome: null })).toBe(true);
    expect(canDragDeal(u, { picId: 2, outcome: null })).toBe(false);
    expect(canDragDeal(u, { picId: null, outcome: null })).toBe(false);
  });

  it("the '*' wildcard allows everything, same as the backend's hasPermission", () => {
    expect(canDragDeal(user({ id: 1, permissions: ["*"] }), { picId: 999, outcome: null })).toBe(
      true,
    );
  });

  it("denies for a null/undefined user", () => {
    expect(canDragDeal(null, { picId: 1, outcome: null })).toBe(false);
    expect(canDragDeal(undefined, { picId: 1, outcome: null })).toBe(false);
  });

  it("denies a closed deal even for a user who would otherwise have full edit access (D5)", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_all"] });
    expect(canDragDeal(u, { picId: 1, outcome: "WON" })).toBe(false);
    expect(canDragDeal(u, { picId: 1, outcome: "LOST" })).toBe(false);
    expect(canDragDeal(u, { picId: 1, outcome: "CANCELLED" })).toBe(false);
  });
});

describe("canDeleteDeal", () => {
  it("denies a user with no pipeline permissions", () => {
    expect(canDeleteDeal(user({ permissions: [] }), { picId: 1 })).toBe(false);
  });

  it("allows delete_all regardless of ownership", () => {
    expect(canDeleteDeal(user({ id: 1, permissions: ["pipeline:delete_all"] }), { picId: 2 })).toBe(
      true,
    );
  });

  it("allows delete_own only when the deal's picId matches the user", () => {
    const u = user({ id: 1, permissions: ["pipeline:delete_own"] });
    expect(canDeleteDeal(u, { picId: 1 })).toBe(true);
    expect(canDeleteDeal(u, { picId: 2 })).toBe(false);
    expect(canDeleteDeal(u, { picId: null })).toBe(false);
  });

  it("the '*' wildcard allows everything, same as the backend's hasPermission", () => {
    expect(canDeleteDeal(user({ id: 1, permissions: ["*"] }), { picId: 999 })).toBe(true);
  });

  it("denies for a null/undefined user", () => {
    expect(canDeleteDeal(null, { picId: 1 })).toBe(false);
    expect(canDeleteDeal(undefined, { picId: 1 })).toBe(false);
  });
});

describe("canAssignDeal", () => {
  it("denies a user with no pipeline permissions", () => {
    expect(canAssignDeal(user({ permissions: [] }), { picId: null })).toBe(false);
  });

  it("allows edit_all for an unassigned deal, the caller's own deal, and a foreign deal", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_all"] });
    expect(canAssignDeal(u, { picId: null })).toBe(true);
    expect(canAssignDeal(u, { picId: 1 })).toBe(true);
    expect(canAssignDeal(u, { picId: 2 })).toBe(true);
  });

  it("allows edit_own only for an unassigned deal, never an already-assigned one", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_own"] });
    expect(canAssignDeal(u, { picId: null })).toBe(true);
    expect(canAssignDeal(u, { picId: 1 })).toBe(false);
    expect(canAssignDeal(u, { picId: 2 })).toBe(false);
  });

  it("the '*' wildcard allows everything, same as the backend's hasPermission", () => {
    expect(canAssignDeal(user({ id: 1, permissions: ["*"] }), { picId: 999 })).toBe(true);
  });

  it("denies for a null/undefined user", () => {
    expect(canAssignDeal(null, { picId: null })).toBe(false);
    expect(canAssignDeal(undefined, { picId: null })).toBe(false);
  });
});

describe("canCloseDeal", () => {
  it("denies a user with no pipeline permissions", () => {
    expect(canCloseDeal(user({ permissions: [] }), { picId: 1, outcome: null })).toBe(false);
  });

  it("allows edit_all on an open deal regardless of ownership", () => {
    expect(
      canCloseDeal(user({ id: 1, permissions: ["pipeline:edit_all"] }), { picId: 2, outcome: null }),
    ).toBe(true);
  });

  it("allows edit_own only on the caller's own open deal", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_own"] });
    expect(canCloseDeal(u, { picId: 1, outcome: null })).toBe(true);
    expect(canCloseDeal(u, { picId: 2, outcome: null })).toBe(false);
  });

  it("denies a deal that is already closed, even with full edit access", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_all"] });
    expect(canCloseDeal(u, { picId: 1, outcome: "WON" })).toBe(false);
    expect(canCloseDeal(u, { picId: 1, outcome: "LOST" })).toBe(false);
    expect(canCloseDeal(u, { picId: 1, outcome: "CANCELLED" })).toBe(false);
  });

  it("denies for a null/undefined user", () => {
    expect(canCloseDeal(null, { picId: 1, outcome: null })).toBe(false);
    expect(canCloseDeal(undefined, { picId: 1, outcome: null })).toBe(false);
  });
});

describe("canReopenDeal", () => {
  it("denies an open deal (nothing to reopen)", () => {
    expect(
      canReopenDeal(user({ id: 1, permissions: ["pipeline:edit_all"] }), {
        picId: 1,
        outcome: null,
        projectId: null,
      }),
    ).toBe(false);
  });

  it("allows a closed deal with no linked project, gated by the edit permission", () => {
    const closed = { picId: 1, outcome: "LOST" as const, projectId: null };
    expect(canReopenDeal(user({ id: 1, permissions: ["pipeline:edit_all"] }), closed)).toBe(true);
    expect(canReopenDeal(user({ id: 1, permissions: ["pipeline:edit_own"] }), closed)).toBe(true);
    expect(
      canReopenDeal(user({ id: 2, permissions: ["pipeline:edit_own"] }), closed),
    ).toBe(false);
    expect(canReopenDeal(user({ permissions: [] }), closed)).toBe(false);
  });

  it("denies a closed deal that already has a linked project (handed off)", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_all"] });
    expect(canReopenDeal(u, { picId: 1, outcome: "WON", projectId: 42 })).toBe(false);
  });

  it("denies for a null/undefined user", () => {
    const closed = { picId: 1, outcome: "CANCELLED" as const, projectId: null };
    expect(canReopenDeal(null, closed)).toBe(false);
    expect(canReopenDeal(undefined, closed)).toBe(false);
  });
});

describe("canHandoffDeal", () => {
  it("denies a user with no pipeline permissions", () => {
    expect(canHandoffDeal(user({ permissions: [] }), { picId: 1, outcome: "WON", projectId: null })).toBe(
      false,
    );
  });

  it("allows edit_all on a Won deal with no linked project, regardless of ownership", () => {
    expect(
      canHandoffDeal(user({ id: 1, permissions: ["pipeline:edit_all"] }), {
        picId: 2,
        outcome: "WON",
        projectId: null,
      }),
    ).toBe(true);
  });

  it("allows edit_own only on the caller's own Won deal (SF3: was project:write-only before)", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_own"] });
    expect(canHandoffDeal(u, { picId: 1, outcome: "WON", projectId: null })).toBe(true);
    expect(canHandoffDeal(u, { picId: 2, outcome: "WON", projectId: null })).toBe(false);
  });

  it("denies a deal that isn't Won, even with full edit access", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_all"] });
    expect(canHandoffDeal(u, { picId: 1, outcome: null, projectId: null })).toBe(false);
    expect(canHandoffDeal(u, { picId: 1, outcome: "LOST", projectId: null })).toBe(false);
    expect(canHandoffDeal(u, { picId: 1, outcome: "CANCELLED", projectId: null })).toBe(false);
  });

  it("denies a Won deal already linked to a project", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_all"] });
    expect(canHandoffDeal(u, { picId: 1, outcome: "WON", projectId: 42 })).toBe(false);
  });

  it("denies for a null/undefined user", () => {
    const won = { picId: 1, outcome: "WON" as const, projectId: null };
    expect(canHandoffDeal(null, won)).toBe(false);
    expect(canHandoffDeal(undefined, won)).toBe(false);
  });
});

describe("canEditDealFields", () => {
  it("denies a user with no pipeline permissions", () => {
    expect(canEditDealFields(user({ permissions: [] }), { picId: 1 })).toBe(false);
  });

  it("allows edit_all regardless of ownership", () => {
    expect(canEditDealFields(user({ id: 1, permissions: ["pipeline:edit_all"] }), { picId: 2 })).toBe(
      true,
    );
  });

  it("allows edit_own only when the deal's picId matches the user", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_own"] });
    expect(canEditDealFields(u, { picId: 1 })).toBe(true);
    expect(canEditDealFields(u, { picId: 2 })).toBe(false);
    expect(canEditDealFields(u, { picId: null })).toBe(false);
  });

  it("has no outcome clause — a closed deal's fields stay editable (backend still accepts a plain PATCH)", () => {
    const u = user({ id: 1, permissions: ["pipeline:edit_all"] });
    // canEditDealFields's Pick doesn't even include `outcome` — closed-ness
    // simply isn't part of this gate's shape, unlike canDragDeal/canCloseDeal.
    expect(canEditDealFields(u, { picId: 1 })).toBe(true);
  });

  it("denies for a null/undefined user", () => {
    expect(canEditDealFields(null, { picId: 1 })).toBe(false);
    expect(canEditDealFields(undefined, { picId: 1 })).toBe(false);
  });
});
