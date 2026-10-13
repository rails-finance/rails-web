// The disclosure grammar (rails-ops TO-DO-ui-jobs 295 and 302), on the page.
// ---------------------------------------------------------------------------
// One rule for every disclosure on the detail pages: the chevron sits directly
// after its heading, and the right end of a row or header holds figures, the
// number pill and a ⋮ where the section has one. On a pointer that hovers the
// chevron is hidden until its row is hovered or focused; on a touch screen it
// always shows, muted.
//
// Liquity V2 (the story Trove): the position card's "Position summary" heading
// with the card menu (C17) at its right end, no card chevron, the Collateral,
// Debt and Collateral ratio rows each on a chevron (the first two open
// by default, the ratio closed, remembered per row, the card-wide key of 209
// dropped on read); the Lifetime flows header's chevron after its heading and
// its ⋮ at the right end; the Repay #148 card's chevron after "Repay", the
// number pill last on the line and no ⋮; T2's breakdown switch at its row's
// right end and T3's row with the chevron after the words. Aave V3: the event ⋮ in the header before the pill,
// a press on it opening the menu (rows unchanged) and leaving the card closed,
// and T6 holding the "?" alone.
//
// ui-jobs 302: on the event card header (T1) the chevron comes last in the left
// cluster, after the verb, the amounts and icons that show and any rate pill;
// an asset icon hides with its amount while Timeline values is on (≥640 px);
// the chevron appears 0.5 s after the pointer enters the header and hides at
// once on leave, keyboard focus shows it at once, the position card's rows keep
// the instant reveal.
//
// ui-jobs 330: the event sheet's words on Liquity V2 and Aave V3, read by
// counting: the switch's label in both states, the side and panel headings,
// "Not changed by this event" on an untouched side and never on a touched
// one, the breakdown's carry-forward names, and the Risk and Limits rows the
// family's sheet builder names (components/protocol/liquity/liquity-cells.tsx
// and content/liquity-v2/event-prose.yaml; components/protocol/aave-v3/
// aave-family-sheet.tsx).
//
// Run:  BASE=http://localhost:3109 node scripts/verify/verify-disclosure-grammar.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { CLOSED_GROUP, openGroup } from "./lib/group-rows.mjs";

const TROVE =
  "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154";
const AAVE = "/ethereum/aave-v3/0xfe28854b855ab09a47adbd893a5f580cdffc5820?market=core";
const STORE = "rails-open-cards-v1";

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const browser = await chromium.launch();

async function open(width, path, { touch = false, store = null, valuesOff = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    hasTouch: touch,
    isMobile: touch,
    extraHTTPHeaders: bypassHeaders(),
  });
  if (valuesOff)
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("timeline-display-v3", JSON.stringify({ showTimelineValues: false }));
      } catch {}
    });
  if (store)
    await ctx.addInitScript(
      ([k, v]) => {
        try {
          localStorage.setItem(k, v);
        } catch {}
      },
      [STORE, JSON.stringify(store)],
    );
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  return { ctx, page, errors };
}

/** The opacity of the chevron inside `sel`'s first match. */
const chevOpacity = (loc) =>
  loc
    .locator("[data-disc-chev]")
    .first()
    .evaluate((el) => Number(getComputedStyle(el).opacity))
    .catch(() => null);

/** The gap, in px, from the end of `textSel`'s text to the chevron in `scope`. */
const chevGap = (scope, textSel) =>
  scope
    .evaluate((root, textSel) => {
      const chev = root.querySelector("[data-disc-chev]");
      const text = textSel ? root.querySelector(textSel) : root;
      if (!chev || !text) return null;
      const range = document.createRange();
      const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
      let last = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) last = n;
      if (!last) return null;
      range.selectNodeContents(last);
      return Math.round(chev.getBoundingClientRect().left - range.getBoundingClientRect().right);
    }, textSel)
    .catch(() => null);

/** The event card holding the number pill `n`. */
function cardWith(page, n) {
  const pill = page.locator(`[data-event-number="${n}"]`).first();
  return { pill, card: page.locator('[data-skel-section="detail-event"]').filter({ has: pill }).first() };
}

/** The header's layout: whether the pill is the last thing on its line, and
 *  where the chevron and the ⋮ stand. */
