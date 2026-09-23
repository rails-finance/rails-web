// Polaris — the timeline's display menu and the collateral ratio at the event.
// ---------------------------------------------------------------------------
// Scaffold of verify-polaris-equity.mjs. Checks (rails-ops
// TO-DO-polaris-v2-parity §1.4 and §1.5):
//
//   (a) usdp/8's display menu offers exactly the six labels and NOT
//       "Collapse like events" (no run card: measured, 0 no-change touches).
//   (b) Change bars on: every touch row on usdp/27 (closed, 4 rows) carries a
//       PositionBar and its close row's collateral change bar is the full
//       negative width. Balance bars on: usdp/8's last row's two balance bars
//       are the widths the route's rows give (tolerance 0.2 pp), and the
//       maxima those widths are measured against equal the listing row's
//       peakColl / peakDebt. Both flags off: no bar on any row.
//   (c) Collateral Ratio on: usdp/8 row #1's chip and its last row's chip
//       read the restated `${round(cr)}% CR`, neither red; usdp/175's
//       liquidation row's chip is the at-fire ratio and is red (asserted on
//       the marker, not the text: 114.78 rounds to 115); its open row is not
//       red. Flag off: no chip anywhere.
//   (d) usdp/8's last row expanded: the "Collateral ratio" stat reads the
//       restated 1-dp figure; its transition's before equals the restated
//       before ratio and its change equals after − before in points. Row #1
//       (the open) has no transition.
//   (e) The dash: with the document rewritten so no row carries
//       `priceAtBlock`, no row shows a chip and the expanded metric reads
//       "—"; the rest of the card renders.
//   (f) "Copy Position" markdown: the timeline table's header carries
//       "Collateral ratio at block" and the last row carries the 2-dp
//       figure; the price-less document gives "—".
//   (g) Persistence: Collateral Ratio on, reload, chips still drawn and
//       localStorage `timeline-display-v3` has showCollateralRatio: true.
//       The defaults are restored at the end.
//
// EVERY EXPECTED FIGURE IS RESTATED from the route's own rows at run time
// (`crPct = newColl × pethInDebt ÷ newDebt × 100`, the before on the lag
// columns at the same row's price), never imported from the code under test.
// usdp/8 is open and gains rows, so "the last row" is whatever the route
// serves; the plan's §1 table is documentation.
//
// The page is server-seeded (the timeline rides the RSC payload, the browser
// never fetches /api/polaris/timeline), so the price-less case rewrites the
// DOCUMENT response: every `priceAtBlock` value in the flight data becomes
// null, and the rewrite asserts it left none behind.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3103 node scripts/verify/verify-polaris-timeline-display.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

