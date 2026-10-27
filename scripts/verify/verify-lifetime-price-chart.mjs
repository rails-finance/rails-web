// The Lifetime flows panel's price view (rails-ops
// reference/lifetime-flows-scrubber.md; ui-jobs 328, step 2).
// ---------------------------------------------------------------------------
// The panel stacks the value line over one held asset's price chart, one
// cursor for both, the events under them. The readout is the price chart's
// tip, shown while the chart has focus. Per page, at 1280 and 390:
//   - the chart's panes stand, value over price, and the value line is the same
//     before and after the cursor's trip along the price chart;
//   - the strip draws no day the series lacks: every day drawn as observed is
//     a day of the page's own price answer, every day drawn carried is not;
//   - at three stops the readout's block (`data-price-block`, the value its
//     <Prov> carries as `source.block`) is the block of the answer's point on
//     the readout's day, and the price figure is inside a <Prov>;
//   - the events-and-charts how-to-read (the events heading's "?", F7.1)
//     names the selected series;
//   - one pip row under the charts;
//   - the price tip's list names each held asset with a series;
//   - the price tip's level line is hidden until its triangle toggle
//     (`data-flow-level-toggle`, F19.8) is pressed, and the chart's level line
//     is drawn either way;
//   - the date tip's chevron (`data-flow-events-toggle`, F5.1) opens the day's
//     events in a fixed-height list that stays open, at one height, as the
//     steps move the cursor.
// Pages: Aave V3 Core 0xfb93…2a71 and 0xfb45…750a (liquidated), whose answer
// is /api/aave-v3/flows, and whose chart opens on the health view (step 4,
// `checkHealth`); four Liquity V2 Troves, whose answer is
// /api/liquity-v2/prices/daily (checked over the answer's own days: before
// them the Trove's rows price the line): WETH 1022…0154 (open, read live),
// WETH 2241…2759 (open, redeemed several hundred times), rETH 1939…5964
// (redeemed, then liquidated on 5 Jun 2026) and WETH 8250…8317 (closed on
// 26 Oct 2026).
// On each Trove (step 3), against the Trove's rows (/api/trove/…/timeline):
//   - the price line carries no event or redemption marks (the events row
//     does);
//   - the liquidation level draws no day the Trove's life lacks: each day has
//     a row holding collateral and debt by its end, none after a liquidation;
//   - at the three stops, the level's <Prov> block is the block of the last
//     row holding both by the day's end (none at the live read), and the
//     runway's is the price's;
//   - a day with redemptions states the last one's redemption price at its block;
//   - on an open Trove the level's last point is today's and equals the
//     card's "Liquidates at", and the runway at the last stop is the card's;
//   - on the liquidated and the closed Trove the last stop reads "At close"
//     on the close day, and the price line draws no day after it (ruling 14);
//   - at 390 a timeline card's caption carries "View on chart" beside its
//     date, a 36px target, and a tap on it moves the cursor to that day and
//     leaves the card closed.
//
// The chart engine (ui-jobs 328 step 4c): the Liquity and Aave families draw
// on Lightweight Charts, one canvas for the value line and the price chart, one
// slider over it (`data-flow-strip-view="chart"`, its panes named by
// `data-flow-chart-panes`); a canvas leaves nothing in the DOM to read, so the
// page sets the drawn days and lines as data hooks (`[data-flow-lw-hooks]`:
// `data-price-line`, `data-liq-level`, `data-flow-value-line`). On the new
// engine the checks add: the time axis is drawn with no logo or notice on the
// chart (the site footer carries the attribution); it fits, opens on the whole
// life with the cursor at the right, spreads its pips; ⏮ ‹ › ⏭ in order at All
// and 30D, frozen and not, at 1280 and 390 with touch; the health view's older
// days a dotted series meeting the solid one (`data-price-meets`); and at 1280
// the wheel (`checkLwWheel`): over the chart it scrolls the page, Ctrl with it
// zooms, a sideways swipe pans. Aave V3 Prime 0xb8a4…715e (wstETH/WETH, more
// than 60 days with events, so its older health days are dotted) and EtherFi
// 0x0f2a…bbe take the health checks; SparkLend 0x1601…347e (no debt, so no
// health view) and Aave V4 Main 0x7eac…fa09 the price checks against their
// answers. Step 5 (the health view on SparkLend, Aave V3 Base and Seamless):
// SparkLend 0x070b…b113 (60 days read, its older days dotted) takes the price
// and health checks, and Aave V3 Base 0xe883…4cc8 (older days dotted) and
// Seamless 0x8182…7804 (every day read) the chart's checks and the health
// checks (`lwOnly`: their price answer is the knots). Each health page also
// checks that an asset picked from the list draws its level. Step 4d moved every other family onto the engine: one position
// per family takes the chart's checks alone (`lwOnly`), its panes named
// (`panes`: "value" where the family has no price series, a pane per side
// where the sides have no common unit), and a one-day life (`priceOnly`) the
// price pane alone, with Home and End on its slider for the steps it does not
// draw. Where the page does not tie the chart to its timeline (no Sync to
// chart), a tap moves the cursor without freezing it and ⏭ brings it back.
// `FIXTURES=<regex>` runs the pages whose id matches.
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
    health: true,
  },
  {
    id: "aave-v3 0xfb45 (liquidated)",
    path: "/ethereum/aave-v3/0xfb45f0e612424104753f2e2fc9507b3d082e750a?market=core",
    answer: "/api/aave-v3/flows",
    health: true,
  },
  {
    id: "aave-v3 prime 0xb8a4",
    path: "/ethereum/aave-v3/0xb8a451107a9f87fde481d4d686247d6e43ed715e?market=prime",
    answer: "/api/aave-v3/flows",
    health: true,
  },
  {
    id: "aave-v3 etherfi 0x0f2a",
    path: "/ethereum/aave-v3/0x0f2a32f4f54ec9d52a193e9e3493fb5fea86cbbe?market=etherfi",
    answer: "/api/aave-v3/flows",
    health: true,
    // A health factor near 50: every asset's level is more than ten times
    // from its price (ruling 15), so none is drawn.
    noLevel: true,
  },
  {
    id: "spark 0x1601",
    path: "/ethereum/spark/0x1601843c5e9bc251a3272907010afa41fa18347e",
    answer: "/api/spark/flows",
    query: "wallet=0x1601843c5e9bc251a3272907010afa41fa18347e",
  },
  {
    id: "spark 0x070b",
    path: "/ethereum/spark/0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
    answer: "/api/spark/flows",
    query: "wallet=0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
    health: true,
    timeline: "/api/spark/timeline?wallet=0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
  },
  {
    id: "aave-v4 main 0x7eac",
    path: "/ethereum/aave-v4/spoke/main/0x7eac02864fbae93de38394a3e7b72a22e9b5fa09",
    answer: "/api/aave-v4/flows",
    query: "wallet=0x7eac02864fbae93de38394a3e7b72a22e9b5fa09&spoke=main",
  },
  // Base's two Pools answer in another shape (the knots): the chart's checks
  // and the health view's.
  {
    id: "aave-v3-base 0xe883",
    path: "/base/aave-v3/0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8",
    lwOnly: true,
    health: true,
    timeline: "/api/chain/aave-v3-base/timeline?wallet=0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8",
  },
  {
    id: "seamless 0x8182",
    path: "/base/seamless/0x818214d3494fbc4be4f450c50677e55987804206",
    lwOnly: true,
    health: true,
    timeline: "/api/chain/seamless/timeline?wallet=0x818214d3494fbc4be4f450c50677e55987804206",
  },
  // Step 4d: one position per family on the chart's checks alone.
  { id: "moonwell 0x33a7", path: "/ethereum/moonwell/0x33a7ec1055edd4cc35ef289156c7a7a078043474", lwOnly: true },
  { id: "moonwell-base 0x2d7a", path: "/base/moonwell/0x2d7a6b617f11b6755bfd3ab79f1d7cb963ff9e9c", lwOnly: true },
  {
    id: "compound-v3 usdc 0xc5cd",
    path: "/ethereum/compound-v3/usdc/0xc5cd3abe92d857ecfb73e86de0f8a3ed3239cc46",
    lwOnly: true,
  },
  {
    id: "compound-v3-base usdc 0x3a79",
    path: "/base/compound-v3/usdc/0x3a79bf27ff626b55c601f01666bc522cc65eb852",
    lwOnly: true,
  },
  { id: "compound-v2 0x6217", path: "/ethereum/compound-v2/0x6217c008da6ea46b6db500695287d77d03f79a42", lwOnly: true },
  { id: "makerdao 2028", path: "/ethereum/makerdao/2028", lwOnly: true },
  {
    id: "dolomite 0x49d6",
    path: "/ethereum/dolomite/0x49d62ca7ab8e28f7a28d9abadf84fe8b45e3caf6/15809042418583418827551470108194220080728327193143889538122062408455944908946",
    lwOnly: true,
  },
  { id: "fluid 6", path: "/ethereum/fluid/6", lwOnly: true },
  {
    id: "liquity-v1 0x04ca",
    path: "/ethereum/liquity-v1/0x04ca2a945ccba92ca2443024c07c99f81e71547f?epoch=1",
    lwOnly: true,
  },
  { id: "sky-savings 0x176f", path: "/ethereum/sky-savings/0x176f3dab24a159341c0509bb36b833e7fdd0a132", lwOnly: true },
  {
    id: "morpho 0xebb8",
    path: "/ethereum/morpho/ebd23a871b52e0a8c92bd719f4413600101b69e946cb72923b3a33fb5bc6ec85-0xebb870a0aaaa7bc55ead925d03a4af4a8db79a03",
    lwOnly: true,
  },
  {
    id: "morpho-base 0x9f03",
    path: "/base/morpho/0x9f03da73cf0f3a141404af735c16cf17427d81db/0xc9658cac13a9b9b5c1ebaa8ce19c735283cc761ff528d149a7221047bb7fab45",
    lwOnly: true,
    panes: "value",
  },
  { id: "polaris usdp 2420", path: "/sepolia/polaris/usdp/2420", lwOnly: true },
  { id: "fx wsteth-249", path: "/ethereum/fx/wsteth-249", lwOnly: true },
  {
    id: "llamalend 0xeb2c",
    path: "/ethereum/llamalend/0x100daa78fc509db39ef7d04de0c1abd299f4c6ce/0xeb2cafb6ea9def8084842558ad1242bbf7fcac2b",
    lwOnly: true,
  },
  {
    id: "frankencoin 0xdc18",
    path: "/ethereum/frankencoin/0xdc189ac81bec4db551a0478334691d71109d9382",
    lwOnly: true,
    panes: "collateral,debt",
  },
  {
    id: "maple 0xc4ec",
    path: "/ethereum/maple/0xc4ec216635491a6d08cfe4537ed4dd767212d8c1",
    lwOnly: true,
    panes: "value",
  },
  {
    id: "pwn 0xb2d3 (liquidated)",
    path: "/ethereum/pwn/0xb2d3fc2bbda9a71c65b69ccf39d7052c26a90d13?loan=37",
    lwOnly: true,
    panes: "collateral,debt",
  },
  {
    id: "aave vault holder 0x1676",
    path: "/ethereum/aave/vaults/0xe1753f2e00940cc31213dd92013cf019dfe4ca1d/0x1676d23711186076fa74aa53511dda750a1f0d9a",
    lwOnly: true,
  },
  {
    id: "yearn vault holder 0xb634",
    path: "/ethereum/yearn/vaults/0x310b7ea7475a0b449cfd73be81522f1b88efafaa/0xb634316e06cc0b358437cbadd4dc94f1d3a92b3b",
    lwOnly: true,
  },
  {
    id: "morpho-base vault holder 0x3d88",
    path: "/base/morpho/vaults/0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2/0x3d8863a416f3091766bfea41d3d7008236a0dd1e",
    lwOnly: true,
  },
  // A one-day life (one transaction on 11 Oct 2026, open): the price pane alone.
  {
    id: "liquity-v2 WETH Trove (one day)",
    path: "/ethereum/liquity-v2/trove/WETH/9356199087677269607208888455574125294289574299403525409279454994357184117603",
    lwOnly: true,
    priceOnly: true,
    panes: "price",
  },
  {
    id: "liquity-v2 WETH Trove",
    path: "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154",
    answer: "/api/liquity-v2/prices/daily",
    trove: "live",
  },
  {
    id: "liquity-v2 WETH Trove (redeemed)",
    path: "/ethereum/liquity-v2/trove/WETH/22412517865912344610666591322850826630726594253808037974356128721405243892759",
    answer: "/api/liquity-v2/prices/daily",
    trove: "redeemed",
  },
  {
    id: "liquity-v2 rETH Trove (liquidated)",
    path: "/ethereum/liquity-v2/trove/rETH/19392756892012588507808147823032851071198051944268422940534038614966657095964",
    answer: "/api/liquity-v2/prices/daily",
    trove: "liquidated",
  },
  {
    // Listed as closed and once drawn open, its axis to today (ui-jobs 328).
    id: "liquity-v2 WETH Trove (closed)",
    path: "/ethereum/liquity-v2/trove/WETH/82501486677343366959104920060744506403266161051192207755275552075653445398317",
    answer: "/api/liquity-v2/prices/daily",
    trove: "closed",
  },
];

