import type { Locator, Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, center, expect, gripFor, loginViaUi, mouseDrag, test } from "../fixtures/test";

// Pipeline module e2e coverage (M6.26) — the board + view-switcher on the
// same vendored dnd-kit engine `kanban-dnd.spec.ts` already proves for the
// Tasks board (`reui/kanban.tsx`; see that file's header comment). This spec
// reuses its proven house tools verbatim (`gripFor`/`center`/`mouseDrag`,
// `loginViaUi`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` from `fixtures/test.ts`) but
// does NOT touch `fixtures/seed.ts`'s task-project fixture — Pipeline deals
// are a different resource entirely, so this file seeds its own opportunity
// fixtures via the API (own `beforeAll`/helpers below), modeled on
// `fixtures/seed.ts`'s own login()+stamped-title pattern without editing
// that shared file (a parallel e2e task owns the create/edit-form + import
// coverage in a sibling spec).
//
// Board structure recap (frontend/src/components/pipeline/adapter.ts,
// SolvroPipelineKanban.tsx): 6 `PipelineStage` columns, each rendered as
// `[data-slot="kanban-column"][data-value="<STAGE>"]` (reui/kanban.tsx) —
// the same data-slot convention kanban-dnd.spec.ts's own column-body drops
// (G6/G9b) key off. Deal cards carry the SAME `KanbanItemHandle
// aria-label="Drag to reorder"` grip `gripFor` already knows how to locate.
//
// 2026-09-25 opportunity flow redesign (docs/archive/plans/opportunity-flow-redesign.md
// §5 Playwright, T7): Won/Lost/Cancelled/Hold left `PipelineStage` (D2) —
// the board is 6 columns now, and a deal is closed via `POST
// /:id/close` (Won/Lost/Cancelled, D5) or tagged via `PATCH /:id`
// (`statusTag: HOLD`/`DELAYED`, `subStatus: WAITING_SALES_INPUT`), never by
// dragging onto a terminal column — those columns don't exist anymore. The
// old single "drag into WON: confirmation dialog…" scenario is replaced by
// three flows exercising the card's ⋯ menu (`OpportunityCard.tsx`,
// `aria-label="More actions"`) plus the one still-gated drag (Technical
// Clarification -> RFP, `isSkipJump`/`MoveReasonModal.tsx`).
//
// Mobile scope for the NEW ⋯-menu flows (Close/Hold) — deliberately DESKTOP
// ONLY, same as the drag scenarios below, even though neither actually drags
// a card across columns: the trigger button is a 24×24px icon-only target
// (`h-6 w-6`, OpportunityCard.tsx's `OpportunityCardMenu`) opening a Base-UI
// portal menu stacked under a second portal (`CloseDealDialog`/its own
// radio cards + select) — nothing this suite's existing mobile coverage has
// exercised before, and implementors have no interactive browser to eyeball
// touch-target/portal-stacking behavior at the iPhone 13 viewport before
// trusting it in CI. Scoping to desktop mirrors the house
// `test.skip(test.info().project.name !== "desktop", ...)` convention the
// drag cases already use, and is called out again on each new test below —
// see this task's report for the explicit deviation note.
//
// Mobile drag coverage — deliberately SKIPPED, not faked (dispatch brief:
// "skip what genuinely can't work, justify in a comment + report"): unlike
// kanban-v2's Tasks board (3 columns, a mobile "Card options" -> "Move to"
// action-sheet fallback for cross-column moves — see
// `kanban-v2/MobileMoveSheet.tsx`/`cards.tsx`), Pipeline's `OpportunityCard`
// has NO such action sheet — the drag handle is the only cross-column move
// affordance at any viewport. At the mobile project's 390px (iPhone 13)
// viewport, each of Pipeline's `w-[85vw]` columns is itself ~332px wide, so
// even two ADJACENT columns (~332+16+332=680px) never both fit on screen at
// once — a genuine cross-stage touch drag would need mid-gesture horizontal
// scrolling that this suite's `touchDrag` helper (a fixed linear touchmove
// path, see `fixtures/test.ts`) doesn't perform. kanban-dnd.spec.ts's own
// mobile section independently confirms this is the real constraint: its
// ONE touch case is a same-column reorder for exactly this reason, and its
// cross-column mobile case goes through the action-sheet UI instead of a
// drag gesture — an affordance Pipeline doesn't have. The underlying
// dnd-kit TouchSensor mechanics are already proven against this exact
// vendored engine by kanban-dnd.spec.ts's mobile project; re-proving that
// low-level mechanism isn't part of this spec's brief. Every NON-drag,
// NON-menu scenario below (board render, view switching, keyboard nav)
// still runs on both the desktop and mobile projects.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

