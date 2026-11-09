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
// family's market rosters, market pages and reserve pages.
//
// Run:  npm run verify:preflight -- --warm <the pages>
//       BASE=http://localhost:3078 node scripts/verify/verify-section-scopes.mjs
//       PAGES=/base/morpho/vaults,/ethereum/yearn/vaults  (a subset)

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

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
];
const PAGES = process.env.PAGES ? process.env.PAGES.split(",").map((p) => p.trim()) : ALL_PAGES;

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
  const tag = path.replace(/0x([0-9a-f]{6})[0-9a-f]{34}/, "0x$1…");

  if (!check(`${tag}: the page answers`, status === 200, String(status))) {
    await ctx.close();
    continue;
  }

  // a — no page-wide toggle.
  const toggles = await page.locator("button.prov-inspect-toggle:not(.prov-inspect-toggle-menu)").count();
  check(`${tag} a: no page-wide inspect toggle`, toggles === 0, `${toggles} on the page`);

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
  check(
    `${tag} b: every traced value sits inside a section scope`,
    tally.total > 0 && tally.orphans.length === 0,
    tally.orphans.length
      ? `${tally.orphans.length} outside: ${tally.orphans.slice(0, 4).join(" | ")}`
      : `${tally.total} values in ${tally.scopes.join(", ")}`,
  );

  for (const scope of tally.scopes) {
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