const only = process.env.FIXTURES ? new RegExp(process.env.FIXTURES) : null;

const DAY = 86_400;
/** A day in the panel's words ("26 Oct '26") as a UTC day number. */
const dayOfWord = (w) => {
  const m = /^(\d{1,2}) (\w{3}) '(\d{2})$/.exec(w.trim());
  if (!m) return null;
  return (
    Date.UTC(2000 + Number(m[3]), "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[2]) / 3, Number(m[1])) / 86_400_000
  );
};
/** The slider the price chart is read through: the price strip, or the one chart. */
const PRICE_STRIP = '[data-flow-strip-view="price"], [data-flow-strip-view="chart"]';

/** The price tip's words for a reader: its text (the level's mark carries
 *  "Liquidates at" / "Liquidates below" for a screen reader) and the picker's
 *  name, the series being drawn as a mark alone. */
function headingText(h) {
  const picker = h.querySelector("[data-price-picker]")?.getAttribute("aria-label") ?? "";
  return `${picker} ${h.textContent ?? ""}`;
}
const HEALTH = "Health factor";

/** The Aave family's health factor as its cards print it (hfLabelV3). */
function hfLabel(hf) {
  if (hf >= 100) return "∞";
  if (hf < 1) return (Math.floor(hf * 1e4 + 1e-9) / 1e4).toFixed(4);
  return hf < 1.1 ? hf.toFixed(4) : hf.toFixed(2);
}

/** The health view on an Aave V3 page (ruling 7): listed first and shown
 *  first; its line is 1; each point it draws rests on a block of one of the
 *  account's events; today's figure is the card's health factor; where the
 *  card states "Liquidates at", that asset's level today is the card's. */
async function checkHealth(page, tag, pg, listedAll) {
  check(`${tag}: the picker lists the health factor first`, listedAll[0] === HEALTH, listedAll.join(","));
  if ((await page.locator("[data-flows-combined] [data-flow-chart-engine=lw]").count()) > 0)
    await checkHealthDotted(page, tag);
  // The tip names its series by its mark: the picker's accessible name.
  const heading = await page.$eval("[data-price-heading]", headingText).catch(() => "");
  check(
    `${tag}: the chart opens on the health factor, its line at 1`,
    heading.includes(`${HEALTH}`) && /Liquidates below(, explain)?\s*1\b/.test(heading),
    heading,
  );
  const u = new URL(`${BASE}${pg.path}`);
  const wallet = u.pathname.split("/").pop();
  const tl = await hostFetch(
    `${BASE}${pg.timeline ?? `/api/aave-v3/timeline?wallet=${wallet}&market=${u.searchParams.get("market")}&limit=1000`}`,
  ).then((r) => r.json());
  const blocks = new Set((tl.events ?? []).map((e) => e.blockNumber));
  const sl = page.locator(PRICE_STRIP).first();
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(200);
  const max = Number(await sl.getAttribute("aria-valuemax"));
  const read = () =>
    page.$eval("[data-price-readout]", (e) => ({
      block: e.getAttribute("data-price-block"),
      text: e.textContent ?? "",
      none: e.hasAttribute("data-price-none"),
    }));
  const end = await read();
  // The card's health factor: the headline's figure.
  const cardText = await page.$eval('[data-card-head="health-factor"]', (h) => h.textContent ?? "").catch(() => "");
  const card = cardText.match(/\d+\.\d+/g)?.pop() ?? null;
  if (card)
    check(
      `${tag}: today's health factor is the card's`,
      end.block === "" && end.text.trim() === card,
      `chart ${end.text} (block ${end.block}), card ${card}`,
    );
  const bad = [];
  for (const target of [Math.floor(max / 2), Math.max(0, max - 1)]) {
    await page.keyboard.press("Home");
    for (let i = 0; i < Math.floor(target / 4); i++) await page.keyboard.press("PageUp");
    for (let i = 0; i < target % 4; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const r = await read();
    if (!r.none && r.block !== "" && !blocks.has(Number(r.block))) bad.push(`${r.block}`);
  }
  check(`${tag}: each health point rests on an event's block`, bad.length === 0, bad.join(","));
  const liq = await page
    .$eval('[data-panel-row="liquidates-at"] dd', (d) => d.textContent?.trim() ?? "")
    .catch(() => null);
  const liqSym = await page
    .$eval(
      '[data-panel-row="liquidates-at"] dd [data-token-symbol], [data-panel-row="liquidates-at"] dd img',
      (i) => i.getAttribute("data-token-symbol") ?? i.getAttribute("alt"),
    )
    .catch(() => null);
  if (liq && liqSym) {
    const picker = page.locator("button[data-price-picker]");
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${liqSym}"]`).click();
    await sl.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(200);
    const v = await page.$eval("[data-liq-readout]", (e) => Number(e.getAttribute("data-liq-value"))).catch(() => null);
    // A level more than ten times under the day's price (a dust debt's) is
    // not drawn (ruling 15): then the chart has none where the card states one.
    const price = await page
      .$eval("[data-price-readout]", (e) => Number((e.textContent ?? "").replace(/[^\d.]/g, "")))
      .catch(() => null);
    const cardV = Number(
      liq
        .replace(/^[^$\d]*\$?/, "")
        .replace(/[^\d.KMB]/g, "")
        .replace(/K$/, "e3")
        .replace(/M$/, "e6"),
    );
    const dust = v == null && price != null && cardV > 0 && cardV < price / 10;
    check(
      `${tag}: ${liqSym}'s level today is the card's "Liquidates at"${dust ? " (a dust debt's: under a tenth of the price, not drawn)" : ""}`,
      dust || (v != null && liq.endsWith(formatLiquidationPrice(v))),
      `chart ${v} (${v != null ? formatLiquidationPrice(v) : "-"}), card ${liq}, price ${price}`,
    );
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${HEALTH}"]`).click();
  }
}

/** The health view has landed: the heading's picker names it. */
async function waitForHealth(page) {
  await page
    .waitForFunction(
      (h) =>
        document.querySelector("[data-price-heading] [data-price-picker]")?.getAttribute("aria-label")?.includes(h),
      HEALTH,
      { timeout: 120000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
}

/** An asset picked from the health view's list draws its liquidation level
 *  (ruling 15): at least one listed asset has a level drawn on its chart. */
async function checkPickedLevel(page, tag, listedAll) {
  const picker = page.locator("button[data-price-picker]");
  const drawn = [];
  for (const sym of listedAll.filter((s) => s !== HEALTH)) {
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${sym}"]`).click();
    await page.waitForTimeout(250);
    const days = await page.$$eval("[data-liq-level]", (ls) =>
      ls.reduce((n, l) => n + (l.getAttribute("data-liq-days") ?? "").split(",").filter(Boolean).length, 0),
    );
    if (days > 0) drawn.push(`${sym} ${days}`);
  }
  check(`${tag}: an asset picked from the list draws its level`, drawn.length > 0, drawn.join(", ") || "none");
  await picker.click();
  await page.locator(`[role="listbox"] [data-price-asset="${HEALTH}"]`).click();
  await page.waitForTimeout(250);
}

/** The health checks on a page the price checks do not read (`lwOnly`): its
 *  tip's level toggle, the list, the health checks and a
 *  picked asset's level. */
async function checkHealthAlone(page, tag, pg) {
  await checkLevelToggle(page, tag);
  const picker = page.locator("button[data-price-picker]");
  let listedAll = [];
  if ((await picker.count()) > 0) {
    await picker.click();
    await page.waitForSelector('[role="listbox"] [data-price-asset]', { timeout: 5000 }).catch(() => {});
    listedAll = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
    await page.keyboard.press("Escape");
  }
  await checkHealth(page, tag, pg, listedAll);
  if (!pg.noLevel) await checkPickedLevel(page, tag, listedAll);
}

/** The price tip's level line: hidden until the triangle toggle is pressed,
 *  the chart's level line drawn either way. Leaves the level shown, for the
 *  readout checks that follow. */
async function checkLevelToggle(page, tag) {
  const toggle = page.locator("[data-flow-level-toggle]");
  if (!check(`${tag}: the price tip has the level toggle`, (await toggle.count()) === 1)) return;
  const state = () =>
    page.evaluate(() => ({
      pressed: document.querySelector("[data-flow-level-toggle]")?.getAttribute("aria-pressed"),
      readout: !!document.querySelector("[data-liq-readout]"),
      lines: document.querySelectorAll("[data-liq-level]").length,
    }));
  const off = await state();
  await toggle.click();
  await page.waitForTimeout(150);
  const on = await state();
  check(
    `${tag}: the level line is hidden until the toggle shows it; the chart's level line stays`,
    off.pressed === "false" &&
      !off.readout &&
      on.pressed === "true" &&
      on.readout &&
      off.lines > 0 &&
      on.lines === off.lines,
    `off ${JSON.stringify(off)}, on ${JSON.stringify(on)}`,
  );
}

/** The date tip's chevron: opens the day's events in a list of one height,
 *  which stays open while the steps move the cursor. */
async function checkEventsToggle(page, tag) {
  const toggle = page.locator("[data-flow-events-toggle]");
  if (!check(`${tag}: the date tip has the events chevron`, (await toggle.count()) === 1)) return;
  const state = () =>
    page.evaluate(() => {
      const list = document.querySelector("[data-flow-pip-tip]");
      return {
        expanded: document.querySelector("[data-flow-events-toggle]")?.getAttribute("aria-expanded"),
        h: list ? Math.round(list.getBoundingClientRect().height) : null,
        items: list ? list.querySelectorAll("li").length : null,
        none: !!list?.querySelector("[data-flow-pip-none]"),
      };
    });
  const closed = await state();
  await toggle.click();
  await page.waitForTimeout(150);
  const seen = [await state()];
  await page.locator("[data-flow-jump=start]").click();
  for (let i = 0; i < 4; i++) {
    await page.locator('[aria-label="Next event"]').click();
    await page.waitForTimeout(100);
    seen.push(await state());
  }
  const heights = new Set(seen.map((s) => s.h));
  check(
    `${tag}: the chevron opens the day's events at one height, open while stepping`,
    closed.expanded === "false" &&
      closed.h == null &&
      seen.every((s) => s.expanded === "true" && s.h > 0 && (s.items > 0 || s.none)) &&
      heights.size === 1 &&
      seen.some((s) => s.items > 0),
    seen.map((s) => `${s.items ?? "-"}${s.none ? " none" : ""} @${s.h}px`).join(", "),
  );
  await page.locator("[data-flow-jump=end]").click();
  await toggle.click();
  await page.waitForTimeout(100);
}

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
  if (kind.endsWith("/flows")) {
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

/** No marks on the price line, and the level's days against the Trove's rows. */
async function checkTroveMarks(page, tag, pg, rows) {
  const marks = await page.$$eval("[data-price-event], [data-redemption-mark]", (cs) => cs.length);
  check(`${tag}: the price line carries no event or redemption marks`, marks === 0, `${marks} marks`);
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
  if (pg.trove === "liquidated" || pg.trove === "closed") {
    // A closed position's chart ends at the close (ruling 14): the last stop
    // reads the close day, plain, under "At close", and the line draws no day
    // after it.
    const liqDay = Math.floor(
      (pg.trove === "liquidated" ? rows.find((r) => r.liquidation) : rows[rows.length - 1]).ts / DAY,
    );
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
        heading: document.querySelector("[data-flow-date]")?.textContent ?? "",
      };
    });
    check(
      `${tag}: at the last stop the panel reads "At close" on the close day`,
      close.heading.startsWith("At close, ") && dayOfWord(close.heading.slice("At close, ".length)) === liqDay,
      `${close.heading}; close ${liqDay}`,
    );
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

/** Under 640px a timeline card's "View on chart" stands in its caption,
 *  beside the date, a 36px target: a tap moves the chart's cursor to that
 *  day and leaves the card closed. */
async function checkPhoneDayMark(page, tag) {
  const btn = page.locator("[data-flow-day-mark-phone] [data-flow-day-move]").nth(1);
  if (!check(`${tag}: 390, the captions carry "View on chart"`, (await btn.count()) > 0)) return;
  await btn.scrollIntoViewIfNeeded();
  const want = await btn.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + 3);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: hit != null && b.contains(hit),
      day: Number(b.closest("[data-flow-day-mark-phone]").getAttribute("data-flow-day-mark-phone")),
    };
  });
  check(
    `${tag}: 390, the caption's chart button is a 36px target, its top edge its own`,
    want.w === 36 && want.h === 36 && want.top,
    JSON.stringify(want),
  );
  const opened = () => page.locator('[data-anatomy="T2"]').count();
  const before = await opened();
  await btn.tap();
  await page.waitForTimeout(600);
  const heading = (await page.locator("[data-flow-date]").first().textContent()) ?? "";
  check(
    `${tag}: 390, a tap on it moves the chart's cursor to that day, the card left closed`,
    dayOfWord(heading) === want.day && (await opened()) === before,
    `heading "${heading}", day ${want.day}, cards open ${before} → ${await opened()}`,
  );
}

