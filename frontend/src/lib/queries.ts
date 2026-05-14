import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./api";
import type { Role } from "./auth";

export type ProjectStatus =
  | "PLANNING"
  | "ACTIVE"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface UserSummary {
  id: number;
  username: string;
  email: string;
  role: Role;
  permissions: string[];
}

export interface Label {
  id: number;
  projectId: number;
  name: string;
  color: string;
}

export interface Section {
  id: number;
  projectId: number;
  name: string;
  position: number;
  // Hex color used as the phase track tint in the Network Diagram view.
  color: string;
  createdAt: string;
}

export interface CustomerSummary {
  id: number;
  name: string;
  accountManager: string | null;
  solutionArchitect: string | null;
  description: string;
  createdAt: string;
  _count: { projects: number };
}

export interface Service {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
}

export interface CustomerServiceAssignment {
  id: number;
  customerId: number;
  serviceId: number;
  service: Service;
  tools: string[];
  createdAt: string;
}

export interface CustomerDetail extends CustomerSummary {
  projects: ProjectSummary[];
  services: CustomerServiceAssignment[];
}

export interface ProjectSummary {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  saId: number;
  tamId: number;
  customerId: number | null;
  baselineLockedAt: string | null;
  baselineLockedById: number | null;
  createdAt: string;
  updatedAt: string;
  sa: { id: number; username: string };
  tam: { id: number; username: string };
  customer: { id: number; name: string } | null;
  _count: { tasks: number };
}

export interface ProjectDetail extends ProjectSummary {
  sa: { id: number; username: string; email: string };
  tam: { id: number; username: string; email: string };
  customer: { id: number; name: string } | null;
  baselineLockedBy: { id: number; username: string } | null;
  _count: { tasks: number; blueprints: number };
}

export interface Task {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  startDate: string | null;
  dueDate: string | null;
  baselineStartDate: string | null;
  baselineDueDate: string | null;
  assignedToId: number | null;
  assignedTo: { id: number; username: string; email: string } | null;
  parentTaskId: number | null;
  sectionId: number | null;
  section: { id: number; name: string; position: number; color: string } | null;
  labels: Label[];
  // Network Diagram fields
  isMilestone: boolean;
  diagramX: number | null;
  diagramY: number | null;
  _count: { subtasks: number; comments: number };
}

export interface TaskWithProject extends Task {
  project: {
    id: number;
    name: string;
    customer: { id: number; name: string } | null;
  };
}

export interface Comment {
  id: number;
  taskId: number;
  authorId: number;
  body: string;
  createdAt: string;
  author: { id: number; username: string; email: string };
}

export interface OverviewProject {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  updatedAt: string;
  tam: { id: number; username: string };
  sa: { id: number; username: string };
  _count: { tasks: number };
}

export interface OverviewTask {
  id: number;
  title: string;
  status: TaskStatus;
  project: { id: number; name: string };
  assignedTo: { id: number; username: string } | null;
}

export interface OverviewResponse {
  projectCount: number;
  projectStatusCounts: Partial<Record<ProjectStatus, number>>;
  taskCounts: Record<TaskStatus, number>;
  recentProjects: OverviewProject[];
  recentTasks: OverviewTask[];
}

export type NoteVisibility = "INTERNAL" | "CUSTOMER_FACING";

export interface ProjectNote {
  id: number;
  projectId: number;
  authorId: number;
  body: string;
  visibility: NoteVisibility;
  createdAt: string;
  author: { id: number; username: string };
}

export type RiskCategory =
  | "EXTERNAL"
  | "INTERNAL"
  | "TECHNICAL"
  | "ORGANIZATIONAL"
  | "FINANCIAL";

export type RiskStatus = "OPEN" | "MITIGATED" | "CLOSED";

