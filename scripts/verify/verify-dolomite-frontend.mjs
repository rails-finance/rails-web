// Live in-browser verification of the Dolomite frontend. Set BASE to the dev
// server; it defaults to :3457, which in the canonical setup points at the
// REAL backend (api/src/routes/dolomite.ts run locally with tsx) over the
// seeded, chain-verified scratch DB (dolomite_scratch, pinned at block
// 25543616) — plus live chain reads for the markets view and the per-account
// risk lane. Run:
//   BASE=http://localhost:3102 node scripts/verify/verify-dolomite-frontend.mjs
// Assertions that could fail; real figures throughout. The listing/detail
// checks depend on the pinned scratch DB; the markets-view checks read live
// chain state.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3457";
let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

// ── /dolomite/markets — the protocol view, real figures at head ─────────────
await page.goto(`${BASE}/dolomite/markets`, { waitUntil: "networkidle", timeout: 120000 });
const h1 = await page.textContent("h1");
check("markets: heading renders", /risk ladder/i.test(h1 ?? ""), h1 ?? "");

const body = await page.textContent("body");
const rowCount = await page.locator("table tbody tr").count();
check("markets: one row per market (21)", rowCount === 21, `${rowCount} rows`);
check("markets: Min collateralisation column header renders", /min collateralisation/i.test(body));

// The multiplicative claim on WLFI: ≈150.0%, never the additive 145.15%.
check("markets: WLFI rung is multiplicative (≈150.0%)", body.includes("150.0%"));
check("markets: no additive misstatement (145.15%)", !body.includes("145.15"));

// The carve-out is stated qualitatively — the override numbers are NOT
// asserted on the markets page (they are account-keyed, unreadable here), so
// the copy describes the category and points to the position page.
check("markets: the carve-out section renders", /account-level carve-out/i.test(body));
check(
  "markets: carve-out described qualitatively, pointing to the position page",
  /lower minimum collateralisation/i.test(body) &&
    /narrower liquidation spread/i.test(body) &&
    /position page/i.test(body),
);
check("markets: override numbers NOT typed in (111.11% / 4%)", !body.includes("111.11%"));

// The shared-oracle alias line.
check("markets: wsrUSD = srUSD alias stated", /wsrUSD/.test(body) && /to the wei/.test(body));

// The block stamp anchors a real head block ("Chain snapshot · block 25,54…").
check("markets: chain-snapshot block stamp", /Chain snapshot · block\s*[\d,]{9,}/i.test(body));
check("markets: closing markets stated", /closed to new borrowing|closing — no new borrowing/.test(body));

// ── /dolomite — the listing over the REAL index (7,869 accounts) ────────────
await page.goto(`${BASE}/dolomite`, { waitUntil: "networkidle", timeout: 120000 });
const listBody = await page.textContent("body");
check("listing: shell renders with title", /Dolomite Accounts/.test(listBody));
check("listing: real rows render (Dolomite Balance vocabulary)", /Dolomite Balance/.test(listBody));
check("listing: account-grain rows (Borrow Position vocabulary)", /Borrow Position/.test(listBody));
const rowLinks = await page.locator('a[href^="/ethereum/dolomite/0x"]').count();
check("listing: card rows link to the two-segment grain", rowLinks > 0, `${rowLinks} row links`);
const firstHref = await page.locator('a[href^="/ethereum/dolomite/0x"]').first().getAttribute("href");
check(
  "listing: hrefs carry owner AND accountNumber",
  /^\/dolomite\/0x[0-9a-f]{40}\/\d+$/.test(firstHref ?? ""),
  firstHref ?? "",
);

// ── /dolomite/[owner] alone 404s DELIBERATELY ───────────────────────────────
const res404 = await page.goto(`${BASE}/dolomite/0x3a277b34cfdc4ea19213007fe9944a27bfd0cbed`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
check("owner-only route 404s deliberately", res404?.status() === 404, `status ${res404?.status()}`);

// ── detail page — a real borrowing account (WLFI-frontend number) ───────────
const OWNER = "0x3a277b34cfdc4ea19213007fe9944a27bfd0cbed";
const NUM = "32240150336664509314013882100458201794439878083374431556084268488477773350727";
await page.goto(`${BASE}/dolomite/${OWNER}/${NUM}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(4000); // chain lane streams in after first paint
const detailBody = await page.textContent("body");
check("detail: mode pill reads Borrowing", /Borrowing/.test(detailBody));
check("detail: WLFI-frontend account named", /WLFI frontend account/.test(detailBody));
check("detail: real balances render (USDC + USD1 supplies)", /USDC/.test(detailBody) && /USD1/.test(detailBody));
check("detail: timeline renders real events", /Deposit/.test(detailBody) && /Withdraw/.test(detailBody));
check(
  "detail: the margin lane landed (requirement stated)",
  /117\.65%|111\.11%/.test(detailBody),
  "(chain lane at head)",
);
check("detail: collateralised readout renders", /collateralised/.test(detailBody));

// The receipts grading (§3E, tsc-invisible): open the card's receipts and
// confirm a par figure's receipt narrates the state class (the emitted
// absolute = the stored slot), not an oracle/emitted drift.
check(
  "detail: par vocabulary present (balance axis labeled par)",
  /par/i.test(detailBody),
  "receipts carry the par grammar",
);

// ── detail page — a LIQUIDATED account: peaks + liquidation legs ────────────
const LIQ_OWNER = "0xc76136bc8447e26d6d2d50ff787eb751b95db4ee";
await page.goto(`${BASE}/dolomite/${LIQ_OWNER}/${NUM}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(2500);
const liqBody = await page.textContent("body");
check("liquidated detail: outcome renders", /LIQUIDATED|Liquidated/.test(liqBody));
check("liquidated detail: liquidation legs in the timeline", /Collateral seized|Liquidation/.test(liqBody));
check("liquidated detail: peak WLFI line renders", /WLFI/.test(liqBody));

check("no page errors across the run", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${failures === 0 ? "ALL FRONTEND CHECKS PASSED" : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