/** The chart's cursor and window as its data hooks state them. */
const lwState = (page) =>
  page.evaluate(() => {
    const w = document.querySelector("[data-flows-combined] [data-flow-chart-engine=lw]");
    const sl = document.querySelector('[data-flows-combined] [data-flow-strip-view="chart"]');
    const x = w?.getAttribute("data-flow-lw-cursor-x") ?? "";
    return {
      x: x === "" ? null : Number(x),
      plotW: Number(w?.getAttribute("data-flow-lw-plot-w") || 0),
      from: Number(w?.getAttribute("data-flow-lw-from")),
      to: Number(w?.getAttribute("data-flow-lw-to")),
      now: Number(sl?.getAttribute("aria-valuenow")),
      max: Number(sl?.getAttribute("aria-valuemax")),
      frozen: document.querySelector("[data-flows-combined][data-flow-frozen]") != null,
    };
  });
const atRight = (s) => s.x != null && s.plotW > 0 && s.x >= s.plotW - 4 && s.x <= s.plotW + 1;
const inPlot = (s) => s.x != null && s.plotW > 0 && s.x >= 0 && s.x <= s.plotW + 1;
const lwShow = (s) => `x ${s.x} of ${s.plotW}, stop ${s.now}/${s.max}${s.frozen ? ", frozen" : ""}`;

