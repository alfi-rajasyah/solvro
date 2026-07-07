import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { ProjectFormModal } from "@/components/ProjectFormModal";
import { TaskPanel } from "@/components/TaskPanel";
import { hasPermission, useAuth } from "@/lib/auth";
import { GanttExportProvider } from "@/lib/gantt/exportContext";
import { type ProjectDetail as ProjectDetailType, useProject } from "@/lib/queries";

const TABS = [
  { to: "overview", label: "Overview" },
  { to: "list", label: "List" },
  { to: "kanban", label: "Kanban" },
  { to: "gantt", label: "Gantt" },
  { to: "timeline", label: "Timeline" },
  { to: "risks", label: "Risks" },
];

export interface ProjectOutletContext {
  project: ProjectDetailType;
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = id ? Number(id) : null;
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: project, isLoading, isError, error } = useProject(projectId);

  // Task side panel is deep-linked via ?task=<id> so it works the same way
  // from the Kanban and List views (and survives a page refresh / share).
  const taskParam = searchParams.get("task");
  const parsedTaskId = taskParam ? Number(taskParam) : NaN;
  const openTaskId = Number.isFinite(parsedTaskId) ? parsedTaskId : null;

  function closeTaskPanel() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("task");
        return next;
      },
      { replace: true },
    );
  }

  const canEdit = hasPermission(user, "project:write");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-surface-container-low" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-container-low" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="rounded-lg border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
        {error instanceof Error
          ? error.message
          : "Project not found or you don't have access."}{" "}
        <Link to="/projects" className="ml-2 font-bold underline">
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <GanttExportProvider>
    <div
      className={[
        "flex h-full min-w-0 flex-col transition-[margin] duration-200 ease-out",
        contextOpen ? "md:mr-80" : openTaskId !== null ? "md:mr-[380px]" : "mr-0",
      ].join(" ")}
    >
      {/* Project name + status now live in the TopBar (see TopBar.tsx).
          This thin meta row keeps description + roles + actions next to the tabs. */}
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          {project.description && (
            <p className="max-w-2xl text-sm text-on-surface-variant">
              {project.description}
            </p>
          )}
          <p className="mt-1 text-[12px] text-on-surface-variant">
            SA <span className="font-medium text-on-surface">{project.sa.username}</span>
            {" → "}
            TAM <span className="font-medium text-on-surface">{project.tam.username}</span>{" "}
            · {project._count.tasks} tasks
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-display text-xs font-bold text-on-surface hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-base">edit</span>
              Edit project
            </button>
          )}
          <button
            type="button"
            onClick={() => setContextOpen((v) => !v)}
            aria-pressed={contextOpen}
            aria-label={contextOpen ? "Hide project context" : "Show project context"}
            className={[
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-display text-xs font-bold transition-colors",
              contextOpen
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container",
            ].join(" ")}
          >
            <span className="material-symbols-outlined text-base">
              {contextOpen ? "right_panel_close" : "right_panel_open"}
            </span>
            Context
          </button>
        </div>
      </div>

      <nav className="mb-6 flex gap-6 overflow-x-auto overflow-y-clip whitespace-nowrap border-b border-outline-variant">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              [
                "-mb-px border-b-2 px-1 pb-3 font-display text-sm transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface",
                tab.to === "gantt" ? "hidden md:inline-block" : "",
              ].join(" ")
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="min-h-0 min-w-0 flex-1">
        <Outlet context={{ project } satisfies ProjectOutletContext} />
      </div>

      <ProjectFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={project}
      />

      <RightSidebar
        project={project}
        open={contextOpen}
        onClose={() => setContextOpen(false)}
      />

      {openTaskId !== null && (
        <TaskPanel
          key={openTaskId}
          projectId={project.id}
          taskId={openTaskId}
          onClose={closeTaskPanel}
        />
      )}
    </div>
    </GanttExportProvider>
  );
}

export function useProjectContext(): ProjectOutletContext {
  return useOutletContext<ProjectOutletContext>();
}
