// The Lifetime flows panel's price view (rails-ops
// reference/lifetime-flows-scrubber.md; ui-jobs 328, step 2).
// ---------------------------------------------------------------------------
// "Value · Price" on the panel's control row swaps the strip under the bars
// for one held asset's price line; the cursor, the pip row and the end labels
// stay. Per page, at 1280 and 390:
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
// is /api/aave-v3/flows; a Liquity V2 WETH Trove, whose answer is
// /api/liquity-v2/prices/daily (checked over the answer's own days: before
// them the Trove's rows price the line).
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
  },
];

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
    if (!check(`${tag}: the Value · Price toggle is drawn`, (await toggle.count()) === 1)) {
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
      before.pressed.join() === "value:true,price:false",
      before.pressed.join(),
    );

    await page.locator('[data-flows-view="price"]').click();
    await page.waitForSelector("[data-price-line]", { timeout: 10000 }).catch(() => {});
    const inPrice = { pressed: await pressed(), pips: await pips() };
    check(
      `${tag}: Price pressed after the press`,
      inPrice.pressed.join() === "value:false,price:true",
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
      check(
        `${tag}: stop ${now}, the readout's block is the answer's block on its day`,
        point != null && String(point[1] ?? "") === (r.block ?? ""),
        `day ${day}: readout ${r.block}, answer ${point ? point[1] : "none"}; ${r.text}`,
      );
      if (BASE.includes("localhost")) check(`${tag}: stop ${now}, the price is inside a <Prov>`, r.prov);
    }

    // Back to Value: the line is the one it was.
    await page.locator('[data-flows-view="value"]').click();
    await page.waitForTimeout(400);
    await page.locator("[data-flow-strip]").first().focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    const after = { pressed: await pressed(), line: await valueLine() };
    check(`${tag}: Value pressed again`, after.pressed.join() === "value:true,price:false", after.pressed.join());
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
