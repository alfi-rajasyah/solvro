// Pure logic behind the offboarding handover modal: the draft the admin
// edits, the completeness rule, the request body, and the error mapping
// (docs/archive/plans/feedback-round-lifecycle-spec.md, F5).
import { ApiError } from "@/lib/api";
import type { HandoverPreview, OffboardBody } from "@/lib/queries";

export const HANDOVER_NOTE_MAX = 2000;

export interface ProjectDraft {
  /** Receiver of the leaver's open tasks and epics; null = leave unassigned. */
  assignTasksTo: number | null;
  /** Required where the leaver is the project's TAM; null = not chosen yet. */
  newTamId: number | null;
  /** Receiver of the SA seat; null = no SA. */
  newSaId: number | null;
  note: string;
}

export interface HandoverDraft {
  projects: Record<number, ProjectDraft>;
  /** customerId -> new owner; null = not chosen yet (an owner is required). */
  customers: Record<number, number | null>;
  /** Receiver of every open deal; null = unassigned. */
  dealsPicId: number | null;
}

/** Defaults: Unassigned / No SA / Unassigned; TAM and customer owners are empty. */
export function initialDraft(preview: HandoverPreview): HandoverDraft {
  const projects: Record<number, ProjectDraft> = {};
  for (const p of preview.projects) {
    projects[p.id] = { assignTasksTo: null, newTamId: null, newSaId: null, note: "" };
  }
  const customers: Record<number, number | null> = {};
  for (const c of preview.customers) customers[c.id] = null;
  return { projects, customers, dealsPicId: null };
}

/** The project ids whose required TAM is still missing. */
export function missingTamProjectIds(preview: HandoverPreview, draft: HandoverDraft): number[] {
  return preview.projects
    .filter((p) => p.isTam && draft.projects[p.id]?.newTamId == null)
    .map((p) => p.id);
}

/**
 * The customer ids still without a new owner. Every owned customer needs one,
 * because an unowned customer is claimable by any TAM
 * (docs/archive/plans/offboard-customer-owner.md).
 */
export function missingOwnerCustomerIds(preview: HandoverPreview, draft: HandoverDraft): number[] {
  return preview.customers.filter((c) => draft.customers[c.id] == null).map((c) => c.id);
}

export function isHandoverComplete(preview: HandoverPreview, draft: HandoverDraft): boolean {
  if (missingTamProjectIds(preview, draft).length > 0) return false;
  if (missingOwnerCustomerIds(preview, draft).length > 0) return false;
  return preview.projects.every(
    (p) => (draft.projects[p.id]?.note.trim().length ?? 0) <= HANDOVER_NOTE_MAX,
  );
}

export function buildOffboardBody(preview: HandoverPreview, draft: HandoverDraft): OffboardBody {
  return {
    projects: preview.projects.map((p) => {
      const d = draft.projects[p.id];
      const note = d?.note.trim() ?? "";
      return {
        projectId: p.id,
        assignTasksTo: d?.assignTasksTo ?? null,
        ...(p.isTam && d?.newTamId != null ? { newTamId: d.newTamId } : {}),
        ...(p.isSa ? { newSaId: d?.newSaId ?? null } : {}),
        ...(note ? { note } : {}),
      };
    }),
    // isHandoverComplete guarantees an owner for each customer before a submit.
    customers: preview.customers.flatMap((c) => {
      const newOwnerId = draft.customers[c.id];
      return newOwnerId == null ? [] : [{ customerId: c.id, newOwnerId }];
    }),
    ...(preview.openDeals > 0 ? { dealsPicId: draft.dealsPicId } : {}),
  };
}

/**
 * Who can receive handed-over work: active, not the leaver, and holding a role
 * that grants at least one permission (`hasAccess` from GET /users). The same
 * rule the server enforces on offboarding and on project reassign.
 */
export function handoverReceivers<
  U extends { id: number; active: boolean; hasAccess: boolean },
>(users: readonly U[], leaverId: number): U[] {
  return users.filter((u) => u.active && u.id !== leaverId && u.hasAccess);
}

/** Applies one assignee to every project row ("Apply to all"). */
export function applyAssigneeToAll(draft: HandoverDraft, assignTasksTo: number | null): HandoverDraft {
  const projects: Record<number, ProjectDraft> = {};
  for (const [id, d] of Object.entries(draft.projects)) {
    projects[Number(id)] = { ...d, assignTasksTo };
  }
  return { ...draft, projects };
}

export interface HandoverError {
  message: string;
  projectId?: number;
  customerId?: number;
  /** True for `deals`-level problems (PIC). */
  deals?: boolean;
  /** The user's work changed under the admin: the preview should be reloaded. */
  stale?: boolean;
}

const ROW_MESSAGES: Record<string, string> = {
  tam_required: "Choose a new TAM for this project.",
  assignee_not_found: "The person chosen for the tasks is not an active user.",
  tam_not_found: "The new TAM is not an active user.",
  sa_not_found: "The new SA is not an active user.",
  assignee_cannot_receive: "The person chosen for the tasks has no access yet.",
  tam_cannot_receive: "The new TAM has no access yet.",
  sa_cannot_receive: "The new SA has no access yet.",
  user_has_no_access: "The chosen person cannot be given access to this project.",
};

function numberField(details: unknown, key: string): number | undefined {
  if (!details || typeof details !== "object") return undefined;
  const v = (details as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

export function handoverErrorFrom(err: unknown): HandoverError {
  if (!(err instanceof ApiError)) return { message: "Could not hand over this user's work." };
  const body = err.body as { code?: unknown; details?: unknown } | null | undefined;
  const code = typeof body?.code === "string" ? body.code : "";
  const details = body?.details;
  if (code in ROW_MESSAGES) {
    return {
      message: ROW_MESSAGES[code],
      projectId: numberField(details, "projectId"),
      // The leaver became TAM after the preview: reload so the picker appears.
      ...(code === "tam_required" ? { stale: true } : {}),
    };
  }
  switch (code) {
    case "owner_not_found":
      return {
        message: "The new owner is not an active user.",
        customerId: numberField(details, "customerId"),
      };
    case "owner_cannot_receive":
      return {
        message: "The new owner has no access yet.",
        customerId: numberField(details, "customerId"),
      };
    case "pic_not_found":
      return { message: "The person chosen for the deals is not an active user.", deals: true };
    case "pic_no_pipeline_access":
      return {
        message: "That person has no Pipeline access. Choose someone who can open the Pipeline.",
        deals: true,
      };
    case "handover_incomplete":
      return {
        message: "This user's work changed while you were choosing.",
        stale: true,
      };
    case "self_deactivate":
      return { message: "You cannot deactivate yourself." };
    case "user_not_found":
      return { message: "This user no longer exists." };
    default:
      return { message: err.message || "Could not hand over this user's work." };
  }
}