// Mirrors backend/src/lib/pipelineFormat.ts's `STAGE_ORDER`/`STAGE_LABELS`
// (frontend/src/lib/pipelineFormat.ts) — duplicated locally rather than
// imported since e2e/ is its own standalone TS project with no dependency
// on frontend/src (confirmed: no existing e2e spec imports frontend code).
// 2026-09-25 flow redesign (D2): 6 values, in the spec's order — WON, DROP
// and HOLD left the enum; a deal that's Won, Lost, Cancelled or on Hold now
// keeps the stage it stalled in (`outcome`/`statusTag`, not `stage`).
const STAGE_ORDER = [
  "ASSESSMENT",
  "TECHNICAL_CLARIFICATION",
  "POC",
  "RFP",
  "DELIVER_PROPOSAL",
  "WAITING_RESPONSE",
] as const;

const STAGE_LABELS: Record<(typeof STAGE_ORDER)[number], string> = {
  ASSESSMENT: "Assessment",
  TECHNICAL_CLARIFICATION: "Technical Clarification",
  POC: "PoC",
  RFP: "RFP",
  DELIVER_PROPOSAL: "Delivered Proposal",
  WAITING_RESPONSE: "Waiting Response",
};

// Verbatim port of frontend/src/lib/pipelineFormat.ts's `formatIDRCompact` —
// same "duplicate rather than cross-package-import" call as STAGE_LABELS
// above. Used to verify the board's per-column value sums against a
// fresh API read, so this assertion holds regardless of how many
// pre-existing opportunities the shared dev DB already has in any stage.
function formatIDRCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000).toFixed(1).replace(".", ",")}M`;
  }
  if (value >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(0)}jt`;
  }
  return `Rp ${value.toLocaleString("id-ID")}`;
}

interface ApiDeal {
  id: string;
  title: string;
  customerName: string;
  stage: (typeof STAGE_ORDER)[number];
  dealValue: number;
  stageOrder: number;
  wonAt: string | null;
  outcome: "WON" | "LOST" | "CANCELLED" | "ARCHIVED" | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request failed ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data = await json<{ token: string }>(res);
  return data.token;
}

