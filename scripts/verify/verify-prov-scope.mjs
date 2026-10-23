// The provenance inspector armed on one section (rails-ops TO-DO-ui-jobs 284).
// ---------------------------------------------------------------------------
// "Inspect provenance" arms the inspector on one section: the position card (a
// row of C17's ⋮, Liquity V2), Lifetime flows (a row of its ⋮), one event (a
// row of the event page card's ⋮ in T1). Only the values inside that section
// become targets (`[data-prov-pickable]` inside `[data-prov-scope="<scope>"]`,
// none outside) and only that section wears the ring (`[data-prov-lit]`, no
// page-wide halo); the Escape ladder is the page-level tool's, and putting the
// mode down hands focus back to the control that armed it. The page-level tool
// (H7.3, the Tools menu) still marks every section under the halo.
//
// Pages: the story Trove and its Repay #148 event page (Liquity V2), an Aave
// V3 Core wallet.
// Repointed (ui-jobs 432): the two card-row checks are dropped; the card has no rows to open since 322/330.
//
// Run:  BASE=http://localhost:3111 node scripts/verify/verify-prov-scope.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { HALO, armScope } from "./lib/prov-inspector.mjs";

const TROVE =
  "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154";
const EVENT_ID = "0x2a440f6541a008e23d3088f88bac08d0ded6884d3238cbe0c1eee4b8a3e158d4_3";
const EVENT_PAGE = `${TROVE}/event/${EVENT_ID}`;
// A card with stats (figures outside the breakdown button).
const AAVE_STATS = "/ethereum/aave-v3/0x8008316e61985599dc62d69716bab3ebe643c0a8?market=core";

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const browser = await chromium.launch();

async function open(width, path, ready) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    hasTouch: width < 640,
    isMobile: width < 640,
    extraHTTPHeaders: bypassHeaders(),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() !== "error" && !/hydrat/i.test(t)) return;
    // A hydration report's lines that differ (+ client, - server) name the cause.
    const diff = t
      .split("\n")
      .filter((l) => /^\s*[+-]\s/.test(l))
      .slice(0, 6)
      .join(" / ");
    errors.push(`${t.slice(0, 160)}${diff ? ` [${diff}]` : ""}`);
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector(ready, { timeout: 120000 }).catch(() => {});
  // Hydration: a press before it is lost.
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}

/** Marked values inside the section `scope` (its innermost named scope) and
 *  everywhere else. */
function marks(page, scope) {
  return page.evaluate((s) => {
    const all = [...document.querySelectorAll("[data-prov-pickable]")];
    const inside = all.filter((e) => e.closest("[data-prov-scope]")?.getAttribute("data-prov-scope") === s).length;
    return { inside, outside: all.length - inside, total: all.length };
  }, scope);
}

