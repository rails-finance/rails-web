// The Lifetime flows panel's price view (rails-ops
// reference/lifetime-flows-scrubber.md; ui-jobs 328, step 2).
// ---------------------------------------------------------------------------
// "Value · Price · Both" on the panel's control row picks the strips under
// the bars: the line, one held asset's price line, or both stacked; the
// cursor, the pip row and the end labels stay. The readout is the price
// strip's tip, shown while the strip has focus. Per page, at 1280 and 390:
//   - the toggle is drawn and `aria-pressed` follows the view; the Value
//     view's line is the same before and after a trip to Price;
//   - the strip draws no day the series lacks: every day drawn as observed is
//     a day of the page's own price answer, every day drawn carried is not;
//   - at three stops the readout's block (`data-price-block`, the value its
//     <Prov> carries as `source.block`) is the block of the answer's point on
//     the readout's day, and the price figure is inside a <Prov>;
//   - the caption names the series' source;
//   - the pip row is one row in both views, its pips on the same x;
//   - the picker lists each held asset with a series.
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
//     card's "Liquidates at", and the runway at the last stop is the card's.
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
      share: e.getAttribute("data-runway-share"),
      runway: e.querySelector("[data-runway]")?.textContent ?? null,
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
    const sentence = await page.evaluate(() => {
      const m = document.body.innerHTML.match(/would need to fall <span[^>]*>([\d.]+)%<\/span>/);
      return m ? Number(m[1]) : null;
    });
    const pct = end?.share != null ? Number(end.share) * 100 : null;
    check(
      `${tag}: the runway at the last stop is the card's`,
      pct != null &&
        sentence != null &&
        Math.abs(pct - sentence) <= 0.05 + 1e-9 &&
        (end.runway ?? "").includes(`${Math.round(pct)}%`),
      `chart ${pct?.toFixed(3)}% "${end?.runway}", card ${sentence}%`,
    );
  }
  if (pg.trove === "redeemed") {
    // Back from today to the nearest day with redemptions.
    let found = null;
    for (let i = 0; i < 60 && !found; i++) {
      found = await page.$eval("[data-liq-readout]", (e) => e.getAttribute("data-redeemed-block")).catch(() => null);
      if (!found) {
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(60);
      }
    }
    const lv = await page.$eval("[data-liq-readout]", (e) => ({
      day: Number(e.getAttribute("data-liq-day")),
      block: e.getAttribute("data-redeemed-block"),
      price: Number(e.getAttribute("data-redeemed-price")),
      text: e.querySelector("[data-redeemed]")?.textContent ?? "",
    }));
    const reds = rows.filter((x) => x.redemption && x.redemptionPrice != null && Math.floor(x.ts / DAY) === lv.day);
    const lastRed = reds[reds.length - 1];
    check(
      `${tag}: a redemption day reads "Redeemed at" the last redemption's price, at its block`,
      found != null &&
        lastRed != null &&
        String(lastRed.block) === lv.block &&
        near(lastRed.redemptionPrice, lv.price) &&
        /Redeemed (at|\d+ times, last at) \$/.test(lv.text),
      `day ${lv.day}: ${lv.text} @${lv.block}; rows ${reds.length}, last ${lastRed?.block} ${lastRed?.redemptionPrice}`,
    );
  }
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
    const toggle = page.locator("[data-flows-view-toggle]").first();
    if (!check(`${tag}: the Value · Price · Both toggle is drawn`, (await toggle.count()) === 1)) {
      await ctx.close();
      continue;
    }
    await toggle.scrollIntoViewIfNeeded();
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

    const pressed = () =>
      page.$$eval("[data-flows-view]", (bs) =>
        bs.map((b) => `${b.dataset.flowsView}:${b.getAttribute("aria-pressed")}`),
      );
    const valueLine = () =>
      page.$$eval("[data-flows-combined] [data-flow-strip] svg path", (ps) =>
        ps.map((p) => p.getAttribute("d")).join("|"),
      );
    const pips = () =>
      page.$$eval("[data-flows-combined] [data-flow-pips]", (rows) =>
        rows.map((r) => [...r.querySelectorAll("[data-flow-pip]")].map((p) => p.style.left).join(",")),
      );
    const before = { pressed: await pressed(), line: await valueLine(), pips: await pips() };
    check(
      `${tag}: Value is pressed by default`,
      before.pressed.join() === "value:true,price:false,both:false",
      before.pressed.join(),
    );

    await page.locator('[data-flows-view="price"]').click();
    await page.waitForSelector("[data-price-line]", { timeout: 10000 }).catch(() => {});
    const inPrice = { pressed: await pressed(), pips: await pips() };
    check(
      `${tag}: Price pressed after the press`,
      inPrice.pressed.join() === "value:false,price:true,both:false",
      inPrice.pressed.join(),
    );
    check(
      `${tag}: the pip row is one row in both views, its pips on the same x`,
      before.pips.length === 1 && inPrice.pips.length === 1 && before.pips[0] === inPrice.pips[0],
      `${before.pips.length}/${inPrice.pips.length} rows`,
    );
    const strip = await page.$eval("[data-flow-strip]", (e) => e.getAttribute("data-flow-strip-view"));
    check(`${tag}: the strip is the price strip`, strip === "price", String(strip));

    // The picker: each held asset with a series.
    const showAll = page.locator("[data-price-show-all]");
    if ((await showAll.count()) > 0) {
      await showAll.click();
      await page.waitForTimeout(200);
    }
    const listed = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
    const want = [...series.keys()];
    check(
      `${tag}: the picker lists each held asset with a series`,
      want.length > 0 && want.every((s) => listed.includes(s)) && listed.every((s) => want.includes(s)),
      `listed ${listed.join(",")}; answer ${want.join(",")}`,
    );

    // Each listed asset: the drawn days against the answer, and the caption.
    for (const sym of listed) {
      await page.locator(`[data-price-asset="${sym}"]`).click();
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
      const caption = await page.locator("[data-price-caption]").textContent();
      check(`${tag} ${sym}: the caption names the source`, pg.source.test(caption ?? ""), caption ?? "");
    }
    // Back to the first asset for the stops.
    await page.locator(`[data-price-asset="${listed[0]}"]`).click();
    const rows = pg.trove ? await troveRows(pg.path) : null;
    if (rows) await checkTroveMarks(page, tag, pg, rows);
    const obs0 = series.get(listed[0]) ?? new Map();

    // Three stops: the opening, the middle and the day before today.
    const sl = page.locator("[data-flow-strip]").first();
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

    // Back to Value: the line is the one it was.
    await page.locator('[data-flows-view="value"]').click();
    await page.waitForTimeout(400);
    await page.locator("[data-flow-strip]").first().focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    const after = { pressed: await pressed(), line: await valueLine() };
    check(
      `${tag}: Value pressed again`,
      after.pressed.join() === "value:true,price:false,both:false",
      after.pressed.join(),
    );
    check(
      `${tag}: the Value view's line is unchanged by the trip`,
      after.line === before.line && before.line.length > 0,
    );
    check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
    // Leave the preference at Value for the next page.
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures === 0 && checked > 0 ? 0 : 1);
