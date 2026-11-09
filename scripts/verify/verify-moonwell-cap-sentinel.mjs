#!/usr/bin/env node
// One-base-unit caps on the Moonwell markets page — a closed door, named as
// one, not "1.00e-18 WETH · 2.69e+23% used".
// ----------------------------------------------------------------------------
// In the Compound V2 fork's convention a cap of 0 means UNCAPPED, so
// governance closes a market to new borrowing or supply by setting the cap to
// the smallest positive amount instead: one base unit (1 wei for an
// 18-decimal token, 1e-6 for USDC). After the 2026-08-27 MAMO incident
// Moonwell set every one of its 21 Base borrow caps and several supply caps
// that way. The page names a one-unit cap "closed" and quotes no share.
//
// Since ui-jobs 549 step 3 the page is the shared market page (R2): one row
// per mToken, a cap pill under the size it limits (`data-caps`), and the
// head's notes counting what every market shares once (`data-market-note`).
// A market's page (R3) states each cap in its Parameters.
//
// The fixture is whatever the markets route says at head — check 0 reads it
// and demands at least one market on each side with a one-base-unit cap and
// at least one with a real cap in ordinary use, so the page is exercised on
// both shapes or the run says why not.
//
// Checks:
//   0. Precondition — the route carries a one-unit borrow cap, a one-unit
//      supply cap, and a real supply cap under 100% used.
//   1. No exponent notation anywhere on the page.
//   2. The one-unit borrow market reads closed: its row's borrow pill says
//      "cap closed", or (when every market shares it) the head's note counts
//      every market closed to new borrowing.
//   3. The one-unit supply market's row reads "cap closed" under Supplied.
//   4. The head's note counts the markets closed to new borrowing, and the
//      count equals the route's (one-unit cap, or borrowed at/over the cap).
//   5. Control — the real-capped market's page states its share and the cap
//      ("N.N% of <amount> <SYM>") under Parameters' Supply cap.
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-moonwell-cap-sentinel.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const PAGE_TIMEOUT_MS = 180000;
const MARKETS = "/base/moonwell/markets";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

async function waitForBase() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${BASE} did not answer within 120s`);
}

// One base unit, judged from the scaled figure and the token's decimals —
// so this reads the same before and after the route learned to say so.
const oneUnit = (cap, decimals) => cap != null && cap > 0 && Math.round(cap * 10 ** decimals) === 1;
const closed = (cap, used, decimals) => oneUnit(cap, decimals) || (used != null && used >= 1);

await waitForBase();

// ── 0. Precondition ───────────────────────────────────────────────────────
const res = await fetch(`${BASE}/api/chain/moonwell-base/markets`);
if (!res.ok) throw new Error(`markets route ${res.status}`);
const data = await res.json();
const ms = data.markets ?? [];
const borrowOne = ms.find((m) => oneUnit(m.borrowCap, m.underlyingDecimals));
const supplyOne = ms.find((m) => oneUnit(m.supplyCap, m.underlyingDecimals));
const realSupply = ms.find(
  (m) =>
    m.supplyCap != null &&
    !oneUnit(m.supplyCap, m.underlyingDecimals) &&
    m.supplyCapUsed != null &&
    m.supplyCapUsed < 1,
);
const closedToBorrow = ms.filter((m) => closed(m.borrowCap, m.borrowCapUsed, m.underlyingDecimals)).length;
check("0a route is live", !data.chainStale && ms.length > 0, `${ms.length} markets @ ${data.blockNumber}`);
check("0b a one-unit borrow cap exists", borrowOne != null, borrowOne?.underlyingSymbol ?? "");
check("0c a one-unit supply cap exists", supplyOne != null, supplyOne?.underlyingSymbol ?? "");
check("0d a real supply cap in ordinary use exists", realSupply != null, realSupply?.underlyingSymbol ?? "");
if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}${MARKETS}`, NAV);
await page.locator("[data-reserve-row]").first().waitFor({ timeout: PAGE_TIMEOUT_MS });

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const rowOf = (m) => page.locator(`[data-comptroller-market="${m.mToken.toLowerCase()}"]`).first();
const noteCount = async (key) => {
  const t = norm(
    await page
      .locator(`[data-market-note="${key}"]`)
      .first()
      .textContent()
      .catch(() => ""),
  );
  const n = /^(All|\d+)/.exec(t)?.[1];
  return n === "All" ? ms.length : n != null ? Number(n) : null;
};

// ── 1. No exponent notation ───────────────────────────────────────────────
{
  const body = await page.evaluate(() => document.body.innerText);
  const hit = /\d\.\d+e[+-]\d+/.exec(body)?.[0];
  check("1  no exponent notation on the page", hit == null, hit ?? "");
}

// ── 2/3. One-unit caps named as closed doors ──────────────────────────────
{
  const pill = norm(
    await rowOf(borrowOne)
      .locator('[data-caps="borrow"]')
      .first()
      .textContent()
      .catch(() => ""),
  );
  const n = await noteCount("closed-to-borrow");
  check(
    `2  ${borrowOne.underlyingSymbol}: borrow cap reads closed`,
    pill === "cap closed" || n === ms.length,
    pill ? `row pill "${pill}"` : `head note counts ${n} of ${ms.length}`,
  );
}
{
  const pill = norm(
    await rowOf(supplyOne)
      .locator('[data-caps="supply"]')
      .first()
      .textContent()
      .catch(() => ""),
  );
  check(
    `3  ${supplyOne.underlyingSymbol} row: supply pill reads "cap closed"`,
    pill === "cap closed",
    pill || "(no pill)",
  );
}

// ── 4. The head counts the markets closed to new borrowing ────────────────
{
  const n = await noteCount("closed-to-borrow");
  check(
    "4  head note counts markets closed to new borrowing",
    n === closedToBorrow,
    `page ${n ?? "(none)"} vs route ${closedToBorrow}`,
  );
}

// ── 5. Control: a real cap states its share and the cap on the market's page ──
{
  const key = realSupply.underlying.toLowerCase();
  const keyed =
    ms.filter((m) => m.underlying?.toLowerCase() === key).length === 1 ? key : realSupply.mToken.toLowerCase();
  await page.goto(`${BASE}${MARKETS}/${keyed}`, NAV);
  await page.locator("[data-reserve-parameters]").first().waitFor({ timeout: PAGE_TIMEOUT_MS });
  const t = norm(await page.locator("[data-reserve-parameters]").first().textContent());
  check(
    `5  ${realSupply.underlyingSymbol} page: supply cap states its share and the cap`,
    new RegExp(`Supply cap\\s*\\d+(\\.\\d)?% of [\\d.,]+[KMB]? ${realSupply.underlyingSymbol}`).test(t),
    t.slice(t.indexOf("Supply cap"), t.indexOf("Supply cap") + 50),
  );
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
