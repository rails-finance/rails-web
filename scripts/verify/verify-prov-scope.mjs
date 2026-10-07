// The provenance inspector armed on one section (rails-ops TO-DO-ui-jobs 284).
// ---------------------------------------------------------------------------
// "Show provenance" arms the inspector on one section: the position card (a
// row of C17's ⋮, Liquity V2), Lifetime flows (a row of its ⋮), one event (a
// row of the event's ⋮ on the other families, a button in the Liquity V2 event
// page's actions row). Only the values inside that section become targets
// (`[data-prov-pickable]` inside `[data-prov-scope="<scope>"]`, none outside);
// the halo and the Escape ladder are the page-level tool's, and putting the
// mode down hands focus back to the control that armed it. The page-level tool
// (H7.3, the Tools menu) still marks every section.
//
// Pages: the story Trove and its Repay #148 event page (Liquity V2), an Aave
// V3 Core wallet, a Maple wallet (the event ⋮ in the phone sheet at 390).
//
// Run:  BASE=http://localhost:3111 node scripts/verify/verify-prov-scope.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { HALO, armInspector, armScope } from "./lib/prov-inspector.mjs";

const TROVE =
  "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154";
const EVENT_ID = "0x2a440f6541a008e23d3088f88bac08d0ded6884d3238cbe0c1eee4b8a3e158d4_3";
const EVENT_PAGE = `${TROVE}/event/${EVENT_ID}`;
const AAVE = "/ethereum/aave-v3/0xfe28854b855ab09a47adbd893a5f580cdffc5820?market=core";
const MAPLE = "/ethereum/maple/0x9ec2d8dd95ee25975ba2a5bb4e9d50dd57b7c87a";

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

  // The C17 row: "Show provenance", no page-wide row.
  await page.locator(C17_TRIGGER).click();
  await page.waitForSelector('[data-prov-scope-toggle="position-card"]', { timeout: 5000 }).catch(() => {});
  const rows = await page.evaluate(() => ({
    scoped: document.querySelector('[data-prov-scope-toggle="position-card"]')?.textContent ?? null,
    global: !!document.querySelector("button.prov-inspect-toggle"),
    sheet: !!document.querySelector('[role="dialog"] [data-prov-scope-toggle="position-card"]'),
  }));
  check(
    `${tag}: C17 holds "Show provenance" and no page-wide inspector row`,
    /^Show provenance/.test(rows.scoped ?? "") && !rows.global && (width >= 640 || rows.sheet),
    JSON.stringify(rows),
  );
  await page.locator('[data-prov-scope-toggle="position-card"]').click();
  await page.waitForTimeout(500);
  const card = await marks(page, "position-card");
  const cardRows = await page.$$eval("[data-card-row-toggle]", (els) =>
    els.map((e) => e.getAttribute("aria-expanded")),
  );
  check(
    `${tag}: the C17 row arms the card alone`,
    (await halo(page)) && card.inside > 0 && card.outside === 0,
    `inside ${card.inside}, outside ${card.outside}`,
  );
  check(
    `${tag}: armed on the card, every card row stands open`,
    cardRows.every((x) => x === "true"),
    JSON.stringify(cardRows),
  );
  check(`${tag}: focus sits on C17's trigger after the pick`, await focusIs(page, C17_TRIGGER));
  // The row reads "Hide provenance" while the card is armed.
  await page.locator(C17_TRIGGER).click();
  await page.waitForSelector('[data-prov-scope-toggle="position-card"]', { timeout: 5000 }).catch(() => {});
  const hideRow = await page.locator('[data-prov-scope-toggle="position-card"]').first();
  const hideText = await hideRow.textContent().catch(() => "");
  const hidePressed = await hideRow.getAttribute("aria-pressed").catch(() => null);
  check(
    `${tag}: the row reads "Hide provenance" while the card is armed`,
    /^Hide provenance/.test(hideText ?? "") && hidePressed === "true",
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
    const rowsNow = await page.$$eval("[data-card-row-toggle]", (els) =>
      els.map((e) => e.getAttribute("aria-expanded")),
    );
    check(
      `${tag}: the flows ⋮ row arms Lifetime flows alone`,
      (await halo(page)) && flows.inside > 0 && flows.outside === 0,
      `inside ${flows.inside}, outside ${flows.outside}`,
    );
    check(
      `${tag}: armed on flows, the card's closed rows stay closed`,
      rowsNow.includes("false"),
      JSON.stringify(rowsNow),
    );
    await ladder(page, "flows", FLOWS_TRIGGER, `${tag} flows`);
  }
  check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ── 2. The Repay #148 event page, 1280 and 390 ─────────────────────────────
