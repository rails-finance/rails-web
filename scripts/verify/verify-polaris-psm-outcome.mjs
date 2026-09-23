// Polaris — the PSM's shares get a net-outcome strip, valued at the feed at
// settle, and the tower's redemption-share/mint-share swatches turn pink.
// ---------------------------------------------------------------------------
// The per-row effect (mintRedeemCollGain × priceAtBlock − mintRedeemDebtGain)
// and its lifetime sums for three fixture CDPs are pinned from psql over the
// RAW tables on the onboarding box, 2026-09-06 — never derived from this code.
// This script proves:
//
//   1. usdp/8: the strip is present under the tower heading row; its three
//      "at settle" figures match the pinned sums (compact formatting); the
//      "today" figure is recomputed from the live overlay (0.5% tolerance,
//      since the feed moves); the strip carries no "profit" and no "%".
//   2. usdp/27: +124.509 total (+43.571 / +80.938); usdp/166: +0.719, no
//      mint clause (it has no priced mint share).
//   3. The tower's "PSM redemption share" and "PSM mint share" breakdown
//      swatches carry the pink checker (a background-image containing "244"
//      and "114" and "182", none containing "251" "146" "60").
//   4. A Liquity V2 trove with a redemption also draws the pink checker on
//      its redemption line, and liquityRedemptionOutcome's own strip still
//      renders (TROVE_B from verify-market-note-row-liquity-v2.mjs — a WETH
//      trove whose price-gap stretch ends in a redemption).
//   5. The markdown export carries the outcome line on usdp/8.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3415 node scripts/verify/verify-polaris-psm-outcome.mjs

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// ── restated formatting, independent of lib/utils/format.ts ────────────────
// formatCompact's own rule: |v| >= 1000 → Intl compact (2dp); else the
// plain-decimal path (Intl default, 3dp).
const fmtCompact = (n) =>
  Math.abs(n) >= 1000
    ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
    : n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const signedCompact = (n) => `${n >= 0 ? "+" : "−"}${fmtCompact(Math.abs(n))}`;

/** Parse a signed, possibly-compact figure ("+1.68M", "−0.514") back to a
 *  number, for a tolerance comparison against a live-recomputed value the
 *  page's own compact rounding can't be string-matched against exactly. */
