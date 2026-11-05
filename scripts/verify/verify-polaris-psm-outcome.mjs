// Polaris — the PSM's shares get a net-outcome bullet, valued at the feed at
// settle, in the Lifetime flows Explanation's Totals (TO-DO-ui-jobs §251).
// ---------------------------------------------------------------------------
// The per-row effect (mintRedeemCollGain × priceAtBlock − mintRedeemDebtGain)
// and its lifetime sums for three fixture CDPs are pinned from psql over the
// RAW tables on the onboarding box, 2026-09-06 — never derived from this code.
// This script proves:
//
//   1. usdp/8: the strip is present on the flows panel's heading row; its three
//      "at settle" figures match the pinned sums (compact formatting); the
//      "today" figure is recomputed from the live overlay (0.5% tolerance,
//      since the feed moves); the strip carries no "profit" and no "%".
//   2. usdp/27: +124.51 total; usdp/166: +0.72, no mint clause.
//   4. A Liquity V2 trove with a redemption: liquityRedemptionOutcome's own
//      strip still renders (TROVE_B, a WETH trove that has been redeemed).
//   5. The markdown export carries the outcome line on usdp/8.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3415 node scripts/verify/verify-polaris-psm-outcome.mjs

import { chromium } from "playwright";
import { copyPositionMarkdown } from "./lib/copy-position.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

async function api(path_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path_}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path_}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path_}`);
}

// ── restated formatting, independent of lib/shared/format-compact.ts ───────
// The one compact rule (ui-jobs 377, ec1c6496): from 1,000 one decimal with K,
// M or B; below 1,000 two decimals; under 0.01 three significant digits.
const fmtCompact = (n) => {
  const a = Math.abs(n);
  for (const [size, suffix] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ]) {
    if (a >= size)
      return `${(a / size).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`;
  }
  if (a > 0 && a < 0.01) return a.toPrecision(3);
  return a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const signedCompact = (n) => `${n >= 0 ? "+" : "−"}${fmtCompact(Math.abs(n))}`;

/** Parse a signed, possibly-compact figure ("+1.68M", "−0.514") back to a
 *  number, for a tolerance comparison against a live-recomputed value the
 *  page's own compact rounding can't be string-matched against exactly. */
function parseSignedCompact(s) {
  const m = /([+−-])\s*([\d,.]+)\s*([BMK])?/.exec(s);
  if (!m) return NaN;
  const sign = m[1] === "−" || m[1] === "-" ? -1 : 1;
  const base = Number(m[2].replace(/,/g, ""));
  const mult = m[3] === "B" ? 1e9 : m[3] === "M" ? 1_000_000 : m[3] === "K" ? 1_000 : 1;
  return sign * base * mult;
}

/** Half the place value of a compact figure's last digit: "+1.8M" → 50,000. */
function compactHalfStep(s) {
  const m = /([\d,]+)(?:\.(\d+))?\s*([KMB])?/.exec(s);
  if (!m) return 0;
  const mult = m[3] === "B" ? 1e9 : m[3] === "M" ? 1e6 : m[3] === "K" ? 1e3 : 1;
  return (mult * 10 ** -(m[2]?.length ?? 0)) / 2;
}

const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  // The chain overlay lands a moment after first paint (index-only first
  // render), and the strip needs it for the "today" figure — a heavier CDP
  // (usdp/8, 45 touches) takes longer than a light one, so poll rather than
  // a single fixed sleep.
  await page.waitForTimeout(1500);
  await page
    .locator('[data-skel-section="detail-economics"]')
    .first()
    .filter({ hasText: /latest block.s feed|The PSM/i })
    .waitFor({ state: "attached", timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

const econSection = (page) => page.locator('[data-skel-section="detail-economics"]').first();

/** The outcome bullet `polarisPsmOutcome`/`liquityRedemptionOutcome` both
 *  render in the panel's Totals (the pane stays mounted while closed, so its
 *  text is read without opening it). */
const outcomeStrip = (page) => econSection(page).locator("[data-flows-outcome]").first();
const stripText = async (loc) => ((await loc.count()) > 0 ? (await loc.textContent()).replace(/\s+/g, " ") : "");

console.log("Polaris — PSM net-outcome strip, valued at the feed at settle\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1600 },
  permissions: ["clipboard-read", "clipboard-write"],
});

// ── 1. usdp/8 ────────────────────────────────────────────────────────────────
// Pinned §1a lifetime sums (psql over the raw tables, 2026-09-06) — never
// derived from this code.
const PIN_8 = {
  effect: 1_644_508.972192,
  redemption: 431_182.101942,
  mint: 1_213_326.870251,
  netCollLeg: 59.87610830170821972,
  netDebtLeg: -1_358_912.0201569084839598,
};

const page8 = await open(context, polarisUrl("usdp", "8"));
const strip8 = outcomeStrip(page8);
check("1a. usdp/8's economics section carries the PSM-outcome strip", (await strip8.count()) > 0);
// The strip's at-settle sentence renders from the index alone; its "latest
// block's feed price" clause lands with the chain overlay a moment later (usdp/8 is the
// heaviest CDP, so "a moment" stretches on a busy server — 2026-09-10 the
// clause was on the page at 3.4 s and this read had already happened). Wait
// for the clause itself before reading the text, bounded so a page that never
// gets it still fails 1e rather than hanging.
await strip8
  .filter({ hasText: /latest block.s feed/ })
  .waitFor({ state: "attached", timeout: 20000 })
  .catch(() => {});
const stripText8 = await stripText(strip8);
check(
  "1b. the strip states the total at-settle effect (pinned +1.6M)",
  stripText8.includes(signedCompact(PIN_8.effect)),
  `wanted "${signedCompact(PIN_8.effect)}" in: ${stripText8.slice(0, 300)}`,
);
check(
  // Each row's share is the net of every mint and redemption since the
  // previous touch, so the strip states one net figure and no split named
  // after either trade.
  "1c. the strip names no redemption-share / mint-share split",
  !/redemption shares|mint shares/i.test(stripText8),
  stripText8.slice(0, 300),
);

const chain8 = await api(`/api/chain/polaris/position?market=usdp&id=8`);
if (check("1d. usdp/8's live overlay answers with a price (precondition)", !chain8.chainStale && !!chain8.price)) {
  const todayExpected = PIN_8.netCollLeg * chain8.price.pethInDebt - PIN_8.netDebtLeg;
  const m = /,\s*([+−][\d,.]+[MK]?)\s*\S*\s*at the latest block.s feed price/.exec(stripText8);
  const gotToday = m ? parseSignedCompact(m[1]) : NaN;
  check(
    `1e. the strip's "latest block's feed price" figure matches netCollLeg × pethInDebt − netDebtLeg (0.5% tolerance)`,
    // Within half the figure's last stated digit (one decimal of M is ±50K),
    // or 0.5%, whichever is wider.
    Number.isFinite(gotToday) &&
      Math.abs(gotToday - todayExpected) <= Math.max(Math.abs(todayExpected) * 0.005 + 1, compactHalfStep(m[1])),
    m
      ? `page states ${m[1]} (${gotToday}) vs expected ${todayExpected}`
      : `no "latest block's feed price" clause in: ${stripText8}`,
  );
}
check(
  '1f. the strip contains no "profit" and no "%"',
  stripText8.length > 0 && !/profit/i.test(stripText8) && !/%/.test(stripText8),
  stripText8,
);