for (const width of [1280, 390]) {
  const BTN = "[data-event-page-actions] [data-prov-scope-toggle]";
  const { ctx, page, errors } = await open(width, EVENT_PAGE, BTN);
  const tag = `event page @${width}`;
  const scope = await page.locator(BTN).getAttribute("data-prov-scope-toggle");
  const cardScope = await page.locator("[data-event-id] [data-prov-scope]").first().getAttribute("data-prov-scope");
  check(
    `${tag}: the button arms the event's id, the card's scope`,
    scope === EVENT_ID && cardScope === EVENT_ID,
    `${scope} / ${cardScope}`,
  );
  check(`${tag}: the button reads "Show provenance"`, (await page.locator(BTN).textContent()) === "Show provenance");
  await page.locator(BTN).click();
  await page.waitForTimeout(500);
  const m = await marks(page, EVENT_ID);
  const inAside = await page.locator("[data-event-page-side] [data-prov-pickable]").count();
  check(
    `${tag}: armed, marks only inside the event (card and aside)`,
    (await halo(page)) && m.inside > 0 && m.outside === 0,
    `inside ${m.inside} (aside ${inAside}), outside ${m.outside}`,
  );
  check(`${tag}: the button reads "Hide provenance"`, (await page.locator(BTN).textContent()) === "Hide provenance");
  await page.locator(BTN).click();
  await page.waitForTimeout(400);
  const off = await marks(page, EVENT_ID);
  check(`${tag}: "Hide provenance" puts the mode down`, !(await halo(page)) && off.total === 0, `${off.total} marked`);
  await page.locator(BTN).click();
  await page.waitForTimeout(400);
  await ladder(page, EVENT_ID, BTN, tag);
  check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ── 3. Aave V3 Core: an event's ⋮ arms that event; the Tools menu marks all ─
{
  const { ctx, page, errors } = await open(1280, AAVE, "[data-event-id] [data-event-menu]");
  const tag = "aave-v3 @1280";
  const cards = page.locator("[data-event-id]");
  const first = cards.nth(0);
  const firstScope = await first.locator("[data-prov-scope]").first().getAttribute("data-prov-scope");
  const menu = first.locator("[data-event-menu]").first();
  const armed = await armScope(page, firstScope, { menu });
  await page.waitForTimeout(500);
  const m = await marks(page, firstScope);
  const by = await marksBySection(page);
  check(
    `${tag}: the first event's ⋮ row arms that event alone`,
    armed && m.inside > 0 && m.outside === 0,
    `inside ${m.inside}, outside ${m.outside} ${JSON.stringify(by)}`,
  );
  const secondScope = await cards.nth(1).locator("[data-prov-scope]").first().getAttribute("data-prov-scope");
  const second = await marks(page, secondScope);
  const cardMarks = await marks(page, "position-card");
  check(
    `${tag}: another event and the card stay unmarked`,
    second.inside === 0 && cardMarks.inside === 0,
    `${second.inside} / ${cardMarks.inside}`,
  );
  await ladder(
    page,
    firstScope,
    `[data-event-id="${await first.getAttribute("data-event-id")}"] [data-event-menu] > button`,
    `${tag} event`,
  );
  // The page-level tool (H7.3) marks every section.
  await armInspector(page);
  await page.waitForTimeout(500);
  const all = await marksBySection(page);
  check(
    `${tag}: the page-level tool marks the card, the flows and the events`,
    (all["position-card"] ?? 0) > 0 && (all.event ?? 0) > 0 && (all.flows ?? 0) > 0,
    JSON.stringify(all),
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

// ── 4. Maple at 390: the event ⋮ row in the phone sheet ────────────────────
{
  const { ctx, page, errors } = await open(390, MAPLE, "[data-event-id]");
  const tag = "maple @390";
  // The spine view: a card's header (and its ⋮) shows once its segment opens.
  if ((await page.locator("[data-event-id] [data-event-menu]").count()) === 0)
    await page
      .locator("[data-spine-toggle]")
      .first()
      .click()
      .catch(() => {});
  const menu = page.locator("[data-event-menu]").first();
  await menu.waitFor({ timeout: 10000 }).catch(() => {});
  const scope = await menu.evaluate((el) => el.closest("[data-prov-scope]")?.getAttribute("data-prov-scope") ?? null);
  await menu.locator(":scope > button").click();
  const inSheet = await page
    .waitForSelector('[role="dialog"] [data-prov-scope-toggle]', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(`${tag}: the event ⋮ opens as a sheet holding "Show provenance"`, inSheet);
  const armed = inSheet ? await armScope(page, scope) : false;
  await page.waitForTimeout(500);
  const m = await marks(page, scope);
  check(
    `${tag}: the row arms that event alone`,
    armed && m.inside > 0 && m.outside === 0,
    `inside ${m.inside}, outside ${m.outside}`,
  );
  await ladder(page, scope, `[data-prov-scope="${scope}"] [data-event-menu] > button`, `${tag} event`);
  check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures === 0 && checked > 0 ? 0 : 1);
