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
// number pill last on the line and no ⋮; T2's rows and T3's row with the
// chevron after the words. Aave V3: the event ⋮ in the header before the pill,
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
// Run:  BASE=http://localhost:3109 node scripts/verify/verify-disclosure-grammar.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

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
  await page.locator('[data-card-row-toggle="2"]').click();
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
  check(
    "2d. #148: the chevron stands in the header, the pill last on the line, no ⋮",
    !!layout && layout.chev && layout.pillLast && !layout.menu,
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
  await card
    .locator("[data-ledger-toggle]")
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {});
  for (const side of ["collateral", "debt"]) {
    const cell = card.locator(`[data-ledger-cell="${side}"]`).first();
    const place = await cell
      .evaluate((c) => {
        const toggle = c.querySelector("[data-ledger-toggle]");
        const first = c.querySelector("[data-ledger-row]");
        const name = first?.querySelector("span");
        if (!toggle || !name) return null;
        const figures = first.lastElementChild?.getBoundingClientRect();
        return {
          inName: name.contains(toggle),
          rightOfFigures: figures ? Math.round(c.getBoundingClientRect().right - figures.right) : null,
        };
      })
      .catch(() => null);
    check(
      `2g. #148: the ${side} row's chevron follows its name, the figure far right`,
      !!place && place.inName && place.rightOfFigures != null && place.rightOfFigures <= 20,
      JSON.stringify(place),
    );
  }
  const t3 = card.locator("[data-t3-toggle]").first();
  const t3Gap = await chevGap(t3, "[data-t3-heading]");
  const t3Name = await t3.getAttribute("aria-label").catch(() => null);
  check(
    "2h. #148: the explanation's chevron follows Event explanation, its name Show event explanation",
    t3Gap != null && t3Gap >= 0 && t3Gap <= 8 && t3Name === "Show event explanation",
    `${t3Gap}px, ${t3Name}`,
  );
  const menus = await card.locator("[data-event-menu]").count();
  check("2i. #148: no event ⋮ on the opened card", menus === 0, `${menus} found`);
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
    "4a. the event ⋮ stands in the header before the pill, the pill last on the line",
    !!layout && layout.chev && layout.menu && layout.menuBeforePill && layout.pillLast,
    JSON.stringify(layout),
  );
  await card.locator("[data-event-head-menu] [data-event-menu] > button").click();
  const items = await card
    .locator('[data-event-menu] [role="menu"] [data-menu-item]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-menu-item")))
    .catch(() => []);
  check(
    "4b. a press on it opens the menu, its rows and then Show provenance (ui-jobs 284)",
    JSON.stringify(items) === JSON.stringify(["view-page", "view-explorer", "copy-link", "show-provenance"]),
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

async function openFolder(page) {
  const folder = page.getByText(/^Cleared/).first();
  if (await folder.count()) await folder.click().catch(() => {});
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
  // ui-jobs 250: the spine draws a redemption's legs, so its head reads the
  // word alone, then the chevron.
  const redemption = heads.find((h) => h.items[0] === "Redemption");
  check(
    "5b. 1280, values on: a redemption card reads Redemption, then the chevron, no icon",
    !!redemption && redemption.last && redemption.items.length === 2 && !redemption.items.includes("IMG"),
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
  // Values off: the head states the legs after the word, labelled.
  const redemptionOff = heads.find((h) => h.items[0] === "Redemption");
  check(
    "5g2. 1280, values off: a redemption reads Redemption Cleared … Reduced … then the chevron",
    !!redemptionOff &&
      redemptionOff.last &&
      redemptionOff.items[1] === "Cleared" &&
      redemptionOff.items.indexOf("Reduced") > 1 &&
      redemptionOff.items.includes("IMG"),
    JSON.stringify(redemptionOff?.items),
  );
  check("5h. no page error", errors.length === 0, errors.join("; "));
  await ctx.close();
}

// 5c. Liquity V2 at 390: amounts and icons show, the chevron last.
{
  const { ctx, page, errors } = await open(390, TROVE);
  await waitHeads(page);
  const { card } = cardWith(page, 148);
  await card.scrollIntoViewIfNeeded().catch(() => {});
  const repay = await headItems(card.locator('[data-anatomy="T1"]')).catch(() => null);
  check(
    "5i. 390: Repay #148 reads Repay, the amount, the icon, the chevron",
    !!repay && repay.last && repay.items[0] === "Repay" && repay.items.includes("IMG"),
    JSON.stringify(repay?.items),
  );
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

await browser.close();
console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the disclosure grammar holds`,
);
process.exit(failures ? 1 : 0);
