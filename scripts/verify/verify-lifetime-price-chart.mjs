// The Lifetime flows panel's price view (rails-ops
// reference/lifetime-flows-scrubber.md; ui-jobs 328, step 2).
// ---------------------------------------------------------------------------
// The panel stacks the value line over one held asset's price chart, one
// cursor for both, the events under them. The readout is the price chart's
// tip, shown while the chart has focus. Per page, at 1280 and 390:
//   - the two strips stand, value over price, and the value line is the same
//     before and after the cursor's trip along the price chart;
//   - the strip draws no day the series lacks: every day drawn as observed is
//     a day of the page's own price answer, every day drawn carried is not;
//   - at three stops the readout's block (`data-price-block`, the value its
//     <Prov> carries as `source.block`) is the block of the answer's point on
//     the readout's day, and the price figure is inside a <Prov>;
//   - the price chart's how-to-read names the series' source;
//   - one pip row under the charts;
//   - the heading's list names each held asset with a series.
// Pages: Aave V3 Core 0xfb93…2a71 and 0xfb45…750a (liquidated), whose answer
// is /api/aave-v3/flows; three Liquity V2 Troves, whose answer is
// /api/liquity-v2/prices/daily (checked over the answer's own days: before
// them the Trove's rows price the line): WETH 1022…0154 (open, read live),
// WETH 2241…2759 (open, redeemed several hundred times) and rETH 1939…5964
// (redeemed, then liquidated on 5 Jun 2026).
// On each Trove (step 3), against the Trove's rows (/api/trove/…/timeline):
//   - every event mark is a row's price at the row's block, on its day, and
//     every priced row has its mark;
//   - every redemption mark sits on a redemption row's day at its redemption
//     price, one per such row;
//   - the liquidation level draws no day the Trove's life lacks: each day has
//     a row holding collateral and debt by its end, none after a liquidation;
//   - at the three stops, the level's <Prov> block is the block of the last
//     row holding both by the day's end (none at the live read), and the
//     runway's is the price's;
//   - a day with redemptions states the last one's redemption price at its block;
//   - on an open Trove the level's last point is today's and equals the
//     card's "Liquidates at", and the runway at the last stop is the card's;
//   - on the liquidated Trove the last stop reads the close day, and the
//     price line draws no day after it (ruling 14).
//
// Run:  BASE_URL=http://localhost:3190 node scripts/verify/verify-lifetime-price-chart.mjs

import { chromium } from "playwright";
import { BASE as HOST_BASE, bypassHeaders, hostFetch } from "./lib/host.mjs";

const BASE = (process.env.BASE_URL ?? HOST_BASE).replace(/\/$/, "");
const PAGES = [
  {
    id: "aave-v3 0xfb93",
    path: "/ethereum/aave-v3/0xfb9395e0b216823c9a60d5dfcb8c6ef458232a71?market=core",
    answer: "/api/aave-v3/flows",
    source: /AaveOracle/,
  },
  {
    id: "aave-v3 0xfb45 (liquidated)",
    path: "/ethereum/aave-v3/0xfb45f0e612424104753f2e2fc9507b3d082e750a?market=core",
    answer: "/api/aave-v3/flows",
    source: /AaveOracle/,
  },
  {
    id: "liquity-v2 WETH Trove",
    path: "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154",
    answer: "/api/liquity-v2/prices/daily",
    source: /PriceFeed/,
    trove: "live",
  },
  {
    id: "liquity-v2 WETH Trove (redeemed)",
    path: "/ethereum/liquity-v2/trove/WETH/22412517865912344610666591322850826630726594253808037974356128721405243892759",
    answer: "/api/liquity-v2/prices/daily",
    source: /PriceFeed/,
    trove: "redeemed",
  },
  {
    id: "liquity-v2 rETH Trove (liquidated)",
    path: "/ethereum/liquity-v2/trove/rETH/19392756892012588507808147823032851071198051944268422940534038614966657095964",
    answer: "/api/liquity-v2/prices/daily",
    source: /PriceFeed/,
    trove: "liquidated",
  },
];