/** On open (ui-jobs 328 step 4c, the phone's clipped chart): the chart fits
 *  the panel with no page overflow, its window covers the whole life, the
 *  cursor stands on the last stop at the plot's right end, and the events row
 *  spreads its pips over the plot. A day's close inside a grid cell (a cell
 *  longer than a day, a phone's width) once read x 0. */
async function checkLwOpen(page, tag, priceOnly = false) {
  // The value line's hook, once the line is drawn (a model rebuilt over more
  // of the life sets it again).
  if (!priceOnly)
    await page
      .waitForFunction(
        () =>
          document.querySelector("[data-flows-combined] [data-flow-value-line]")?.getAttribute("data-flow-value-line"),
        null,
        { timeout: 30000 },
      )
      .catch(() => {});
  const r = await page.evaluate((priceOnly) => {
    const w = document.querySelector("[data-flows-combined] [data-flow-chart-engine=lw]");
    const panel = w.closest("[data-flows-combined]").getBoundingClientRect();
    const box = w.querySelector("[data-flow-lw-box]").getBoundingClientRect();
    const canv = [...w.querySelectorAll("[data-flow-lw-box] canvas")].map((c) => c.getBoundingClientRect());
    const line = w.querySelector("[data-flow-value-line]")?.getAttribute("data-flow-value-line") ?? "";
    // The price chart alone: its observed days' closes.
    const price = w.querySelector("[data-price-line]");
    const ts = priceOnly
      ? ["data-price-observed", "data-price-carried"].flatMap((a) =>
          (price?.getAttribute(a) ?? "")
            .split(",")
            .filter(Boolean)
            .map((d) => (Number(d) + 1) * 86400),
        )
      : line
          .split(/[|,]/)
          .map((p) => Number(p.split(":")[0]))
          .filter((t) => Number.isFinite(t) && t > 0);
    return {
      fits:
        box.left >= panel.left - 1 &&
        box.right <= panel.right + 1 &&
        canv.length > 0 &&
        canv.every((c) => c.left >= box.left - 1 && c.right <= box.right + 1),
      sizes: `panel ${Math.round(panel.left)}–${Math.round(panel.right)}, box ${Math.round(box.left)}–${Math.round(box.right)}`,
      overflow: document.documentElement.scrollWidth - innerWidth,
      first: ts.length ? Math.min(...ts) : 0,
      last: ts.length ? Math.max(...ts) : 0,
      pips: [...document.querySelectorAll("[data-flows-combined] [data-flow-pip]")].map((p) =>
        parseFloat(p.style.left),
      ),
    };
  }, priceOnly);
  check(
    `${tag}: the chart fits the panel, no page overflow`,
    r.fits && r.overflow <= 0,
    `${r.sizes}, overflow ${r.overflow}`,
  );
  const s = await lwState(page);
  check(
    `${tag}: the window on open covers the whole life`,
    s.from <= r.first && s.to >= r.last,
    `window ${new Date(s.from * 1000).toISOString().slice(0, 10)}–${new Date(s.to * 1000).toISOString().slice(0, 10)}, life ${new Date(r.first * 1000).toISOString().slice(0, 10)}–${new Date(r.last * 1000).toISOString().slice(0, 10)}`,
  );
  check(
    `${tag}: on open the cursor stands on the last stop, at the plot's right end`,
    s.now === s.max && atRight(s),
    lwShow(s),
  );
  if (priceOnly) return;
  check(
    `${tag}: the events row spreads its pips over the plot`,
    r.pips.length > 1 && r.pips.every((x) => x >= -1 && x <= s.plotW + 1) && r.pips.filter((x) => x <= 1).length <= 1,
    `${r.pips.length} pips, ${r.pips.filter((x) => x <= 1).length} at x 0`,
  );
}

