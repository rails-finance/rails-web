#!/usr/bin/env node
// Since rails-ops decision 0018 a position LISTING states no liquidation risk;
// the position page is the one place a health factor (or borrow capacity) is
// stated, from a live read of the protocol's contracts on every visit. That is
// a promise the listing verifier cannot check — it reads routes, and the risk
// strip is drawn in the browser after the live read lands. This script opens
// one open, indebted position on each of the seven lanes in a real browser and
// asserts the strip is there.
// ----------------------------------------------------------------------------
//   1  the listing offers an open row with debt (the fixture is derived from
//      the route, never pasted; a lane with no indebted open row is INFO);
//   2  the position page draws the risk strip: the "% from liquidation" figure
//      that every lane's runway prints from the live read;
//   3  the strip names its line — "Health factor" on the Aave family and Spark,
//      "Borrow capacity" on Compound V3, Moonwell and Morpho Blue;
//   4  the page carries no "could not be read" / "unavailable" wording, and the
//      browser logged no page error while drawing it. A React hydration
//      mismatch (#418 / #423) is reported as INFO, not FAIL: it was seen once
//      in three loads of the same Ethereum Aave V3 page on 2026-09-10 and is
//      timing-dependent (a relative "< 1 min ago" stamp rendered twice), so a
//      red here would flake; anything else the page throws is a FAIL.
//
// Per-lane row grammar (where the debt sits, and the page path). The fixture
// is the LARGEST debt on the page: a dust debt (0.004 USDe was the first row
// on Ethereum Aave V3 on 2026-09-10) renders "No debt" by the page's own rule.
//   aave-v3-base / seamless / aave-v3 : Σ reserves.debtBalanceRaw × price · wallet
//   spark / moonwell-base             : Σ borrows.amount × price · wallet
//   compound-base                     : −base.amount · account
//   morpho-base                       : borrowed.amount · owner / marketId
//
//   BASE=https://rails-web.vercel.app node scripts/verify/verify-position-page-risk-live.mjs
//
// ── PROVED IT CAN FAIL, 2026-09-10 ──────────────────────────────────────────
//   RUNWAY set to "from liquidationx" → FAIL 2 on all seven lanes. Picking the
//   FIRST indebted row instead of the largest → FAIL 2 on aave-v3 (the dust
//   wallet's page says "No debt"). Against production 2026-09-10 07:30 UTC:
//   28/28, one INFO (a hydration mismatch on the 139M-debt Aave V3 wallet, not
//   seen again on two reloads).

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3762";
const PAGE = 40;
/** The figure every lane's runway prints from the live read. */
const RUNWAY = "from liquidation";

/** A row's debt in the loan asset's USD (or its own units where the lane
 *  quotes no price), from the row's own balances and prices. The largest
 *  indebted row is the fixture: a dust debt renders "No debt" by the page's
 *  own rule and draws no strip, which is correct and not what this checks. */
const px = (r, a) => Number(r.priceByAddress?.[a?.toLowerCase()] ?? r.priceByAddress?.[a] ?? 0);
const aaveDebt = (r) =>
  (r.reserves ?? []).reduce(
    (s, x) => s + (Number(x.debtBalanceRaw ?? 0) / 10 ** (x.decimals ?? 18)) * px(r, x.address),
    0,
  );
const borrowsDebt = (r) => (r.borrows ?? []).reduce((s, x) => s + Number(x.amount ?? 0) * (px(r, x.address) || 1), 0);

const LANES = [
  { api: "aave-v3-base", line: "Health factor", debt: aaveDebt, path: (r) => `/base/aave-v3/${r.wallet}` },
  { api: "seamless", line: "Health factor", debt: aaveDebt, path: (r) => `/base/seamless/${r.wallet}` },
  { api: "moonwell-base", line: "Borrow capacity", debt: borrowsDebt, path: (r) => `/base/moonwell/${r.wallet}` },
  {
    api: "compound-base",
    line: "Borrow capacity",
    debt: (r) => Math.max(0, -Number(r.base?.amount ?? 0)),
    path: (r) => `/base/compound-v3/${r.account}`,
  },
  {
    api: "morpho-base",
    line: "Borrow capacity",
    debt: (r) => Number(r.borrowed?.amount ?? 0),
    path: (r) => `/base/morpho/${r.owner}/${r.marketId}`,
  },
  { api: "aave-v3", line: "Health factor", debt: aaveDebt, path: (r) => `/ethereum/aave-v3/${r.wallet}` },
  { api: "spark", line: "Health factor", debt: borrowsDebt, path: (r) => `/ethereum/spark/${r.wallet}` },
];
/** Below this the page may say "No debt" instead of drawing a strip. */
const DEBT_FLOOR = 1;

let passes = 0;
let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);

/** The open rows of one listing page, whatever envelope the lane answers in. */
async function openRows(api) {
  const res = await fetch(`${BASE}/api/${api}/positions?status=open&limit=${PAGE}`, { cache: "no-store" });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const body = await res.json();
  const rows = Array.isArray(body.rows) ? body.rows : Array.isArray(body.data) ? body.data : null;
  if (!rows) return { error: "no rows array in the answer" };
  return { rows: rows.filter((r) => r.status === "open") };
}

console.log(`Position page risk strip, live — against ${BASE}\n`);

const browser = await chromium.launch();
for (const lane of LANES) {
  const listing = await openRows(lane.api);
  if (listing.error) {
    check(`1  ${lane.api}: the listing answers`, false, listing.error);
    continue;
  }
  const row = listing.rows
    .map((r) => ({ r, debt: lane.debt(r) }))
    .filter((x) => x.debt >= DEBT_FLOOR)
    .sort((a, b) => b.debt - a.debt)[0]?.r;
  if (!row) {
    info(`1  ${lane.api}: no open row with debt above ${DEBT_FLOOR} in the first ${PAGE}`, "nothing to open");
    continue;
  }
  const path = lane.path(row);
  check(
    `1  ${lane.api}: an open row with debt`,
    true,
    `${path} (debt ≈ ${Math.round(lane.debt(row)).toLocaleString("en-US")})`,
  );

  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  let navError = null;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
  } catch (e) {
    navError = String(e).split("\n")[0];
  }
  // The strip arrives with the live read; give a slow read a moment past idle.
  await page.waitForTimeout(3000);
  const text = (await page.evaluate(() => document.body.innerText)) ?? "";

  const at = text.indexOf(RUNWAY);
  const window = at >= 0 ? text.slice(Math.max(0, at - 120), at + RUNWAY.length).replace(/\s+/g, " ") : "";
  check(
    `2  ${lane.api}: the page draws the "% ${RUNWAY}" figure`,
    at >= 0,
    navError ?? (at >= 0 ? `…${window}` : "absent"),
  );
  check(`3  ${lane.api}: the strip names its line`, text.includes(lane.line), lane.line);
  const wording = ["could not be read", "unavailable"].filter((w) => text.includes(w));
  const hydration = pageErrors.filter((e) => /React error #4(18|23)/.test(e));
  const thrown = pageErrors.filter((e) => !hydration.includes(e));
  if (hydration.length) info(`4  ${lane.api}: hydration mismatch (timing-dependent)`, hydration[0].slice(0, 120));
  check(
    `4  ${lane.api}: nothing unread, no page error`,
    wording.length === 0 && thrown.length === 0,
    wording.length ? `found "${wording.join('", "')}"` : thrown.length ? thrown[0].slice(0, 160) : "",
  );
  await page.close();
}
await browser.close();

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