const headerLayout = (card) =>
  card.locator('[data-anatomy="T1"]').evaluate((t1) => {
    const pill = t1.querySelector("[data-event-number]");
    const chev = t1.querySelector("[data-evt-head-chev]");
    const menu = t1.querySelector("[data-event-menu]");
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const p = pill?.getBoundingClientRect();
    const lineItems = [...t1.querySelectorAll("span, a, button, svg, img")].filter((el) => {
      if (!vis(el) || !p || el === pill || pill.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > p.top && r.top < p.bottom;
    });
    const pillLast = !!p && lineItems.every((el) => el.getBoundingClientRect().right <= p.right + 0.5);
    return {
      pillLast,
      pillInHead: !!pill,
      chev: !!chev && vis(chev),
      menu: !!menu,
      menuBeforePill: !!menu && !!p && menu.getBoundingClientRect().right <= p.left + 0.5,
    };
  });

// ── 1. Liquity V2 at 1280, a pointer that hovers ─────────────────────────
{
  const { ctx, page, errors } = await open(1280, TROVE);
  check("1280 reports a pointer that hovers", await page.evaluate(() => matchMedia("(hover: hover)").matches));
  const card = page.locator('[data-anatomy="P1"]').first();
  await card
    .locator("[data-position-summary]")
    .waitFor({ timeout: 120000 })
    .catch(() => {});
  await page
    .locator('[data-card-row-toggle="1"]')
    .waitFor({ timeout: 60000 })
    .catch(() => {});
  const heading = await card
    .locator("[data-position-summary]")
    .textContent()
    .catch(() => null);
  check("1a. the position card's heading reads Position summary", heading === "Position summary", heading ?? "none");
  const menuPlace = await card
    .evaluate((c) => {
      const header = c.querySelector("[data-card-header]");
      const menu = c.querySelector("[data-card-menu]");
      if (!header || !menu) return null;
      return {
        inHeader: header.contains(menu),
        rightGap: Math.round(header.getBoundingClientRect().right - menu.getBoundingClientRect().right),
        inFoot: !!c.querySelector('[data-anatomy="C3"]')?.parentElement?.querySelector("[data-card-menu]"),
      };
    })
    .catch(() => null);
  check(
    "1b. the card ⋮ (C17) stands at the heading's right end",
    !!menuPlace && menuPlace.inHeader && menuPlace.rightGap <= 2,
    JSON.stringify(menuPlace),
  );
  const oldChevron = await page.locator("[data-card-disclosure-toggle], [data-card-chevron]").count();
  check("1c. no card chevron", oldChevron === 0, `${oldChevron} found`);
  const rows = await page.$$eval("[data-card-row-toggle]", (els) =>
    els.map((e) => [e.getAttribute("data-card-row-toggle"), e.getAttribute("aria-expanded")]),
  );
  check(
    "1d. Collateral and Debt open by default, Collateral ratio closed",
    JSON.stringify(rows) ===
      JSON.stringify([
        ["0", "true"],
        ["1", "true"],
        ["2", "false"],
      ]),
    JSON.stringify(rows),
  );
  const rowGap = await chevGap(page.locator('[data-card-row-toggle="0"]'), null);
  check("1e. a row's chevron follows its heading", rowGap != null && rowGap >= 0 && rowGap <= 8, `${rowGap}px`);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  const restOp = await chevOpacity(page.locator('[data-card-row="0"]'));
  await page.locator('[data-card-row="0"]').hover();
  await page.waitForTimeout(400);
  const hoverOp = await chevOpacity(page.locator('[data-card-row="0"]'));
  check(
    "1f. the row's chevron is hidden until the row is hovered",
    restOp === 0 && hoverOp === 1,
    `${restOp} → ${hoverOp}`,
  );

  // The ⋮ opens its menu and moves no row.
  await card.locator("[data-card-menu] > button").click();
  const menuOpen = await page
    .locator('[data-card-menu] [role="menu"]')
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const rowsAfter = await page.$$eval("[data-card-row-toggle]", (els) =>
    els.map((e) => [e.getAttribute("data-card-row-toggle"), e.getAttribute("aria-expanded")]),
  );
  check(
    "1g. a press on the card ⋮ opens its menu and toggles no row",
    menuOpen && JSON.stringify(rowsAfter) === JSON.stringify(rows),
    JSON.stringify(rowsAfter),
  );
  await page.keyboard.press("Escape");

  // The ratio row opens to the risk strip, and stays open across a reload;
  // the card-wide key of 209 is dropped on read.
  // A missing row fails 1h below; it does not end the run.
  await page
    .locator('[data-card-row-toggle="2"]')
    .click({ timeout: 10000 })
    .catch(() => {});
  const liq = await page
    .locator('[data-card-row="2"]', { hasText: "Liquidates at" })
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check("1h. the Collateral ratio row opens to its lines", liq);
  const stored = await page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) ?? "{}")), STORE);
  const rowKey = stored.find((k) => k.startsWith("position:liquity-v2:") && k.endsWith(":row2")) ?? null;
  check("1i. the opened row is stored under a row key", !!rowKey, JSON.stringify(stored));
  await ctx.close();
  if (rowKey) {
    const cardKey = rowKey.slice(0, -":row2".length);
    const again = await open(1280, TROVE, { store: { [rowKey]: true, [cardKey]: true } });
    await again.page
      .locator('[data-card-row-toggle="2"]')
      .waitFor({ timeout: 120000 })
      .catch(() => {});
    await again.page.waitForTimeout(1500);
    const ratioOpen = await again.page.getAttribute('[data-card-row-toggle="2"]', "aria-expanded").catch(() => null);
    check("1j. the row's state survives a reload", ratioOpen === "true", ratioOpen ?? "none");
    const left = await again.page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k) ?? "{}")), STORE);
    check("1k. the card-wide key of 209 is dropped on read", !left.includes(cardKey), JSON.stringify(left));
    await again.ctx.close();
  }
  check("1l. no page error", errors.length === 0, errors.join("; "));
}

