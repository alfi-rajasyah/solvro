import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SidebarProvider } from "./SidebarContext";
import { TopBar } from "./TopBar";

export function Shell() {
  return (
    <SidebarProvider>
      <div className="h-screen w-full overflow-hidden bg-background text-on-surface">
        <Sidebar />
        <TopBar />
        <main className="h-[calc(100vh-64px)] overflow-y-auto overflow-x-hidden bg-surface-container-low p-4 md:ml-16 md:p-6">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