/** The wheel on a position page (Miles, 26 Oct 2026): over the chart it
 *  scrolls the page and leaves the window; Ctrl with the wheel (a trackpad's
 *  pinch arrives so) zooms about the pointer and leaves the page; a sideways
 *  swipe pans the zoomed window. Desktop only: a phone has no wheel. */
async function checkLwWheel(page, tag) {
  await page
    .locator('[data-flows-combined] [data-flow-range="All"]')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(600);
  const box = page.locator("[data-flows-combined] [data-flow-lw-box]").first();
  // The chart in the viewport's upper half, so the page has room to scroll.
  const place = async () => {
    await box.evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 160));
    await page.waitForTimeout(300);
  };
  await place();
  const over = async () => {
    const b = await box.boundingBox();
    await page.mouse.move(b.x + b.width * 0.5, b.y + Math.min(40, b.height / 3));
  };
  const at = async () => ({ y: await page.evaluate(() => window.scrollY), ...(await lwState(page)) });
  await over();
  const a = await at();
  // A short page (a one-day life) may have no room left below: the wheel
  // scrolls it up instead.
  const down = await page.evaluate(() => window.scrollY + innerHeight < document.documentElement.scrollHeight - 2);
  await page.mouse.wheel(0, down ? 240 : -240);
  await page.waitForTimeout(700);
  const b = await at();
  check(
    `${tag}: the wheel over the chart scrolls the page and leaves the window`,
    (down ? b.y > a.y : b.y < a.y) && b.from === a.from && b.to === a.to,
    `scroll ${a.y} → ${b.y}, window ${a.to - a.from} → ${b.to - b.from} s`,
  );
  // The wheel moved the chart up the viewport: back under the pointer.
  await place();
  await over();
  const c = await at();
  await page.keyboard.down("Control");
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(40);
  }
  await page.keyboard.up("Control");
  await page.waitForTimeout(900);
  const d = await at();
  check(
    `${tag}: Ctrl with the wheel zooms the chart and leaves the page`,
    d.y === c.y && d.to - d.from < (c.to - c.from) * 0.9,
    `scroll ${c.y} → ${d.y}, window ${c.to - c.from} → ${d.to - d.from} s`,
  );
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(-120, 0);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(900);
  const e = await at();
  check(
    `${tag}: a sideways swipe pans the zoomed window and leaves the page`,
    e.y === d.y && e.from < d.from && Math.abs(e.to - e.from - (d.to - d.from)) <= (d.to - d.from) * 0.05,
    `scroll ${d.y} → ${e.y}, from ${d.from} → ${e.from}`,
  );
  await page.locator('[data-flows-combined] [data-flow-range="All"]').first().click();
  await page.waitForTimeout(600);
}