async function api(path_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path_}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path_}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path_}`);
}

const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;

// ── the restated formula ────────────────────────────────────────────────────
const n = (s) => (s == null ? null : Number(s));
/** The ratio a touch row states, as a percentage, or null. */
const crPct = (d) => {
  const price = d.priceAtBlock?.pethInDebt;
  const coll = n(d.newColl);
  const debt = n(d.newDebt);
  if (price == null || coll == null || debt == null || debt <= 0) return null;
  return ((coll * price) / debt) * 100;
};
const crBeforePct = (d) => {
  const price = d.priceAtBlock?.pethInDebt;
  const coll = n(d.collBefore);
  const debt = n(d.debtBefore);
  if (price == null || coll == null || debt == null || debt <= 0) return null;
  return ((coll * price) / debt) * 100;
};
/** A liquidation row's ratio at fire: the ENTIRE seized collateral × price ÷
 *  the debt cleared. */
const crAtFirePct = (d) => {
  const price = d.priceAtBlock?.pethInDebt;
  const seized = n(d.collLiquidated);
  const cleared = n(d.debtLiquidated);
  if (price == null || !seized || !cleared) return null;
  return ((seized * price) / cleared) * 100;
};
const chipText = (pct) => `${Math.round(pct)}% CR`;
const pct1 = (pct) => `${pct.toFixed(1)}%`;
const pct2 = (pct) => `${pct.toFixed(2)}%`;
const MENU_LABELS = [
  "Timestamps (UTC)",
  "Timeline values",
  "Change bars",
  "Balance bars",
  "Collateral Ratio",
  "Event numbers",
];

// ── the routes, read at run time ────────────────────────────────────────────
const byTime = (a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp;
const rowsOf = async (market, id) => {
  const t = await api(`/api/polaris/timeline?market=${market}&id=${id}`);
  return [...t.events].sort(byTime);
};
const rows8 = await rowsOf("usdp", "8");
const rows27 = await rowsOf("usdp", "27");
const rows175 = await rowsOf("usdp", "175");
const listing8 = (await api(`/api/polaris/positions?market=usdp&id=8`)).data?.[0];

const touches8 = rows8.filter((e) => e.context.data.eventType !== "transfer");
const first8 = touches8[0];
const last8 = touches8[touches8.length - 1];
const liq175 = rows175.find((e) => e.context.data.eventType === "liquidate");
const open175 = rows175.find((e) => e.context.data.eventType === "open");
const close27 = rows27.find((e) => e.context.data.eventType === "close");

check(
  "0. the routes answer: usdp/8 has an open first row and a priced last row, usdp/27 a close, usdp/175 a liquidation",
  first8?.context.data.eventType === "open" &&
    last8?.context.data.priceAtBlock != null &&
    close27 != null &&
    liq175 != null &&
    open175 != null,
  JSON.stringify({ rows8: rows8.length, rows27: rows27.length, rows175: rows175.length }),
);

// Lifetime maxima over the rows: the bars' scale.
const maxima = (rows) => {
  let coll = 0;
  let debt = 0;
  for (const e of rows) {
    const d = e.context.data;
    if (d.eventType === "transfer" || d.newColl == null || d.newDebt == null) continue;
    coll = Math.max(coll, n(d.newColl));
    debt = Math.max(debt, n(d.newDebt));
  }
  return { coll, debt };
};

// ── browser helpers ─────────────────────────────────────────────────────────

async function open(context, url, routeRewrite) {
  const page = await context.newPage();
  if (routeRewrite) await page.route(routeRewrite.match, routeRewrite.handler);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  return page;
}

/** Grow the render window until every event is painted. */
async function showAll(page) {
  for (let i = 0; i < 25; i++) {
    const btn = page.getByRole("button", { name: /^Show \d+ more$/ });
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.waitForTimeout(150);
  }
}

/** The eye-menu trigger: the LAST FilterDropdown's own direct-child <button>
 *  in the toolbar's control row, anchored on the "N events" count span. The
 *  `>` direct-child combinator is load-bearing — once the panel is open its
 *  rows are ALSO <button>s inside the same wrapper (copied from
 *  verify-historic-usd-pills.mjs). */
function menuTrigger(page) {
  const countSpan = page.getByText(/^\d+ events?$/).first();
  const row = countSpan.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " gap-2 ") and contains(concat(" ", normalize-space(@class), " "), " items-center ")][1]',
  );
  return { countSpan, trigger: row.locator("div.relative.inline-flex.items-center > button").last() };
}

/** Open the eye menu and return the labels it offers (then close it). */
async function readDisplayMenu(page) {
  const { countSpan, trigger } = menuTrigger(page);
  await countSpan.waitFor({ state: "visible", timeout: 30000 });
  // The dropdown title-cases its labels ("Timestamps (utc)"), so every
  // comparison in this file is case-insensitive.
  const anyItem = page.getByRole("button", { name: /^Timestamps \(UTC\)$/i });
  let opened = false;
  for (let attempt = 0; attempt < 6 && !opened; attempt += 1) {
    await trigger.click();
    opened = await anyItem
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!opened) await page.waitForTimeout(700);
  }
  if (!opened) throw new Error(`Display menu never opened on ${page.url()}`);
  // The panel: the trigger's wrapper's other buttons.
  const panel = trigger.locator("xpath=..");
  const labels = await panel.locator("button").allInnerTexts();
  const items = labels.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s && s !== "Display");
  await countSpan.click();
  return items;
}

/** Toggle the named display item to the wanted state (idempotent). */
async function setDisplayFlag(page, label, wantOn) {
  const { countSpan, trigger } = menuTrigger(page);
  await countSpan.waitFor({ state: "visible", timeout: 30000 });
  const item = page.getByRole("button", { name: new RegExp(`^${label.replace(/[()]/g, "\\$&")}$`, "i") });
  let opened = false;
  for (let attempt = 0; attempt < 6 && !opened; attempt += 1) {
    await trigger.click();
    opened = await item
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!opened) await page.waitForTimeout(700);
  }
  if (!opened) throw new Error(`Display menu never offered "${label}" on ${page.url()}`);
  const isOn = await item
    .locator("span")
    .first()
    .evaluate((el) => el.className.includes("bg-rb-500"))
    .catch(() => false);
  if (isOn !== wantOn) await item.click();
  await countSpan.click();
  await page.waitForTimeout(200);
}

const rowOf = (page, eventId) => page.locator(`[data-event-id="${eventId}"]`).first();

/** Expand one event row (its header button). Idempotent: a card's open state
 *  persists in the browser profile, so a row opened on an earlier page of
 *  this run is already open here, and a blind click would close it. */
async function expandRow(page, eventId) {
  const row = rowOf(page, eventId);
  await row.scrollIntoViewIfNeeded();
  // Open already when its detail grid is drawn (every non-transfer row's grid
  // carries the "Collateral ratio" stat, a figure or a dash).
  const isOpen = (await row.locator("div", { hasText: /^Collateral ratio$/ }).count()) > 0;
  if (!isOpen) await row.getByRole("button").first().click();
  await page.waitForTimeout(300);
  return row;
}

/** The chip on a row: its text and its marker, or null. */
async function readChip(page, eventId) {
  const chip = rowOf(page, eventId).locator("[data-ratio-chip]").first();
  if ((await chip.count()) === 0) return null;
  return {
    text: (await chip.innerText()).replace(/\s+/g, " ").trim(),
    marker: await chip.getAttribute("data-ratio-chip"),
    red: ((await chip.getAttribute("class")) ?? "").includes("text-red-500"),
  };
}

/** A bar's drawn width in percent (0 when it has no fill), per `data-bar`. */
async function readBar(page, eventId, name) {
  const bar = rowOf(page, eventId).locator(`[data-bar="${name}"]`).first();
  if ((await bar.count()) === 0) return null;
  const fill = bar.locator("div").first();
  if ((await fill.count()) === 0) return { width: 0, cls: "" };
  const style = (await fill.getAttribute("style")) ?? "";
  const m = style.match(/width:\s*([\d.]+)%/);
  return { width: m ? Number(m[1]) : 0, cls: (await fill.getAttribute("class")) ?? "" };
}

/** The "Collateral ratio" stat inside an expanded row: its value, and the
 *  transition's before and change (the DeltaToggle shows the before first;
 *  a click shows the change). */
async function readRatioStat(page, eventId) {
  const row = rowOf(page, eventId);
  const label = row.locator("div", { hasText: /^Collateral ratio$/ }).last();
  if ((await label.count()) === 0) return null;
  const stat = label.locator("xpath=..");
  const text = (await stat.innerText()).replace(/\s+/g, " ").trim();
  const toggle = stat.getByRole("button", { name: /Show total change/i });
  let change = null;
  if ((await toggle.count()) > 0) {
    await toggle.click();
    await page.waitForTimeout(150);
    change = (await stat.innerText()).replace(/\s+/g, " ").trim();
    await stat.getByRole("button", { name: /Show before and after/i }).click();
  }
  return { text, change };
}

async function copyMarkdown(page) {
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(500);
  return page.evaluate(() => navigator.clipboard.readText());
}

/** The price-less document: every `priceAtBlock` value in the flight data
 *  becomes null. The payload is a JS string literal, so keys read
 *  `\"priceAtBlock\":` there; the plain form covers any unescaped copy. */
