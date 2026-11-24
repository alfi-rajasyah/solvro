import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminGuard } from "@/components/AdminGuard";
import { AuthGuard } from "@/components/AuthGuard";
import { ExecutiveGuard } from "@/components/ExecutiveGuard";
import { PermissionGuard } from "@/components/PermissionGuard";
import { PipelineGuard } from "@/components/PipelineGuard";
import { Shell } from "@/components/layout/Shell";
import { lazyPage } from "@/lib/lazyPage";
import { Login } from "@/pages/Login";
import { NotFound } from "@/pages/NotFound";
import { Overview } from "@/pages/Overview";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { PublicShare } from "@/pages/PublicShare";

// Route-level code splitting: everything except the pages a session always
// opens first (Login, Overview, ProjectDetail's frame) loads on demand, so the
// entry chunk stays small. Projects went lazy when React Router 7 pushed the
// entry chunk over its 1 MB budget (docs/ISSUES.md ISS-175). The Suspense
// boundary lives in Shell.tsx, inside the page error boundary, so a failed
// chunk is still caught (docs/archive/plans/application-review-2026-10-22.md,
// F-16).
// `lazyPage` (lib/lazyPage.ts) retries a failed chunk import once.
const Admin = lazyPage(() => import("@/pages/Admin"), "Admin");
const CustomerDetail = lazyPage(() => import("@/pages/CustomerDetail"), "CustomerDetail");
const Customers = lazyPage(() => import("@/pages/Customers"), "Customers");
const DailyReview = lazyPage(() => import("@/pages/DailyReview"), "DailyReview");
const Executive = lazyPage(() => import("@/pages/Executive"), "Executive");
const Help = lazyPage(() => import("@/pages/Help"), "Help");
const OpportunityDetail = lazyPage(() => import("@/pages/OpportunityDetail"), "OpportunityDetail");
const Pipeline = lazyPage(() => import("@/pages/Pipeline"), "Pipeline");
const Projects = lazyPage(() => import("@/pages/Projects"), "Projects");
const Settings = lazyPage(() => import("@/pages/Settings"), "Settings");
const Tasks = lazyPage(() => import("@/pages/Tasks"), "Tasks");
const Utilization = lazyPage(() => import("@/pages/Utilization"), "Utilization");
const WeeklySync = lazyPage(() => import("@/pages/WeeklySync"), "WeeklySync");
const ProjectEpics = lazyPage(() => import("@/pages/views/ProjectEpics"), "ProjectEpics");
const ProjectGantt = lazyPage(() => import("@/pages/views/ProjectGantt"), "ProjectGantt");
const ProjectKanban = lazyPage(() => import("@/pages/views/ProjectKanban"), "ProjectKanban");
const ProjectList = lazyPage(() => import("@/pages/views/ProjectList"), "ProjectList");
const ProjectOverview = lazyPage(() => import("@/pages/views/ProjectOverview"), "ProjectOverview");
const ProjectRisks = lazyPage(() => import("@/pages/views/ProjectRisks"), "ProjectRisks");
const ProjectServices = lazyPage(() => import("@/pages/views/ProjectServices"), "ProjectServices");
const ProjectTimeline = lazyPage(() => import("@/pages/views/ProjectTimeline"), "ProjectTimeline");

/**
 * `/projects/:id` → its Overview tab. Carries `?task=` (and any other query or
 * hash) across the redirect so a shared task link still opens the panel.
 */
function ProjectIndexRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "overview", search, hash }} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Guest link view: outside AuthGuard and the app shell, never redirects. */}
      <Route path="/share/:token" element={<PublicShare />} />

      <Route
        element={
          <AuthGuard>
            <Shell />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />}>
          <Route index element={<ProjectIndexRedirect />} />
          <Route path="overview" element={<ProjectOverview />} />
          <Route path="list" element={<ProjectList />} />
          <Route path="kanban" element={<ProjectKanban />} />
          <Route path="gantt" element={<ProjectGantt />} />
          <Route path="epics" element={<ProjectEpics />} />
          <Route path="timeline" element={<ProjectTimeline />} />
          <Route path="risks" element={<ProjectRisks />} />
          <Route path="services" element={<ProjectServices />} />
        </Route>
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="daily-review" element={<DailyReview />} />
        <Route path="weekly-sync" element={<WeeklySync />} />
        <Route path="tasks" element={<Tasks />} />
        {/* Utilization is gated on project:read, like its nav entry — hours mean
            nothing without project access (port decision I-7,
            docs/archive/plans/solvro-cust-port-plan.md §10). */}
        <Route
          path="utilization"
          element={
            <PermissionGuard permission="project:read">
              <Utilization />
            </PermissionGuard>
          }
        />
        <Route path="work-logs" element={<Navigate to="/utilization" replace />} />
        <Route
          path="pipeline"
          element={
            <PipelineGuard>
              <Pipeline />
            </PipelineGuard>
          }
        />
        <Route
          path="pipeline/:id"
          element={
            <PipelineGuard>
              <OpportunityDetail />
            </PipelineGuard>
          }
        />
        <Route
          path="executive"
          element={
            <ExecutiveGuard>
              <Executive />
            </ExecutiveGuard>
          }
        />
        <Route path="settings" element={<Settings />} />
        <Route path="help" element={<Help />} />
        <Route
          path="admin"
          element={
            <AdminGuard>
              <Admin />
            </AdminGuard>
          }
        />
        {/* Unknown URL: a real 404 inside the shell (sidebar stays) instead of
            a silent redirect to Overview
            (docs/archive/plans/application-review-2026-10-22.md, F-45). */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
