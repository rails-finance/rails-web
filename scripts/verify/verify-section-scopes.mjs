// Every traced value on a product page is reachable from a section ⋮
// (rails-ops TO-DO-ui-jobs 549/550, proposal §3 and §4).
// ---------------------------------------------------------------------------
// The page-wide inspector toggle (H12's crosshair) is gone from these pages,
// so a value's one route to its receipt is the "Inspect provenance" row of the
// ⋮ on the section it sits in. For each page this asserts:
//
//   a  the page mounts no page-wide toggle (`button.prov-inspect-toggle`
//      outside a menu);
//   b  every scoped <Prov> (`.prov-locate-box`) sits inside a
//      `[data-prov-scope]` section, and there is at least one;
//   c  every such section holds a ⋮ whose menu carries
//      `[data-prov-scope-toggle="<its scope>"]` reading "Inspect provenance";
//   d  arming from that row rings that section alone (`[data-prov-lit]` on it
//      and nowhere else), its values are pickable and no value outside it is.
//
// Pages: the Morpho Base case-study vault, a Morpho Ethereum vault, the three
// Aave vault families, a Yearn vault, the four family rosters, and the Aave
// family's market rosters, market pages and reserve pages, Dolomite's
// markets page, f(x)'s pools roster and a pool's page, and Compound V3's
// markets roster and a Comet's page on each chain, and Compound V2's and
// Moonwell's markets pages with one market's page each, Maple's pools roster
// and a pool's page, and a page per family with "Supplied by vaults" (the
// Morpho market page, not yet on the shells, is held to that section alone).
//
// Run:  npm run verify:preflight -- --warm <the pages>
//       BASE=http://localhost:3078 node scripts/verify/verify-section-scopes.mjs
//       PAGES=/base/morpho/vaults,/ethereum/yearn/vaults  (a subset)

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const USDC_CORE = "/ethereum/aave-v3/markets/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const MORPHO_BASE_MARKET =
  "/base/morpho/markets/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913/0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836";
const MORPHO_ETHEREUM_MARKET =
  "/ethereum/morpho/markets/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48/0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc";
const MORPHO_ARBITRUM_MARKET =
  "/arbitrum/morpho/markets/0xaf88d065e77c8cc2239327c5edb3a432268e5831/0x5dd281933e74e576825deda2f28764f1ad3818faa485cbefc808bef0fc1518e5";

const ALL_PAGES = [
  "/base/morpho/vaults/0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2",
  "/ethereum/morpho/vaults/0xbeef01735c132ada46aa9aa4c54623caa92a64cb",
  // Savings GHO, a static aToken (waUSDC), an Umbrella stake token (stkwaUSDC).
  "/ethereum/aave/vaults/0xe1753f2e00940cc31213dd92013cf019dfe4ca1d",
  "/ethereum/aave/vaults/0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
  "/ethereum/aave/vaults/0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
  "/ethereum/yearn/vaults/0x310b7ea7475a0b449cfd73be81522f1b88efafaa",
  "/base/morpho/vaults",
  "/ethereum/morpho/vaults",
  "/ethereum/aave/vaults",
  "/ethereum/yearn/vaults",
  // The Aave family's market pages (A1, A2) and reserve pages (A3): the
  // Ethereum roster, Core's page, and a reserve on each chain and on SparkLend.
  "/ethereum/aave-v3/markets",
  "/ethereum/aave-v3/markets?market=core",
  "/base/aave-v3/markets",
  "/arbitrum/aave-v3/markets",
  "/ethereum/spark/markets",
  "/base/seamless/markets",
  "/ethereum/aave-v3/markets/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "/base/aave-v3/markets/0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
  "/arbitrum/aave-v3/markets/0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  "/ethereum/spark/markets/0x6b175474e89094c44da98b954eedeac495271d0f",
  // Dolomite's one pool on the A2 shell: its head and its markets table.
  "/ethereum/dolomite/markets",
  // f(x)'s pools roster (A1) and a pool's page (A2): the head and its six
  // sections, each with its own ⋮.
  "/ethereum/fx/pools",
  "/ethereum/fx/pools/wsteth",
  // Compound V3's markets roster (A1) on each chain and a Comet's page (A2):
  // the head and its collateral, each with its own ⋮.
  "/ethereum/compound-v3/markets",
  "/ethereum/compound-v3/markets/usdc",
  "/base/compound-v3/markets",
  "/base/compound-v3/markets/weth",
  "/arbitrum/compound-v3/markets",
  "/arbitrum/compound-v3/markets/usdc",
  // The Comptroller family's one-market explorers (R2) and a market's page
  // (R3) on each: Compound V2's USDC, Moonwell's USDC on Ethereum and Base.
  "/ethereum/compound-v2/markets",
  "/ethereum/compound-v2/markets/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "/ethereum/moonwell/markets",
  "/ethereum/moonwell/markets/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "/base/moonwell/markets",
  "/base/moonwell/markets/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  // Maple's pools roster, one ⋮ per pool card, and a pool's page on the vault
  // grammar (ui-jobs 549 step 4).
  "/ethereum/maple/pools",
  "/ethereum/maple/pools/syrupusdc",
  // "Supplied by vaults" (ui-jobs 549 step 4), one page per family: Aave V3
  // Core's USDC reserve, and a Morpho Blue market on Base.
  USDC_CORE,
  MORPHO_BASE_MARKET,
  // Morpho Blue's market page on Ethereum and Arbitrum (Base's is above).
  MORPHO_ETHEREUM_MARKET,
  MORPHO_ARBITRUM_MARKET,
];
const PAGES = process.env.PAGES ? process.env.PAGES.split(",").map((p) => p.trim()) : ALL_PAGES;

