import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Runs a dynamic import, retrying once after `delayMs` if it rejects (a
 * flaky network or a chunk replaced mid-deploy)
 * (docs/archive/plans/application-review-2026-10-22.md, F-16).
 */
export async function importWithRetry<T>(load: () => Promise<T>, delayMs = 400): Promise<T> {
  try {
    return await load();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return load();
  }
}

/**
 * `React.lazy` for a named export. React caches the first rejection of a lazy
 * component for good, so the page error boundary's "Try again" would re-throw
 * the same error forever; the factory therefore retries the import itself.
 * A page that still fails after the retry shows the boundary's panel, and
 * "Reload page" is the way out.
 */
export function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): LazyExoticComponent<ComponentType> {
  return lazy(() => importWithRetry(load).then((m) => ({ default: m[name] })));
}
