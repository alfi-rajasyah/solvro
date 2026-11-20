/**
 * Users a picker may offer for a NEW assignment: active accounts, plus the
 * record's current value even if that account was deactivated since (the
 * backend refuses a newly assigned inactive user but accepts a re-save of the
 * current one). `active` is optional so loosely typed pickers can pass it.
 */
export function selectableUsers<T extends { id: number; active?: boolean }>(
  users: readonly T[] | undefined,
  currentIds: ReadonlyArray<number | null | "" | undefined>,
): T[] {
  return (users ?? []).filter(
    (u) => u.active !== false || currentIds.some((id) => id === u.id),
  );
}
