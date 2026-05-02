import { useState } from "react";
import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { ProjectFormModal } from "@/components/ProjectFormModal";
import { ProjectStatusChip } from "@/components/StatusChip";
import { hasPermission, useAuth } from "@/lib/auth";
import { type ProjectDetail as ProjectDetailType, useProject } from "@/lib/queries";

const TABS = [
  { to: "list", label: "List" },
  { to: "kanban", label: "Kanban" },
  { to: "gantt", label: "Gantt" },
  { to: "timeline", label: "Timeline" },
];

export interface ProjectOutletContext {
  project: ProjectDetailType;
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = id ? Number(id) : null;
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);

  const { data: project, isLoading, isError, error } = useProject(projectId);

  const canEdit = hasPermission(user, "project:write");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
        <div className="h-64 animate-pulse rounded border border-outline-variant bg-surface-container-low" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="rounded border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container">
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
    <div
      className={[
        "flex h-full min-w-0 flex-col transition-[margin] duration-200 ease-out",
        contextOpen ? "md:mr-80" : "mr-0",
      ].join(" ")}
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest text-on-surface-variant">
            SOLV-{String(project.id).padStart(3, "0")}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="truncate font-display text-h2 text-on-surface">
              {project.name}
            </h1>
            <ProjectStatusChip status={project.status} />
          </div>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
              {project.description}
            </p>
          )}
          <p className="mt-2 text-[11px] text-on-surface-variant">
            TAM <span className="font-medium text-on-surface">{project.tam.username}</span>{" "}
            · SA <span className="font-medium text-on-surface">{project.sa.username}</span>{" "}
            · {project._count.tasks} tasks
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-display text-xs font-bold text-on-surface hover:bg-surface-container"
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
              "inline-flex items-center gap-2 rounded border px-3 py-1.5 font-display text-xs font-bold transition-colors",
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

      <nav className="mb-6 flex gap-6 overflow-x-auto whitespace-nowrap border-b border-outline-variant">
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
    </div>
  );
}

export function useProjectContext(): ProjectOutletContext {
  return useOutletContext<ProjectOutletContext>();
}