await page8.close();

// ── 2. usdp/27 and usdp/166 ───────────────────────────────────────────────────
const PIN_27 = { effect: 124.508871, redemption: 43.570811, mint: 80.93806 };
const PIN_166 = { effect: 0.71855454 };

const page27 = await open(context, polarisUrl("usdp", "27"));
const strip27Text = await stripText(outcomeStrip(page27));
check(
  "2a. usdp/27's strip states the pinned total (+124.51)",
  strip27Text.includes(signedCompact(PIN_27.effect)),
  strip27Text,
);
await page27.close();

const page166 = await open(context, polarisUrl("usdp", "166"));
const strip166Text = await stripText(outcomeStrip(page166));
check(
  "2b. usdp/166's strip states the pinned total (+0.72) with no mint-share clause",
  strip166Text.includes(signedCompact(PIN_166.effect)) && !/mint shares/i.test(strip166Text),
  strip166Text,
);
await page166.close();

// ── 4. a Liquity V2 trove with a redemption ──────────────────────────────────
// TROVE_B, a WETH trove that has been redeemed.
const TROVE_B = "29779854367542649123526514384205099621162281315544372345570836626121545773770";
const troveUrl = `${BASE}/ethereum/liquity-v2/trove/WETH/${TROVE_B}`;
const pageTrove = await open(context, troveUrl);
const troveEcon = econSection(pageTrove);
check("4a. TROVE_B's economics section renders", (await troveEcon.count()) > 0);
const troveStripText = await stripText(outcomeStrip(pageTrove));
check(
  "4c. liquityRedemptionOutcome's bullet renders (\"… at the time, … at the latest block's price\")",
  /at the time, [+−]\$[\d,.]+ at the latest block.s price/i.test(troveStripText),
  troveStripText,
);
await pageTrove.close();

// ── 5. markdown export ───────────────────────────────────────────────────────
const page8b = await open(context, polarisUrl("usdp", "8"));
async function copyMarkdown(page) {
  return copyPositionMarkdown(page);
}
const md8 = await copyMarkdown(page8b);
const hasOutcomeLine = /\*\*PSM outcome at the feed:\*\*/.test(md8);
const hasOutcomeFigure = md8.includes(signedCompact(PIN_8.effect));
check(
  "5. usdp/8's markdown export carries the PSM-outcome line",
  hasOutcomeLine && hasOutcomeFigure,
  hasOutcomeLine && hasOutcomeFigure
    ? "line present with the pinned figure"
    : hasOutcomeLine
      ? "line present but the pinned figure is missing"
      : "line absent",
);
await page8b.close();

await context.close();
await browser.close();

// The sibling runs this script used to spawn are retired: run-all.mjs runs
// every Polaris verifier on its own row, and nested runs only multiplied the
// time (past their 300 s child cap) and turned one red into several.

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Polaris PSM net-outcome strip holds`,
);
process.exit(failures ? 1 : 0);
