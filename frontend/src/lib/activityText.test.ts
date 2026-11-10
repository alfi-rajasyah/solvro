import { describe, expect, it } from "vitest";
import { describeActivity } from "./activityText";
import type { ActivityEvent } from "./queries";

function ev(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 1,
    entityType: "task",
    entityId: 42,
    projectId: 7,
    opportunityId: null,
    action: "created",
    entityLabel: "Configure backup jobs",
    changes: null,
    createdAt: "2026-09-30T10:00:00.000Z",
    actor: { id: 3, username: "maya.putri", avatarUrl: null },
    ...over,
  };
}

const text = (e: ActivityEvent) => describeActivity(e).text;

describe("describeActivity - tasks", () => {
  it("created with an assignee", () => {
    const e = ev({ changes: { assignee: { from: null, to: { id: 5, username: "ben" } } } });
    expect(text(e)).toBe("maya.putri created the task Configure backup jobs, assigned to ben");
  });

  it("created / deleted", () => {
    expect(text(ev())).toBe("maya.putri created the task Configure backup jobs");
    expect(text(ev({ action: "deleted" }))).toBe("maya.putri deleted the task Configure backup jobs");
  });

  it("links to the task unless it was deleted", () => {
    expect(describeActivity(ev()).taskId).toBe(42);
    expect(describeActivity(ev({ action: "updated", changes: { status: { from: "TODO", to: "DONE" } } })).taskId).toBe(42);
    expect(describeActivity(ev({ action: "deleted" })).taskId).toBeNull();
    expect(describeActivity(ev({ entityType: "risk" })).taskId).toBeNull();
  });

  it("due date change uses the day formatter", () => {
    const e = ev({
      action: "updated",
      changes: { dueDate: { from: "2026-10-02", to: "2026-10-05" } },
    });
    const y = new Date().getFullYear();
    const expected = (d: string) => (y === 2026 ? d : `${d} 2026`);
    expect(text(e)).toBe(
      `maya.putri changed the due date of Configure backup jobs from ${expected("2 Oct")} to ${expected("5 Oct")}`,
    );
  });

  it("setting and clearing a date", () => {
    const set = ev({ action: "updated", changes: { startDate: { from: null, to: "2026-10-05" } } });
    expect(text(set)).toMatch(/^maya\.putri set the start date of Configure backup jobs to 5 Oct/);
    const clear = ev({ action: "updated", changes: { dueDate: { from: "2026-10-02", to: null } } });
    expect(text(clear)).toMatch(/^maya\.putri cleared the due date of Configure backup jobs \(was 2 Oct/);
  });

  it("status and priority use the shared labels", () => {
    expect(text(ev({ action: "updated", changes: { status: { from: "TODO", to: "IN_PROGRESS" } } }))).toBe(
      "maya.putri changed the status of Configure backup jobs from To do to In progress",
    );
    expect(text(ev({ action: "updated", changes: { priority: { from: "LOW", to: "URGENT" } } }))).toBe(
      "maya.putri changed the priority of Configure backup jobs from Low to Urgent",
    );
  });

  it("title rename, assignee, flags", () => {
    expect(text(ev({ action: "updated", changes: { title: { from: "Old", to: "New name" } } }))).toBe(
      "maya.putri renamed the task Configure backup jobs to New name",
    );
    expect(
      text(ev({ action: "updated", changes: { assignee: { from: null, to: { id: 5, username: "ben" } } } })),
    ).toBe("maya.putri assigned Configure backup jobs to ben");
    expect(
      text(
        ev({
          action: "updated",
          changes: { assignee: { from: { id: 5, username: "ben" }, to: { id: 6, username: "cara" } } },
        }),
      ),
    ).toBe("maya.putri reassigned Configure backup jobs from ben to cara");
    expect(
      text(ev({ action: "updated", changes: { assignee: { from: { id: 5, username: "ben" }, to: null } } })),
    ).toBe("maya.putri unassigned Configure backup jobs (was ben)");
    expect(text(ev({ action: "updated", changes: { isMilestone: { from: false, to: true } } }))).toBe(
      "maya.putri marked Configure backup jobs as a milestone",
    );
    expect(text(ev({ action: "updated", changes: { isCriticalPath: { from: true, to: false } } }))).toBe(
      "maya.putri removed Configure backup jobs from the critical path",
    );
  });

  it("description changes never show text", () => {
    const e = ev({
      action: "updated",
      changes: { description: { changed: true, from: "SECRET OLD", to: "SECRET NEW" } },
    });
    expect(text(e)).toBe("maya.putri updated the description of Configure backup jobs");
    expect(text(e)).not.toMatch(/SECRET/);
  });

  it("labels added and removed", () => {
    const e = ev({
      action: "updated",
      changes: { labels: { added: ["backend", "urgent"], removed: ["later"] } },
    });
    expect(text(e)).toBe(
      "maya.putri changed the labels on Configure backup jobs (added backend, urgent; removed later)",
    );
  });

  it("foreign-key ids read without values", () => {
    expect(text(ev({ action: "updated", changes: { sectionId: { from: 1, to: 2 } } }))).toBe(
      "maya.putri changed the section of Configure backup jobs",
    );
    expect(text(ev({ action: "updated", changes: { epicId: { from: null, to: 9 } } }))).toBe(
      "maya.putri changed the epic of Configure backup jobs",
    );
    expect(text(ev({ action: "updated", changes: { parentTaskId: { from: null, to: 9 } } }))).toBe(
      "maya.putri changed the parent task of Configure backup jobs",
    );
  });

  it("names the iTop ticket link properly", () => {
    expect(text(ev({ action: "updated", changes: { itopTicketRef: { from: null, to: "R-000123" } } }))).toBe(
      "maya.putri changed the iTop ticket of Configure backup jobs from none to R-000123",
    );
  });

  it("several fields collapse into one clause list, many fields into a count", () => {
    const some = ev({
      action: "updated",
      changes: { status: { from: "TODO", to: "DONE" }, priority: { from: "LOW", to: "HIGH" } },
    });
    expect(text(some)).toBe(
      "maya.putri updated Configure backup jobs: status from To do to Done, priority from Low to High",
    );
    const many = ev({
      action: "updated",
      changes: {
        status: { from: "TODO", to: "DONE" },
        priority: { from: "LOW", to: "HIGH" },
        title: { from: "a", to: "b" },
        dueDate: { from: null, to: "2026-10-05" },
      },
    });
    expect(text(many)).toBe("maya.putri updated 4 fields of Configure backup jobs");
  });

  it("empty changes on an update", () => {
    expect(text(ev({ action: "updated", changes: {} }))).toBe("maya.putri updated Configure backup jobs");
  });

  it("emphasises the actor and the entity in parts", () => {
    const { parts } = describeActivity(ev());
    expect(parts[0]).toEqual({ kind: "actor", text: "maya.putri" });
    expect(parts.find((p) => p.kind === "entity")?.text).toBe("Configure backup jobs");
  });
});

describe("describeActivity - comments", () => {
  it("names the task, never the body", () => {
    const e = ev({ entityType: "comment", entityId: 900, action: "created", changes: { body: "TOP SECRET" } });
    expect(text(e)).toBe("maya.putri commented on Configure backup jobs");
    expect(text(e)).not.toMatch(/SECRET/);
    expect(describeActivity(e).taskId).toBeNull();
  });

  it("links to the task when the event carries its id", () => {
    const e = ev({ entityType: "comment", entityId: 900, action: "created", changes: { taskId: 42 } });
    expect(describeActivity(e).taskId).toBe(42);
  });

  it("edited / deleted / no label", () => {
    expect(text(ev({ entityType: "comment", action: "updated" }))).toBe(
      "maya.putri edited a comment on Configure backup jobs",
    );
    expect(text(ev({ entityType: "comment", action: "deleted" }))).toBe(
      "maya.putri deleted a comment on Configure backup jobs",
    );
    expect(text(ev({ entityType: "comment", action: "created", entityLabel: null }))).toBe(
      "maya.putri commented on a task",
    );
  });
});

describe("describeActivity - risks", () => {
  it("created / deleted", () => {
    expect(text(ev({ entityType: "risk", entityLabel: "Vendor delay" }))).toBe(
      "maya.putri added the risk Vendor delay",
    );
    expect(text(ev({ entityType: "risk", entityLabel: "Vendor delay", action: "deleted" }))).toBe(
      "maya.putri deleted the risk Vendor delay",
    );
  });

  it("status change uses risk labels", () => {
    const e = ev({
      entityType: "risk",
      entityLabel: "Vendor delay",
      action: "updated",
      changes: { status: { from: "OPEN", to: "MITIGATED" } },
    });
    expect(text(e)).toBe("maya.putri changed the status of the risk Vendor delay from Open to Mitigated");
  });

  it("long-text plan changes read as an update, never text", () => {
    const e = ev({
      entityType: "risk",
      entityLabel: "Vendor delay",
      action: "updated",
      changes: { mitigationPlan: { changed: true } },
    });
    expect(text(e)).toBe("maya.putri updated the mitigation plan of the risk Vendor delay");
  });

  it("does not link to a task", () => {
    expect(describeActivity(ev({ entityType: "risk" })).taskId).toBeNull();
  });
});

describe("describeActivity - notes", () => {
  it("states visibility and never a body", () => {
    const internal = ev({
      entityType: "note",
      entityLabel: null,
      action: "created",
      changes: { visibility: "INTERNAL", body: "PRIVATE TEXT" },
    });
    expect(text(internal)).toBe("maya.putri added an internal note");
    expect(text(internal)).not.toMatch(/PRIVATE/);
    expect(
      text(ev({ entityType: "note", entityLabel: null, action: "created", changes: { visibility: "CUSTOMER_FACING" } })),
    ).toBe("maya.putri added a customer-facing note");
  });

  it("updated / deleted / unknown visibility", () => {
    expect(
      text(ev({ entityType: "note", entityLabel: null, action: "updated", changes: { visibility: "INTERNAL" } })),
    ).toBe("maya.putri edited an internal note");
    expect(
      text(
        ev({
          entityType: "note",
          entityLabel: null,
          action: "updated",
          changes: { visibility: { from: "INTERNAL", to: "CUSTOMER_FACING" } },
        }),
      ),
    ).toBe("maya.putri changed a note from internal to customer-facing");
    expect(text(ev({ entityType: "note", entityLabel: null, action: "deleted", changes: { visibility: "INTERNAL" } }))).toBe(
      "maya.putri deleted an internal note",
    );
    expect(text(ev({ entityType: "note", entityLabel: null, action: "created", changes: null }))).toBe(
      "maya.putri added a note",
    );
  });
});

describe("describeActivity - members", () => {
  it("added and removed", () => {
    expect(text(ev({ entityType: "member", entityLabel: "ben", action: "added" }))).toBe(
      "maya.putri added ben to the project",
    );
    expect(text(ev({ entityType: "member", entityLabel: "ben", action: "removed" }))).toBe(
      "maya.putri removed ben from the project",
    );
    expect(
      text(ev({ entityType: "member", entityLabel: "ben", action: "removed", changes: { unassignedTasks: 2 } })),
    ).toBe("maya.putri removed ben from the project (unassigned 2 tasks)");
    expect(text(ev({ entityType: "member", entityLabel: null, action: "added" }))).toBe(
      "maya.putri added a member to the project",
    );
  });
});

describe("describeActivity - project", () => {
  const project = (changes: Record<string, unknown>) =>
    ev({ entityType: "project", entityLabel: "Acme rollout", action: "updated", changes });

  it("rename, status, customer", () => {
    expect(text(project({ name: { from: "Acme", to: "Acme rollout" } }))).toBe(
      "maya.putri renamed the project from Acme to Acme rollout",
    );
    expect(text(project({ status: { from: "ACTIVE", to: "ON_HOLD" } }))).toBe(
      "maya.putri changed the project status from Active to On hold",
    );
    expect(text(project({ customer: { from: { id: 1, name: "Foo" }, to: { id: 2, name: "Bar" } } }))).toBe(
      "maya.putri changed the project customer from Foo to Bar",
    );
    expect(text(project({ customerId: { from: 1, to: 2 } }))).toBe("maya.putri changed the project customer");
    expect(text(project({ customerId: { from: null, to: 2 } }))).toBe("maya.putri changed the project customer");
  });

  it("several fields", () => {
    expect(text(project({ name: { from: "A", to: "B" }, status: { from: "ACTIVE", to: "COMPLETED" } }))).toBe(
      "maya.putri updated the project: name from A to B, status from Active to Completed",
    );
  });
});

describe("describeActivity - degrades gracefully", () => {
  it("null actor reads Someone", () => {
    expect(text(ev({ actor: null }))).toBe("Someone created the task Configure backup jobs");
  });

  it("unknown entity type / action", () => {
    const e = ev({ entityType: "widget" as never, action: "exploded" as never });
    expect(text(e)).toBe("maya.putri exploded the widget Configure backup jobs");
  });

  it("garbage changes never throw", () => {
    const weird: unknown[] = ["str", 5, [], [1, 2], { a: 1 }, { status: 3 }, { status: { from: {}, to: [] } }, { labels: 7 }];
    for (const changes of weird) {
      for (const entityType of ["task", "risk", "project", "note", "member", "comment", "nope"]) {
        for (const action of ["created", "updated", "deleted", "added", "removed", "nope"]) {
          const out = describeActivity(ev({ entityType, action, changes } as never));
          expect(out.text.startsWith("maya.putri")).toBe(true);
        }
      }
    }
  });

  it("null label with an update still reads", () => {
    expect(text(ev({ entityLabel: null, action: "updated", changes: { status: { from: "TODO", to: "DONE" } } }))).toBe(
      "maya.putri changed the status of a task from To do to Done",
    );
  });

  it("clips very long values", () => {
    const long = "x".repeat(200);
    const out = text(ev({ action: "updated", changes: { title: { from: "a", to: long } } }));
    expect(out.length).toBeLessThan(120);
  });
});

describe("describeActivity - project roles", () => {
  const project = (changes: Record<string, unknown>) =>
    ev({ entityType: "project", entityId: 7, entityLabel: "Acme rollout", action: "updated", changes });

  it("names the solution architect and the TAM", () => {
    expect(
      text(project({ sa: { from: { id: 1, username: "ana" }, to: { id: 2, username: "budi" } } })),
    ).toBe("maya.putri changed the project solution architect from ana to budi");
    expect(text(project({ saId: { from: null, to: 2 } }))).toBe(
      "maya.putri changed the project solution architect",
    );
    expect(text(project({ tam: { from: { id: 1, username: "ana" }, to: { id: 2, username: "budi" } } }))).toBe(
      "maya.putri changed the project TAM from ana to budi",
    );
  });

  it("a plain project creation and a handoff", () => {
    const created = ev({ entityType: "project", entityLabel: "Acme rollout", changes: { tam: 1, sa: 2 } });
    expect(text(created)).toBe("maya.putri created the project Acme rollout");
    const handoff = ev({
      entityType: "project",
      entityLabel: "Acme rollout",
      changes: { fromOpportunity: { id: "opp1", title: "Acme deal" }, tam: 1, sa: 2 },
    });
    const sentence = describeActivity(handoff);
    expect(sentence.text).toBe("maya.putri created the project Acme rollout from deal Acme deal");
    expect(sentence.parts.find((p) => p.text === "Acme deal")).toEqual({
      kind: "entity",
      text: "Acme deal",
      href: "/pipeline/opp1",
    });
    expect(text(ev({ entityType: "project", entityLabel: null, changes: { fromOpportunity: { id: "o", title: "X" } } }))).toBe(
      "maya.putri created the project from deal X",
    );
  });

  it("never names the source deal when it is withheld, absent or the viewer cannot see the Pipeline", () => {
    const base = { entityType: "project", entityLabel: "Acme rollout" } as const;
    expect(text(ev({ ...base, changes: { fromOpportunity: { withheld: true }, tam: 1 } }))).toBe(
      "maya.putri created the project Acme rollout",
    );
    const handoff = ev({ ...base, changes: { fromOpportunity: { id: "opp1", title: "Acme deal" } } });
    const hidden = describeActivity(handoff, { canViewPipeline: false });
    expect(hidden.text).toBe("maya.putri created the project Acme rollout");
    expect(hidden.parts.some((p) => p.href?.startsWith("/pipeline/"))).toBe(false);
  });
});

describe("describeActivity - epics", () => {
  it("created, updated, deleted", () => {
    const epic = (over: Partial<ActivityEvent>) =>
      ev({ entityType: "epic", entityLabel: "Billing", ...over });
    expect(text(epic({}))).toBe("maya.putri created the epic Billing");
    expect(text(epic({ action: "deleted" }))).toBe("maya.putri deleted the epic Billing");
    expect(text(epic({ action: "updated", changes: { status: { from: "TODO", to: "DONE" } } }))).toBe(
      "maya.putri changed the status of Billing from To do to Done",
    );
    expect(describeActivity(epic({})).taskId).toBeNull();
    expect(text(epic({ action: "deleted", changes: { taskCount: 3 } }))).toBe(
      "maya.putri deleted the epic Billing (3 tasks)",
    );
    expect(text(epic({ action: "updated", changes: { owner: { from: null, to: { id: 2, username: "budi" } } } }))).toBe(
      "maya.putri changed the owner of Billing from none to budi",
    );
    expect(text(epic({ action: "updated", changes: { color: { from: "#111111", to: "#222222" } } }))).toBe(
      "maya.putri changed the color of Billing from #111111 to #222222",
    );
    expect(text(epic({ action: "updated", changes: { description: { changed: true } } }))).toBe(
      "maya.putri updated the description of Billing",
    );
  });
});

describe("describeActivity - Pipeline deals", () => {
  const deal = (over: Partial<ActivityEvent>) =>
    ev({
      entityType: "opportunity",
      entityId: null,
      projectId: null,
      opportunityId: "opp1",
      entityLabel: "Acme deal",
      ...over,
    });

  it("created and reopened", () => {
    expect(text(deal({}))).toBe("maya.putri created the deal Acme deal");
    expect(text(deal({ action: "reopened" }))).toBe("maya.putri reopened Acme deal");
  });

  it("links the deal title to its page", () => {
    const part = describeActivity(deal({ action: "reopened" })).parts.find((p) => p.kind === "entity");
    expect(part).toEqual({ kind: "entity", text: "Acme deal", href: "/pipeline/opp1" });
    expect(describeActivity(deal({ action: "reopened" })).taskId).toBeNull();
  });

  it("moved reads the stage labels and notes a skipped PoC", () => {
    const moved = (changes: Record<string, unknown>) => text(deal({ action: "moved", changes }));
    expect(moved({ stage: { from: "POC", to: "RFP" } })).toBe("maya.putri moved Acme deal from PoC to RFP");
    expect(moved({ stage: { from: "TECHNICAL_CLARIFICATION", to: "RFP" }, pocSkipped: true })).toBe(
      "maya.putri moved Acme deal from Technical Clarification to RFP (skipped PoC)",
    );
    expect(moved({})).toBe("maya.putri moved Acme deal");
  });

  it("closed reads the outcome and the reason category", () => {
    const closed = (changes: Record<string, unknown>) => text(deal({ action: "closed", changes }));
    expect(closed({ outcome: "LOST", reasonCategory: "COMPETITOR" })).toBe(
      "maya.putri closed Acme deal as Lost (Competitor)",
    );
    expect(closed({ outcome: "WON" })).toBe("maya.putri closed Acme deal as Won");
    expect(closed({})).toBe("maya.putri closed Acme deal");
  });

  it("assigned, reassigned and unassigned", () => {
    const assigned = (pic: unknown) => text(deal({ action: "assigned", changes: { pic } }));
    expect(assigned({ from: null, to: { id: 5, username: "budi" } })).toBe("maya.putri assigned Acme deal to budi");
    expect(assigned({ from: { id: 4, username: "ana" }, to: { id: 5, username: "budi" } })).toBe(
      "maya.putri reassigned Acme deal from ana to budi",
    );
    expect(assigned({ from: { id: 4, username: "ana" }, to: null })).toBe(
      "maya.putri unassigned Acme deal (was ana)",
    );
  });

  it("handed off links the project", () => {
    const sentence = describeActivity(
      deal({ action: "handed_off", changes: { project: { id: 9, name: "Acme rollout" } } }),
    );
    expect(sentence.text).toBe("maya.putri handed Acme deal off to project Acme rollout");
    expect(sentence.parts.find((p) => p.text === "Acme rollout")?.href).toBe("/projects/9");
    expect(text(deal({ action: "handed_off" }))).toBe("maya.putri handed Acme deal off to a project");
  });

  it("updated reads the deal columns", () => {
    const updated = (changes: Record<string, unknown>) => text(deal({ action: "updated", changes }));
    expect(updated({ dealValue: { from: 1000000, to: 2500000 } })).toMatch(
      /^maya\.putri changed the value of Acme deal from Rp 1\.000\.000 to Rp 2\.500\.000$/,
    );
    expect(updated({ winProbability: { from: 25, to: 50 } })).toBe(
      "maya.putri changed the win probability of Acme deal from 25% to 50%",
    );
    expect(updated({ deadline: { from: null, to: "2026-10-05" } })).toMatch(
      /^maya\.putri changed the deadline of Acme deal from none to 5 Oct/,
    );
    expect(updated({ statusTag: { from: null, to: "HOLD" } })).toBe(
      "maya.putri changed the status tag of Acme deal from none to Hold",
    );
    expect(updated({ description: { changed: true } })).toBe("maya.putri updated the description of Acme deal");
  });

  it("notes and links", () => {
    expect(text(deal({ entityType: "opportunity_note", changes: { activityId: "a1" } }))).toBe(
      "maya.putri added a note on Acme deal",
    );
    expect(text(deal({ entityType: "opportunity_note", entityLabel: null }))).toBe(
      "maya.putri added a note on a deal",
    );
    const link = (action: ActivityEvent["action"]) =>
      text(deal({ entityType: "opportunity_link", action, changes: { linkId: "l1", label: "Proposal" } }));
    expect(link("added")).toBe("maya.putri added the link Proposal to Acme deal");
    expect(link("updated")).toBe("maya.putri updated the link Proposal on Acme deal");
    expect(link("removed")).toBe("maya.putri removed the link Proposal from Acme deal");
  });

  it("degrades to a generic sentence for an unknown deal action", () => {
    expect(text(deal({ action: "added" }))).toMatch(/^maya\.putri added the opportunity Acme deal$/);
  });
});

describe("describeActivity - project links", () => {
  const link = (over: Partial<ActivityEvent> = {}) =>
    ev({
      entityType: "project_link",
      entityId: null,
      entityLabel: null,
      changes: { linkId: "l1", label: "Proposal" },
      ...over,
    });

  it("added / updated / removed name the label", () => {
    expect(text(link({ action: "added" }))).toBe("maya.putri added the link Proposal to the project");
    expect(text(link({ action: "updated" }))).toBe("maya.putri updated the link Proposal on the project");
    expect(text(link({ action: "removed" }))).toBe("maya.putri removed the link Proposal from the project");
  });

  it("falls back to a generic link when the label is missing", () => {
    expect(text(link({ action: "added", changes: null }))).toBe("maya.putri added a link to the project");
  });

  it("emphasises the label and never links to a task", () => {
    const s = describeActivity(link({ action: "added" }));
    expect(s.parts.filter((p) => p.kind === "entity").map((p) => p.text)).toEqual(["Proposal"]);
    expect(s.taskId).toBeNull();
  });
});

describe("describeActivity - guest links", () => {
  const link = (over: Partial<ActivityEvent> = {}) =>
    ev({ entityType: "share_link", entityLabel: "For Nusantara IT", ...over });

  it("created / revoked name the label", () => {
    expect(text(link({ action: "created" }))).toBe("maya.putri created the guest link For Nusantara IT");
    expect(text(link({ action: "removed" }))).toBe("maya.putri revoked the guest link For Nusantara IT");
  });

  it("unlabelled links read as a guest link", () => {
    expect(text(link({ action: "created", entityLabel: null }))).toBe("maya.putri created a guest link");
    expect(text(link({ action: "removed", entityLabel: null }))).toBe("maya.putri revoked a guest link");
  });

  it("emphasises the label and never links to a task", () => {
    const s = describeActivity(link({ action: "created" }));
    expect(s.parts.filter((p) => p.kind === "entity").map((p) => p.text)).toEqual(["For Nusantara IT"]);
    expect(s.taskId).toBeNull();
  });
});

describe("describeActivity - project lifecycle", () => {
  const proj = (action: string, changes: unknown, label: string | null = "Acme rollout") =>
    ev({ entityType: "project", action: action as ActivityEvent["action"], entityLabel: label, changes: changes as ActivityEvent["changes"] });

  it("all tasks closed", () => {
    const e = proj("all_tasks_closed", { done: 4, cancelled: 1 });
    expect(text(e)).toBe("maya.putri closed the last open task: all tasks in Acme rollout are closed — mark the project Completed?");
    expect(describeActivity(e).parts.filter((p) => p.kind === "entity").map((p) => p.text)).toEqual(["Acme rollout"]);
    expect(text(proj("all_tasks_closed", null, null))).toContain("all tasks in the project are closed");
  });

  it("cancel cascade, singular and plural", () => {
    expect(text(proj("updated", { status: { from: "ACTIVE", to: "CANCELLED" }, cancelledTasks: 5 }))).toMatch(/; cancelled 5 open tasks$/);
    expect(text(proj("updated", { status: { from: "ACTIVE", to: "CANCELLED" }, cancelledTasks: 1 }))).toMatch(/; cancelled 1 open task$/);
  });

  it("reactivation shift", () => {
    expect(text(proj("updated", { status: { from: "ON_HOLD", to: "ACTIVE" }, shiftedDays: 7, shiftedTasks: 3 }))).toMatch(
      /; shifted 3 open tasks by 7 days$/,
    );
    expect(text(proj("updated", { status: { from: "ON_HOLD", to: "ACTIVE" }, shiftedDays: 1, shiftedTasks: 1 }))).toMatch(
      /; shifted 1 open task by 1 day$/,
    );
    expect(text(proj("updated", { shiftedDays: 2 }))).toBe("maya.putri shifted open tasks by 2 days");
  });

  it("handover", () => {
    expect(text(proj("updated", { handover: { from: "ana", to: "bob", tasks: 3, epics: 1 } }))).toBe(
      "maya.putri handed over ana's 3 tasks and 1 epic to bob",
    );
    expect(text(proj("updated", { handover: { from: "ana", to: null, tasks: 1 } }))).toBe(
      "maya.putri handed over ana's 1 task to nobody (left unassigned)",
    );
    expect(text(proj("updated", { tam: { from: 1, to: 2 }, handover: { from: "ana", to: "bob", tasks: 2 } }))).toMatch(
      /; handed over ana's 2 tasks to bob$/,
    );
  });

  it("handover with epics only omits the zero task count", () => {
    expect(text(proj("updated", { handover: { from: "ana", to: "bob", tasks: 0, epics: 1 } }))).toBe(
      "maya.putri handed over ana's 1 epic to bob",
    );
    expect(text(proj("updated", { handover: { from: "ana", to: "bob", tasks: 0, epics: 2 } }))).toBe(
      "maya.putri handed over ana's 2 epics to bob",
    );
  });

  it("malformed lifecycle values degrade without throwing or printing undefined", () => {
    for (const c of [
      { cancelledTasks: "x" },
      { shiftedDays: null, shiftedTasks: 2 },
      { handover: "oops" },
      { handover: { from: "ana" } },
      { handover: {} },
    ]) {
      const t = text(proj("updated", c));
      expect(t).toBe("maya.putri updated the project");
      expect(t).not.toContain("undefined");
    }
  });
});