function parseSignedCompact(s) {
  const m = /([+−-])\s*([\d,.]+)\s*([MK])?/.exec(s);
  if (!m) return NaN;
  const sign = m[1] === "−" || m[1] === "-" ? -1 : 1;
  const base = Number(m[2].replace(/,/g, ""));
  const mult = m[3] === "M" ? 1_000_000 : m[3] === "K" ? 1_000 : 1;
  return sign * base * mult;
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
  // render), and the tower needs it for the "today" figure — a heavier CDP
  // (usdp/8, 45 touches) takes longer than a light one, so poll rather than
  // a single fixed sleep.
  await page.waitForTimeout(1500);
  await page
    .locator('[data-skel-section="detail-economics"]')
    .first()
    .filter({ hasText: /today.s feed|The PSM/i })
    .waitFor({ state: "attached", timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

const econSection = (page) => page.locator('[data-skel-section="detail-economics"]').first();

/** The rowExtra strip's own container (the heading-row stat line) — the
 *  `justify-end` flex row `polarisPsmOutcome`/`liquityRedemptionOutcome`
 *  both render, distinct from the collapsed Explanation bullet that states
 *  the same sentence. */
const outcomeStrip = (page) => econSection(page).locator("div.justify-end.pl-2").first();

/** A breakdown-row's swatch `background-image`, by its exact label text. */
async function swatchOf(page, label) {
  return econSection(page).evaluate((root, label) => {
    for (const tr of root.querySelectorAll("tr")) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 3) continue;
      if (tds[2].textContent?.trim().startsWith(label)) {
        const swatch = tds[1].querySelector("span[style]");
        return swatch ? swatch.getAttribute("style") : null;
      }
    }
    return null;
  }, label);
}

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
// The strip's at-settle sentence renders from the index alone; its "today's
// feed" clause lands with the chain overlay a moment later (usdp/8 is the
// heaviest CDP, so "a moment" stretches on a busy server — 2026-09-10 the
// clause was on the page at 3.4 s and this read had already happened). Wait
// for the clause itself before reading the text, bounded so a page that never
// gets it still fails 1e rather than hanging.
await strip8
  .filter({ hasText: /today.s feed/ })
  .waitFor({ state: "attached", timeout: 20000 })
  .catch(() => {});
const stripText8 = (await strip8.count()) > 0 ? (await strip8.innerText()).replace(/\s+/g, " ") : "";
check(
  "1b. the strip states the total at-settle effect (pinned +1.64M)",
  stripText8.includes(signedCompact(PIN_8.effect)),
  `wanted "${signedCompact(PIN_8.effect)}" in: ${stripText8.slice(0, 300)}`,
);
check(
  "1c. the strip states the redemption-share and mint-share splits (pinned +431.18K / +1.21M)",
  stripText8.includes(signedCompact(PIN_8.redemption)) && stripText8.includes(signedCompact(PIN_8.mint)),
  `wanted "${signedCompact(PIN_8.redemption)}" and "${signedCompact(PIN_8.mint)}"`,
);

const chain8 = await api(`/api/chain/polaris/position?market=usdp&id=8`);
if (check("1d. usdp/8's live overlay answers with a price (precondition)", !chain8.chainStale && !!chain8.price)) {
  const todayExpected = PIN_8.netCollLeg * chain8.price.pethInDebt - PIN_8.netDebtLeg;
  const m = /at today.s feed the same legs come to\s*([+−][\d,.]+[MK]?)/.exec(stripText8);
  const gotToday = m ? parseSignedCompact(m[1]) : NaN;
  check(
    `1e. the strip's "today's feed" figure matches netCollLeg × pethInDebt − netDebtLeg (0.5% tolerance)`,
    Number.isFinite(gotToday) && Math.abs(gotToday - todayExpected) <= Math.abs(todayExpected) * 0.005 + 1,
    m ? `page states ${m[1]} (${gotToday}) vs expected ${todayExpected}` : `no "today's feed" clause in: ${stripText8}`,
  );
}
check(
  '1f. the strip contains no "profit" and no "%"',
  stripText8.length > 0 && !/profit/i.test(stripText8) && !/%/.test(stripText8),
  stripText8,
);

// ── 3. the tower's PSM swatches carry the pink checker ──────────────────────
const redemptionSwatch = await swatchOf(page8, "PSM redemption share");
const mintSwatch = await swatchOf(page8, "PSM mint share");
const isPink = (style) => !!style && style.includes("244") && style.includes("114") && style.includes("182");
const isOrange = (style) => !!style && style.includes("251") && style.includes("146") && style.includes("60");
check(
  '3a. the "PSM redemption share" breakdown row carries the pink checker',
  isPink(redemptionSwatch) && !isOrange(redemptionSwatch),
  redemptionSwatch ?? "row not found",
);
check(
  '3b. the "PSM mint share" breakdown row carries the pink checker',
  isPink(mintSwatch) && !isOrange(mintSwatch),
  mintSwatch ?? "row not found",
);
await page8.close();

// ── 2. usdp/27 and usdp/166 ───────────────────────────────────────────────────
const PIN_27 = { effect: 124.508871, redemption: 43.570811, mint: 80.93806 };
const PIN_166 = { effect: 0.71855454 };

const page27 = await open(context, polarisUrl("usdp", "27"));
const strip27Text =
  (await outcomeStrip(page27).count()) > 0 ? (await outcomeStrip(page27).innerText()).replace(/\s+/g, " ") : "";
check(
  "2a. usdp/27's strip states the pinned total and split (+124.509; +43.571 / +80.938)",
  strip27Text.includes(signedCompact(PIN_27.effect)) &&
    strip27Text.includes(signedCompact(PIN_27.redemption)) &&
    strip27Text.includes(signedCompact(PIN_27.mint)),
  strip27Text,
);
await page27.close();

const page166 = await open(context, polarisUrl("usdp", "166"));
const strip166Text =
  (await outcomeStrip(page166).count()) > 0 ? (await outcomeStrip(page166).innerText()).replace(/\s+/g, " ") : "";
check(
  "2b. usdp/166's strip states the pinned total (+0.719) with no mint-share clause",
  strip166Text.includes(signedCompact(PIN_166.effect)) && !/mint shares/i.test(strip166Text),
  strip166Text,
);
await page166.close();

// ── 4. a Liquity V2 trove with a redemption ──────────────────────────────────
// TROVE_B from verify-market-note-row-liquity-v2.mjs — a WETH trove whose
// price-gap stretch ends in a redemption (so it has actually been redeemed).
const TROVE_B = "29779854367542649123526514384205099621162281315544372345570836626121545773770";
const troveUrl = `${BASE}/ethereum/liquity-v2/trove/WETH/${TROVE_B}`;
const pageTrove = await open(context, troveUrl);
const troveEcon = econSection(pageTrove);
check("4a. TROVE_B's economics section renders", (await troveEcon.count()) > 0);
const redemptionSwatchV2 = await swatchOf(pageTrove, "Redeemed");
check(
  '4b. TROVE_B\'s "Redeemed" breakdown row still carries the pink checker',
  isPink(redemptionSwatchV2) && !isOrange(redemptionSwatchV2),
  redemptionSwatchV2 ?? "row not found",
);
const troveStripText =
  (await outcomeStrip(pageTrove).count()) > 0 ? (await outcomeStrip(pageTrove).innerText()).replace(/\s+/g, " ") : "";
check(
  '4c. liquityRedemptionOutcome\'s own strip still renders ("net outcome from redemptions")',
  /net outcome from redemptions/i.test(troveStripText),
  troveStripText,
);
await pageTrove.close();

// ── 5. markdown export ───────────────────────────────────────────────────────
const page8b = await open(context, polarisUrl("usdp", "8"));
async function copyMarkdown(page) {
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(500);
  return page.evaluate(() => navigator.clipboard.readText());
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

// ── siblings ─────────────────────────────────────────────────────────────────

function runSibling(script) {
  const scriptPath = path.join(__dirname, script);
  const result = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, BASE },
    encoding: "utf8",
    timeout: 300000,
  });
  const out = (result.stdout ?? "") + (result.stderr ?? "");
  const passMatch = /ALL (\d+) CHECKS PASS/.exec(out);
  const failMatch = /(\d+) CHECK\(S\) FAILED of (\d+)/.exec(out);
  return {
    ok: result.status === 0,
    summary: passMatch
      ? `${passMatch[1]}/${passMatch[1]} passed`
      : failMatch
        ? `${failMatch[2] - failMatch[1]}/${failMatch[2]} passed, ${failMatch[1]} failed`
        : `exit ${result.status}, no summary line found`,
  };
}

for (const sib of [
  "verify-polaris-psm-share.mjs",
  "verify-polaris-at-block-prices.mjs",
  "verify-polaris-rate-step.mjs",
  "verify-polaris-equity.mjs",
  "verify-market-note-placement.mjs",
]) {
  console.log(`\n--- running sibling verifier: ${sib} ---`);
  const r = runSibling(sib);
  check(`6. ${sib} still passes`, r.ok, r.summary);
}

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Polaris PSM net-outcome strip holds`,
);
process.exit(failures ? 1 : 0);