/** The health view's older days (ruling 15): drawn as a second, dotted
 *  series, which meets the solid line on each day the two touch. */
async function checkHealthDotted(page, tag) {
  const h = await page.$eval("[data-price-line]", (g) => ({
    key: g.getAttribute("data-price-line"),
    dotted: (g.getAttribute("data-price-dotted") ?? "").split(",").filter(Boolean).length,
    meets: g.getAttribute("data-price-meets") ?? "",
  }));
  if (h.key !== "health" || h.dotted === 0) return;
  const [met, days] = h.meets.split("/").map(Number);
  check(
    `${tag}: the health view's older days are a dotted series that meets the solid one`,
    days > 0 && met === days,
    `${h.dotted} dotted vertices; meets ${h.meets}`,
  );
}

/** The price chart alone draws no steps: Home and End on its slider put the
 *  cursor on the first stop in the plot and the last at the right end. */
async function checkLwKeys(page, tag) {
  const sl = page.locator('[data-flows-combined] [data-flow-strip-view="chart"]').first();
  await sl.focus();
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  const a = await lwState(page);
  await page.keyboard.press("End");
  await page.waitForTimeout(400);
  const e = await lwState(page);
  check(
    `${tag}: Home puts the cursor on the first stop in the plot, End on the last at the right end`,
    a.now === 0 && inPlot(a) && a.x < e.x && e.now === e.max && atRight(e),
    `${lwShow(a)} → ${lwShow(e)}`,
  );
}

