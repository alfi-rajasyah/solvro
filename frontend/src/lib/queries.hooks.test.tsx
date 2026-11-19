// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  apiRequest: vi.fn(),
}));

import { apiRequest } from "./api";
import {
  queryKeys,
  reorderTasksLocally,
  useCreateTask,
  useUpdateTask,
  useUpdateCustomerServices,
  useUpdateProjectServices,
  useUpdateSection,
  type CustomerDetail,
  type ProjectDetail,
  type Section,
  type Service,
  type Task,
} from "./queries";

const api = vi.mocked(apiRequest);

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => api.mockReset());
afterEach(cleanup);

const svc = (id: number, name: string): Service => ({
  id,
  name,
  description: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useCreateTask (ISS-021)", () => {
  it("invalidates the Daily Review queries on success", async () => {
    const { qc, wrapper } = setup();
    api.mockResolvedValue({ id: 1 });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateTask(7), { wrapper });
    await act(() => result.current.mutateAsync({ title: "t" } as never));
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.dailyReviewRoot });
  });
});

describe("service mapping mutations (ISS-044)", () => {
  const existing = {
    id: 5,
    projectId: 7,
    serviceId: 1,
    service: svc(1, "Backup"),
    tools: ["Veeam"],
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("patches project services optimistically, then rolls back on error", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(["services"], [svc(1, "Backup"), svc(2, "Monitoring")]);
    qc.setQueryData(queryKeys.project(7), { id: 7, services: [existing] } as unknown as ProjectDetail);
    const d = deferred<unknown>();
    api.mockImplementation((path: string) =>
      path === "/projects/7/services" ? d.promise : Promise.resolve(undefined),
    );
    const { result } = renderHook(() => useUpdateProjectServices(7), { wrapper });
    let p!: Promise<unknown>;
    act(() => {
      p = result.current
        .mutateAsync([
          { serviceId: 1, tools: ["Acronis"] },
          { serviceId: 2, tools: [] },
        ])
        .catch(() => undefined);
    });
    await waitFor(() => {
      const cur = qc.getQueryData<ProjectDetail>(queryKeys.project(7))!;
      expect(cur.services.map((s) => [s.serviceId, s.tools])).toEqual([
        [1, ["Acronis"]],
        [2, []],
      ]);
    });
    d.reject(new Error("boom"));
    await act(() => p);
    // onSettled invalidates; with no active observer the restored snapshot stays.
    expect(qc.getQueryData<ProjectDetail>(queryKeys.project(7))!.services).toEqual([existing]);
  });

  it("patches customer services optimistically (removal included)", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(queryKeys.customer(3), {
      id: 3,
      services: [{ ...existing, customerId: 3, projectId: undefined }],
    } as unknown as CustomerDetail);
    const d = deferred<unknown>();
    api.mockReturnValue(d.promise as never);
    const { result } = renderHook(() => useUpdateCustomerServices(3), { wrapper });
    act(() => {
      void result.current.mutateAsync([]);
    });
    await waitFor(() =>
      expect(qc.getQueryData<CustomerDetail>(queryKeys.customer(3))!.services).toEqual([]),
    );
    d.resolve({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("reorderTasksLocally (ISS-046)", () => {
  const sections = [
    { id: 1, name: "Alpha", position: 0, color: "#111111" },
    { id: 2, name: "Beta", position: 1, color: "#222222" },
  ];
  const task = (id: number, sectionId: number | null): Task =>
    ({
      id,
      parentTaskId: null,
      status: "TODO",
      position: id,
      epicId: null,
      sectionId,
      section: sectionId ? sections.find((s) => s.id === sectionId)! : null,
    }) as unknown as Task;

  it("moves the nested section object with a cross-section move", () => {
    const out = reorderTasksLocally([task(1, 1), task(2, 1)], 1, { sectionId: 2, position: 0 }, sections);
    expect(out.find((t) => t.id === 1)!.section).toEqual(sections[1]);
    expect(out.find((t) => t.id === 2)!.section).toEqual(sections[0]);
  });

  it("clears the nested section when unassigned and keeps it when unchanged", () => {
    const tasks = [task(1, 1)];
    expect(reorderTasksLocally(tasks, 1, { sectionId: null }, sections)[0].section).toBeNull();
    expect(reorderTasksLocally(tasks, 1, { position: 0 }, sections)[0].section).toEqual(sections[0]);
  });
});

describe("useUpdateTask section chip", () => {
  it("updates the nested section on a sectionId-only patch", async () => {
    const { qc, wrapper } = setup();
    const secs = [
      { id: 1, projectId: 7, name: "Alpha", position: 0, color: "#111111", createdAt: "x" },
      { id: 2, projectId: 7, name: "Beta", position: 1, color: "#222222", createdAt: "x" },
    ];
    qc.setQueryData(queryKeys.projectSections(7), secs);
    qc.setQueryData(queryKeys.projectTasks(7), [
      {
        id: 1,
        parentTaskId: null,
        status: "TODO",
        position: 0,
        epicId: null,
        labels: [],
        sectionId: 1,
        section: { id: 1, name: "Alpha", position: 0, color: "#111111" },
      },
    ] as unknown as Task[]);
    const gate = deferred<unknown>();
    api.mockReturnValue(gate.promise as never);
    const { result } = renderHook(() => useUpdateTask(7), { wrapper });
    act(() => {
      void result.current.mutateAsync({ id: 1, patch: { sectionId: 2 } }).catch(() => undefined);
    });
    await waitFor(() => {
      const t = qc.getQueryData<Task[]>(queryKeys.projectTasks(7))![0];
      expect(t.sectionId).toBe(2);
      expect(t.section).toEqual({ id: 2, name: "Beta", position: 1, color: "#222222" });
    });
    gate.resolve({ id: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useUpdateSection (ISS-112)", () => {
  const sec = (id: number, position: number): Section => ({
    id,
    projectId: 7,
    name: `S${id}`,
    position,
    color: "#000000",
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  it("refetches the sections from the server after a failed PATCH", async () => {
    const { qc, wrapper } = setup();
    const serverOrder = [sec(1, 0), sec(2, 1), sec(3, 2)];
    qc.setQueryData(queryKeys.projectSections(7), serverOrder);
    const calls: string[] = [];
    const gate = deferred<void>();
    api.mockImplementation((path: string, opts?: { method?: string }) => {
      calls.push(`${opts?.method ?? "GET"} ${path}`);
      if (opts?.method === "PATCH") return Promise.reject(new Error("boom"));
      return gate.promise.then(() => serverOrder) as never;
    });
    const { result } = renderHook(() => useUpdateSection(7), { wrapper });
    // An active observer makes invalidateQueries refetch.
    const obs = new QueryObserver(qc, {
      queryKey: queryKeys.projectSections(7),
      queryFn: () => api("/projects/7/sections") as Promise<Section[]>,
      staleTime: Infinity,
    });
    const off = obs.subscribe(() => undefined);
    calls.length = 0;
    let both!: Promise<unknown>;
    act(() => {
      const first = result.current.mutateAsync({ id: 3, patch: { position: 0 } }).catch(() => undefined);
      const second = result.current.mutateAsync({ id: 2, patch: { position: 0 } }).catch(() => undefined);
      both = Promise.all([first, second]);
    });
    await waitFor(() => expect(calls).toContain("GET /projects/7/sections"));
    // While the re-seed is still in flight the queued second drop must not go
    // out: the first mutation has settled (its PATCH rejected) but is held.
    // The GET is only issued from the settled callback, so the rejection has
    // already been processed; flush microtasks so a missing hold would show.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(calls).not.toContain("PATCH /sections/2");
    gate.resolve();
    await act(() => both);
    off();
    expect(calls.indexOf("GET /projects/7/sections")).toBeLessThan(calls.indexOf("PATCH /sections/2"));
    expect(qc.getQueryData<Section[]>(queryKeys.projectSections(7))).toEqual(serverOrder);
  });
});
