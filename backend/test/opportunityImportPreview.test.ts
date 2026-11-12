import "./env.js";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { signToken } from "../src/http/auth.js";
import { buildXlsx } from "./xlsxFixture.js";

// POST /opportunities/import/preview: the backend parse that replaced the
// browser-side SheetJS parse (B-18). Nothing is written by this route.

const app = createApp();
let counter = 0;

async function createUser(permissions: string[]) {
  counter += 1;
  const stamp = `${counter}-${Date.now()}`;
  const role = await prisma.role.create({ data: { roleName: `test-preview-role-${stamp}`, permissions } });
  const user = await prisma.user.create({
    data: {
      username: `test-preview-user-${stamp}`,
      email: `test-preview-user-${stamp}@example.com`,
      passwordHash: null,
      roleId: role.id,
      active: true,
    },
  });
  return { user, token: signToken({ sub: user.id, ver: 0 }) };
}

function preview(token: string, body: Buffer, type = "application/octet-stream") {
  return request(app)
    .post("/opportunities/import/preview")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", type)
    .send(body);
}

const HEADER = "Title,Company,Deal Value,Stage,PIC,Deadline,Product / Solution,Win Probability,Lead Source,Activity Log";

describe("POST /opportunities/import/preview", () => {
  it("parses a CSV, matches the PIC and writes nothing", async () => {
    const { token } = await createUser(["pipeline:view", "pipeline:create"]);
    const { user: pic } = await createUser(["pipeline:view"]);
    const pending = await createUser([]);
    const before = await prisma.opportunity.count();
    const csv = [
      HEADER,
      `Preview Deal,Preview Co,1000,rfp,${pic.username.toUpperCase()},30/06/2026,,60,,`,
      `Preview Deal 2,Preview Co,1000,rfp,${pending.user.username},,,,,`,
      `,No Title Co,,assessment,,,,,,`,
    ].join("\n");
    const res = await preview(token, Buffer.from(csv));
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(3);
    expect(res.body.rows[0]).toMatchObject({ status: "valid", picId: pic.id, deadline: "2026-06-30", stage: "RFP" });
    // An account with no permissions is not a PIC candidate (same as GET /users).
    expect(res.body.rows[1]).toMatchObject({ status: "valid", picId: null });
    expect(res.body.rows[2]).toMatchObject({ status: "invalid", errors: ["Title is required."] });
    expect(await prisma.opportunity.count()).toBe(before);
  });

  it("parses an .xlsx", async () => {
    const { token } = await createUser(["pipeline:create"]);
    const buf = buildXlsx([HEADER.split(","), ["X Deal", "X Co", 250000, "poc", "", 46203, "", 40, "", ""]]);
    const res = await preview(token, buf);
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ status: "valid", dealValue: 250000, stage: "POC", deadline: "2026-06-30" });
  });

  it("needs pipeline:create", async () => {
    const { token } = await createUser(["pipeline:view"]);
    const res = await preview(token, Buffer.from(HEADER));
    expect(res.status).toBe(403);
  });

  it("answers 400 with a code for an unreadable or legacy file", async () => {
    const { token } = await createUser(["pipeline:create"]);
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    const legacy = await preview(token, ole);
    expect(legacy.status).toBe(400);
    expect(legacy.body.code).toBe("legacy_xls");
    const bin = await preview(token, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
    expect(bin.status).toBe(400);
    expect(bin.body.code).toBe("unreadable_file");
  });

  it("refuses a body that is not application/octet-stream", async () => {
    const { token } = await createUser(["pipeline:create"]);
    const res = await request(app)
      .post("/opportunities/import/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ rows: [] });
    expect(res.status).toBe(415);
  });

  it("refuses a file over 1 MB", async () => {
    const { token } = await createUser(["pipeline:create"]);
    const res = await preview(token, Buffer.alloc(1024 * 1024 + 1, 0x41));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("payload_too_large");
  });
});
