// API helpers for the project-lifecycle / offboarding specs: throwaway users,
// customers and projects created through the admin API, so every spec file
// owns all of its data (CI shards by spec file onto separate fresh stacks).

import { login } from "./seed";

export const THROWAWAY_PASSWORD = "Lifecycle1234!";

export function uniqueStamp(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request failed ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function api<T = unknown>(
  base: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: authHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export interface ThrowawayUser {
  id: number;
  email: string;
  username: string;
  password: string;
  /** Present once the user has an active role (a PENDING user can still log in). */
  token: string;
}

/** Creates a user through the admin API (default role TAM) and signs them in. */
export async function createUser(
  base: string,
  adminToken: string,
  tag: string,
  role = "TAM",
): Promise<ThrowawayUser> {
  const username = `e2e-${tag}-${uniqueStamp()}`;
  const email = `${username}@solvro.test`;
  const created = await api<{ id: number }>(base, adminToken, "POST", "/admin/users", {
    email,
    username,
    password: THROWAWAY_PASSWORD,
    role,
  });
  const session = await login(base, email, THROWAWAY_PASSWORD);
  return { id: created.id, email, username, password: THROWAWAY_PASSWORD, token: session.token };
}

export async function deleteUser(base: string, adminToken: string, id: number): Promise<void> {
  await fetch(`${base}/api/admin/users/${id}`, { method: "DELETE", headers: authHeaders(adminToken) }).catch(
    () => {},
  );
}

export async function createCustomer(
  base: string,
  adminToken: string,
  name: string,
  tamId?: number,
): Promise<{ id: number; name: string }> {
  return api(base, adminToken, "POST", "/customers", { name, description: "e2e lifecycle", ...(tamId && { tamId }) });
}

export async function createProject(
  base: string,
  adminToken: string,
  input: { name: string; customerId: number; tamId?: number; status?: string },
): Promise<{ id: number; name: string; status: string }> {
  return api(base, adminToken, "POST", "/projects", { description: "e2e lifecycle", status: "ACTIVE", ...input });
}

export interface ApiTask {
  id: number;
  title: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  assignedToId: number | null;
  [key: string]: unknown;
}

export function listTasks(base: string, token: string, projectId: number): Promise<ApiTask[]> {
  return api<ApiTask[]>(base, token, "GET", `/projects/${projectId}/tasks`);
}

/** Whole calendar days between two API date strings (positive when `b` is later). */
export function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) throw new Error("date missing");
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
}