async function createDeal(
  token: string,
  body: { title: string; customerName: string; stage: string; dealValue: number },
): Promise<ApiDeal> {
  const res = await fetch(`${BASE_URL}/api/opportunities`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json<ApiDeal>(res);
}

async function getDeal(token: string, id: string): Promise<ApiDeal> {
  const res = await fetch(`${BASE_URL}/api/opportunities/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return json<ApiDeal>(res);
}

async function getAllDeals(token: string): Promise<ApiDeal[]> {
  const res = await fetch(`${BASE_URL}/api/opportunities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return json<ApiDeal[]>(res);
}

async function deleteDeal(token: string, id: string): Promise<void> {
  // Best-effort, but never silent — a failed teardown otherwise leaks
  // e2e-prefixed rows into the shared DB with no trace in the run output.
  try {
    const res = await fetch(`${BASE_URL}/api/opportunities/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) {
      console.warn(`cleanup: DELETE /opportunities/${id} returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`cleanup: DELETE /opportunities/${id} threw`, err);
  }
}

function column(page: Page, stage: string) {
  return page.locator(`[data-slot="kanban-column"][data-value="${stage}"]`);
}

/**
 * Locates a board card's own root element (`OpportunityCard.tsx`'s outer
 * `<div>`, uniquely bearing the `touch-manipulation` class among elements
 * ever mounted on `/pipeline`) scoped to `stage`'s column and `cardTitle` —
 * the stable anchor every card-menu flow below clicks its ⋯ trigger from and
 * reads its badge chips off (`OwnerChip`/`SubStatusChip`/`TagChip`/
 * `IdleChip` — plain `<span>`s, not ARIA roles, so a chip's icon glyph text
 * (`aria-hidden`, but NOT excluded from a plain DOM-text scan) folds into
 * any text-content check scoped to this root — `toContainText` rather than
 * an exact `getByText` is what every chip assertion below uses because of
 * this).
 */
function cardRoot(page: Page, stage: string, cardTitle: string): Locator {
  return column(page, stage).locator("div.touch-manipulation").filter({ hasText: cardTitle });
}

/**
 * Drags `cardTitle`'s grip into `targetStage`'s column body. Scrolls the
 * target column into view first (the board is one horizontal-scroll row —
 * see SolvroPipelineKanban.tsx's header comment — so a far column can start
 * outside the desktop viewport), then drops just below the column's own
 * header (a fixed `+80` offset from its top) rather than near the bottom:
 * `mapCommitToMove` (commitMapper.ts) reads its destination stage off
 * `meta.overContainer`, which resolves correctly whether the drop lands on
 * the column's own empty space OR directly on an existing card — so exactly
 * where inside the column doesn't matter, only that the point stays inside
 * it. Anchoring near the top avoids ever needing to know (or scroll to) the
 * bottom of a column that may already hold many pre-existing dev-DB deals.
 */
async function dragCardIntoColumn(page: Page, cardTitle: string, targetStage: string): Promise<void> {
  const col = column(page, targetStage);
  await col.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const grip = await gripFor(page, cardTitle, "Drag to reorder");
  const box = await col.boundingBox();
  expect(grip, `grip for "${cardTitle}" not found`).toBeTruthy();
  expect(box, `column ${targetStage} not found`).toBeTruthy();

  const target = { x: box!.x + box!.width / 2, y: box!.y + Math.min(80, box!.height - 10) };
  await mouseDrag(page, center(grip!), target);
}

/** The Active/Closed switch (Pipeline.tsx, D11) — a second `role="group"` of
 * buttons on the same page as the view switcher, disambiguated from it by
 * requiring BOTH "Active" and "Closed" text somewhere among its buttons
 * (the view switcher's own group never contains either word). */
function dealsFilterGroup(page: Page): Locator {
  return page.locator('div[role="group"]').filter({ hasText: "Active" }).filter({ hasText: "Closed" });
}

/** A closed deal's card root on `PipelineClosed.tsx` (the Closed switch's
 * Kanban-tab view) — same unique-class-plus-title scoping as `cardRoot`
 * above, over `ClosedDealCard`'s own root className instead of
 * `OpportunityCard`'s (the two views are never mounted at the same time, so
 * there's no risk of this matching a board card instead). */
function closedCard(page: Page, cardTitle: string): Locator {
  return page.locator('[data-slot="closed-deal-card"]').filter({ hasText: cardTitle });
}

test.describe("pipeline board", () => {
  let token: string;
  let createdIds: string[] = [];
  let deals: {
    assessment: ApiDeal;
    rfp: ApiDeal;
    poc: ApiDeal;
    tech: ApiDeal;
    proposal: ApiDeal;
    waiting: ApiDeal;
  };
  let closeTarget: ApiDeal;
  let holdTarget: ApiDeal;
  let skipTarget: ApiDeal;

  test.beforeAll(async () => {
    token = await login();

    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const prefix = `e2e-pipeline-board-${stamp}`;
    const customerName = `${prefix}-customer`;

    const mk = (suffix: string, stage: string, dealValue: number) =>
      createDeal(token, { title: `${prefix}-${suffix}`, customerName, stage, dealValue });

    // Six deals across six distinct stages — each transaction touches only
    // its own stage's stageOrder count (backend/src/routes/opportunities.ts's
    // POST "/"), so concurrent creation across DIFFERENT stages is
    // race-free. These six stay untouched by the card-menu/skip-jump flows
    // below (dedicated fixtures of their own) so the view-switcher and
    // keyboard tests further down can keep referencing them by title.
    const [assessment, rfp, poc, tech, proposal, waiting, close, hold, skip] = await Promise.all([
      mk("assessment", "ASSESSMENT", 15_000_000),
      mk("rfp", "RFP", 32_000_000),
      mk("poc", "POC", 8_000_000),
      mk("tech", "TECHNICAL_CLARIFICATION", 45_000_000),
      mk("proposal", "DELIVER_PROPOSAL", 12_000_000),
      mk("waiting", "WAITING_RESPONSE", 60_000_000),
      mk("close-target", "ASSESSMENT", 9_000_000),
      mk("hold-target", "RFP", 21_000_000),
      mk("skip-target", "TECHNICAL_CLARIFICATION", 17_000_000),
    ]);

    deals = { assessment, rfp, poc, tech, proposal, waiting };
    closeTarget = close;
    holdTarget = hold;
    skipTarget = skip;
    createdIds = [
      assessment.id,
      rfp.id,
      poc.id,
      tech.id,
      proposal.id,
      waiting.id,
      close.id,
      hold.id,
      skip.id,
    ];
  });

  test.afterAll(async () => {
    if (!token) return;
    // Sequential, NOT `Promise.all` (deliberate, T7 finding): two DELETEs
    // for opportunities sharing the same `stage` both run
    // `closeGapInStage`'s per-row `tx.opportunity.update` loop
    // (backend/src/routes/opportunities.ts) inside their own transaction —
    // concurrently, that intermittently deadlocks in Postgres (`40P01`,
    // `PrismaClientUnknownRequestError`) and one side 500s. `deleteDeal`
    // itself stays best-effort/non-throwing (its own header comment), but a
    // concurrent cleanup here reliably lost some of this file's own
    // same-stage fixtures to that 500 — sequential avoids the race
    // entirely. See this task's report for the full repro; not fixed here
    // (backend/ is out of this task's scope).
    for (const id of createdIds) {
      await deleteDeal(token, id);
    }
  });

  // ---------------------------------------------------------------------
  // 1. Board render — both projects.
  // ---------------------------------------------------------------------
  test("renders KPI bar, 6 columns, seeded deals in the right columns, and column value sums", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/pipeline", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // KPI bar (PipelineKpiBar.tsx's 5 tiles — a 5th "Idle alerts" tile
    // joined the original 4 in the 2026-09-25 flow redesign, D1/§3.6).
    await expect(page.getByText("Total Pipeline", { exact: true })).toBeVisible();
    await expect(page.getByText("Deadline ≤ 7d", { exact: true })).toBeVisible();
    await expect(page.getByText("Won this month", { exact: true })).toBeVisible();
    await expect(page.getByText("Active PICs", { exact: true })).toBeVisible();
    await expect(page.getByText("Idle alerts", { exact: true })).toBeVisible();

    // Exactly 6 PipelineStage columns render (D2 — Won/Drop/Hold left the
    // enum), each with its label.
    await expect(page.locator('[data-slot="kanban-column"]')).toHaveCount(6);
    // ...and left to right in D2's order — the PipelineStage enum's
    // declaration order IS the board order, so a reordered enum would
    // silently flip the columns while every per-column check stayed green.
    expect(
      await page
        .locator('[data-slot="kanban-column"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-value"))),
    ).toEqual([...STAGE_ORDER]);
    for (const stage of STAGE_ORDER) {
      const col = column(page, stage);
      await expect(col).toBeVisible();
      await expect(col.getByText(STAGE_LABELS[stage], { exact: true })).toBeVisible();
    }

    // Seeded cards land in the column matching their seeded stage.
    const placements: Array<[ApiDeal, string]> = [
      [deals.assessment, "ASSESSMENT"],
      [deals.rfp, "RFP"],
      [deals.poc, "POC"],
      [deals.tech, "TECHNICAL_CLARIFICATION"],
      [deals.proposal, "DELIVER_PROPOSAL"],
      [deals.waiting, "WAITING_RESPONSE"],
    ];
    for (const [deal, stage] of placements) {
      await expect(column(page, stage).getByText(deal.title, { exact: true })).toBeVisible();
    }

    // Column value sums — computed from a fresh API read so this holds
    // regardless of whatever else the shared dev DB already has per stage.
    // `.first()`: the column header's own sum span (SolvroPipelineKanban.tsx)
    // renders BEFORE any card in DOM order, but a pre-existing dev-DB card
    // can coincidentally carry the exact same compact-formatted dealValue
    // text as the column's aggregate sum (confirmed live: an existing "Rp
    // 1,5M" card collided with a column total of the same formatted value) —
    // `.first()` deterministically resolves to the header instance either way.
    const allDeals = await getAllDeals(token);
    for (const stage of STAGE_ORDER) {
      const sum = allDeals
        .filter((d) => d.stage === stage && d.outcome === null)
        .reduce((s, d) => s + d.dealValue, 0);
      await expect(
        column(page, stage).getByText(formatIDRCompact(sum), { exact: true }).first(),
      ).toBeVisible();
    }
  });

  // ---------------------------------------------------------------------
  // 2. Cross-stage drag — desktop only (mouse PointerSensor; see this
  //    file's header comment for the mobile skip rationale).
  // ---------------------------------------------------------------------
  test("drag a card between two stages: lands and persists after reload", async ({ page }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "mouse drag cases run on the desktop project only (dnd-kit PointerSensor) — see file header for the mobile rationale",
    );
    await loginViaUi(page);
    // The sidebar starts expanded at 1280px and wider (SidebarContext.tsx).
    // With it open, the six-stage board overflows at 1440px: scrolling the
    // RFP column into view pushes the Assessment card's grip off-screen and
    // the pointer drag never starts. Collapse the rail the way a user would
    // (the persisted choice) so both ends of the drag are on screen.
    await page.evaluate(() => localStorage.setItem("solvro.sidebar", "closed"));
    await page.goto("/pipeline", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    await dragCardIntoColumn(page, deals.assessment.title, "RFP");

    // Lands immediately (client-side, before any reload).
    await expect(column(page, "RFP").getByText(deals.assessment.title, { exact: true })).toBeVisible();

    // Persists after reload — proves the server round-trip actually
    // happened, not just the optimistic local write.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(column(page, "RFP").getByText(deals.assessment.title, { exact: true })).toBeVisible();

    const updated = await getDeal(token, deals.assessment.id);
    expect(updated.stage).toBe("RFP");
  });

  // ---------------------------------------------------------------------
  // 3a. Close from the card menu (D5) — desktop only, see file header.
  // ---------------------------------------------------------------------
  test("card menu: Close deal as Lost moves it to the Closed board; Reopen restores it", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "the ⋯ menu / Close dialog flow runs on the desktop project only — see file header for the mobile rationale",
    );
    await loginViaUi(page);
    await page.goto("/pipeline", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    await cardRoot(page, "ASSESSMENT", closeTarget.title)
      .getByRole("button", { name: "More actions" })
      .click();
    await page.getByRole("menuitem", { name: "Close deal…", exact: true }).click();

    const closeDialog = page.getByRole("dialog", { name: "Close deal", exact: true });
    await expect(closeDialog).toBeVisible();

    // Click the visible radio CARD (the `<label>`), not the raw
    // `<input type="radio">` a bare `.check()` would target: the input is
    // `sr-only` (CloseDealDialog.tsx), and its collapsed hit-box sits under
    // the card's own icon glyph, so a direct click/`.check()` on the input
    // times out with "<span aria-hidden ...>cancel</span> intercepts
    // pointer events" — real users click the label (native label->input
    // association fires regardless of exactly where inside it they click),
    // so this test does the same rather than fighting the input directly.
    await closeDialog.locator("fieldset label").filter({ hasText: "Lost" }).click();
    await expect(closeDialog.getByRole("radio", { name: "Lost", exact: true })).toBeChecked();
    await closeDialog.getByLabel("Reason category").selectOption("COMPETITOR");
    await closeDialog.getByLabel("Note (optional)").fill("Lost to a lower-priced competitor.");
    await closeDialog.getByRole("button", { name: "Close as Lost", exact: true }).click();
    await expect(closeDialog).toBeHidden({ timeout: 10_000 });
    await page.waitForTimeout(600);

    // Left the Active board.
    await expect(column(page, "ASSESSMENT").getByText(closeTarget.title, { exact: true })).toHaveCount(0);

    // Switch to Closed (`?deals=closed`, a `role="group"` of buttons with
    // `aria-pressed`, D11).
    const closedBtn = dealsFilterGroup(page).getByRole("button", { name: /^Closed/ });
    await closedBtn.click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/[?&]deals=closed/);
    await expect(closedBtn).toHaveAttribute("aria-pressed", "true");

    // Shows under Lost with its (locked) stage chip and the reason category.
    const card = closedCard(page, closeTarget.title);
    await expect(card).toBeVisible();
    await expect(card.getByText("Assessment", { exact: true })).toBeVisible();
    await expect(card).toContainText("Lost");
    await expect(card).toContainText("Competitor");

    // Detail page: Reopen button + the close activity entry (the free-text
    // note is appended after a colon — backend/src/routes/opportunities.ts's
    // POST /:id/close — so this matches the fixed prefix, not the whole note).
    await page.goto(`/pipeline/${closeTarget.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const reopenButton = page.getByRole("button", { name: "Reopen" });
    await expect(reopenButton).toBeVisible();
    await expect(page.getByText(/Closed as Lost \(Competitor\)/)).toBeVisible();

    await reopenButton.click();
    await page.waitForTimeout(800);
    await expect(page.getByRole("button", { name: "Reopen" })).toHaveCount(0);

    const reopened = await getDeal(token, closeTarget.id);
    expect(reopened.outcome).toBeNull();
    expect(reopened.stage).toBe("ASSESSMENT");

    // Back on the Active board, same stage.
    await page.goto("/pipeline", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(column(page, "ASSESSMENT").getByText(closeTarget.title, { exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // 3a'. Archive from the detail page — desktop only, same as 3a. Its own
  //      deal, so it never races the shared fixtures above.
  // ---------------------------------------------------------------------
  test("Close deal as Archived takes no reason and lands in the Archived column", async ({ page }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "the Close dialog flow runs on the desktop project only — see file header for the mobile rationale",
    );
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const deal = await createDeal(token, {
      title: `e2e-pipeline-archive-${stamp}`,
      customerName: `e2e-pipeline-archive-${stamp}-customer`,
      stage: "ASSESSMENT",
      dealValue: 1_000_000,
    });
    try {
      await loginViaUi(page);
      await page.goto(`/pipeline/${deal.id}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Close deal/ }).first().click();
      const closeDialog = page.getByRole("dialog", { name: "Close deal", exact: true });
      await expect(closeDialog).toBeVisible();

      await closeDialog.locator("fieldset label").filter({ hasText: "Archived" }).click();
      await expect(closeDialog.getByRole("radio", { name: "Archived", exact: true })).toBeChecked();
      await expect(closeDialog.getByLabel("Reason category")).toHaveCount(0);
      await closeDialog.getByLabel("Note (optional)").fill("Duplicate entry.");
      await closeDialog.getByRole("button", { name: "Close as Archived", exact: true }).click();
      await expect(closeDialog).toBeHidden({ timeout: 10_000 });
      await expect(page.getByText("Archived: Duplicate entry.")).toBeVisible();
      expect((await getDeal(token, deal.id)).outcome).toBe("ARCHIVED");

      await page.goto("/pipeline?deals=closed", { waitUntil: "networkidle" });
      const card = closedCard(page, deal.title);
      await expect(card).toBeVisible();
      await expect(card).toContainText("Archived");
    } finally {
      await deleteDeal(token, deal.id);
    }
  });

  // ---------------------------------------------------------------------
  // 3b. Hold from the card menu keeps the column — desktop only, see file
  //     header.
  // ---------------------------------------------------------------------
  test("card menu: Hold keeps the column and shows the Hold chip; Release hold clears it", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "the ⋯ menu flow runs on the desktop project only — see file header for the mobile rationale",
    );
    await loginViaUi(page);
    await page.goto("/pipeline", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    await cardRoot(page, "RFP", holdTarget.title).getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Hold", exact: true }).click();
    await page.waitForTimeout(600);

    // Stays in RFP, shows the Hold chip.
    await expect(column(page, "RFP").getByText(holdTarget.title, { exact: true })).toBeVisible();
    await expect(cardRoot(page, "RFP", holdTarget.title)).toContainText("Hold");

    // Persists after reload.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(column(page, "RFP").getByText(holdTarget.title, { exact: true })).toBeVisible();
    await expect(cardRoot(page, "RFP", holdTarget.title)).toContainText("Hold");

    await cardRoot(page, "RFP", holdTarget.title)
      .getByRole("button", { name: "More actions" })
      .click();
    await page.getByRole("menuitem", { name: "Release hold", exact: true }).click();
    await page.waitForTimeout(600);

    await expect(cardRoot(page, "RFP", holdTarget.title)).not.toContainText("Hold");

    // Persists after reload.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(column(page, "RFP").getByText(holdTarget.title, { exact: true })).toBeVisible();
    await expect(cardRoot(page, "RFP", holdTarget.title)).not.toContainText("Hold");
  });

  // ---------------------------------------------------------------------
  // 3c. Technical Clarification -> RFP skip jump asks for a reason (D4) —
  //     desktop only (drag), reuses the file's own drag helper.
  // ---------------------------------------------------------------------
  test("drag Technical Clarification -> RFP: cancel restores, confirm logs the reason", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "mouse drag cases run on the desktop project only (dnd-kit PointerSensor) — see file header for the mobile rationale",
    );
    await loginViaUi(page);
    // Collapse the rail so both ends of a pointer drag stay on screen (see the
    // first drag test above).
    await page.evaluate(() => localStorage.setItem("solvro.sidebar", "closed"));
    await page.goto("/pipeline", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // --- Cancel path -----------------------------------------------------
    await dragCardIntoColumn(page, skipTarget.title, "RFP");

    const reasonDialog = page.getByRole("dialog", { name: "Move to RFP and skip PoC?", exact: true });
    await expect(reasonDialog).toBeVisible();
    await reasonDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(reasonDialog).not.toBeVisible();

    await expect(
      column(page, "TECHNICAL_CLARIFICATION").getByText(skipTarget.title, { exact: true }),
    ).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(
      column(page, "TECHNICAL_CLARIFICATION").getByText(skipTarget.title, { exact: true }),
    ).toBeVisible();

    const afterCancel = await getDeal(token, skipTarget.id);
    expect(afterCancel.stage).toBe("TECHNICAL_CLARIFICATION");

    // --- Confirm path, with a reason --------------------------------------
    await dragCardIntoColumn(page, skipTarget.title, "RFP");

    const reasonDialog2 = page.getByRole("dialog", { name: "Move to RFP and skip PoC?", exact: true });
    await expect(reasonDialog2).toBeVisible();

    const reasonText = "Client asked to jump straight to the RFP stage.";
    await reasonDialog2.getByLabel("Reason for the skip").fill(reasonText);
    await reasonDialog2.getByRole("button", { name: "Move to RFP", exact: true }).click();
    await expect(reasonDialog2).not.toBeVisible({ timeout: 10_000 });

    await expect(column(page, "RFP").getByText(skipTarget.title, { exact: true })).toBeVisible();

    const afterConfirm = await getDeal(token, skipTarget.id);
    expect(afterConfirm.stage).toBe("RFP");

    // Deal page's activity feed carries the skip reason.
    await page.goto(`/pipeline/${skipTarget.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await expect(
      page.getByText(`Moved from Technical Clarification to RFP, PoC skipped: ${reasonText}`, {
        exact: true,
      }),
    ).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // 4. View switching — both projects (no drag involved).
  // ---------------------------------------------------------------------
  test("view switcher: List/Swimlane/Quarter render seeded deals, ?view= updates, survives reload", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/pipeline", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const group = page.locator('div[role="group"]');
    const listBtn = group.getByRole("button").filter({ hasText: "List" });
    const swimlaneBtn = group.getByRole("button").filter({ hasText: "Swimlane" });
    const quarterBtn = group.getByRole("button").filter({ hasText: "Quarter" });

    await listBtn.click();
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/[?&]view=list/);
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(deals.rfp.title, { exact: true }).first()).toBeVisible();

    await swimlaneBtn.click();
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/[?&]view=swimlane/);
    await expect(swimlaneBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(deals.poc.title, { exact: true }).first()).toBeVisible();
    // Swimlane/Quarter show active deals only, always (D11) — the caption
    // makes that scope explicit rather than silently matching whatever the
    // Active/Closed switch (Kanban/List only) happens to be set to.
    await expect(page.getByText("Active deals", { exact: true })).toBeVisible();

    await quarterBtn.click();
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/[?&]view=quarter/);
    await expect(quarterBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(deals.tech.title, { exact: true }).first()).toBeVisible();

    // Switcher survives reload — `?view=` in the URL is what Pipeline.tsx's
    // own useState initializer reads on mount (Pipeline.tsx).
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/[?&]view=quarter/);
    await expect(page.getByText(deals.tech.title, { exact: true }).first()).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // 5. Keyboard: a card's title link navigates to /pipeline/:id — both
  //    projects.
  // ---------------------------------------------------------------------
  test("keyboard: a card's title link is focusable and Enter navigates to the detail page", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/pipeline", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // OpportunityCard.tsx renders the title as a real `<a>` (`<Link>`) —
    // reachable by Tab, unlike the card's own onClick div. `.press()`
    // focuses the element before dispatching the key (Playwright's
    // documented behavior for element-scoped `press`), which is the
    // meaningful assertion here: this is a native anchor sitting in normal
    // tab order, so a real Tab sequence would reach it the same way: no
    // bespoke keydown handler to fake.
    const titleLink = page.getByRole("link", { name: deals.proposal.title, exact: true });
    await expect(titleLink).toBeVisible();
    await titleLink.press("Enter");

    await page.waitForURL(new RegExp(`/pipeline/${deals.proposal.id}`), { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/pipeline/${deals.proposal.id}`));
  });
});