/** The steps (⏮ ‹ › ⏭), at All and zoomed to 30D, frozen and not: ⏭ puts the
 *  cursor on the last stop at the plot's right end and releases a freeze;
 *  every step leaves the cursor in the plot, in order. */
async function checkLwSteps(page, tag, touch) {
  const press = async (sel) => {
    await page.locator(`[data-flows-combined] ${sel}`).first().click();
    await page.waitForTimeout(500);
    return lwState(page);
  };
  const START = '[data-flow-jump="start"]';
  const END = '[data-flow-jump="end"]';
  const PREV = 'button[aria-label="Previous event"]';
  const NEXT = 'button[aria-label="Next event"]';
  const freeze = async () => {
    const sl = page.locator('[data-flows-combined] [data-flow-strip-view="chart"]').first();
    const b = await sl.boundingBox();
    const s = await lwState(page);
    const at = { x: Math.round(s.plotW * 0.5), y: Math.min(40, Math.round((b?.height ?? 80) / 3)) };
    if (touch) await sl.tap({ position: at });
    else await sl.click({ position: at });
    await page.waitForTimeout(500);
    return lwState(page);
  };
  // A page that ties the chart to its timeline (Sync to chart) freezes on a tap.
  const tied = (await page.locator("[data-flow-sync]").count()) > 0;
  const zooms =
    (await page.locator('[data-flows-combined] [data-flow-range="30D"]').count()) > 0 ? ["All", "30D"] : ["All"];
  for (const z of zooms) {
    if (z !== "All") await press(`[data-flow-range="${z}"]`);
    const t = `${tag} ${z}`;
    const a = await press(START);
    check(`${t}: ⏮ puts the cursor on the first stop, in the plot`, a.now === 0 && inPlot(a), lwShow(a));
    const b = await press(NEXT);
    check(`${t}: › moves the cursor right, in the plot`, b.now > a.now && inPlot(b) && b.x >= a.x, lwShow(b));
    const e = await press(END);
    check(
      `${t}: ⏭ puts the cursor on the last stop, at the plot's right end`,
      e.now === e.max && atRight(e),
      lwShow(e),
    );
    const p = await press(PREV);
    check(`${t}: ‹ moves the cursor left, in the plot`, p.now < e.now && inPlot(p) && p.x <= e.x, lwShow(p));
    const f = await freeze();
    const fe = await press(END);
    if (tied)
      check(
        `${t}: ⏭ from a frozen cursor releases it on the last stop, at the right end`,
        f.frozen && !fe.frozen && fe.now === fe.max && atRight(fe),
        `${lwShow(f)} → ${lwShow(fe)}`,
      );
    else
      check(
        `${t}: a tap moves the cursor without freezing it; ⏭ brings it to the right end`,
        !f.frozen && f.now < f.max && inPlot(f) && !fe.frozen && fe.now === fe.max && atRight(fe),
        `${lwShow(f)} → ${lwShow(fe)}`,
      );
  }
  if (zooms.length > 1) await press('[data-flow-range="All"]');
}

const browser = await chromium.launch();

