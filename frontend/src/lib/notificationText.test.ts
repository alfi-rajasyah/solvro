import { describe, expect, it } from "vitest";
import { describeNotification, notificationHref } from "./notificationText";
import type { ActivityEvent, AppNotification } from "./queries";

function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 1,
    entityType: "task",
    entityId: 42,
    projectId: 7,
    opportunityId: null,
    action: "updated",
    entityLabel: "Configure backup jobs",
    changes: { assignee: { from: null, to: { id: 3, username: "ana" } } },
    createdAt: "2026-09-30T10:00:00.000Z",
    actor: { id: 9, username: "rina.wijaya", avatarUrl: null },
    ...over,
  };
}

function notif(over: Partial<AppNotification> = {}, ev: Partial<ActivityEvent> = {}): AppNotification {
  return {
    id: 5,
    reason: "assigned",
    readAt: null,
    createdAt: "2026-09-30T10:00:00.000Z",
    event: event(ev),
    projectId: 7,
    projectName: "Acme rollout",
    opportunityId: null,
    opportunityTitle: null,
    ...over,
  };
}

describe("describeNotification", () => {
  it("assigned", () => {
    expect(describeNotification(notif()).text).toBe("rina.wijaya assigned you Configure backup jobs");
  });

  it("commented", () => {
    const n = notif(
      { reason: "commented" },
      { entityType: "comment", entityId: 900, action: "created", changes: { taskId: 42 } },
    );
    expect(describeNotification(n).text).toBe("rina.wijaya commented on Configure backup jobs");
  });

  it("mentioned", () => {
    expect(describeNotification(notif({ reason: "mentioned" })).text).toBe(
      "rina.wijaya mentioned you on Configure backup jobs",
    );
  });

  it("emphasises actor and task in parts", () => {
    const { parts } = describeNotification(notif());
    expect(parts[0]).toEqual({ kind: "actor", text: "rina.wijaya" });
    expect(parts[parts.length - 1]).toEqual({ kind: "entity", text: "Configure backup jobs" });
  });

  it("a deleted actor reads Someone", () => {
    expect(describeNotification(notif({}, { actor: null })).text).toBe("Someone assigned you Configure backup jobs");
  });

  it("falls back to the activity sentence for an unknown reason or a missing title", () => {
    expect(describeNotification(notif({ reason: "weird" as never })).text).toMatch(/^rina\.wijaya /);
    expect(describeNotification(notif({}, { entityLabel: null })).text).toMatch(/^rina\.wijaya /);
  });
});

describe("notificationHref", () => {
  it("task events link to the task via entityId", () => {
    expect(notificationHref(notif())).toBe("/projects/7?task=42");
  });

  it("comment events link via changes.taskId, not the comment id", () => {
    const n = notif({ reason: "commented" }, { entityType: "comment", entityId: 900, action: "created", changes: { taskId: 42 } });
    expect(notificationHref(n)).toBe("/projects/7?task=42");
  });

  it("falls back to the project when no task is known or it was deleted", () => {
    expect(notificationHref(notif({}, { entityType: "comment", entityId: 900, changes: null }))).toBe("/projects/7");
    expect(notificationHref(notif({}, { action: "deleted" }))).toBe("/projects/7");
    expect(notificationHref(notif({}, { entityType: "risk" }))).toBe("/projects/7");
  });
});

describe("deal notifications", () => {
  const dealEvent: Partial<ActivityEvent> = {
    entityType: "opportunity",
    entityId: null,
    projectId: null,
    opportunityId: "opp1",
    entityLabel: "Acme deal",
    changes: null,
  };
  const dealNotif = (reason: AppNotification["reason"], ev: Partial<ActivityEvent> = {}) =>
    notif(
      { reason, projectId: null, projectName: null, opportunityId: "opp1", opportunityTitle: "Acme deal" },
      { ...dealEvent, ...ev },
    );

  it("assigned you the deal", () => {
    expect(describeNotification(dealNotif("assigned", { action: "assigned" })).text).toBe(
      "rina.wijaya assigned you the deal Acme deal",
    );
  });

  it("added a note", () => {
    expect(
      describeNotification(dealNotif("commented", { entityType: "opportunity_note", action: "created" })).text,
    ).toBe("rina.wijaya added a note on Acme deal");
  });

  it("mentioned you on a deal", () => {
    expect(
      describeNotification(dealNotif("mentioned", { entityType: "opportunity_note", action: "created" })).text,
    ).toBe("rina.wijaya mentioned you on Acme deal");
  });

  it("closed, with the outcome when the event has it", () => {
    expect(
      describeNotification(dealNotif("deal_closed", { action: "closed", changes: { outcome: "LOST" } })).text,
    ).toBe("rina.wijaya closed Acme deal as Lost");
    expect(describeNotification(dealNotif("deal_closed", { action: "closed" })).text).toBe(
      "rina.wijaya closed Acme deal",
    );
  });

  it("reads the outcome through the shared labels", () => {
    expect(
      describeNotification(dealNotif("deal_closed", { action: "closed", changes: { outcome: "CANCELLED" } })).text,
    ).toBe("rina.wijaya closed Acme deal as Cancelled");
  });

  it("emphasises the deal title", () => {
    const { parts } = describeNotification(dealNotif("assigned", { action: "assigned" }));
    expect(parts[parts.length - 1]).toEqual({ kind: "entity", text: "Acme deal" });
  });

  it("links to the deal page, never to a project", () => {
    expect(notificationHref(dealNotif("assigned", { action: "assigned" }))).toBe("/pipeline/opp1");
    expect(notificationHref(dealNotif("commented", { entityType: "opportunity_note" }))).toBe("/pipeline/opp1");
  });

  it("handed off to a project", () => {
    const n = dealNotif("handed_off", { action: "handed_off", changes: { project: { id: 9, name: "Acme rollout" } } });
    expect(describeNotification(n).text).toBe("rina.wijaya handed Acme deal off to project Acme rollout");
    expect(notificationHref(n)).toBe("/pipeline/opp1");
    expect(describeNotification(dealNotif("handed_off", { action: "handed_off" })).text).toBe(
      "rina.wijaya handed Acme deal off to a project",
    );
  });

  it("falls back to the activity sentence when no deal title is known", () => {
    const n = dealNotif("assigned", { action: "assigned", entityLabel: null });
    n.opportunityTitle = null;
    expect(describeNotification(n).text).toMatch(/^rina\.wijaya /);
  });
});

