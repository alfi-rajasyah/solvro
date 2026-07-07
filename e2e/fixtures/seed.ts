// Ported from the QA gate script (qa-fixtures.mjs): seeds a fresh project
// (with a handful of tasks/subtasks) via the API so specs never depend on
// pre-existing data beyond the admin account created in CI /locally.
//
// Login uses the "sa" (service area) id from the login response itself
// (user.id) rather than a hardcoded id — the QA script's `saId: 1` only
// worked because the admin happened to be user #1; using the caller's own
// id is correct regardless of seeding order.

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "qa@solvro.test";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "QaTest1234!";

export interface SeededTask {
  id: number;
  title: string;
  status: string;
  position: number;
  parentTaskId: number | null;
  [key: string]: unknown;
}

export interface SeededFixture {
  token: string;
  userId: number;
  projectId: number;
  alpha: SeededTask;
  beta: SeededTask;
  gamma: SeededTask;
  delta: SeededTask;
  subA: SeededTask;
  subB: SeededTask;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request failed ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function login(
  base: string,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<{ token: string; userId: number }> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await json<{ token: string; user: { id: number } }>(res);
  return { token: data.token, userId: data.user.id };
}

/** Seeds a fresh customer (reused if one already exists) + project + tasks/subtasks. */
export async function seedFixture(base: string): Promise<SeededFixture> {
  const { token, userId } = await login(base);
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const customers = await fetch(`${base}/api/customers`, { headers: H }).then((r) =>
    json<Array<{ id: number }>>(r),
  );
  let custId = Array.isArray(customers) && customers[0]?.id;
  if (!custId) {
    const c = await fetch(`${base}/api/customers`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ name: `QA Fixture Co ${stamp}`, description: "e2e fixture" }),
    }).then((r) => json<{ id: number }>(r));
    custId = c.id;
  }

  const proj = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: `Gate ${stamp}`,
      description: "e2e fixture project",
      customerId: custId,
      saId: userId,
    }),
  }).then((r) => json<{ id: number }>(r));

  const mk = (body: Record<string, unknown>) =>
    fetch(`${base}/api/projects/${proj.id}/tasks`, {
      method: "POST",
      headers: H,
      body: JSON.stringify(body),
    }).then((r) => json<SeededTask>(r));

  const alpha = await mk({ title: "Alpha", status: "TODO", startDate: "2026-07-01", dueDate: "2026-07-05" });
  const beta = await mk({ title: "Beta", status: "TODO", startDate: "2026-07-02", dueDate: "2026-07-08" });
  const gamma = await mk({ title: "Gamma", status: "TODO", startDate: "2026-07-03", dueDate: "2026-07-09" });
  const delta = await mk({ title: "Delta", status: "IN_PROGRESS", startDate: "2026-07-01", dueDate: "2026-07-12" });
  const subA = await mk({ title: "Sub one", parentTaskId: alpha.id });
  const subB = await mk({ title: "Sub two", parentTaskId: alpha.id });

  return { token, userId, projectId: proj.id, alpha, beta, gamma, delta, subA, subB };
}

export async function getTasks(base: string, token: string, projectId: number): Promise<SeededTask[]> {
  const res = await fetch(`${base}/api/projects/${projectId}/tasks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return json<SeededTask[]>(res);
}

export async function setWipLimits(
  base: string,
  token: string,
  projectId: number,
  wipLimits: Record<string, number | null>,
): Promise<void> {
  await fetch(`${base}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ wipLimits }),
  });
}