const DAY = 86_400;

/** The Trove's rows, every page of them, as the page reads them. */
async function troveRows(path) {
  const [, , , , ct, id] = path.split("/");
  const rows = [];
  for (let offset = 0; offset <= 10_000; offset += 1000) {
    const body = await hostFetch(`${BASE}/api/trove/${ct}/${id}/timeline?limit=1000&offset=${offset}`).then((r) =>
      r.json(),
    );
    for (const e of body.events ?? []) {
      const c = e.context?.data;
      if (!c) continue;
      rows.push({
        id: e.id,
        block: e.blockNumber,
        ts: e.timestamp,
        logIndex: Number(String(e.id).split("_").pop()) || 0,
        price: c.collateralPrice > 0 ? c.collateralPrice : null,
        redemption: c.operation === "redeemCollateral",
        redemptionPrice: c.redemption?.redemptionPrice > 0 ? c.redemption.redemptionPrice : null,
        holds: c.stateAfter ? c.stateAfter.coll > 0 && c.stateAfter.debt > 0 : null,
        liquidation: c.operation === "liquidate",
      });
    }
    if (!body.pagination?.hasMore) break;
  }
  // Duplicated rows (a page boundary) once each, in the replay's order.
  const seen = new Set();
  return rows
    .filter((r) => {
      const k = r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.ts - b.ts || a.block - b.block || a.logIndex - b.logIndex);
}

/** The block the level on `day` rests on: the last row by the day's end,
 *  where it holds collateral and debt (a row stating no after-state keeps the
 *  last state); on the day a row leaves nothing, the last row that held both;
 *  null where there is no level. */
function levelBlockOn(rows, day, nowS) {
  const end = Math.min((day + 1) * DAY, nowS);
  let held = false;
  let block = null;
  let lastHold = null;
  let dropDay = null;
  for (const r of rows) {
    if (r.ts > end) break;
    if (r.holds === false) {
      if (held) dropDay = Math.floor(r.ts / DAY);
      held = false;
    } else if (r.holds === true || held) {
      held = true;
      block = r.block;
      lastHold = r.block;
    }
  }
  return held ? block : dropDay === day ? lastHold : null;
}

/** The card's liquidation price format (lib/utils/liquidation-utils.ts). */
function formatLiquidationPrice(p) {
  if (p < 0.01) return "< $0.01";
  if (p < 1) return "$" + p.toFixed(3);
  if (p < 100) return "$" + p.toFixed(2);
  if (p < 1_000) return "$" + p.toFixed(0);
  if (p < 1_000_000) return "$" + (p / 1000).toFixed(p < 10_000 ? 2 : 1) + "K";
  return "$" + (p / 1_000_000).toFixed(2) + "M";
}

const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/** Per asset symbol, the answer's observations by day: [price, block]. */
function answerSeries(kind, body, collSymbol) {
  const out = new Map();
  if (kind === "/api/aave-v3/flows") {
    const held = new Set();
    for (const d of body.days ?? []) for (const b of d[4] ?? []) held.add(b[1]);
    for (const [addr, p] of Object.entries(body.prices ?? {})) {
      if (!held.has(addr)) continue;
      const sym = body.assets?.[addr]?.symbol ?? addr;
      out.set(sym, new Map((p.obs ?? []).filter((o) => o[1] > 0).map((o) => [o[0], [o[1], o[2] ?? null]])));
    }
  } else {
    out.set(collSymbol, new Map((body.obs ?? []).filter((o) => o[1] > 0).map((o) => [o[0], [o[1], o[2] ?? null]])));
  }
  return out;
}

/** The marks and the level's days against the Trove's rows. */
async function checkTroveMarks(page, tag, pg, rows) {
  const marks = await page.$$eval("[data-price-event]", (cs) =>
    cs.map((c) => ({
      tone: c.dataset.priceEvent,
      day: Number(c.dataset.priceEventDay),
      block: c.dataset.priceEventBlock === "" ? null : Number(c.dataset.priceEventBlock),
      price: Number(c.dataset.priceEventPrice),
    })),
  );
  const priced = rows.filter((r) => r.price != null);
  const pool = new Map();
  for (const r of priced) pool.set(r.block, [...(pool.get(r.block) ?? []), r]);
  const bad = [];
  for (const m of marks) {
    const at = pool.get(m.block) ?? [];
    const i = at.findIndex((r) => Math.floor(r.ts / DAY) === m.day && near(r.price, m.price));
    if (i < 0) bad.push(`${m.block}@${m.day}`);
    else at.splice(i, 1);
  }
  const left = [...pool.values()].flat();
  check(
    `${tag}: every event mark is a row's price at its block and day, every priced row marked`,
    marks.length > 0 && bad.length === 0 && left.length === 0,
    `${marks.length} marks, ${priced.length} priced rows; unmatched ${bad.slice(0, 3)}; unmarked ${left.slice(0, 3).map((r) => r.block)}`,
  );
  const reds = await page.$$eval("[data-redemption-mark]", (ps) =>
    ps.map((p) => ({
      day: Number(p.dataset.redemptionDay),
      block: Number(p.dataset.redemptionBlock),
      price: Number(p.dataset.redemptionPrice),
    })),
  );
  const redRows = rows.filter((r) => r.redemption && r.redemptionPrice != null && r.price != null);
  const redBad = reds.filter(
    (m) =>
      !redRows.some((r) => r.block === m.block && Math.floor(r.ts / DAY) === m.day && near(r.redemptionPrice, m.price)),
  );
  if (pg.trove !== "live" || redRows.length > 0)
    check(
      `${tag}: each redemption mark sits on its row's day at the row's redemption price, one per row`,
      redRows.length > 0 && reds.length === redRows.length && redBad.length === 0,
      `${reds.length} marks, ${redRows.length} redemption rows; off ${redBad.slice(0, 3).map((m) => `${m.block}@${m.day}`)}`,
    );
  const levelDays = await page.$$eval("[data-liq-level]", (ps) =>
    ps.flatMap((p) => (p.dataset.liqDays ?? "").split(",").filter(Boolean).map(Number)),
  );
  const nowS = Date.now() / 1000;
  const lacking = levelDays.filter((d) => levelBlockOn(rows, d, nowS) == null);
  const liq = rows.find((r) => r.liquidation);
  const after = liq ? levelDays.filter((d) => d > Math.floor(liq.ts / DAY)) : [];
  check(
    `${tag}: the liquidation level draws no day the Trove's life lacks`,
    levelDays.length > 0 && lacking.length === 0 && after.length === 0,
    `${levelDays.length} days; without a holding row ${lacking.slice(0, 3)}; after the liquidation ${after.slice(0, 3)}`,
  );
  if (pg.trove === "liquidated")
    check(
      `${tag}: the level ends on the liquidation's day`,
      liq != null && Math.max(...levelDays) === Math.floor(liq.ts / DAY),
      `last ${Math.max(...levelDays)}, liquidation ${liq ? Math.floor(liq.ts / DAY) : "none"}`,
    );
}

/** The level's line of the readout at a stop: its <Prov> blocks. */
async function checkLevelReadout(page, tag, now, r, rows) {
  const lv = await page
    .$eval("[data-liq-readout]", (e) => ({
      day: e.getAttribute("data-liq-day"),
      block: e.getAttribute("data-liq-block"),
      runwayBlock: e.getAttribute("data-runway-block"),
      redeemedBlock: e.getAttribute("data-redeemed-block"),
      redeemedPrice: e.getAttribute("data-redeemed-price"),
      provs: e.querySelectorAll("[data-prov-covered], [data-prov-inspect], [data-prov-pickable]").length,
      text: e.textContent,
    }))
    .catch(() => null);
  const today = Math.floor(Date.now() / 1000 / DAY);
  const day = r.day != null ? Number(r.day) : null;
  if (!lv || lv.day == null) {
    // No level on the day: none is due (before the open, in a gap, after the end).
    const due = day != null && day !== today && levelBlockOn(rows, day, Date.now() / 1000) != null;
    check(`${tag}: stop ${now}, no level where none is due`, !due, lv?.text ?? "no level line");
    return;
  }
  const lday = Number(lv.day);
  const live = lday === today && rows[rows.length - 1].holds;
  const want = live ? "" : String(levelBlockOn(rows, lday, Date.now() / 1000) ?? "");
  check(
    `${tag}: stop ${now}, the level's block is the last holding row's by the day's end`,
    lv.block === want,
    `day ${lday}: readout ${lv.block}, rows ${want}; ${lv.text}`,
  );
  if (lv.runwayBlock != null)
    check(
      `${tag}: stop ${now}, the runway's block is the price's`,
      lv.runwayBlock === (r.block || lv.block),
      `runway ${lv.runwayBlock}, price ${r.block}`,
    );
  if (lv.redeemedBlock != null) {
    const reds = rows.filter((x) => x.redemption && x.redemptionPrice != null && Math.floor(x.ts / DAY) === lday);
    const lastRed = reds[reds.length - 1];
    check(
      `${tag}: stop ${now}, the redemption price is the day's last redemption's, at its block`,
      lastRed != null &&
        String(lastRed.block) === lv.redeemedBlock &&
        near(lastRed.redemptionPrice, Number(lv.redeemedPrice)),
      `readout ${lv.redeemedBlock} ${lv.redeemedPrice}; rows ${lastRed?.block} ${lastRed?.redemptionPrice}`,
    );
  }
  if (BASE.includes("localhost"))
    check(`${tag}: stop ${now}, the level's figures are inside <Prov>s`, lv.provs >= 1, `${lv.provs}`);
}

/** The last stop against the card, and a redemption day's readout. */
async function checkTroveEnd(page, tag, pg, rows, sl) {
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  const end = await page
    .$eval("[data-liq-readout]", (e) => ({
      day: e.getAttribute("data-liq-day"),
      value: e.getAttribute("data-liq-value"),
    }))
    .catch(() => null);
  if (pg.trove === "live" || pg.trove === "redeemed") {
    const today = Math.floor(Date.now() / 1000 / DAY);
    const card = (
      await page
        .locator('[data-panel-row="liquidates-at"] dd')
        .first()
        .textContent()
        .catch(() => null)
    )?.trim();
    check(
      `${tag}: the level's last point is today's and equals the card's "Liquidates at"`,
      end != null && Number(end.day) === today && card != null && formatLiquidationPrice(Number(end.value)) === card,
      `level ${end?.day} ${end?.value} (${end ? formatLiquidationPrice(Number(end.value)) : "-"}), card ${card}`,
    );
  }
  if (pg.trove === "liquidated") {
    // A closed position's chart ends at the close (ruling 14): the last stop
    // reads the close day, plain, and the line draws no day after it.
    const liqDay = Math.floor(rows.find((r) => r.liquidation).ts / DAY);
    const close = await page.evaluate(() => {
      const r = document.querySelector("[data-price-readout]");
      const g = document.querySelector("[data-price-line]");
      const days = ["data-price-observed", "data-price-carried"].flatMap((a) =>
        (g?.getAttribute(a) ?? "").split(",").filter(Boolean).map(Number),
      );
      return {
        day: r?.getAttribute("data-price-day"),
        green: /text-green/.test(r?.className ?? ""),
        last: Math.max(...days),
      };
    });
    check(
      `${tag}: at the last stop the heading reads the close day, and the line ends there`,
      Number(close.day) <= liqDay && !close.green && close.last === liqDay,
      `readout day ${close.day}${close.green ? " (live green)" : ""}, line's last day ${close.last}, liquidation ${liqDay}`,
    );
  }
  // The runway and the redemption price left the chart's readout for the
  // card's "Collateral can fall" and the event cards (heading figures, 14 Oct
  // 2026): the heading states the price and the level alone.
}

const browser = await chromium.launch();

for (const pg of PAGES) {
  for (const width of [1280, 390]) {
    const tag = `${pg.id} @${width}`;
    const ctx = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: width < 640,
      isMobile: width < 640,
      extraHTTPHeaders: bypassHeaders(),
    });
    // The full Lifetime flows panel: the compact view (the default) has no
    // scrubber or events row.
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("rails-flows-view-v1", "full");
      } catch {}
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let body = null;
    page.on("response", async (r) => {
      const u = new URL(r.url());
      if (u.pathname !== pg.answer || !r.ok()) return;
      try {
        body = await r.json();
      } catch {}
    });
    await page.goto(`${BASE}${pg.path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForSelector("[data-flows-combined] [data-flow-strip] svg", { timeout: 180000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const views = await page.$$eval("[data-flows-combined] [data-flow-strip]", (els) =>
      els.map((e) => e.getAttribute("data-flow-strip-view")),
    );
    if (
      !check(`${tag}: the value line and the price chart stand stacked`, views.join() === "value,price", views.join())
    ) {
      await ctx.close();
      continue;
    }
    const PRICE = '[data-flow-strip-view="price"]';
    await page.locator(PRICE).scrollIntoViewIfNeeded();
    if (!body) {
      // The answer was read before the listener saw it: read it as the page does.
      const u = new URL(`${BASE}${pg.path}`);
      const q =
        pg.answer === "/api/aave-v3/flows"
          ? `wallet=${u.pathname.split("/").pop()}&market=${u.searchParams.get("market")}`
          : `collateralType=${u.pathname.split("/")[4]}`;
      body = await hostFetch(`${BASE}${pg.answer}?${q}`).then((r) => r.json());
    }
    const series = answerSeries(pg.answer, body, pg.path.split("/")[4]);

    const valueLine = () =>
      page.$$eval('[data-flows-combined] [data-flow-strip-view="value"] svg path', (ps) =>
        ps.map((p) => p.getAttribute("d")).join("|"),
      );
    const pips = () =>
      page.$$eval("[data-flows-combined] [data-flow-pips]", (rows) =>
        rows.map((r) => [...r.querySelectorAll("[data-flow-pip]")].map((p) => p.style.left).join(",")),
      );
    const before = { line: await valueLine(), pips: await pips() };
    check(`${tag}: one pip row under the charts`, before.pips.length === 1, `${before.pips.length} rows`);

    // The picker: each held asset with a series.
    // The heading's list (several assets: open it to read its options) or
    // the asset's name (one).
    const picker = page.locator("button[data-price-picker]");
    if ((await picker.count()) > 0) {
      await picker.click();
      await page.waitForSelector('[role="listbox"] [data-price-asset]', { timeout: 5000 }).catch(() => {});
    }
    const listed = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
    if ((await picker.count()) > 0) await page.keyboard.press("Escape");
    const pick = async (sym) => {
      if ((await picker.count()) === 0) return;
      await picker.click();
      await page.locator(`[role="listbox"] [data-price-asset="${sym}"]`).click();
    };
    const want = [...series.keys()];
    check(
      `${tag}: the picker lists each held asset with a series`,
      want.length > 0 && want.every((s) => listed.includes(s)) && listed.every((s) => want.includes(s)),
      `listed ${listed.join(",")}; answer ${want.join(",")}`,
    );

    // Each listed asset: the drawn days against the answer, and the price
    // chart's how-to-read naming the source.
    for (const sym of listed) {
      await pick(sym);
      await page.waitForTimeout(250);
      const drawn = await page.$eval("[data-price-line]", (g) => ({
        observed: (g.getAttribute("data-price-observed") ?? "").split(",").filter(Boolean).map(Number),
        carried: (g.getAttribute("data-price-carried") ?? "").split(",").filter(Boolean).map(Number),
      }));
      const obs = series.get(sym) ?? new Map();
      const days = [...obs.keys()];
      const lo = Math.min(...days);
      const hi = Math.max(...days);
      const inRange = (d) => pg.answer === "/api/aave-v3/flows" || (d >= lo && d <= hi);
      const extra = drawn.observed.filter((d) => inRange(d) && !obs.has(d));
      const wrong = drawn.carried.filter((d) => inRange(d) && obs.has(d));
      check(
        `${tag} ${sym}: every day drawn observed is in the answer, none drawn carried is`,
        drawn.observed.length > 0 && extra.length === 0 && wrong.length === 0,
        `${drawn.observed.length} observed, ${drawn.carried.length} carried; extra ${extra.slice(0, 3)}; carried but answered ${wrong.slice(0, 3)}`,
      );
      await page.locator('[data-flow-help="F19.7"] button').click();
      const help = await page
        .locator('[role="dialog"][aria-label="How to read the price chart"]')
        .textContent({ timeout: 5000 })
        .catch(() => "");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      check(`${tag} ${sym}: the price chart's how-to-read names the source`, pg.source.test(help ?? ""), help ?? "");
    }
    // Back to the first asset for the stops.
    await pick(listed[0]);
    const rows = pg.trove ? await troveRows(pg.path) : null;
    if (rows) await checkTroveMarks(page, tag, pg, rows);
    const obs0 = series.get(listed[0]) ?? new Map();

    // Three stops: the opening, the middle and the day before today; the
    // price strip focused, which shows its readout as the cursor's tip.
    const sl = page.locator(PRICE).first();
    await sl.focus();
    const max = Number(await sl.getAttribute("aria-valuemax"));
    const targets = [0, Math.floor(max / 2), Math.max(0, max - 1)];
    for (const target of targets) {
      await page.keyboard.press("Home");
      for (let i = 0; i < Math.floor(target / 4); i++) await page.keyboard.press("PageUp");
      for (let i = 0; i < target % 4; i++) await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(150);
      const r = await page.$eval("[data-price-readout]", (e) => ({
        day: e.getAttribute("data-price-day"),
        block: e.getAttribute("data-price-block"),
        prov: !!e.querySelector("[data-prov-covered], [data-prov-inspect], [data-prov-pickable]"),
        text: e.textContent,
      }));
      const now = Number(await sl.getAttribute("aria-valuenow"));
      if (rows) await checkLevelReadout(page, tag, now, r, rows);
      if (r.day == null) {
        check(`${tag}: stop ${now} has a price`, false, r.text ?? "");
        continue;
      }
      const day = Number(r.day);
      const point = obs0.get(day);
      // Outside the Liquity answer's days the Trove's own rows price the line.
      if (
        !point &&
        pg.answer !== "/api/aave-v3/flows" &&
        (day < Math.min(...obs0.keys()) || day > Math.max(...obs0.keys()))
      ) {
        check(`${tag}: stop ${now} reads a row's price outside the answer's days`, true, r.text ?? "");
        continue;
      }
      // An open Trove's today is the live read, which has no block.
      if (pg.trove && day === Math.floor(Date.now() / 86_400_000) && r.block === "") {
        check(`${tag}: stop ${now}, today reads the live price`, true, r.text ?? "");
        continue;
      }
      check(
        `${tag}: stop ${now}, the readout's block is the answer's block on its day`,
        point != null && String(point[1] ?? "") === (r.block ?? ""),
        `day ${day}: readout ${r.block}, answer ${point ? point[1] : "none"}; ${r.text}`,
      );
      if (BASE.includes("localhost")) check(`${tag}: stop ${now}, the price is inside a <Prov>`, r.prov);
    }

    if (rows) await checkTroveEnd(page, tag, pg, rows, sl);

    // The value line is the one it was: the stops moved the cursor only.
    await sl.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    check(
      `${tag}: the value line is unchanged by the stops`,
      (await valueLine()) === before.line && before.line.length > 0,
    );
    check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures === 0 && checked > 0 ? 0 : 1);
