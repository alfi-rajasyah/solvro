import { ApiError } from "@/lib/api";

/**
 * The message to show when saving a role fails. A validation error carries the
 * Zod issue text in `details.fieldErrors.permissions` (it names the rejected
 * permission); the generic `error` text ("Invalid request") would not.
 */
export function roleSaveErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  const body = err.body as
    | { code?: string; details?: { fieldErrors?: Record<string, string[] | undefined> } }
    | null
    | undefined;
  if (body?.code === "validation_error") {
    const issue = body.details?.fieldErrors?.permissions?.[0];
    if (issue) return issue;
  }
  return err.message;
}
