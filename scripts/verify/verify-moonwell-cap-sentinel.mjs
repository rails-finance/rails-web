#!/usr/bin/env node
// One-base-unit caps on the Moonwell markets page — a closed door, named as
// one, not "1.00e-18 WETH · 2.69e+23% used".
// ----------------------------------------------------------------------------
// In the Compound V2 fork's convention a cap of 0 means UNCAPPED, so
// governance closes a market to new borrowing or supply by setting the cap to
// the smallest positive amount instead: one base unit (1 wei for an
// 18-decimal token, 1e-6 for USDC). After the 2026-08-27 MAMO incident
// Moonwell set every one of its 21 Base borrow caps and 6 supply caps that
// way. Until 2026-09-03 the markets page printed those as a token amount in
// exponent notation with a share used in the 1e23% range, and the borrow side
// carried no "closed" phrase at all. Now a one-base-unit cap renders as
// "borrow cap one base unit · closed to new borrowing" (no share), the borrow
// side says "closed to new borrowing" whenever borrowing has reached its cap,
// and the summary line counts the markets closed to new borrowing beside the
// supply count it already carried.
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
//   2. The one-unit borrow market's card reads "borrow cap one base unit ·
//      closed to new borrowing".
//   3. The one-unit supply market's card reads "supply cap one base unit ·
//      closed to new supply".
//   4. The summary line counts the markets closed to new borrowing, and the
//      count equals the route's (one-unit cap, or borrowed at/over the cap).
//   5. Control — the real-capped market still reads "supply cap <amount> ·
//      N.N% used".
//
// Proved it can fail 2026-09-03: against the deployed site before the fix
// (BASE=https://rails-web-onboarding.vercel.app), checks 1–4 FAIL while 0 and
// 5 PASS. Against a dev server on the fix: ALL PASS.
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
await page.getByText("borrow cap", { exact: false }).first().waitFor({ timeout: PAGE_TIMEOUT_MS });

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
// The card is the nearest ancestor of the market's explorer link that carries
// its caps line.
async function cardText(m) {
  const link = page.locator(`a[href*="${m.mToken}" i]`).first();
  const card = link.locator(
    'xpath=ancestor::div[.//text()[contains(., "borrow cap")] or .//text()[contains(., "supply cap")]][1]',
  );
  return norm(await card.textContent());
}

// ── 1. No exponent notation ───────────────────────────────────────────────
{
  const body = await page.evaluate(() => document.body.innerText);
  const hit = /\d\.\d+e[+-]\d+/.exec(body)?.[0];
  check("1  no exponent notation on the page", hit == null, hit ?? "");
}

// ── 2/3. One-unit caps named as closed doors ──────────────────────────────
{
  const t = await cardText(borrowOne);
  check(
    `2  ${borrowOne.underlyingSymbol} card: borrow cap one base unit · closed to new borrowing`,
    /borrow cap one base unit · closed to new borrowing/.test(t) && !/borrow cap one base unit · .*% used/.test(t),
    t.slice(t.indexOf("borrow cap"), t.indexOf("borrow cap") + 70),
  );
}
{
  const t = await cardText(supplyOne);
  check(
    `3  ${supplyOne.underlyingSymbol} card: supply cap one base unit · closed to new supply`,
    /supply cap one base unit · closed to new supply/.test(t) && !/supply cap one base unit · .*% used/.test(t),
    t.slice(t.indexOf("supply cap"), t.indexOf("supply cap") + 70),
  );
}

// ── 4. Summary counts the markets closed to new borrowing ─────────────────
{
  const body = norm(await page.evaluate(() => document.body.innerText));
  const m = /(\d+) markets? (?:is|are) closed to new borrowing by (?:its|their) own caps?/.exec(body);
  check(
    "4  summary counts markets closed to new borrowing",
    m != null && Number(m[1]) === closedToBorrow,
    `page ${m?.[1] ?? "(none)"} vs route ${closedToBorrow}`,
  );
}

// ── 5. Control: a real cap still states its share ─────────────────────────
{
  const t = await cardText(realSupply);
  check(
    `5  ${realSupply.underlyingSymbol} card: real supply cap states its share`,
    new RegExp(`supply cap [\\d,.]+ ${realSupply.underlyingSymbol} · \\d+\\.\\d% used`).test(t),
    t.slice(t.indexOf("supply cap"), t.indexOf("supply cap") + 60),
  );
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