/** Marked values per named section. */
function marksBySection(page) {
  return page.evaluate(() => {
    const out = {};
    for (const e of document.querySelectorAll("[data-prov-pickable]")) {
      const s = e.closest("[data-prov-scope]")?.getAttribute("data-prov-scope") ?? "(unnamed)";
      const k = s === "position-card" || s === "flows" || s === "(unnamed)" ? s : "event";
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  });
}

const halo = async (page) => Boolean(await page.$(HALO));
/** Armed on `scope` alone: that section wears the ring, nothing else does,
 *  and the page-wide halo is absent. */
const litOnly = (page, scope) =>
  page.evaluate((s) => {
    const lit = [...document.querySelectorAll("[data-prov-lit]")].map((e) => e.getAttribute("data-prov-scope"));
    return lit.length === 1 && lit[0] === s && !document.querySelector(".prov-inspect-halo");
  }, scope);
const focusIs = (page, sel) => page.evaluate((q) => !!document.activeElement?.matches(q), sel);

/** The Escape ladder: pick a value inside the section, Escape closes the
 *  popover and keeps the mode, a second Escape puts it down, and focus lands
 *  on `opener`. */
async function ladder(page, scope, opener, label) {
  const pick = page.locator(`[data-prov-scope="${scope}"] [data-prov-pickable]`).first();
  await pick.scrollIntoViewIfNeeded().catch(() => {});
  await pick.click({ timeout: 5000 }).catch(() => {});
  const pop = await page
    .waitForSelector(".prov-inspect-pop", { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const afterOne = { pop: Boolean(await page.$(".prov-inspect-pop")), armed: await halo(page) };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const afterTwo = { armed: await halo(page), marked: (await marks(page, scope)).total };
  const focused = await focusIs(page, opener);
  check(
    `${label}: a pick pins a receipt, Escape closes it and keeps the mode, a second Escape puts it down`,
    pop && !afterOne.pop && afterOne.armed && !afterTwo.armed && afterTwo.marked === 0,
    JSON.stringify({ pop, afterOne, afterTwo }),
  );
  check(`${label}: focus returns to the control that armed it`, focused, opener);
}

const CARD = '[data-prov-scope="position-card"]';
const C17 = "[data-card-menu]";
const C17_TRIGGER = `${C17} > button`;
const FLOWS_MENU = "[data-panel-menu]";
const FLOWS_TRIGGER = `${FLOWS_MENU} > button`;

// ── 1. Liquity V2 Trove, 1280 and 390 ───────────────────────────────────────
for (const width of [1280, 390]) {
  const { ctx, page, errors } = await open(width, TROVE, `${CARD} [data-prov-covered], ${CARD} .prov-locate-box`);
  await page.waitForSelector(FLOWS_MENU, { timeout: 60000 }).catch(() => {});
  const tag = `trove @${width}`;

  // The C17 row: "Inspect provenance", no page-wide row.
  await page.locator(C17_TRIGGER).click();
  await page.waitForSelector('[data-prov-scope-toggle="position-card"]', { timeout: 5000 }).catch(() => {});
  const rows = await page.evaluate(() => ({
    scoped: document.querySelector('[data-prov-scope-toggle="position-card"]')?.textContent ?? null,
    global: !!document.querySelector("button.prov-inspect-toggle"),
    sheet: !!document.querySelector('[role="dialog"] [data-prov-scope-toggle="position-card"]'),
  }));
  check(
    `${tag}: C17 holds "Inspect provenance" and no page-wide inspector row`,
    /^Inspect provenance/.test(rows.scoped ?? "") && !rows.global && (width >= 640 || rows.sheet),
    JSON.stringify(rows),
  );
  await page.locator('[data-prov-scope-toggle="position-card"]').click();
  await page.waitForTimeout(500);
  const card = await marks(page, "position-card");
  check(
    `${tag}: the C17 row arms the card alone, and the card alone wears the ring`,
    (await litOnly(page, "position-card")) && card.inside > 0 && card.outside === 0,
    `inside ${card.inside}, outside ${card.outside}`,
  );
  // Dropped: "armed on the card, every card row stands open" read [data-card-row-toggle]; 322/330 removed the card's rows.
  check(`${tag}: focus sits on C17's trigger after the pick`, await focusIs(page, C17_TRIGGER));
  // The row reads "Stop inspecting" while the card is armed.
  await page.locator(C17_TRIGGER).click();
  await page.waitForSelector('[data-prov-scope-toggle="position-card"]', { timeout: 5000 }).catch(() => {});
  const hideRow = await page.locator('[data-prov-scope-toggle="position-card"]').first();
  const hideText = await hideRow.textContent().catch(() => "");
  const hidePressed = await hideRow.getAttribute("aria-pressed").catch(() => null);
  check(
    `${tag}: the row reads "Stop inspecting" while the card is armed`,
    /^Stop inspecting/.test(hideText ?? "") && hidePressed === "true",
    hideText ?? "",
  );
  // Close the menu without Escape (Escape belongs to the armed mode's ladder).
  if (width >= 640) await page.locator(C17_TRIGGER).click();
  else await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  await ladder(page, "position-card", C17_TRIGGER, `${tag} card`);

  // Lifetime flows: its ⋮ row arms the panel alone and leaves the card rows as
  // the reader set them.
  if (width >= 640) {
    await armScope(page, "flows", { menu: FLOWS_MENU });
    await page.waitForTimeout(500);
    const flows = await marks(page, "flows");
    check(
      `${tag}: the flows ⋮ row arms Lifetime flows alone, and the panel alone wears the ring`,
      (await litOnly(page, "flows")) && flows.inside > 0 && flows.outside === 0,
      `inside ${flows.inside}, outside ${flows.outside}`,
    );
    // Dropped: "armed on flows, the card's closed rows stay closed" read [data-card-row-toggle]; 322/330 removed the card's rows.
    await ladder(page, "flows", FLOWS_TRIGGER, `${tag} flows`);
  }
  check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ── 2. The Repay #148 event page, 1280 and 390 ─────────────────────────────
// The event's "Inspect provenance" is a row of the card's ⋮ in T1; the actions
// row carries none.
for (const width of [1280, 390]) {
  const MENU = "[data-event-id] [data-event-menu]";
  const TRIGGER = `${MENU} > button`;
  const ROW = `[data-prov-scope-toggle="${EVENT_ID}"]`;
  const { ctx, page, errors } = await open(width, EVENT_PAGE, TRIGGER);
  const tag = `event page @${width}`;
  const inActions = await page.locator("[data-event-page-actions] [data-prov-scope-toggle]").count();
  check(`${tag}: the actions row holds no provenance control`, inActions === 0, `${inActions} found`);
  const openRow = async () => {
    for (let i = 0; i < 4 && (await page.locator(ROW).count()) === 0; i++) {
      await page
        .locator(TRIGGER)
        .click()
        .catch(() => {});
      await page.waitForSelector(ROW, { timeout: 4000 }).catch(() => {});
    }
    return page.locator(ROW).first();
  };
  const cardScope = await page.locator("[data-event-id] [data-prov-scope]").first().getAttribute("data-prov-scope");
  check(`${tag}: the card's scope is the event's id`, cardScope === EVENT_ID, cardScope ?? "");
  const row = await openRow();
  const rowText = (await row.textContent().catch(() => "")) ?? "";
  check(`${tag}: the ⋮ row reads "Inspect provenance"`, /^Inspect provenance/.test(rowText), rowText);
  await row.click();
  await page.waitForTimeout(500);
  const m = await marks(page, EVENT_ID);
  const inAside = await page.locator("[data-event-page-side] [data-prov-pickable]").count();
  check(
    `${tag}: armed, marks only inside the event (card and aside), which alone wears the ring`,
    (await litOnly(page, EVENT_ID)) && m.inside > 0 && m.outside === 0,
    `inside ${m.inside} (aside ${inAside}), outside ${m.outside}`,
  );
  check(`${tag}: focus sits on the ⋮ after the pick`, await focusIs(page, TRIGGER));
  const hide = await openRow();
  const hideText = (await hide.textContent().catch(() => "")) ?? "";
  check(`${tag}: the row reads "Stop inspecting" while armed`, /^Stop inspecting/.test(hideText), hideText);
  await hide.click();
  await page.waitForTimeout(400);
  const off = await marks(page, EVENT_ID);
  check(`${tag}: "Stop inspecting" puts the mode down`, !(await halo(page)) && off.total === 0, `${off.total} marked`);
  await (await openRow()).click();
  await page.waitForTimeout(400);
  await ladder(page, EVENT_ID, TRIGGER, tag);
  check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ── 3. Aave V3 Core: each section's ⋮ arms that section alone ──────────
// The page-level tool is gone: the card's ⋮ and the panel's ⋮ each carry
// "Inspect provenance" for their own section (scoped arming). The fixture's
// card has stats outside the breakdown button, whose headline figures take
// no armed click (their receipt sits in the breakdown's heading).
{
  const { ctx, page, errors } = await open(1280, AAVE_STATS, "[data-event-id]");
  const tag = "aave-v3 @1280";
  await page.waitForSelector("[data-position-panel] [data-panel-row]", { timeout: 60_000 }).catch(() => {});
  await armScope(page, "position-card", { menu: "[data-card-menu]" });
  await page.waitForTimeout(500);
  const card = await marksBySection(page);
  check(
    `${tag}: the card's ⋮ marks the card's figures and nothing else`,
    (card["position-card"] ?? 0) > 0 && !card.flows && !card.event,
    JSON.stringify(card),
  );
  // Fresh, so the card's arming does not carry over.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-lifetime-flows-panel] [data-panel-menu]", { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await armScope(page, "flows", { menu: "[data-lifetime-flows-panel] [data-panel-menu]" });
  await page.waitForTimeout(500);
  const flows = await marksBySection(page);
  check(
    `${tag}: the panel's ⋮ marks the flows and nothing else`,
    (flows.flows ?? 0) > 0 && !flows["position-card"] && !flows.event,
    JSON.stringify(flows),
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures === 0 && checked > 0 ? 0 : 1);