describe("project role notifications", () => {
  const roleNotif = (changes: Record<string, unknown>, reason: AppNotification["reason"] = "assigned") =>
    notif({ reason }, { entityType: "project", entityId: 7, action: "created", entityLabel: "Acme rollout", changes });

  it("made you TAM of the project, from the deal", () => {
    const n = roleNotif({ fromOpportunity: { id: "opp1", title: "Acme deal" }, tam: { id: 3, username: "ana" }, sa: { id: 4, username: "budi" } });
    expect(describeNotification(n, 3).text).toBe("rina.wijaya made you TAM of Acme rollout (from deal Acme deal)");
  });

  it("made you SA of the project when the viewer is the SA", () => {
    const n = roleNotif({ tam: { id: 3, username: "ana" }, sa: { id: 4, username: "budi" } });
    expect(describeNotification(n, 4).text).toBe("rina.wijaya made you SA of Acme rollout");
  });

  it("an SA change on a project reads as the SA role without a viewer id", () => {
    const n = roleNotif({ sa: { from: null, to: { id: 4, username: "budi" } } });
    n.event.action = "updated";
    expect(describeNotification(n).text).toBe("rina.wijaya made you SA of Acme rollout");
  });

  it("omits the deal for a viewer without pipeline:view", () => {
    const n = roleNotif({ fromOpportunity: { id: "opp1", title: "Acme deal" }, tam: { id: 3, username: "ana" } });
    expect(describeNotification(n, 3, false).text).toBe("rina.wijaya made you TAM of Acme rollout");
    expect(
      describeNotification(roleNotif({ fromOpportunity: { withheld: true }, tam: { id: 3, username: "ana" } }), 3).text,
    ).toBe("rina.wijaya made you TAM of Acme rollout");
  });

  it("links a role notification to the project", () => {
    expect(notificationHref(roleNotif({ tam: 3 }))).toBe("/projects/7");
  });
});

describe("describeNotification - lifecycle", () => {
  const pe = (changes: unknown, action = "updated") =>
    ({ entityType: "project", entityId: 7, action, entityLabel: "Acme rollout", changes }) as Partial<ActivityEvent>;

  it("all tasks closed has no actor and links to the project", () => {
    const n = notif({ reason: "all_tasks_closed" as AppNotification["reason"] }, pe({ done: 3, cancelled: 0 }, "all_tasks_closed"));
    const s = describeNotification(n);
    expect(s.text).toBe("All tasks in Acme rollout are closed — mark the project Completed?");
    expect(s.parts.some((p) => p.kind === "actor")).toBe(false);
    expect(notificationHref(n)).toBe("/projects/7");
  });

  it("tasks handed over, singular and plural", () => {
    const r = "tasks_handed_over" as AppNotification["reason"];
    expect(describeNotification(notif({ reason: r }, pe({ handover: { from: "ana", to: "me", tasks: 3, epics: 1 } }))).text).toBe(
      "rina.wijaya handed you 3 tasks and 1 epic in Acme rollout",
    );
    expect(describeNotification(notif({ reason: r }, pe({ handover: { from: "ana", to: "me", tasks: 1 } }))).text).toBe(
      "rina.wijaya handed you 1 task in Acme rollout",
    );
  });

  it("thin handover payload falls back to the activity sentence", () => {
    const r = "tasks_handed_over" as AppNotification["reason"];
    for (const c of [null, {}, { handover: { from: "ana" } }]) {
      const t = describeNotification(notif({ reason: r }, pe(c))).text;
      expect(t).toBe("rina.wijaya updated the project");
      expect(t).not.toContain("undefined");
    }
  });
});
