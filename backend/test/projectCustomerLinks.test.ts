// Document links on projects and customers (docs/archive/plans/project-customer-links.md):
// GET/POST/PATCH/DELETE /projects/:id/links and /customers/:id/links. Fixtures
// write via `prisma` directly; the routes under test go through the real app.
import "./env.js";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { createUserWithRole, seedRoles } from "./testAuth.js";

const app = createApp();

beforeAll(async () => {
  await seedRoles();
});

function uniq(label: string): string {
  return `${label} ${Date.now()}-${Math.random()}`;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function fixture() {
  const tam = await createUserWithRole("TAM");
  const member = await createUserWithRole("TAM");
  const outsider = await createUserWithRole("TAM");
  const stakeholder = await createUserWithRole("STAKEHOLDER");
  const customer = await prisma.customer.create({
    data: { name: uniq("Customer"), description: "d", tamId: tam.userId },
  });
  const project = await prisma.project.create({
    data: { name: uniq("Project"), tamId: tam.userId, customerId: customer.id, status: "ACTIVE" },
  });
  const otherProject = await prisma.project.create({
    data: { name: uniq("Project"), tamId: tam.userId, customerId: customer.id, status: "ACTIVE" },
  });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.userId } });
  // A second customer the outsider cannot see (owned by someone else, no
  // project the outsider can see under it).
  const otherCustomer = await prisma.customer.create({
    data: { name: uniq("Customer"), description: "d", tamId: tam.userId },
  });
  return { tam, member, outsider, stakeholder, customer, otherCustomer, project, otherProject };
}

const BAD_URLS = ["javascript:alert(1)", "ftp://example.com/file", "not a url", "data:text/html,hi"];

