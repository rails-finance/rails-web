// The disclosure grammar (rails-ops TO-DO-ui-jobs 295), on the page.
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

async function open(width, path, { touch = false, store = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 1000 },
    hasTouch: touch,
    isMobile: touch,
    extraHTTPHeaders: bypassHeaders(),
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
  await page.waitForTimeout(400);
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
    "4b. a press on it opens the menu, rows unchanged",
    JSON.stringify(items) === JSON.stringify(["view-page", "view-explorer", "copy-link"]),
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

await browser.close();
console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the disclosure grammar holds`,
);
process.exit(failures ? 1 : 0);
