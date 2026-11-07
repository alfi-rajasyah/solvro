import { fieldErrorsFrom } from "@/lib/formErrors";
import { ApiError } from "@/lib/api";

/**
 * The message to show when saving a role fails. A validation error carries the
 * Zod issue text in `details.fieldErrors.permissions` (it names the rejected
 * permission); the generic `error` text ("Invalid request") would not.
 */
export function roleSaveErrorMessage(err: unknown, fallback: string): string {
  const issue = fieldErrorsFrom(err).permissions;
  if (issue) return issue;
  return err instanceof ApiError ? err.message : fallback;
}