describe("project links", () => {
  it("creates, lists (oldest first), patches and deletes", async () => {
    const f = await fixture();
    const base = `/projects/${f.project.id}/links`;

    const first = await request(app)
      .post(base)
      .set(auth(f.tam.token))
      .send({ label: "  Spec  ", url: " https://example.com/spec " });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      projectId: f.project.id,
      label: "Spec",
      url: "https://example.com/spec",
      createdAt: expect.any(String),
    });
    const second = await request(app)
      .post(base)
      .set(auth(f.tam.token))
      .send({ label: "Board", url: "http://example.com/board" });
    expect(second.status).toBe(201);

    const list = await request(app).get(base).set(auth(f.tam.token));
    expect(list.status).toBe(200);
    expect((list.body as { label: string }[]).map((l) => l.label)).toEqual(["Spec", "Board"]);

    const patched = await request(app)
      .patch(`${base}/${first.body.id}`)
      .set(auth(f.tam.token))
      .send({ label: "Spec v2" });
    expect(patched.status).toBe(200);
    expect(patched.body.label).toBe("Spec v2");
    expect(patched.body.url).toBe("https://example.com/spec");

    const del = await request(app).delete(`${base}/${first.body.id}`).set(auth(f.tam.token));
    expect(del.status).toBe(204);
    const after = await request(app).get(base).set(auth(f.tam.token));
    expect((after.body as unknown[]).length).toBe(1);
  });

  it("lets a project member write, and a read-only user read but not write", async () => {
    const f = await fixture();
    const base = `/projects/${f.project.id}/links`;
    const byMember = await request(app)
      .post(base)
      .set(auth(f.member.token))
      .send({ label: "Doc", url: "https://example.com/d" });
    expect(byMember.status).toBe(201);

    // The stakeholder holds project:read only; make it a member so it can see the project.
    await prisma.projectMember.create({
      data: { projectId: f.project.id, userId: f.stakeholder.userId },
    });
    const read = await request(app).get(base).set(auth(f.stakeholder.token));
    expect(read.status).toBe(200);
    const write = await request(app)
      .post(base)
      .set(auth(f.stakeholder.token))
      .send({ label: "x", url: "https://example.com/x" });
    expect(write.status).toBe(403);
    const patch = await request(app)
      .patch(`${base}/${byMember.body.id}`)
      .set(auth(f.stakeholder.token))
      .send({ label: "y" });
    expect(patch.status).toBe(403);
    const del = await request(app).delete(`${base}/${byMember.body.id}`).set(auth(f.stakeholder.token));
    expect(del.status).toBe(403);
  });

  // User decision 2026-10-12: links follow `project:write`, so the project's
  // SA (seeded role without it) sees the links but cannot change them.
  it("lets the project's SA read but not write", async () => {
    const f = await fixture();
    const sa = await createUserWithRole("SA");
    await prisma.project.update({ where: { id: f.project.id }, data: { saId: sa.userId } });
    const base = `/projects/${f.project.id}/links`;
    const link = await prisma.projectLink.create({
      data: { projectId: f.project.id, label: "L", url: "https://example.com" },
    });
    expect((await request(app).get(base).set(auth(sa.token))).status).toBe(200);
    expect(
      (await request(app).post(base).set(auth(sa.token)).send({ label: "x", url: "https://example.com/x" })).status,
    ).toBe(403);
    expect(
      (await request(app).patch(`${base}/${link.id}`).set(auth(sa.token)).send({ label: "y" })).status,
    ).toBe(403);
    expect((await request(app).delete(`${base}/${link.id}`).set(auth(sa.token))).status).toBe(403);
  });

  it("404s every verb for a user who cannot see the project (before body validation)", async () => {
    const f = await fixture();
    const link = await prisma.projectLink.create({
      data: { projectId: f.project.id, label: "L", url: "https://example.com" },
    });
    const base = `/projects/${f.project.id}/links`;
    expect((await request(app).get(base).set(auth(f.outsider.token))).status).toBe(404);
    expect(
      (await request(app).post(base).set(auth(f.outsider.token)).send({ label: "", url: "junk" })).status,
    ).toBe(404);
    expect(
      (await request(app).patch(`${base}/${link.id}`).set(auth(f.outsider.token)).send({ label: "x" })).status,
    ).toBe(404);
    expect((await request(app).delete(`${base}/${link.id}`).set(auth(f.outsider.token))).status).toBe(404);
    expect(await prisma.projectLink.count({ where: { projectId: f.project.id } })).toBe(1);
  });

  it("rejects non-http(s) and malformed URLs and bad labels with 400", async () => {
    const f = await fixture();
    const base = `/projects/${f.project.id}/links`;
    for (const url of BAD_URLS) {
      const res = await request(app).post(base).set(auth(f.tam.token)).send({ label: "L", url });
      expect(res.status, url).toBe(400);
    }
    expect((await request(app).post(base).set(auth(f.tam.token)).send({ label: "  ", url: "https://a.io" })).status).toBe(400);
    expect(
      (await request(app).post(base).set(auth(f.tam.token)).send({ label: "x".repeat(201), url: "https://a.io" })).status,
    ).toBe(400);

    const link = await prisma.projectLink.create({
      data: { projectId: f.project.id, label: "L", url: "https://example.com" },
    });
    for (const url of BAD_URLS) {
      const res = await request(app).patch(`${base}/${link.id}`).set(auth(f.tam.token)).send({ url });
      expect(res.status, url).toBe(400);
    }
    expect(await prisma.projectLink.count({ where: { projectId: f.project.id } })).toBe(1);
  });

  it("404s a link id that belongs to another project", async () => {
    const f = await fixture();
    const foreign = await prisma.projectLink.create({
      data: { projectId: f.otherProject.id, label: "L", url: "https://example.com" },
    });
    const base = `/projects/${f.project.id}/links/${foreign.id}`;
    expect((await request(app).patch(base).set(auth(f.tam.token)).send({ label: "x" })).status).toBe(404);
    expect((await request(app).delete(base).set(auth(f.tam.token))).status).toBe(404);
    const stillThere = await prisma.projectLink.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(stillThere.label).toBe("L");
  });

  it("records label-only activity events and nothing for an unchanged PATCH", async () => {
    const f = await fixture();
    const base = `/projects/${f.project.id}/links`;
    const url = "https://secret.example.com/path?token=abc";
    const created = await request(app).post(base).set(auth(f.tam.token)).send({ label: "Runbook", url });
    const id = created.body.id as string;

    // Same values: no event.
    await request(app).patch(`${base}/${id}`).set(auth(f.tam.token)).send({ label: "Runbook", url });
    // Changed URL only: an event, with the (unchanged) label.
    await request(app)
      .patch(`${base}/${id}`)
      .set(auth(f.tam.token))
      .send({ url: "https://secret.example.com/other" });
    await request(app).patch(`${base}/${id}`).set(auth(f.tam.token)).send({ label: "Runbook 2" });
    await request(app).delete(`${base}/${id}`).set(auth(f.tam.token));

    const events = await prisma.activityEvent.findMany({
      where: { projectId: f.project.id, entityType: "project_link" },
      orderBy: { id: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual(["added", "updated", "updated", "removed"]);
    expect(events.map((e) => e.entityLabel)).toEqual(["Runbook", "Runbook", "Runbook 2", "Runbook 2"]);
    for (const e of events) {
      expect(e.entityId).toBeNull();
      expect(e.actorId).toBe(f.tam.userId);
      expect(e.changes).toEqual({ linkId: id, label: e.entityLabel });
      expect(JSON.stringify(e)).not.toContain("secret.example.com");
    }
    // Link events do not notify anyone.
    expect(
      await prisma.notification.count({ where: { activityEventId: { in: events.map((e) => e.id) } } }),
    ).toBe(0);
  });

  it("deletes a project's links when the project is deleted", async () => {
    const f = await fixture();
    await prisma.projectLink.create({
      data: { projectId: f.project.id, label: "L", url: "https://example.com" },
    });
    await prisma.project.delete({ where: { id: f.project.id } });
    expect(await prisma.projectLink.count({ where: { projectId: f.project.id } })).toBe(0);
  });
});

describe("customer links", () => {
  it("creates, lists (oldest first), patches and deletes", async () => {
    const f = await fixture();
    const base = `/customers/${f.customer.id}/links`;

    const first = await request(app)
      .post(base)
      .set(auth(f.tam.token))
      .send({ label: " Contract ", url: "https://example.com/contract" });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      customerId: f.customer.id,
      label: "Contract",
      url: "https://example.com/contract",
      createdAt: expect.any(String),
    });
    await request(app).post(base).set(auth(f.tam.token)).send({ label: "Wiki", url: "https://example.com/wiki" });

    const list = await request(app).get(base).set(auth(f.tam.token));
    expect(list.status).toBe(200);
    expect((list.body as { label: string }[]).map((l) => l.label)).toEqual(["Contract", "Wiki"]);

    const patched = await request(app)
      .patch(`${base}/${first.body.id}`)
      .set(auth(f.tam.token))
      .send({ url: "https://example.com/contract-v2" });
    expect(patched.status).toBe(200);
    expect(patched.body.url).toBe("https://example.com/contract-v2");

    expect((await request(app).delete(`${base}/${first.body.id}`).set(auth(f.tam.token))).status).toBe(204);
    expect(((await request(app).get(base).set(auth(f.tam.token))).body as unknown[]).length).toBe(1);
    // The activity log has no customer scope: nothing was recorded.
    expect(
      await prisma.activityEvent.count({
        where: { entityType: "project_link", projectId: { in: [f.project.id, f.otherProject.id] } },
      }),
    ).toBe(0);
  });

  it("lets a user who sees the customer through a project membership write; read-only users get 403", async () => {
    const f = await fixture();
    const base = `/customers/${f.customer.id}/links`;
    const byMember = await request(app)
      .post(base)
      .set(auth(f.member.token))
      .send({ label: "Doc", url: "https://example.com/d" });
    expect(byMember.status).toBe(201);

    await prisma.projectMember.create({
      data: { projectId: f.project.id, userId: f.stakeholder.userId },
    });
    expect((await request(app).get(base).set(auth(f.stakeholder.token))).status).toBe(200);
    expect(
      (await request(app).post(base).set(auth(f.stakeholder.token)).send({ label: "x", url: "https://example.com/x" })).status,
    ).toBe(403);
    expect(
      (await request(app).patch(`${base}/${byMember.body.id}`).set(auth(f.stakeholder.token)).send({ label: "y" })).status,
    ).toBe(403);
    expect((await request(app).delete(`${base}/${byMember.body.id}`).set(auth(f.stakeholder.token))).status).toBe(403);
  });

  it("404s every verb for a user who cannot see the customer", async () => {
    const f = await fixture();
    const link = await prisma.customerLink.create({
      data: { customerId: f.otherCustomer.id, label: "L", url: "https://example.com" },
    });
    const base = `/customers/${f.otherCustomer.id}/links`;
    expect((await request(app).get(base).set(auth(f.outsider.token))).status).toBe(404);
    expect(
      (await request(app).post(base).set(auth(f.outsider.token)).send({ label: "", url: "junk" })).status,
    ).toBe(404);
    expect(
      (await request(app).patch(`${base}/${link.id}`).set(auth(f.outsider.token)).send({ label: "x" })).status,
    ).toBe(404);
    expect((await request(app).delete(`${base}/${link.id}`).set(auth(f.outsider.token))).status).toBe(404);
    expect(await prisma.customerLink.count({ where: { customerId: f.otherCustomer.id } })).toBe(1);
  });

  it("rejects non-http(s) and malformed URLs with 400", async () => {
    const f = await fixture();
    const base = `/customers/${f.customer.id}/links`;
    for (const url of BAD_URLS) {
      const res = await request(app).post(base).set(auth(f.tam.token)).send({ label: "L", url });
      expect(res.status, url).toBe(400);
    }
    const link = await prisma.customerLink.create({
      data: { customerId: f.customer.id, label: "L", url: "https://example.com" },
    });
    for (const url of BAD_URLS) {
      const res = await request(app).patch(`${base}/${link.id}`).set(auth(f.tam.token)).send({ url });
      expect(res.status, url).toBe(400);
    }
  });

  it("404s a link id that belongs to another customer", async () => {
    const f = await fixture();
    const foreign = await prisma.customerLink.create({
      data: { customerId: f.otherCustomer.id, label: "L", url: "https://example.com" },
    });
    const base = `/customers/${f.customer.id}/links/${foreign.id}`;
    expect((await request(app).patch(base).set(auth(f.tam.token)).send({ label: "x" })).status).toBe(404);
    expect((await request(app).delete(base).set(auth(f.tam.token))).status).toBe(404);
    expect(await prisma.customerLink.count({ where: { id: foreign.id } })).toBe(1);
  });

  it("deletes a customer's links when the customer is deleted", async () => {
    const f = await fixture();
    await prisma.customerLink.create({
      data: { customerId: f.otherCustomer.id, label: "L", url: "https://example.com" },
    });
    await prisma.customer.delete({ where: { id: f.otherCustomer.id } });
    expect(await prisma.customerLink.count({ where: { customerId: f.otherCustomer.id } })).toBe(0);
  });
});