for (const pg of PAGES.filter((p) => !only || only.test(p.id))) {
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
      if (!pg.answer || u.pathname !== pg.answer || !r.ok()) return;
      try {
        body = await r.json();
      } catch {}
    });
    await page.goto(`${BASE}${pg.path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page
      .waitForSelector("[data-flows-combined] [data-flow-strip] svg, [data-flows-combined] [data-flow-lw-box] canvas", {
        timeout: 180000,
      })
      .catch(() => {});
    // On the new engine, the canvas: the library loads after the panel, and
    // the panel's own icons are svgs too.
    if ((await page.locator("[data-flows-combined] [data-flow-chart-engine=lw]").count()) > 0)
      await page
        .waitForFunction(
          () =>
            document.querySelector("[data-flows-combined] [data-flow-lw-box] canvas") &&
            (document
              .querySelector("[data-flows-combined] [data-flow-value-line]")
              ?.getAttribute("data-flow-value-line") ||
              document.querySelector('[data-flows-combined="price"] [data-price-line]')),
          null,
          { timeout: 120000 },
        )
        .catch(() => {});
    await page.waitForTimeout(2500);
    // The health view lands once its position-state reads have, and redraws
    // the price pane: every check below waits for it.
    if (pg.health) await waitForHealth(page);
    // The drawn strips name their views; the chart names its panes.
    const views = await page.$$eval("[data-flows-combined] [data-flow-strip]", (els) =>
      els.flatMap((e) =>
        e.getAttribute("data-flow-strip-view") === "chart"
          ? (e.querySelector("[data-flow-chart-panes]")?.getAttribute("data-flow-chart-panes") ?? "").split(",")
          : [e.getAttribute("data-flow-strip-view")],
      ),
    );
    const panes = pg.panes ?? "value,price";
    if (!check(`${tag}: the chart's panes stand stacked (${panes})`, views.join() === panes, views.join())) {
      await ctx.close();
      continue;
    }
    const lw = (await page.locator("[data-flows-combined] [data-flow-chart-engine=lw]").count()) > 0;
    if (lw) {
      // The attribution is the site footer's (Miles, 26 Oct 2026): no logo
      // or notice on the chart.
      const drawn = await page.evaluate(() => ({
        canvases: document.querySelectorAll("[data-flow-lw-box] canvas").length,
        notice: document.querySelector("[data-flows-combined] [data-flow-lw-notice]") != null,
        logo: document.querySelector('[data-flow-lw-box] a[href*="tradingview"]') != null,
      }));
      check(
        `${tag}: the chart draws on Lightweight Charts with its time axis, no logo or notice on it`,
        drawn.canvases > 0 && !drawn.notice && !drawn.logo,
        JSON.stringify(drawn),
      );
      await page.locator("[data-flows-combined] [data-flow-chart-engine=lw]").scrollIntoViewIfNeeded();
      await checkLwOpen(page, tag, pg.priceOnly);
    }
    if (pg.lwOnly) {
      if (!check(`${tag}: the chart draws on Lightweight Charts`, lw)) {
        await ctx.close();
        continue;
      }
      if (pg.priceOnly) await checkLwKeys(page, tag);
      else await checkLwSteps(page, tag, width < 640);
      if (width >= 640) await checkLwWheel(page, tag);
      if (pg.health) await checkHealthAlone(page, tag, pg);
      check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
      await ctx.close();
      continue;
    }
    const PRICE = PRICE_STRIP;
    await page.locator(PRICE).scrollIntoViewIfNeeded();
    if (!body) {
      // The answer was read before the listener saw it: read it as the page does.
      const u = new URL(`${BASE}${pg.path}`);
      const q =
        pg.query ??
        (pg.answer === "/api/aave-v3/flows"
          ? `wallet=${u.pathname.split("/").pop()}&market=${u.searchParams.get("market")}`
          : `collateralType=${u.pathname.split("/")[4]}`);
      body = await hostFetch(`${BASE}${pg.answer}?${q}`).then((r) => r.json());
    }
    const series = answerSeries(pg.answer, body, pg.path.split("/")[4]);

    // The value line as drawn: the strip's paths, or the chart's hook.
    const valueLine = () =>
      page.evaluate(
        () =>
          document
            .querySelector("[data-flows-combined] [data-flow-value-line]")
            ?.getAttribute("data-flow-value-line") ??
          [...document.querySelectorAll('[data-flows-combined] [data-flow-strip-view="value"] svg path')]
            .map((p) => p.getAttribute("d"))
            .join("|"),
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
    // The tip's toggles, once the series the chart opens on has landed.
    // Only a page that draws a level has the toggle: the Aave family's
    // health view and the Troves; Aave V4 draws the price alone until its
    // step 5 pass, and a SparkLend page with no debt has no health view.
    if (pg.health || pg.trove) await checkLevelToggle(page, tag);
    await checkEventsToggle(page, tag);
    if ((await picker.count()) > 0) {
      await picker.click();
      await page.waitForSelector('[role="listbox"] [data-price-asset]', { timeout: 5000 }).catch(() => {});
    }
    const listedAll = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
    if ((await picker.count()) > 0) await page.keyboard.press("Escape");
    // The health view (Aave V3, ruling 7) is listed first; the assets follow.
    const listed = listedAll.filter((s) => s !== HEALTH);
    if (pg.health) {
      await checkHealth(page, tag, pg, listedAll);
      if (!pg.noLevel) await checkPickedLevel(page, tag, listedAll);
    }
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

    // Each listed asset: the drawn days against the answer, and the charts'
    // how-to-read naming the series.
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
      const inRange = (d) => pg.answer.endsWith("/flows") || (d >= lo && d <= hi);
      const extra = drawn.observed.filter((d) => inRange(d) && !obs.has(d));
      const wrong = drawn.carried.filter((d) => inRange(d) && obs.has(d));
      check(
        `${tag} ${sym}: every day drawn observed is in the answer, none drawn carried is`,
        drawn.observed.length > 0 && extra.length === 0 && wrong.length === 0,
        `${drawn.observed.length} observed, ${drawn.carried.length} carried; extra ${extra.slice(0, 3)}; carried but answered ${wrong.slice(0, 3)}`,
      );
      await page.locator('[data-flow-help="F7.1"] button').click();
      const help = await page
        .locator('[role="dialog"][aria-label="How to read the events and charts"]')
        .textContent({ timeout: 5000 })
        .catch(() => "");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      check(`${tag} ${sym}: the charts' how-to-read names the series`, help?.includes(`The ${sym} price`), help ?? "");
    }
    // Back to the first asset for the stops.
    await pick(listed[0]);
    const rows = pg.trove ? await troveRows(pg.path) : null;
    if (rows) await checkTroveMarks(page, tag, pg, rows);
    const obs0 = series.get(listed[0]) ?? new Map();

    // Three stops: the opening, the middle and the day before today; the
    // price strip focused, which shows its readout as the cursor's tip.
    // The value line as the stops find it: read here, after the asset picks
    // and the health view's late reads, so the check below is about the
    // stops alone (on 0xfb93 the line read at load is not the line the stops
    // find, 23 Oct 2026, so the load-time read tested the picks and the late
    // reads along with them).
    const lineBeforeStops = await valueLine();
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
        !pg.answer.endsWith("/flows") &&
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
    if (lw) await checkLwSteps(page, tag, width < 640);
    if (lw && width >= 640) await checkLwWheel(page, tag);

    // The value line is the one it was: the stops moved the cursor only.
    await sl.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    check(
      `${tag}: the value line is unchanged by the stops`,
      (await valueLine()) === lineBeforeStops && lineBeforeStops.length > 0,
    );
    if (pg.trove && width < 640) await checkPhoneDayMark(page, tag);
    check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures === 0 && checked > 0 ? 0 : 1);
