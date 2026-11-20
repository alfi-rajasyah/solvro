import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  applyAssigneeToAll,
  buildOffboardBody,
  handoverErrorFrom,
  handoverReceivers,
  initialDraft,
  isHandoverComplete,
  missingOwnerCustomerIds,
  missingTamProjectIds,
} from "@/lib/handover";
import type { HandoverPreview } from "@/lib/queries";

const preview: HandoverPreview = {
  projects: [
    { id: 1, name: "Alpha", status: "ACTIVE", customerName: "Acme", isTam: true, isSa: false, openTasks: 3, openEpics: 1 },
    { id: 2, name: "Beta", status: "PLANNING", customerName: null, isTam: false, isSa: true, openTasks: 0, openEpics: 0 },
  ],
  customers: [{ id: 9, name: "Acme" }],
  openDeals: 2,
};

describe("handover draft", () => {
  it("is incomplete until the required TAM is chosen", () => {
    const draft = initialDraft(preview);
    draft.customers[9] = 7;
    expect(missingTamProjectIds(preview, draft)).toEqual([1]);
    expect(isHandoverComplete(preview, draft)).toBe(false);
    draft.projects[1].newTamId = 5;
    expect(isHandoverComplete(preview, draft)).toBe(true);
  });

  it("is incomplete until every customer has a new owner", () => {
    const draft = initialDraft(preview);
    draft.projects[1].newTamId = 5;
    expect(missingOwnerCustomerIds(preview, draft)).toEqual([9]);
    expect(isHandoverComplete(preview, draft)).toBe(false);
    draft.customers[9] = 7;
    expect(missingOwnerCustomerIds(preview, draft)).toEqual([]);
    expect(isHandoverComplete(preview, draft)).toBe(true);
  });

  it("is incomplete when a note is over the limit", () => {
    const draft = initialDraft(preview);
    draft.projects[1].newTamId = 5;
    draft.customers[9] = 7;
    draft.projects[2].note = "x".repeat(2001);
    expect(isHandoverComplete(preview, draft)).toBe(false);
  });

  it("builds the body with explicit nulls and only the relevant keys", () => {
    const draft = initialDraft(preview);
    draft.projects[1].newTamId = 5;
    draft.projects[1].assignTasksTo = 6;
    draft.projects[1].note = "  see wiki ";
    draft.customers[9] = 7;
    expect(buildOffboardBody(preview, draft)).toEqual({
      projects: [
        { projectId: 1, assignTasksTo: 6, newTamId: 5, note: "see wiki" },
        { projectId: 2, assignTasksTo: null, newSaId: null },
      ],
      customers: [{ customerId: 9, newOwnerId: 7 }],
      dealsPicId: null,
    });
  });

  it("leaves out a customer whose owner is not chosen yet", () => {
    const draft = initialDraft(preview);
    draft.projects[1].newTamId = 5;
    expect(buildOffboardBody(preview, draft).customers).toEqual([]);
  });

  it("omits dealsPicId when there are no open deals", () => {
    const body = buildOffboardBody({ ...preview, openDeals: 0 }, initialDraft(preview));
    expect("dealsPicId" in body).toBe(false);
  });

  it("applies one assignee to every project", () => {
    const next = applyAssigneeToAll(initialDraft(preview), 4);
    expect(next.projects[1].assignTasksTo).toBe(4);
    expect(next.projects[2].assignTasksTo).toBe(4);
  });
});

describe("handoverErrorFrom", () => {
  const err = (code: string, details?: unknown) =>
    new ApiError(400, "msg", { error: "msg", code, details });

  it("names the offending project or customer", () => {
    expect(handoverErrorFrom(err("tam_required", { projectId: 3 }))).toMatchObject({ projectId: 3 });
    expect(handoverErrorFrom(err("owner_not_found", { customerId: 8 }))).toMatchObject({ customerId: 8 });
  });

  it("maps deal errors and stale previews", () => {
    expect(handoverErrorFrom(err("pic_no_pipeline_access")).deals).toBe(true);
    expect(handoverErrorFrom(err("handover_incomplete", { projectIds: [1], customerIds: [] })).stale).toBe(true);
  });

  it("falls back to the server message", () => {
    expect(handoverErrorFrom(err("weird")).message).toBe("msg");
    expect(handoverErrorFrom(new Error("x")).message).toMatch(/Could not hand over/);
  });
});

describe("handover receivers and stale mapping", () => {
  it("treats tam_required as stale and keeps the row message", () => {
    const e = handoverErrorFrom(new ApiError(400, "m", { code: "tam_required", details: { projectId: 4 } }));
    expect(e).toMatchObject({ stale: true, projectId: 4, message: "Choose a new TAM for this project." });
  });

  it("excludes the leaver, inactive users and any role without access (PENDING or a custom empty role)", () => {
    const users = [
      { id: 1, active: true, hasAccess: true },
      { id: 2, active: false, hasAccess: true },
      { id: 3, active: true, hasAccess: false },
      { id: 4, active: true, hasAccess: true },
      { id: 5, active: true, hasAccess: false },
    ];
    expect(handoverReceivers(users, 4).map((u) => u.id)).toEqual([1]);
  });
});
