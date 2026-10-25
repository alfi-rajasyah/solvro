import { ApiError } from "@/lib/api";

// The API answers a failed Zod parse with 400
// `{ error: "Invalid request", code: "validation_error", details: zodError.flatten() }`
// (backend/src/http/errors.ts), where `details.fieldErrors` maps a top-level
// body key to its messages. Forms used to show only `err.message`
// ("Invalid request"), so the field that was wrong never said so
// (docs/archive/plans/application-review-2026-10-22.md, F-34).

interface ValidationDetails {
  formErrors?: unknown;
  fieldErrors?: unknown;
}

function validationDetails(err: unknown): ValidationDetails | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { code?: unknown; details?: unknown } | null | undefined;
  if (!body || body.code !== "validation_error") return null;
  const details = body.details;
  return details && typeof details === "object" ? (details as ValidationDetails) : null;
}

/**
 * The first server message for each field of a `validation_error` response,
 * keyed by the request body's field name. Empty for any other error.
 */
export function fieldErrorsFrom(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const fieldErrors = validationDetails(err)?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return out;
  for (const [field, messages] of Object.entries(fieldErrors as Record<string, unknown>)) {
    if (!Array.isArray(messages)) continue;
    const first = messages.find((m): m is string => typeof m === "string" && m.length > 0);
    if (first) out[field] = first;
  }
  return out;
}

/** "assignedToId" -> "Assigned to id". */
function fieldLabel(field: string): string {
  const words = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The text for a form's general error alert. It is the API's own message
 * (`fallback` when the error is not an API error); for a validation error it
 * also lists, as "Field: message", every rejected field the form has no input
 * for (`renderedFields` are the ones it shows inline) and any form-level
 * message, so nothing the server objected to is lost.
 */
export function formErrorMessage(
  err: unknown,
  fallback: string,
  renderedFields: readonly string[] = [],
): string {
  const base = err instanceof ApiError ? err.message : fallback;
  const details = validationDetails(err);
  if (!details) return base;
  const rendered = new Set(renderedFields);
  const items: string[] = [];
  if (Array.isArray(details.formErrors)) {
    for (const m of details.formErrors) if (typeof m === "string" && m) items.push(m);
  }
  for (const [field, message] of Object.entries(fieldErrorsFrom(err))) {
    if (!rendered.has(field)) items.push(`${fieldLabel(field)}: ${message}`);
  }
  return items.length > 0 ? `${base} — ${items.join("; ")}` : base;
}
