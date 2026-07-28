import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { CommandPalette } from "@/components/CommandPalette";
import { InstallBanner } from "@/components/InstallBanner";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { TopBar } from "./TopBar";

function ShellLayout() {
  const { open } = useSidebar();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Single app-wide ⌘K/Ctrl+K listener. Skips editable targets so typing
  // "k" with modifiers inside inputs/textareas never hijacks focus (spec).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setPaletteOpen((v) => !v);
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
      {/* In normal flow (unlike Sidebar/TopBar, which are fixed/sticky) so it
          takes its own row at the very top; main below is flex-1 so it fills
          whatever's left rather than assuming a fixed TopBar height. */}
      <InstallBanner />
      <Sidebar />
      <TopBar onOpenSearch={() => setPaletteOpen(true)} />
      <main
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-4 transition-[margin] duration-200 ease-out md:p-6 ${shift}`}
      >
        <Outlet />
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