const PRICE_KEY = /(\\?"priceAtBlock\\?":)(\{[^{}]*\}|\\?"[^"\\]*\\?"|\d[\d.e+-]*)/g;
let priceLessLeftovers = -1;
const priceLessRewrite = {
  match: (url) => url.pathname.startsWith("/sepolia/polaris/") && !url.pathname.includes("/api/"),
  handler: async (route) => {
    const res = await route.fetch();
    const ct = res.headers()["content-type"] ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/x-component")) return route.fulfill({ response: res });
    let body = await res.text();
    body = body.replace(PRICE_KEY, (_m, key) => `${key}null`);
    priceLessLeftovers = (body.match(/priceAtBlock\\?":(?!null)/g) ?? []).length;
    const headers = {};
    for (const [k, v] of Object.entries(res.headers()))
      if (!["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())) headers[k] = v;
    return route.fulfill({ status: res.status(), headers, body });
  },
};

// ── the browser ─────────────────────────────────────────────────────────────

console.log("Polaris — the timeline's display menu and the collateral ratio at the event\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});

try {
  // ── (a) the menu ──────────────────────────────────────────────────────────
  const page8 = await open(context, polarisUrl("usdp", "8"));
  const menu = (await readDisplayMenu(page8)).map((s) => s.toLowerCase());
  check(
    "a. usdp/8's display menu offers exactly the six labels and no collapse item",
    menu.length === 6 &&
      MENU_LABELS.every((l, i) => menu[i] === l.toLowerCase()) &&
      !menu.includes("collapse like events"),
    JSON.stringify(menu),
  );

  // ── (b) the bars ──────────────────────────────────────────────────────────
  await setDisplayFlag(page8, "Change bars", false);
  await setDisplayFlag(page8, "Balance bars", true);
  await showAll(page8);
  const max8 = maxima(rows8);
  const dLast = last8.context.data;
  const expColl = (n(dLast.newColl) / max8.coll) * 100;
  const expDebt = (n(dLast.newDebt) / max8.debt) * 100;
  const collBar = await readBar(page8, last8.id, "coll-balance");
  const debtBar = await readBar(page8, last8.id, "debt-balance");
  check(
    `b1. usdp/8's last row's balance bars are ${expColl.toFixed(1)}% / ${expDebt.toFixed(1)}% of the lifetime maxima (tolerance 0.2 pp)`,
    collBar != null &&
      debtBar != null &&
      Math.abs(collBar.width - expColl) <= 0.2 &&
      Math.abs(debtBar.width - expDebt) <= 0.2,
    JSON.stringify({ collBar, debtBar, expColl, expDebt }),
  );
  check(
    "b2. the maxima the bars are measured against equal the listing row's peakColl / peakDebt",
    listing8 != null &&
      Math.abs(max8.coll - listing8.peakColl) / listing8.peakColl < 1e-6 &&
      Math.abs(max8.debt - listing8.peakDebt) / listing8.peakDebt < 1e-6,
    JSON.stringify({ max8, peakColl: listing8?.peakColl, peakDebt: listing8?.peakDebt }),
  );
  check(
    "b3. balance bars alone: no change bar on the last row",
    (await readBar(page8, last8.id, "coll-change")) == null,
  );
  await setDisplayFlag(page8, "Balance bars", false);
  check(
    "b4. both flags off: no bar on any row",
    (await page8.locator("[data-position-bar]").count()) === 0,
    `${await page8.locator("[data-position-bar]").count()} bars`,
  );

  const page27 = await open(context, polarisUrl("usdp", "27"));
  await setDisplayFlag(page27, "Change bars", true);
  const touches27 = rows27.filter((e) => e.context.data.eventType !== "transfer");
  let barsOnTouches = 0;
  for (const e of touches27)
    if ((await rowOf(page27, e.id).locator("[data-position-bar]").count()) > 0) barsOnTouches++;
  check(
    `b5. usdp/27 change bars on: every touch row (${touches27.length}) carries a PositionBar`,
    barsOnTouches === touches27.length,
    `${barsOnTouches} of ${touches27.length}`,
  );
  const max27 = maxima(rows27);
  const dClose = close27.context.data;
  const expCloseColl = (Math.abs(n(dClose.newColl) - n(dClose.collBefore)) / max27.coll) * 100;
  const closeBar = await readBar(page27, close27.id, "coll-change");
  check(
    `b6. usdp/27's close row's collateral change bar is the full negative change (${expCloseColl.toFixed(1)}%, removal tint)`,
    closeBar != null && Math.abs(closeBar.width - expCloseColl) <= 0.2 && /bg-blue-200/.test(closeBar.cls),
    JSON.stringify({ closeBar, expCloseColl }),
  );
  await setDisplayFlag(page27, "Change bars", false);
  await page27.close();

  // ── (c) the chips ─────────────────────────────────────────────────────────
  check(
    "c0. Collateral Ratio off: no chip anywhere on usdp/8",
    (await page8.locator("[data-ratio-chip]").count()) === 0,
  );
  await setDisplayFlag(page8, "Collateral Ratio", true);
  await showAll(page8);
  const cr1 = crPct(first8.context.data);
  const crLast = crPct(dLast);
  const chip1 = await readChip(page8, first8.id);
  const chipLast = await readChip(page8, last8.id);
  check(
    `c1. usdp/8 row #1's chip reads "${chipText(cr1)}" and is not red`,
    chip1 != null && chip1.text === chipText(cr1) && !chip1.red && chip1.marker === "ok",
    JSON.stringify(chip1),
  );
  check(
    `c2. usdp/8's last row's chip reads "${chipText(crLast)}" and is not red`,
    chipLast != null && chipLast.text === chipText(crLast) && !chipLast.red && chipLast.marker === "ok",
    JSON.stringify(chipLast),
  );

  const page175 = await open(context, polarisUrl("usdp", "175"));
  const fire = crAtFirePct(liq175.context.data);
  const chipLiq = await readChip(page175, liq175.id);
  const chipOpen175 = await readChip(page175, open175.id);
  const crOpen175 = crPct(open175.context.data);
  check(
    `c3. usdp/175's liquidation row's chip is the at-fire ratio "${chipText(fire)}" and is red (${fire.toFixed(2)} < 115)`,
    chipLiq != null && chipLiq.text === chipText(fire) && chipLiq.red && chipLiq.marker === "below-min" && fire < 115,
    JSON.stringify(chipLiq),
  );
  check(
    `c4. usdp/175's open row's chip reads "${chipText(crOpen175)}" and is not red`,
    chipOpen175 != null && chipOpen175.text === chipText(crOpen175) && !chipOpen175.red,
    JSON.stringify(chipOpen175),
  );
  // The forensics explainer states the same at-fire figure to 2 dp.
  await expandRow(page175, liq175.id);
  const liqRow = rowOf(page175, liq175.id);
  const explBtn = liqRow.getByRole("button", { name: /explanation/i }).first();
  if ((await explBtn.count()) > 0 && (await explBtn.getAttribute("aria-expanded")) !== "true") await explBtn.click();
  await page175.waitForTimeout(300);
  const liqText = (await liqRow.innerText()).replace(/\s+/g, " ");
  const liqStat = await readRatioStat(page175, liq175.id);
  check(
    `c5. the liquidation row's metric (${pct1(fire)}) and the forensics clause (${pct2(fire)}) state the same ratio at fire`,
    liqStat != null && liqStat.text.includes(pct1(fire)) && liqText.includes(pct2(fire)) && liqStat.change == null,
    JSON.stringify({ liqStat, has2dp: liqText.includes(pct2(fire)) }),
  );
  await page175.close();

  // ── (d) the metric ────────────────────────────────────────────────────────
  await expandRow(page8, last8.id);
  const statLast = await readRatioStat(page8, last8.id);
  const beforeLast = crBeforePct(dLast);
  const changeLast = crLast - beforeLast;
  const changeStr = `${changeLast >= 0 ? "+" : "−"}${Math.abs(changeLast).toFixed(1)} pts`;
  check(
    `d1. usdp/8's last row's "Collateral ratio" stat reads ${pct1(crLast)}, before ${pct1(beforeLast)}, change ${changeStr}`,
    statLast != null &&
      statLast.text.includes(pct1(crLast)) &&
      statLast.text.includes(pct1(beforeLast)) &&
      statLast.change != null &&
      statLast.change.includes(changeStr),
    JSON.stringify(statLast),
  );
  await expandRow(page8, first8.id);
  const statFirst = await readRatioStat(page8, first8.id);
  check(
    `d2. usdp/8 row #1 (the open) reads ${pct1(cr1)} with no transition`,
    statFirst != null && statFirst.text.includes(pct1(cr1)) && statFirst.change == null && !/pts/.test(statFirst.text),
    JSON.stringify(statFirst),
  );

  // ── (f) the export, with prices ───────────────────────────────────────────
  // The table row is found by its transaction cell (the hash's first ten
  // characters), not by its number: the export's row order is the page's.
  // The wire drops `txHash` from a row (it is a segment of the id,
  // `cdp_updated:<hash>:<logIndex>`), so it is read back off the id.
  const hashOf = (e) => e.txHash ?? e.id.split(":")[1];
  const mdRowFor = (md, e) =>
    md.split("\n").find((l) => l.startsWith("| ") && l.includes(hashOf(e).slice(0, 10))) ?? "";
  const md = await copyMarkdown(page8);
  const tableHeader = md.split("\n").find((l) => l.startsWith("| # | Date | Action |")) ?? "";
  const lastMdRow = mdRowFor(md, last8);
  check(
    `f1. the markdown timeline table has a "Collateral ratio at block" column and the last row carries ${pct2(crLast)}`,
    tableHeader.includes("| Collateral ratio at block |") && lastMdRow.includes(`| ${pct2(crLast)} |`),
    JSON.stringify({ tableHeader, lastMdRow: lastMdRow.slice(0, 300) }),
  );

  // ── (g) persistence ───────────────────────────────────────────────────────
  await page8.reload({ waitUntil: "domcontentloaded" });
  await page8
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page8.waitForTimeout(800);
  const stored = await page8.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("timeline-display-v3") ?? "null");
    } catch {
      return null;
    }
  });
  check(
    "g. Collateral Ratio survives a reload: chips drawn and timeline-display-v3 has showCollateralRatio: true",
    stored?.showCollateralRatio === true && (await page8.locator("[data-ratio-chip]").count()) > 0,
    JSON.stringify({ stored, chips: await page8.locator("[data-ratio-chip]").count() }),
  );

  // ── (e) the dash ──────────────────────────────────────────────────────────
  const pageNoPrice = await open(context, polarisUrl("usdp", "8"), priceLessRewrite);
  await showAll(pageNoPrice);
  check(
    "e0. the price-less document left no priceAtBlock value behind",
    priceLessLeftovers === 0,
    `${priceLessLeftovers} leftovers`,
  );
  const chipsNoPrice = await pageNoPrice.locator("[data-ratio-chip]").count();
  await expandRow(pageNoPrice, last8.id);
  const statNoPrice = await readRatioStat(pageNoPrice, last8.id);
  const rowText = (await rowOf(pageNoPrice, last8.id).innerText()).replace(/\s+/g, " ");
  check(
    "e1. without a price: no chip on any row, the expanded metric reads a dash, and the row's Collateral and Debt stats still render",
    chipsNoPrice === 0 &&
      statNoPrice != null &&
      /Collateral ratio —/.test(statNoPrice.text) &&
      /Collateral/.test(rowText) &&
      /Debt/.test(rowText),
    JSON.stringify({ chipsNoPrice, statNoPrice }),
  );
  const mdNoPrice = await copyMarkdown(pageNoPrice);
  const lastMdRowNoPrice = mdRowFor(mdNoPrice, last8);
  check(
    "f2. the price-less markdown gives — in the price and ratio columns",
    /\| — \| — \| /.test(lastMdRowNoPrice),
    lastMdRowNoPrice.slice(0, 300),
  );
  await pageNoPrice.close();

  // ── restore the shared defaults ───────────────────────────────────────────
  await setDisplayFlag(page8, "Collateral Ratio", false);
  const restored = await page8.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("timeline-display-v3") ?? "null");
    } catch {
      return null;
    }
  });
  check(
    "z. the run leaves the display flags at their defaults",
    restored?.showCollateralRatio === false && !restored?.showChangeBars && !restored?.showBalanceBars,
    JSON.stringify(restored),
  );
  await page8.close();
} finally {
  await context.close();
  await browser.close();
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`} (${checked} checks)`);
process.exit(failures === 0 ? 0 : 1);