export interface Risk {
  id: number;
  projectId: number;
  description: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  status: RiskStatus;
  mitigationPlan: string | null;
  contingencyPlan: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TasksFilter {
  status?: TaskStatus;
  priority?: Priority;
  assignedToId?: number;
  labelId?: number;
  customerId?: number;
  overdue?: boolean;
  topLevel?: boolean;
}

export interface ProjectsFilter {
  customerId?: number;
}

export const queryKeys = {
  overview: ["overview"] as const,
  users: ["users"] as const,
  projects: (filter?: ProjectsFilter) => ["projects", filter ?? {}] as const,
  project: (id: number) => ["projects", id] as const,
  projectTasks: (id: number) => ["projects", id, "tasks"] as const,
  projectLabels: (id: number) => ["projects", id, "labels"] as const,
  projectSections: (id: number) => ["projects", id, "sections"] as const,
  projectRisks: (id: number) => ["projects", id, "risks"] as const,
  projectNotes: (id: number, visibility?: NoteVisibility) =>
    ["projects", id, "notes", visibility ?? "all"] as const,
  projectDependencies: (id: number) => ["projects", id, "dependencies"] as const,
  customers: ["customers"] as const,
  customer: (id: number) => ["customers", id] as const,
  tasks: (filter?: TasksFilter) => ["tasks", filter ?? {}] as const,
  comments: (taskId: number) => ["tasks", taskId, "comments"] as const,
};

export function useOverview() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: ({ signal }) => apiRequest<OverviewResponse>("/overview", { signal }),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: ({ signal }) => apiRequest<UserSummary[]>("/users", { signal }),
    staleTime: 60_000,
  });
}

export function useProjects(filter: ProjectsFilter = {}) {
  const params = new URLSearchParams();
  if (filter.customerId) params.set("customerId", String(filter.customerId));
  const qs = params.toString();
  return useQuery({
    queryKey: queryKeys.projects(filter),
    queryFn: ({ signal }) =>
      apiRequest<ProjectSummary[]>(`/projects${qs ? `?${qs}` : ""}`, { signal }),
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: queryKeys.customers,
    queryFn: ({ signal }) => apiRequest<CustomerSummary[]>("/customers", { signal }),
    staleTime: 30_000,
  });
}

export function useCustomer(id: number | null) {
  return useQuery({
    queryKey: id ? queryKeys.customer(id) : ["customers", "noop"],
    queryFn: ({ signal }) =>
      apiRequest<CustomerDetail>(`/customers/${id}`, { signal }),
    enabled: id !== null,
  });
}

export function useProject(id: number | null) {
  return useQuery({
    queryKey: id ? queryKeys.project(id) : ["projects", "noop"],
    queryFn: ({ signal }) =>
      apiRequest<ProjectDetail>(`/projects/${id}`, { signal }),
    enabled: id !== null,
  });
}

export function useProjectTasks(id: number | null) {
  return useQuery({
    queryKey: id ? queryKeys.projectTasks(id) : ["projects", "noop", "tasks"],
    queryFn: ({ signal }) =>
      apiRequest<Task[]>(`/projects/${id}/tasks`, { signal }),
    enabled: id !== null,
  });
}

export function useProjectLabels(id: number | null) {
  return useQuery({
    queryKey: id ? queryKeys.projectLabels(id) : ["projects", "noop", "labels"],
    queryFn: ({ signal }) =>
      apiRequest<Label[]>(`/projects/${id}/labels`, { signal }),
    enabled: id !== null,
    staleTime: 30_000,
  });
}

export function useTasks(filter: TasksFilter = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.priority) params.set("priority", filter.priority);
  if (filter.assignedToId) params.set("assignedToId", String(filter.assignedToId));
  if (filter.labelId) params.set("labelId", String(filter.labelId));
  if (filter.customerId) params.set("customerId", String(filter.customerId));
  if (filter.overdue) params.set("overdue", "true");
  if (filter.topLevel) params.set("topLevel", "true");
  const qs = params.toString();
  return useQuery({
    queryKey: queryKeys.tasks(filter),
    queryFn: ({ signal }) =>
      apiRequest<TaskWithProject[]>(`/tasks${qs ? `?${qs}` : ""}`, { signal }),
  });
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  saId: number;
  tamId?: number;
  customerId: number;
  status?: ProjectStatus;
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiRequest<ProjectSummary>("/projects", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
      qc.invalidateQueries({ queryKey: queryKeys.customers });
    },
  });
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  saId?: number;
  tamId?: number;
  customerId?: number;
}

export function useUpdateProject(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) =>
      apiRequest<ProjectSummary>(`/projects/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: queryKeys.project(id) });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
      qc.invalidateQueries({ queryKey: queryKeys.customers });
    },
  });
}

export interface CustomerInput {
  name: string;
  accountManager?: string;
  solutionArchitect?: string;
  description: string;
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) =>
      apiRequest<CustomerSummary>("/customers", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.customers }),
  });
}

export function useUpdateCustomer(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CustomerInput>) =>
      apiRequest<CustomerSummary>(`/customers/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers });
      qc.invalidateQueries({ queryKey: queryKeys.customer(id) });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useServices() {
  return useQuery({
    queryKey: ["services"] as const,
    queryFn: ({ signal }) => apiRequest<Service[]>("/services", { signal }),
    staleTime: 60_000,
  });
}