/** A page that must draw a section, waited for before the checks: the Aave
 *  reserve page reads its vaults after its head. */
const MUST_DRAW = {
  [USDC_CORE]: "supplied-by-vaults",
  [MORPHO_BASE_MARKET]: "supplied-by-vaults",
  [MORPHO_ETHEREUM_MARKET]: "supplied-by-vaults",
};
/** A page where only these sections are held to c and d, a and b waiting for
 *  its migration. None now; kept for the next page that needs it. */
const ONLY_SCOPES = {};

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/** A section's ⋮ triggers: a `SectionMenu`'s, or the position card's (C17). */
const MENU_TRIGGERS = "[data-section-menu] button[aria-haspopup], [data-card-menu] > button[aria-haspopup]";

const browser = await chromium.launch();

for (const path of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, extraHTTPHeaders: bypassHeaders() });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch((e) => e);
  const status = res && typeof res.status === "function" ? res.status() : String(res);
  // Hydration: the ⋮ answers a press only once React has attached.
  await page.waitForSelector(".prov-locate-box", { timeout: 120_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const must = MUST_DRAW[path];
  if (must) await page.waitForSelector(`[data-prov-scope="${must}"]`, { timeout: 120_000 }).catch(() => {});
  const only = ONLY_SCOPES[path];
  const tag = path.replace(/0x([0-9a-f]{6})[0-9a-f]{34}/, "0x$1…");

  if (!check(`${tag}: the page answers`, status === 200, String(status))) {
    await ctx.close();
    continue;
  }

  if (must)
    check(
      `${tag}: draws "${must}"`,
      (await page.locator(`[data-prov-scope="${must}"]`).count()) > 0,
      "the section is not on the page",
    );

  // a — no page-wide toggle.
  const toggles = await page.locator("button.prov-inspect-toggle:not(.prov-inspect-toggle-menu)").count();
  if (!only) check(`${tag} a: no page-wide inspect toggle`, toggles === 0, `${toggles} on the page`);

  // b — every traced value sits in a section scope.
  const tally = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".prov-locate-box")];
    const orphans = boxes
      .filter((b) => !b.closest("[data-prov-scope]"))
      .map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40));
    const scopes = [
      ...new Set(boxes.map((b) => b.closest("[data-prov-scope]")?.getAttribute("data-prov-scope")).filter(Boolean)),
    ];
    return { total: boxes.length, orphans, scopes };
  });
  if (!only)
    check(
      `${tag} b: every traced value sits inside a section scope`,
      tally.total > 0 && tally.orphans.length === 0,
      tally.orphans.length
        ? `${tally.orphans.length} outside: ${tally.orphans.slice(0, 4).join(" | ")}`
        : `${tally.total} values in ${tally.scopes.join(", ")}`,
    );

  for (const scope of only ?? tally.scopes) {
    const section = page.locator(`[data-prov-scope="${scope}"]`).first();
    const trigger = section.locator(MENU_TRIGGERS).first();
    const row = page.locator(`[data-prov-scope-toggle="${scope}"]`).first();
    // c — the section's ⋮ carries its Inspect provenance row.
    let rowText = "";
    if ((await trigger.count()) > 0) {
      for (let i = 0; i < 4 && !(await row.isVisible().catch(() => false)); i++) {
        await trigger.scrollIntoViewIfNeeded().catch(() => {});
        await trigger.click().catch(() => {});
        await page.waitForTimeout(500);
      }
      rowText = ((await row.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    }
    if (
      !check(
        `${tag} c: "${scope}" has a ⋮ with Inspect provenance on it`,
        /Inspect provenance/.test(rowText),
        rowText || ((await trigger.count()) ? "the ⋮ opened no row for this scope" : "no ⋮ in the section"),
      )
    )
      continue;

    // d — arming rings this section alone.
    await row.click();
    await page.waitForTimeout(600);
    const armed = await page.evaluate((s) => {
      const lit = [...document.querySelectorAll("[data-prov-lit]")].map((e) => e.getAttribute("data-prov-scope"));
      const picks = [...document.querySelectorAll("[data-prov-pickable]")];
      const inside = picks.filter((p) => p.closest("[data-prov-scope]")?.getAttribute("data-prov-scope") === s).length;
      return { lit, inside, outside: picks.length - inside, halo: !!document.querySelector(".prov-inspect-halo") };
    }, scope);
    check(
      `${tag} d: arming "${scope}" rings it alone and marks only its values`,
      armed.lit.length === 1 && armed.lit[0] === scope && armed.inside > 0 && armed.outside === 0 && !armed.halo,
      JSON.stringify(armed),
    );
    // Put the mode down: the first Escape closes any popover, the second disarms.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  check(`${tag}: no page error`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await ctx.close();
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures === 0 && checked > 0 ? 0 : 1);
