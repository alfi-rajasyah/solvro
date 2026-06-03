import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { TopBar } from "./TopBar";

function ShellLayout() {
  const { open } = useSidebar();
  // The sidebar is `position: fixed` (out of flow), so the main canvas must
  // carry a left margin equal to the *live* sidebar width — otherwise an
  // expanded sidebar overlays the content instead of pushing it. Desktop only:
  // open → 260px (ml-sidebar), collapsed → 64px (ml-16). On mobile the sidebar
  // is an overlay drawer, so no shift (base has no margin).
  const shift = open ? "md:ml-sidebar" : "md:ml-16";
  return (
    <div className="h-screen w-full overflow-hidden bg-background text-on-surface">
      <Sidebar />
      <TopBar />
      <main
        className={`h-[calc(100vh-56px)] overflow-y-auto overflow-x-hidden bg-background p-4 transition-[margin] duration-200 ease-out md:p-6 ${shift}`}
      >
        <Outlet />
      </main>
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