// ── 2. Liquity V2: Lifetime flows and the Repay #148 card, 1280 ──────────
{
  const { ctx, page, errors } = await open(1280, TROVE);
  const f1 = page.locator('[data-anatomy="F1"]').first();
  await f1.waitFor({ timeout: 120000 }).catch(() => {});
  const flowsGap = await chevGap(f1.locator("[data-flows-toggle]"), "[data-flows-title]");
  check(
    "2a. the Lifetime flows chevron follows its heading",
    flowsGap != null && flowsGap >= 0 && flowsGap <= 8,
    `${flowsGap}px`,
  );
  const flowsMenu = await f1
    .evaluate((row) => {
      const menu = row.querySelector("[data-panel-menu]");
      if (!menu) return null;
      return {
        rightGap: Math.round(row.getBoundingClientRect().right - menu.getBoundingClientRect().right),
        help: !!row.querySelector('[data-anatomy="F16"]'),
      };
    })
    .catch(() => null);
  check(
    "2b. the Lifetime flows ⋮ stands at the header's right end, the ? in it",
    !!flowsMenu && flowsMenu.rightGap <= 6 && !flowsMenu.help,
    JSON.stringify(flowsMenu),
  );
  // A press before hydration is lost: pressed until the row shows.
  const howTo = page.locator('[data-menu-item="how-to-read"]');
  for (let i = 0; i < 10 && !(await howTo.isVisible()); i++) {
    await f1.locator("[data-panel-menu] > button").click();
    await page.waitForTimeout(500);
  }
  await howTo.click({ timeout: 5000 }).catch(() => {});
  const modal = await page
    .locator('[role="dialog"][aria-label="How to read these charts"]')
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const stillOpen = await f1.locator("[data-flows-toggle]").getAttribute("aria-expanded");
  check(
    "2c. its row opens How to read these charts and the panel stays open",
    modal && stillOpen === "true",
    stillOpen,
  );
  await page.keyboard.press("Escape");

  const { pill, card } = cardWith(page, 148);
  await pill.waitFor({ timeout: 120000 }).catch(() => {});
  await card.scrollIntoViewIfNeeded();
  const layout = await headerLayout(card).catch(() => null);
  // Repointed (ui-jobs 309 step 11): since ui-jobs 250 the number stands in
  // the row's number column, and every timeline card's ⋮
  // carries "View event page" (the number is plain text), Liquity V2's too.
  check(
    "2d. #148: the chevron stands in the header, the number in the number column",
    !!layout &&
      layout.chev &&
      !layout.pillInHead &&
      (await card.locator("[data-number-column] [data-event-number]").count()) > 0,
    JSON.stringify(layout),
  );
  const headGap = await card
    .locator('[data-anatomy="T1"]')
    .evaluate((t1) => {
      const chev = t1.querySelector("[data-evt-head-chev]");
      const word = [...t1.querySelectorAll("span")].find((s) => s.textContent === "Repay");
      if (!chev || !word) return null;
      return Math.round(chev.getBoundingClientRect().left - word.getBoundingClientRect().right);
    })
    .catch(() => null);
  check(
    "2e. #148: the chevron follows the word Repay",
    headGap != null && headGap >= 0 && headGap <= 8,
    `${headGap}px`,
  );
  const head = card.locator('[data-anatomy="T1"] > div').first();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  const restOp = await chevOpacity(card.locator("[data-evt-head-chev]"));
  await head.hover({ position: { x: 200, y: 20 } });
  await page.waitForTimeout(800);
  const hoverOp = await chevOpacity(card.locator("[data-evt-head-chev]"));
  check(
    "2f. #148: the header's chevron is hidden until the header is hovered",
    restOp === 0 && hoverOp === 1,
    `${restOp} → ${hoverOp}`,
  );
  await head.click({ position: { x: 200, y: 20 } });
  // 2g (ui-jobs 330): the opened card's T2 is the event sheet, which draws no
  // ledger cell, so the Collateral and Debt rows' chevrons are gone with it;
  // its one disclosure is the breakdown switch, at the right end of the row
  // above the panels.
  await card
    .locator("[data-sheet-switch]")
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const switchPlace = await card
    .locator("[data-sheet-controls]")
    .first()
    .evaluate((row) => {
      const b = row.querySelector("[data-sheet-switch]");
      if (!b) return null;
      return { rightGap: Math.round(row.getBoundingClientRect().right - b.getBoundingClientRect().right) };
    })
    .catch(() => null);
  check(
    "2g. #148: the sheet's breakdown switch stands at the right end of its row",
    !!switchPlace && switchPlace.rightGap >= 0 && switchPlace.rightGap <= 2,
    JSON.stringify(switchPlace),
  );
  const t3 = card.locator("[data-t3-toggle]").first();
  const t3Gap = await chevGap(t3, "[data-t3-heading]");
  const t3Name = await t3.getAttribute("aria-label").catch(() => null);
  check(
    "2h. #148: the explanation's chevron follows Event explanation, its name Show event explanation",
    t3Gap != null && t3Gap >= 0 && t3Gap <= 8 && t3Name === "Show event explanation",
    `${t3Gap}px, ${t3Name}`,
  );
  // 2i retired (ui-jobs 309 step 11): "no event ⋮ on the opened card". Since
  // ui-jobs 250 the event page is reached from the row's ⋮ ("View event page")
  // on every family, Liquity V2 included, and the number is plain text.
  check("2j. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 3. Liquity V2 at 390, a touch screen ─────────────────────────────────
{
  const { ctx, page, errors } = await open(390, TROVE, { touch: true });
  check("390 reports no hover", await page.evaluate(() => !matchMedia("(hover: hover)").matches));
  await page
    .locator('[data-card-row-toggle="0"]')
    .waitFor({ timeout: 120000 })
    .catch(() => {});
  const shown = await page.$$eval("[data-card-row] [data-disc-chev]", (els) =>
    els.map((el) => ({ op: getComputedStyle(el).opacity, color: getComputedStyle(el).color })),
  );
  const muted = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text-muted)";
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  check(
    "3a. the rows' chevrons always show, muted",
    shown.length === 3 && shown.every((s) => s.op === "1" && s.color === muted),
    JSON.stringify(shown),
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("3b. no horizontal overflow", overflow <= 0, `${overflow}px`);
  check("3c. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 4. Aave V3: the event ⋮ in the header ────────────────────────────────
{
  const { ctx, page, errors } = await open(1280, AAVE);
  const pill = page.locator("[data-event-id] [data-event-number]").first();
  await pill.waitFor({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const card = page.locator("[data-event-id]").first();
  const layout = await headerLayout(card).catch(() => null);
  check(
    // Repointed (ui-jobs 309 step 11): the number left the header for the
    // number column with ui-jobs 250.
    "4a. the event ⋮ stands in the header, the number in the number column",
    !!layout && layout.chev && layout.menu && !layout.pillInHead,
    JSON.stringify(layout),
  );
  await card.locator("[data-event-head-menu] [data-event-menu] > button").click();
  const items = await card
    .locator('[data-event-menu] [role="menu"] [data-menu-item]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-menu-item")))
    .catch(() => []);
  check(
    "4b. a press on it opens the menu: Open event page (ui-jobs 308; provenance is on the event page)",
    JSON.stringify(items) === JSON.stringify(["view-page"]),
    JSON.stringify(items),
  );
  const closed = await card.locator('[data-anatomy="T2"]').count();
  check("4c. and leaves the card closed", closed === 0, `${closed} T2 found`);
  await page.keyboard.press("Escape");
  await card.locator("[data-event-head-menu] [data-event-menu] > button").focus();
  await page.keyboard.press("Enter");
  const byKey = await card
    .locator('[data-event-menu] [role="menu"]')
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  const closedKey = await card.locator('[data-anatomy="T2"]').count();
  check("4d. Enter on the ⋮ opens the menu and leaves the card closed", byKey && closedKey === 0, `${closedKey} T2`);
  await page.keyboard.press("Escape");
  await card
    .locator('[data-anatomy="T1"] > div')
    .first()
    .click({ position: { x: 100, y: 20 } });
  await card
    .locator("[data-t3-toggle]")
    .first()
    .click({ timeout: 30000 })
    .catch(() => {});
  const t6 = await card
    .locator('[data-anatomy="T6"]')
    .first()
    .evaluate((el) => ({ menu: !!el.querySelector("[data-event-menu]"), help: el.querySelectorAll("button").length }))
    .catch(() => null);
  check("4e. T6 holds the ? and no ⋮", !!t6 && !t6.menu && t6.help >= 1, JSON.stringify(t6));
  const rows = await page.$$eval("[data-card-row-toggle]", (els) =>
    els.map((e) => [e.getAttribute("data-card-row-toggle"), e.getAttribute("aria-expanded")]),
  );
  const summary = await page.locator("[data-position-summary]").count();
  check(
    "4f. the position card: Position summary, the asset rows open, the risk row closed",
    summary === 1 && rows.every(([i, open]) => (Number(i) < 2 ? open === "true" : open === "false")),
    `${summary} heading, ${JSON.stringify(rows)}`,
  );
  check("4g. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 5. ui-jobs 302: the chevron last, the icon with its amount, the delay ──
const MAPLE = "/ethereum/maple/0x9ec2d8dd95ee25975ba2a5bb4e9d50dd57b7c87a";

/** A T1 head's visible leaf items, left to right: the words, the icons ("IMG")
 *  and the chevron ("CHEV"), up to the date. `last` is whether the chevron is
 *  the last of them on the left cluster (before the right end's date/time). */
const headItems = (t1) =>
  t1.evaluate((el) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
    };
    const chev = el.querySelector("[data-evt-head-chev]");
    const meta = el.querySelector(".evt-meta");
    const items = [...el.querySelectorAll("span, img")]
      .filter((e) => vis(e) && !e.querySelector("span, img") && !(meta && meta.contains(e)))
      .map((e) => {
        if (chev && chev.contains(e)) return "CHEV";
        if (e.tagName === "IMG") return e.hasAttribute("data-party-icon") ? "PARTY" : "IMG";
        return e.textContent.trim();
      })
      .filter((t, i, a) => t && !(t === "CHEV" && a[i - 1] === "CHEV"));
    return { items, chev: !!chev && vis(chev), last: items.length > 0 && items[items.length - 1] === "CHEV" };
  });

/** Every T1 on the page that has a chevron: [number, words] with the images
 *  counted, so a family-wide "no icon" and "chevron last" reads in one call. */
async function allHeads(page) {
  const heads = page.locator('[data-anatomy="T1"]');
  const n = Math.min(await heads.count(), 40);
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = await headItems(heads.nth(i)).catch(() => null);
    if (h && h.chev) out.push(h);
  }
  return out;
}

/** Open the first group (a redemption run): from its ⋮ since ui-jobs 250. */
async function openFolder(page) {
  const folder = page.locator(CLOSED_GROUP).first();
  if (await folder.count()) await openGroup(page, folder).catch(() => {});
  await page.waitForTimeout(2500);
}

async function waitHeads(page) {
  await page
    .locator('[data-anatomy="T1"]')
    .first()
    .waitFor({ timeout: 180000 })
    .catch(() => {});
  await page.waitForTimeout(3000);
}

// 5a. Liquity V2 at 1280, Timeline values on.
{
  const { ctx, page, errors } = await open(1280, TROVE);
  await waitHeads(page);
  await openFolder(page);
  const { card } = cardWith(page, 148);
  const repay = await headItems(card.locator('[data-anatomy="T1"]')).catch(() => null);
  check(
    "5a. 1280, values on: Repay #148 holds no icon and its chevron is last",
    !!repay && !repay.items.includes("IMG") && repay.last && repay.items[0] === "Repay",
    JSON.stringify(repay?.items),
  );
  const heads = await allHeads(page);
  const redemption = heads.find((h) => h.items[0] === "Cleared");
  check(
    "5b. 1280, values on: a redemption card reads Cleared … Reduced … then the chevron",
    !!redemption &&
      redemption.last &&
      redemption.items.indexOf("Reduced") > 0 &&
      redemption.items.indexOf("CHEV") > redemption.items.indexOf("Reduced"),
    JSON.stringify(redemption?.items),
  );
  const first = cardWith(page, 1);
  await first.card.scrollIntoViewIfNeeded().catch(() => {});
  const open1 = await headItems(first.card.locator('[data-anatomy="T1"]')).catch(() => null);
  check(
    "5c. 1280, values on: the open card's chevron follows the rate pill",
    !!open1 &&
      open1.items[0] === "Open" &&
      open1.last &&
      !open1.items.includes("IMG") &&
      /%$/.test(open1.items[open1.items.length - 2] ?? ""),
    JSON.stringify(open1?.items),
  );
  const strays = heads.filter((h) => !h.last);
  check("5d. 1280, values on: every Liquity head ends on its chevron", strays.length === 0, JSON.stringify(strays));
  check("5e. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// 5b. Liquity V2 at 1280, Timeline values off: the icon follows its amount.
{
  const { ctx, page, errors } = await open(1280, TROVE, { valuesOff: true });
  await waitHeads(page);
  await openFolder(page);
  const { card } = cardWith(page, 148);
  const repay = await headItems(card.locator('[data-anatomy="T1"]')).catch(() => null);
  const at = (a, x) => a.indexOf(x);
  check(
    "5f. 1280, values off: Repay #148 reads Repay, the amount, the icon, the chevron",
    !!repay &&
      repay.last &&
      repay.items[0] === "Repay" &&
      at(repay.items, "IMG") === 2 &&
      at(repay.items, "CHEV") === 3,
    JSON.stringify(repay?.items),
  );
  const heads = await allHeads(page);
  const strays = heads.filter((h) => !h.last);
  check("5g. 1280, values off: every Liquity head ends on its chevron", strays.length === 0, JSON.stringify(strays));
  check("5h. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// 5c. Liquity V2 at 390: amounts and icons show, the chevron last.
{
  const { ctx, page, errors } = await open(390, TROVE);
  await waitHeads(page);
  const { card } = cardWith(page, 148);
  await card.scrollIntoViewIfNeeded().catch(() => {});
  // 5i retired (ui-jobs 309 step 11): "390: Repay #148 reads Repay, the
  // amount, the icon, the chevron". Below 640px the timeline draws no T1
  // header; the caption on the spine carries the row and the spine its
  // amounts and icons (mobile decision 16, event-card.tsx).
  const heads = await allHeads(page);
  const strays = heads.filter((h) => !h.last);
  check("5j. 390: every Liquity head ends on its chevron", strays.length === 0, JSON.stringify(strays));
  check("5k. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// 5d. Chain-truth families at 1280, values on: no icon beside a hidden amount,
// the chevron last. A row whose amount never hands off to the spine (Maple's
// "Shares received") keeps its amount and its icon together.
const FLUID = "/ethereum/fluid/19428";
for (const [name, path, strict] of [
  ["Aave V3", AAVE, true],
  ["Maple", MAPLE, false],
  ["Fluid", FLUID, true],
]) {
  const { ctx, page, errors } = await open(1280, path);
  await waitHeads(page);
  const heads = await allHeads(page);
  const isAmount = (t) => /^[+−-]?\s?[<\d]/.test(t ?? "");
  const stray = heads.filter((h) =>
    strict ? h.items.includes("IMG") : h.items.some((t, i) => t === "IMG" && !isAmount(h.items[i - 1])),
  );
  const unlast = heads.filter((h) => !h.last);
  check(
    `5l. ${name} 1280, values on: ${heads.length} heads, ${strict ? "no icon in any" : "no icon without its amount"}`,
    heads.length > 0 && stray.length === 0,
    JSON.stringify(stray.slice(0, 2)),
  );
  check(
    `5m. ${name} 1280: the chevron is last in every head`,
    heads.length > 0 && unlast.length === 0,
    JSON.stringify(unlast.slice(0, 2)),
  );
  check(`5n. ${name}: no page error`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

// 5e. The reveal: a half second on T1, instant on the position card's rows,
// instant on keyboard focus.
{
  const { ctx, page, errors } = await open(1280, TROVE);
  await waitHeads(page);
  const { card } = cardWith(page, 148);
  await card.scrollIntoViewIfNeeded();
  const head = card.locator('[data-anatomy="T1"] > div').first();
  const op = () => chevOpacity(card.locator("[data-evt-head-chev]"));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  const rest = await op();
  await head.hover({ position: { x: 200, y: 20 } });
  await page.waitForTimeout(150);
  const early = await op();
  await page.waitForTimeout(650);
  const late = await op();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(250);
  const left = await op();
  check(
    "5o. T1: hidden at rest, still hidden 150 ms after entering, shown by 800 ms, hidden 250 ms after leaving",
    rest === 0 && early === 0 && late === 1 && left === 0,
    `${rest} · ${early} · ${late} · ${left}`,
  );
  const row = page.locator('[data-card-row="0"]');
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  await row.hover();
  await page.waitForTimeout(250);
  const rowOp = await chevOpacity(row);
  check("5p. the position card's row shows its chevron within 250 ms of the pointer", rowOp === 1, `${rowOp}`);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.activeElement?.blur?.());
  const focusTarget = card
    .locator(
      '[data-anatomy="T1"] [data-event-menu] > button, [data-anatomy="T1"] [role="button"], [data-anatomy="T1"] button',
    )
    .first();
  const hasFocusable = (await focusTarget.count()) > 0;
  if (hasFocusable) {
    await page.keyboard.press("Tab");
    // Walk the tab order until focus sits inside this card's header.
    let inside = false;
    for (let i = 0; i < 200 && !inside; i++) {
      inside = await head.evaluate(
        (h) =>
          h.contains(document.activeElement) ||
          h.closest("[data-skel-section]")?.querySelector('[data-anatomy="T1"]')?.contains(document.activeElement) ||
          false,
      );
      if (!inside) await page.keyboard.press("Tab");
    }
    await page.waitForTimeout(250);
    const focusOp = inside ? await op() : null;
    check(
      "5q. keyboard focus in the T1 header shows its chevron within 250 ms",
      inside && focusOp === 1,
      `${inside} · ${focusOp}`,
    );
  } else {
    check(
      "5q. keyboard focus in the T1 header shows its chevron within 250 ms",
      false,
      "no focusable control in the header",
    );
  }
  check("5r. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// ── 6. ui-jobs 330: the event sheet's words ──────────────────────────────
// Each subject is an event opened by its `?at=` landing; `rows` are the Risk
// and Limits rows in order, `params` the breakdown's rows, `optional` the rows
// a sheet draws only where they apply (a batch's delegate fee, eMode).
const SHEET_WORDS_SUBJECTS = [
  {
    name: "Liquity V2 Trove …545773770 #3",
    path: "/ethereum/liquity-v2/trove/WETH/29779854367542649123526514384205099621162281315544372345570836626121545773770",
    id: "0xe5509980170a44f3f5878afd1b13d3e797cba9789b1509de475fcb9fb97ad930_1",
    risk: ["Collateral Ratio", "Liquidates at"],
    limits: ["Interest Rate"],
    params: ["Minimum ratio", "Critical ratio"],
    optional: ["Delegate's fee"],
  },
  {
    name: "Aave V3 0x9ff6…0de5 Borrow",
    path: "/ethereum/aave-v3/0x9ff679ef5e663a223c5ef07fd191e9e7eda90de5",
    id: "borrow:0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2:0x2b82089ec595c4609440e634572811db526179653f67dea0bb4c324b0511f417:4",
    risk: ["Health factor", "Collateral can fall"],
    limits: ["LTV", "Still borrowable"],
    params: ["Max LTV", "Liquidation threshold"],
    optional: ["eMode"],
  },
  {
    name: "Aave V3 0xc593…5948 Repay with collateral",
    path: "/ethereum/aave-v3/0xc593352eefa7c45863525a3194870929fd6f5948",
    id: "transfer_out:0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8:0x7e796baa18541a2018cb7c06f7079bcea2b9591f0ffd00232bad7cc847c4da2e:28",
    risk: ["Health factor", "Collateral can fall"],
    limits: ["LTV", "Still borrowable"],
    params: ["Max LTV", "Liquidation threshold"],
    optional: ["eMode"],
  },
];
const UNTOUCHED = "Not changed by this event";

/** The sheet's words, read off its attributes. */
const sheetWords = (sheet) =>
  sheet.evaluate((s) => {
    const label = (r) => r.firstElementChild?.textContent.replace(/\s+/g, " ").trim() ?? "";
    const sw = s.querySelector("[data-sheet-switch]");
    return {
      switch: sw ? { label: sw.getAttribute("aria-label"), title: sw.getAttribute("title") } : null,
      sides: [...s.querySelectorAll("[data-sheet-side]")].map((e) => ({
        side: e.getAttribute("data-sheet-side"),
        touched: e.getAttribute("data-sheet-touched"),
        heading: e.querySelector("h3")?.textContent.trim() ?? "",
        untouched: e.textContent.split("Not changed by this event").length - 1,
        carry: [...e.querySelectorAll('[data-sheet-layer="carry"] [data-sheet-row]')].map(label),
        before: [...e.querySelectorAll('[data-sheet-row="before"]')].map(label),
      })),
      panels: [...s.querySelectorAll("[data-sheet-panel]")].map((e) => ({
        panel: e.getAttribute("data-sheet-panel"),
        heading: e.querySelector("h3")?.textContent.trim() ?? "",
        rows: [...e.querySelectorAll("[data-sheet-row]")].filter((r) => !r.closest("[data-sheet-layer]")).map(label),
        params: [...e.querySelectorAll('[data-sheet-layer="parameters"] [data-sheet-row]')].map(label),
      })),
    };
  });

/** `got` is `want` in order, then only rows from `optional`. */
const rowsRead = (got, want, optional) =>
  JSON.stringify(got.slice(0, want.length)) === JSON.stringify(want) &&
  got.slice(want.length).every((r) => optional.includes(r));

for (const s of SHEET_WORDS_SUBJECTS) {
  const { ctx, page, errors } = await open(1280, `${s.path}?at=${encodeURIComponent(s.id)}`);
  const sheet = page.locator(`[data-event-id="${s.id}"] [data-anatomy~="T2"] [data-sheet]`).first();
  const drawn = await sheet
    .waitFor({ state: "attached", timeout: 180000 })
    .then(() => true)
    .catch(() => false);
  if (!check(`6. ${s.name}: the opened card draws the sheet`, drawn)) {
    await ctx.close();
    continue;
  }
  const off = await sheetWords(sheet).catch(() => null);
  check(
    `6a. ${s.name}: the switch reads Show breakdown (label and title)`,
    off?.switch?.label === "Show breakdown" && off.switch.title === "Show breakdown",
    JSON.stringify(off?.switch),
  );
  check(
    `6b. ${s.name}: the sides read Collateral and Debt, the panels Risk and Limits`,
    JSON.stringify(off?.sides.map((x) => x.heading)) === JSON.stringify(["Collateral", "Debt"]) &&
      JSON.stringify(off?.panels.map((x) => x.heading)) === JSON.stringify(["Risk", "Limits"]),
    JSON.stringify({ sides: off?.sides.map((x) => x.heading), panels: off?.panels.map((x) => x.heading) }),
  );
  const sides = off?.sides ?? [];
  const untouched = sides.filter((x) => x.touched === "false");
  check(
    `6c. ${s.name}: an untouched side reads "${UNTOUCHED}" once, a touched side never (${untouched.length} untouched of ${sides.length})`,
    sides.length > 0 && sides.every((x) => x.untouched === (x.touched === "false" ? 1 : 0)),
    JSON.stringify(sides.map((x) => [x.side, x.touched, x.untouched])),
  );
  const risk = off?.panels.find((p) => p.panel === "risk");
  const limits = off?.panels.find((p) => p.panel === "limits");
  check(
    `6d. ${s.name}: Risk reads ${s.risk.join(", ")}`,
    !!risk && rowsRead(risk.rows, s.risk, []),
    JSON.stringify(risk?.rows),
  );
  check(
    `6e. ${s.name}: Limits reads ${s.limits.join(", ")}`,
    !!limits && rowsRead(limits.rows, s.limits, s.optional),
    JSON.stringify(limits?.rows),
  );
  await sheet
    .locator("[data-sheet-switch]")
    .evaluate((el) => el.click())
    .catch(() => {});
  await page
    .waitForFunction((el) => el?.getAttribute("data-sheet-breakdown") === "on", await sheet.elementHandle(), {
      timeout: 10000,
    })
    .catch(() => {});
  const on = await sheetWords(sheet).catch(() => null);
  check(
    `6f. ${s.name}: pressed, the switch reads Hide breakdown (label and title)`,
    on?.switch?.label === "Hide breakdown" && on.switch.title === "Hide breakdown",
    JSON.stringify(on?.switch),
  );
  const onLimits = on?.panels.find((p) => p.panel === "limits");
  check(
    `6g. ${s.name}: with the breakdown on, Limits adds ${s.params.join(", ")}`,
    !!onLimits && rowsRead(onLimits.params, s.params, s.optional),
    JSON.stringify(onLimits?.params),
  );
  const carried = (on?.sides ?? []).filter((x) => x.carry.length > 0);
  check(
    `6h. ${s.name}: each side's carry layer opens on Last event and closes on Before this event (${carried.length} sides)`,
    carried.length === (on?.sides.length ?? -1) &&
      carried.every(
        (x) => x.carry[0] === "Last event" && JSON.stringify(x.before) === JSON.stringify(["Before this event"]),
      ),
    JSON.stringify(on?.sides.map((x) => [x.side, x.carry, x.before])),
  );
  check(`6i. ${s.name}: no page error`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

await browser.close();
console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the disclosure grammar holds`,
);
process.exit(failures ? 1 : 0);