export interface ServiceInput {
  name: string;
  description?: string;
  active?: boolean;
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceInput) =>
      apiRequest<Service>("/services", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<ServiceInput> }) =>
      apiRequest<Service>(`/services/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: queryKeys.customers });
    },
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/services/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: queryKeys.customers });
    },
  });
}

export interface ServiceAssignmentInput {
  serviceId: number;
  tools: string[];
}

export function useUpdateCustomerServices(customerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignments: ServiceAssignmentInput[]) =>
      apiRequest<CustomerDetail>(`/customers/${customerId}/services`, {
        method: "PUT",
        body: { assignments },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customer(customerId) });
      qc.invalidateQueries({ queryKey: queryKeys.customers });
    },
  });
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  startDate?: string | null;
  dueDate?: string | null;
  baselineStartDate?: string | null;
  baselineDueDate?: string | null;
  assignedToId?: number | null;
  parentTaskId?: number | null;
  sectionId?: number | null;
  labelIds?: number[];
  // Network Diagram fields
  isMilestone?: boolean;
  diagramX?: number | null;
  diagramY?: number | null;
}

export interface LockBaselineInput {
  asOfDate?: string | null;
  clear?: boolean;
}

export function useLockBaseline(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LockBaselineInput = {}) =>
      apiRequest<ProjectDetail>(`/projects/${projectId}/baseline`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateTask(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateTaskInput }) =>
      apiRequest<Task>(`/tasks/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.projectTasks(projectId) });
      const prev = qc.getQueryData<Task[]>(queryKeys.projectTasks(projectId));
      if (prev) {
        qc.setQueryData<Task[]>(
          queryKeys.projectTasks(projectId),
          prev.map((t) => (t.id === id ? { ...t, ...patch } as Task : t)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev)
        qc.setQueryData(queryKeys.projectTasks(projectId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useDeleteTask(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  startDate?: string | null;
  dueDate?: string | null;
  assignedToId?: number | null;
  parentTaskId?: number | null;
  sectionId?: number | null;
  labelIds?: number[];
  isMilestone?: boolean;
}

export function useCreateTask(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiRequest<Task>(`/projects/${projectId}/tasks`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export interface CreateLabelInput {
  name: string;
  color?: string;
}

export function useCreateLabel(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLabelInput) =>
      apiRequest<Label>(`/projects/${projectId}/labels`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectLabels(projectId) });
    },
  });
}

export function useDeleteLabel(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/labels/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectLabels(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
    },
  });
}

export function useComments(taskId: number | null) {
  return useQuery({
    queryKey: taskId ? queryKeys.comments(taskId) : ["tasks", "noop", "comments"],
    queryFn: ({ signal }) =>
      apiRequest<Comment[]>(`/tasks/${taskId}/comments`, { signal }),
    enabled: taskId !== null,
  });
}

export function useProjectSections(id: number | null) {
  return useQuery({
    queryKey: id ? queryKeys.projectSections(id) : ["projects", "noop", "sections"],
    queryFn: ({ signal }) =>
      apiRequest<Section[]>(`/projects/${id}/sections`, { signal }),
    enabled: id !== null,
    staleTime: 30_000,
  });
}

export interface CreateSectionInput {
  name: string;
  position?: number;
  color?: string;
}

export function useCreateSection(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSectionInput) =>
      apiRequest<Section>(`/projects/${projectId}/sections`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectSections(projectId) });
    },
  });
}

export function useUpdateSection(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<CreateSectionInput> }) =>
      apiRequest<Section>(`/sections/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectSections(projectId) });
      // Tasks carry `section: { color }`; invalidate so the diagram repaints.
      qc.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
    },
  });
}

export function useDeleteSection(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/sections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectSections(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
    },
  });
}

export function useProjectRisks(id: number | null) {
  return useQuery({
    queryKey: id ? queryKeys.projectRisks(id) : ["projects", "noop", "risks"],
    queryFn: ({ signal }) =>
      apiRequest<Risk[]>(`/projects/${id}/risks`, { signal }),
    enabled: id !== null,
  });
}

export interface CreateRiskInput {
  description: string;
  category?: RiskCategory;
  probability?: number;
  impact?: number;
  status?: RiskStatus;
  mitigationPlan?: string | null;
  contingencyPlan?: string | null;
}

export type UpdateRiskInput = Partial<CreateRiskInput>;

export function useCreateRisk(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRiskInput) =>
      apiRequest<Risk>(`/projects/${projectId}/risks`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectRisks(projectId) });
    },
  });
}

export function useUpdateRisk(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateRiskInput }) =>
      apiRequest<Risk>(`/risks/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.projectRisks(projectId) });
      const prev = qc.getQueryData<Risk[]>(queryKeys.projectRisks(projectId));
      if (prev) {
        qc.setQueryData<Risk[]>(
          queryKeys.projectRisks(projectId),
          prev.map((r) => (r.id === id ? ({ ...r, ...patch } as Risk) : r)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev)
        qc.setQueryData(queryKeys.projectRisks(projectId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectRisks(projectId) });
    },
  });
}

