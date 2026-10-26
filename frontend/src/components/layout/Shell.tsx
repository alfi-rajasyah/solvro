import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { CommandPalette } from "@/components/CommandPalette";
import { InstallBanner } from "@/components/InstallBanner";
import { useAuth } from "@/lib/auth";
import { ConnectionAnnouncer, OfflineBanner, SessionExpiryBanner, UpdateBanner } from "./ConnectionBanners";
import { RouteFallback } from "./RouteFallback";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { TopBar } from "./TopBar";

const MAIN_CONTENT_ID = "main-content";

function ShellLayout() {
  const { open } = useSidebar();
  const { bootError, retryBoot } = useAuth();
  // Keyed on the path so a page-level error panel clears as soon as the user
  // navigates elsewhere instead of sticking to every later page.
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Mirror of `paletteOpen` for the listener below, which stays mounted once
  // ([] deps) instead of re-attaching on every open/close — a passive
  // `[paletteOpen]`-deps effect leaves a brief stale-closure window (a
  // key-repeat ⌘K can fire before React tears down and re-attaches the old
  // closure) where the guard reads a stale value. The ref is updated inline,
  // synchronously, at the exact point the listener itself decides to
  // open/close (no waiting on a render+effect round-trip to catch up), and
  // mirrored by the effect below for opens/closes that originate elsewhere
  // (TopBar's search icon, CommandPalette's own Escape/backdrop close).
  const paletteOpenRef = useRef(paletteOpen);
  useEffect(() => {
    paletteOpenRef.current = paletteOpen;
  }, [paletteOpen]);

  // Single app-wide ⌘K/Ctrl+K listener. The editable-target guard only
  // applies to the OPEN direction (typing "k" with modifiers inside an
  // input/textarea never hijacks focus, per spec); the CLOSE direction
  // checks `paletteOpenRef` directly instead, since the palette autofocuses
  // its own input the instant it opens (CommandPalette.tsx) — inferring
  // "closing" from `document.activeElement`'s tag made a second ⌘K press
  // no-op almost every time, because focus was already sitting inside that
  // same input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      if (paletteOpenRef.current) {
        e.preventDefault();
        paletteOpenRef.current = false;
        setPaletteOpen(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      paletteOpenRef.current = true;
      setPaletteOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The sidebar is `position: fixed` (out of flow), so the main canvas must
  // carry a left margin equal to the *live* sidebar width — otherwise an
  // expanded sidebar overlays the content instead of pushing it. Desktop only:
  // open → 260px (ml-sidebar), collapsed → 64px (ml-16). On mobile the sidebar
  // is an overlay drawer, so no shift (base has no margin).
  const shift = open ? "md:ml-sidebar" : "md:ml-sidebar-collapsed";
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-on-surface">
      {/* First focusable element: keyboard users jump past the sidebar and top
          bar. Visually hidden until focused (docs/archive/plans/application-review-2026-10-22.md, F-34). */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-200 focus:rounded-sm focus:border focus:border-outline-variant focus:bg-surface-container-lowest focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        onClick={(e) => {
          // Move focus directly: a bare hash href would add "#main-content"
          // to the router's URL.
          e.preventDefault();
          document.getElementById(MAIN_CONTENT_ID)?.focus();
        }}
      >
        Skip to main content
      </a>
      {/* In normal flow (unlike Sidebar/TopBar, which are fixed/sticky) so it
          takes its own row at the very top; main below is flex-1 so it fills
          whatever's left rather than assuming a fixed TopBar height. */}
      <InstallBanner />
      <ConnectionAnnouncer />
      <OfflineBanner shift={shift} />
      <UpdateBanner shift={shift} />
      <SessionExpiryBanner shift={shift} />
      {bootError && (
        // Shifted past the fixed sidebar like <main>, or its first words sit
        // underneath it (docs/archive/plans/application-review-2026-10-22.md, QA-02).
        <div
          role="alert"
          className={`flex flex-wrap items-center justify-between gap-2 border-b border-error/40 bg-error-container px-4 py-2 text-sm text-on-error-container transition-[margin] duration-200 ease-out ${shift}`}
        >
          <span>Cannot reach the server to confirm your session: {bootError}</span>
          <button
            type="button"
            className="rounded-sm border border-current px-2 py-0.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            onClick={retryBoot}
          >
            Retry
          </button>
        </div>
      )}
      <Sidebar />
      <TopBar onOpenSearch={() => setPaletteOpen(true)} />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={`min-h-0 flex-1 overflow-y-auto focus:outline-none overflow-x-hidden bg-background p-4 transition-[margin] duration-200 ease-out md:p-6 ${shift}`}
      >
        {/* A page-level render error keeps the sidebar and top bar usable. */}
        <AppErrorBoundary scope="page" key={pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </AppErrorBoundary>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export function Shell() {
  return (
    <SidebarProvider>
      <ShellLayout />
    </SidebarProvider>
  );
}
