/**
 * True on Apple platforms, where the search shortcut reads ⌘K. Elsewhere it
 * is Ctrl K. Reads `userAgentData` when the browser has it, else the legacy
 * platform string, and is false outside a browser.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Label for the app-wide search shortcut, matching the host platform. */
export function searchShortcutLabel(): string {
  return isMacPlatform() ? "⌘K" : "Ctrl K";
}