export function useDeleteRisk(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/risks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectRisks(projectId) });
    },
  });
}

export function useProjectNotes(
  id: number | null,
  opts: { visibility?: NoteVisibility; limit?: number } = {},
) {
  const { visibility, limit } = opts;
  return useQuery({
    queryKey: id
      ? queryKeys.projectNotes(id, visibility)
      : ["projects", "noop", "notes"],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (visibility) params.set("visibility", visibility);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      return apiRequest<ProjectNote[]>(
        `/projects/${id}/notes${qs ? `?${qs}` : ""}`,
        { signal },
      );
    },
    enabled: id !== null,
  });
}

export interface CreateNoteInput {
  body: string;
  visibility?: NoteVisibility;
}

export function useAddProjectNote(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) =>
      apiRequest<ProjectNote>(`/projects/${projectId}/notes`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      // Invalidate every visibility-bucketed key for this project.
      qc.invalidateQueries({ queryKey: ["projects", projectId, "notes"] });
    },
  });
}

export function useAddComment(taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiRequest<Comment>(`/tasks/${taskId}/comments`, {
        method: "POST",
        body: { body },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.comments(taskId) });
    },
  });
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  active: boolean;
  role: Role;
  createdAt: string;
  provider: "google" | "password";
  avatarUrl: string | null;
  projectsAsTAM: number;
  projectsAsSA: number;
}

export interface AuthSettings {
  googleClientId: string | null;
  googleAllowedDomains: string[];
  updatedAt: string;
  updatedBy: { id: number; username: string } | null;
}

// Public — no auth required. Used by Login.tsx to decide whether to render
// the Google button and what audience to initialise GoogleOAuthProvider with.
export interface GoogleAuthRuntimeConfig {
  clientId: string | null;
  enabled: boolean;
}

export interface AdminProject {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  saId: number;
  tamId: number;
  customerId: number | null;
  createdAt: string;
  updatedAt: string;
  sa: { id: number; username: string };
  tam: { id: number; username: string };
  customer: { id: number; name: string } | null;
  _count: { tasks: number };
}

export const adminQueryKeys = {
  users: ["admin", "users"] as const,
  projects: ["admin", "projects"] as const,
  roles: ["admin", "roles"] as const,
  authSettings: ["admin", "settings", "auth"] as const,
};

export interface AdminRole {
  id: number;
  roleName: string;
  permissions: string[];
  userCount: number;
  builtIn: boolean;
}

export function useAdminRoles() {
  return useQuery({
    queryKey: adminQueryKeys.roles,
    queryFn: ({ signal }) => apiRequest<AdminRole[]>("/admin/roles", { signal }),
  });
}

export function useAdminCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { roleName: string; permissions: string[] }) =>
      apiRequest<AdminRole>("/admin/roles", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQueryKeys.roles });
    },
  });
}

export function useAdminUpdateRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: string[] }) =>
      apiRequest<AdminRole>(`/admin/roles/${id}`, {
        method: "PATCH",
        body: { permissions },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQueryKeys.roles });
    },
  });
}

export function useAdminDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/admin/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQueryKeys.roles });
      qc.invalidateQueries({ queryKey: adminQueryKeys.users });
    },
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: adminQueryKeys.users,
    queryFn: ({ signal }) => apiRequest<AdminUser[]>("/admin/users", { signal }),
  });
}

export function useAdminCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      email: string;
      username: string;
      password: string;
      role: Role;
    }) =>
      apiRequest<AdminUser>("/admin/users", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQueryKeys.users });
      qc.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useAdminUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) =>
      apiRequest<AdminUser>(`/admin/users/${id}/role`, {
        method: "PATCH",
        body: { role },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQueryKeys.users });
      qc.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useAdminSetActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest<AdminUser>(`/admin/users/${id}/deactivate`, {
        method: "PATCH",
        body: { active },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQueryKeys.users });
      qc.invalidateQueries({ queryKey: queryKeys.users });
    },
  });
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiRequest<void>("/auth/change-password", { method: "POST", body: input }),
  });
}

export function useAdminResetPassword() {
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ tempPassword: string }>(
        `/admin/users/${id}/reset-password`,
        { method: "POST" },
      ),
  });
}

export function useAdminDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQueryKeys.users });
      qc.invalidateQueries({ queryKey: queryKeys.users });
      qc.invalidateQueries({ queryKey: adminQueryKeys.roles });
    },
  });
}

export function useAdminProjects() {
  return useQuery({
    queryKey: adminQueryKeys.projects,
    queryFn: ({ signal }) =>
      apiRequest<AdminProject[]>("/admin/projects", { signal }),
  });
}

export function useAdminReassignProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, newTamId }: { projectId: number; newTamId: number }) =>
      apiRequest<AdminProject>("/admin/projects/reassign", {
        method: "PUT",
        body: { projectId, newTamId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminQueryKeys.projects });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useAuthSettings() {
  return useQuery({
    queryKey: adminQueryKeys.authSettings,
    queryFn: ({ signal }) =>
      apiRequest<AuthSettings>("/admin/settings/auth", { signal }),
  });
}

export interface UpdateAuthSettingsInput {
  googleClientId?: string | null;
  googleAllowedDomains?: string[];
}

export function useUpdateAuthSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAuthSettingsInput) =>
      apiRequest<AuthSettings>("/admin/settings/auth", {
        method: "PATCH",
        body: input,
      }),
    onSuccess: (fresh) => {
      qc.setQueryData(adminQueryKeys.authSettings, fresh);
      // The public runtime config could have flipped enabled/disabled —
      // refetch so the Login page picks up the new state on next mount.
      qc.invalidateQueries({ queryKey: ["auth", "google", "config"] });
    },
  });
}

// Public runtime config for the Login page (no auth required).
export function useGoogleAuthConfig() {
  return useQuery({
    queryKey: ["auth", "google", "config"] as const,
    queryFn: ({ signal }) =>
      apiRequest<GoogleAuthRuntimeConfig>("/auth/google/config", {
        signal,
        auth: false,
      }),
    staleTime: 60_000,
  });
}

export interface Holiday {
  date: string;
  name: string;
  type: string;
}

export function useHolidays(years: number[]) {
  const uniq = Array.from(new Set(years)).sort((a, b) => a - b);
  return useQueries({
    queries: uniq.map((y) => ({
      queryKey: ["holidays", y] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        apiRequest<Holiday[]>(`/holidays?year=${y}`, { signal }),
      staleTime: 24 * 60 * 60 * 1000,
    })),
    combine: (results) => ({
      data: results.flatMap((r) => r.data ?? []),
      isLoading: results.some((r) => r.isLoading),
      isError: results.some((r) => r.isError),
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Network Diagram (Dependency View) — TaskDependency rows
// ─────────────────────────────────────────────────────────────────────────

export type DependencyType = "HARD" | "SOFT";

export interface TaskDependency {
  id: number;
  projectId: number;
  predecessorTaskId: number;
  successorTaskId: number;
  type: DependencyType;
  // Diagram routing hints (which handle the user dragged from/to);
  // null means "use defaults" — right-source → left-target.
  sourceHandle: string | null;
  targetHandle: string | null;
  createdAt: string;
}

export interface CreateDependencyInput {
  predecessorTaskId: number;
  successorTaskId: number;
  type?: DependencyType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export function useProjectDependencies(projectId: number | null) {
  return useQuery({
    queryKey: projectId
      ? queryKeys.projectDependencies(projectId)
      : ["projects", "noop", "dependencies"],
    queryFn: ({ signal }) =>
      apiRequest<TaskDependency[]>(`/projects/${projectId}/dependencies`, { signal }),
    enabled: projectId !== null,
  });
}

export function useCreateDependency(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDependencyInput) =>
      apiRequest<TaskDependency>(`/projects/${projectId}/dependencies`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectDependencies(projectId) });
    },
  });
}

export function useUpdateDependency(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type }: { id: number; type: DependencyType }) =>
      apiRequest<TaskDependency>(`/dependencies/${id}`, {
        method: "PATCH",
        body: { type },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectDependencies(projectId) });
    },
  });
}

export function useDeleteDependency(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/dependencies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projectDependencies(projectId) });
    },
  });
}
