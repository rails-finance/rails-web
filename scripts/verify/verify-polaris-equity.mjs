// Polaris — equity at the feed, and the explanation's stance on P&L.
// ---------------------------------------------------------------------------
// Scaffold of verify-polaris-at-block-prices.mjs. Checks:
//
//   1. usdp/8: the card's "Equity at the feed" stat and the explanation's
//      bullet both show entireColl × pethInDebt − entireDebt (recomputed from
//      the live overlay, independently of the page — tolerance 0.5%, the
//      page may land a block later); the stat carries no "P&L"/"profit"
//      label and no "%".
//   2. usdp/8: the bullet says the valuation "says nothing of profit".
//   3. usdp/27 (closed): no equity stat; the lifetime bullet's figures equal
//      the plan's §1 pins (pinned HERE, never read off the route) and it
//      contains "realised outcome".
//   4. usdp/166 (liquidated): the liquidation clause carries the two pinned
//      figures.
//   5. The markdown export carries the equity line on usdp/8 and the stance
//      sentence on usdp/27.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3414 node scripts/verify/verify-polaris-equity.mjs

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

// ── restated formatting, independent of lib/utils/format.ts ────────────────
// formatNumber's plain-decimal path: Intl defaults (0–3 fraction digits).
const fmtNum = (n) => n.toLocaleString("en-US", { style: "decimal" });
const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  // The card's first render is index-only (no chain overlay yet, so no
  // Explanation and no Equity stat); the chain lane lands a moment later and
  // the card re-renders with it. Wait for the Explanation button to attach
  // (it renders once `chain` is non-null, on every status) before reading
  // anything chain-dependent.
  await page
    .locator('[data-skel-section="detail-card"] button[aria-label*="explanation" i]')
    .first()
    .waitFor({ state: "attached", timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

/** The position card's own container — data-skel-section="detail-card", set
 *  by PositionCardShell only for the receipts (detail) render. */
const card = (page) => page.locator('[data-skel-section="detail-card"]').first();

/** Read the "Equity at the feed" stat, if the card has one: its raw exact
 *  string (AssetAmount's data-prov-exact), symbol, and the panel row's
 *  collapsed text (to check for stray "P&L"/"profit"/"%"). The stat is a row
 *  of the card's panel (`data-panel-row="equity"`, position-card-panel.tsx). */
async function readEquityStat(page) {
  return page.evaluate(() => {
    const row = document.querySelector('[data-skel-section="detail-card"] [data-panel-row="equity"]');
    if (!row) return { found: false };
    const exactEl = row.querySelector("[data-prov-exact]");
    return {
      found: /Equity at the feed/.test(row.textContent ?? ""),
      exact: exactEl?.getAttribute("data-prov-exact") ?? null,
      symbol: exactEl?.getAttribute("data-prov-symbol") ?? null,
      containerText: row.textContent?.replace(/\s+/g, " ").trim() ?? null,
    };
  });
}

/** Open the card's own Explanation disclosure and return its collapsed text. */
async function readExplanation(page) {
  const c = card(page);
  const btn = c.getByRole("button", { name: /explanation/i }).first();
  if ((await btn.count()) === 0) return null;
  const expanded = await btn.getAttribute("aria-expanded");
  if (expanded !== "true") await btn.click();
  await page.waitForTimeout(300);
  // div[data-prov-exempt] — the Explanation pane itself; a <span
  // data-prov-exempt> also sits on the card's meta cluster (event count / last
  // activity), earlier in document order, and must not be matched here.
  const pane = c.locator("div[data-prov-exempt]").first();
  return (await pane.innerText()).replace(/\s+/g, " ").trim();
}

async function copyMarkdown(page) {
  return copyPositionMarkdown(page);
}

/** Parse a signed decimal (comma-grouped, U+2212 or ASCII minus) to a number. */
function parseSigned(s) {
  if (s == null) return NaN;
  return Number(s.replace(/,/g, "").replace(/−/g, "-"));
}

console.log("Polaris — equity at the feed, and the explanation's stance on P&L\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});

// ── 1 & 2. usdp/8 (open) ─────────────────────────────────────────────────────

const chain8 = await api(`/api/chain/polaris/position?market=usdp&id=8`);
if (chain8.chainStale || !chain8.price) {
  check("1. usdp/8's live overlay answers with a price (precondition)", false, "chainStale or no price leg");
} else {
  const expectedEquity = chain8.entireColl * chain8.price.pethInDebt - chain8.entireDebt;
  console.log(
    `(info) usdp/8 @ block ${chain8.blockNumber}: entireColl ${chain8.entireColl}, pethInDebt ${chain8.price.pethInDebt}, entireDebt ${chain8.entireDebt} → equity ${expectedEquity}`,
  );

  const page8 = await open(context, polarisUrl("usdp", "8"));

  const stat = await readEquityStat(page8);
  check('1a. usdp/8 shows an "Equity at the feed" stat', stat.found, JSON.stringify(stat));
  if (stat.found) {
    const statValue = parseSigned(stat.exact);
    const withinTol =
      Number.isFinite(statValue) &&
      Math.abs(statValue - expectedEquity) <= Math.max(1, Math.abs(expectedEquity) * 0.005);
    check(
      "1b. the stat's exact figure matches entireColl × pethInDebt − entireDebt (0.5% tolerance)",
      withinTol,
      `stat ${stat.exact} (${statValue}) vs expected ${expectedEquity}`,
    );
    check(
      '1c. the stat carries no "P&L"/"profit" label and no "%"',
      !/P&L/i.test(stat.containerText ?? "") &&
        !/profit/i.test(stat.containerText ?? "") &&
        !/%/.test(stat.containerText ?? ""),
      stat.containerText ?? "",
    );
  }

  const explanation8 = await readExplanation(page8);
  check("1d. usdp/8's explanation opens", explanation8 != null, explanation8 ? "" : "no Explanation button/pane");
  if (explanation8) {
    const m = /equity is\s*([−-]?[\d,]+(?:\.\d+)?)\s*USDp/i.exec(explanation8);
    const bulletValue = m ? parseSigned(m[1]) : NaN;
    check(
      "1e. the bullet states the same equity figure (0.5% tolerance)",
      Number.isFinite(bulletValue) &&
        Math.abs(bulletValue - expectedEquity) <= Math.max(1, Math.abs(expectedEquity) * 0.005),
      m
        ? `bullet says ${m[1]} vs expected ${expectedEquity}`
        : `no "equity is … USDp" match in: ${explanation8.slice(0, 300)}`,
    );
    // The stance in the card's words since f7dfc4c5 (content/polaris/event-prose.yaml
    // position_words.equity); the basis sentence lives in the stat's receipt and
    // the markdown export (5a, 5b), not the Explanation.
    check('2a. the bullet says the valuation "says nothing of profit"', /says nothing of profit/i.test(explanation8));
  }

  await page8.close();
}

// ── 3. usdp/27 (closed) ──────────────────────────────────────────────────────
// Pinned §1 figures — raw 1e18 sums from psql, NOT read off the route.
const PIN_27 = {
  deposited: 0.0625,
  withdrawn: 0.079870062687253897,
  borrowed: 77.45913640239678747,
  repaid: 108.555393484321083984,
  interestCharged: 0.116437610459914132,
  collFromPsm: 0.032154966278583882,
  collToPsm: 0.015044385553928385,
  debtFromPsm: 66.238326425471171818,
  debtToPsm: 117.726348953114385233,
};

const page27 = await open(context, polarisUrl("usdp", "27"));
const stat27 = await readEquityStat(page27);
check('3a. usdp/27 (closed) shows NO "Equity at the feed" stat', !stat27.found, JSON.stringify(stat27));

const explanation27 = await readExplanation(page27);
check("3b. usdp/27's explanation opens", explanation27 != null);
if (explanation27) {
  let allPinsPresent = true;
  const missing = [];
  for (const [leg, value] of Object.entries(PIN_27)) {
    const want = fmtNum(value);
    if (!explanation27.includes(want)) {
      allPinsPresent = false;
      missing.push(`${leg}: wanted "${want}"`);
    }
  }
  check("3c. the lifetime bullet states every §1 pin (formatted)", allPinsPresent, missing.join("; "));
  // 3d retired: since f7dfc4c5 a closed card's Explanation states the life's
  // figures alone (position_words.life_*); the "realised outcome" stance is
  // the markdown export's, which 5b reads.
}

// ── 4. usdp/166 (liquidated) ─────────────────────────────────────────────────
const PIN_166 = { collLiquidated: 0.270426123598289887, debtLiquidated: 1146.405794704979134539 };

const page166 = await open(context, polarisUrl("usdp", "166"));
const explanation166 = await readExplanation(page166);
check("4a. usdp/166's explanation opens", explanation166 != null);
if (explanation166) {
  const wantColl = fmtNum(PIN_166.collLiquidated);
  const wantDebt = fmtNum(PIN_166.debtLiquidated);
  check(
    "4b. the liquidation clause carries both pinned figures",
    explanation166.includes(wantColl) &&
      explanation166.includes(wantDebt) &&
      /liquidation seized/i.test(explanation166),
    `wanted "${wantColl}" and "${wantDebt}" in: ${explanation166.slice(0, 400)}`,
  );
}

await page166.close();

// ── 5. markdown export ───────────────────────────────────────────────────────

const chain8b = await api(`/api/chain/polaris/position?market=usdp&id=8`);
const expectedEquity8b = chain8b.price ? chain8b.entireColl * chain8b.price.pethInDebt - chain8b.entireDebt : NaN;

const page8b = await open(context, polarisUrl("usdp", "8"));
const md8 = await copyMarkdown(page8b);
const mdEquityMatch = /\*\*Equity at the feed:\*\*\s*([−-]?[\d,]+(?:\.\d+)?)\s*USDp[^)]*not a profit\)/.exec(md8);
const mdEquityValue = mdEquityMatch ? parseSigned(mdEquityMatch[1]) : NaN;
check(
  '5a. usdp/8\'s markdown carries the "Equity at the feed" line with the correct figure (0.5% tolerance)',
  Number.isFinite(mdEquityValue) &&
    Number.isFinite(expectedEquity8b) &&
    Math.abs(mdEquityValue - expectedEquity8b) <= Math.max(1, Math.abs(expectedEquity8b) * 0.005),
  mdEquityMatch
    ? `markdown says ${mdEquityMatch[1]} vs expected ${expectedEquity8b}`
    : `line not found in: ${md8.slice(0, 800)}`,
);
await page8b.close();

const md27 = await copyMarkdown(page27);
check(
  "5b. usdp/27's markdown carries the lifetime stance sentence",
  /realised outcome/i.test(md27) && /\bbasis\b/i.test(md27),
);
await page27.close();

await context.close();
await browser.close();

// The sibling runs this script used to spawn are retired: run-all.mjs runs
// every Polaris verifier on its own row, and nested runs only multiplied the
// time (past their 300 s child cap) and turned one red into several.

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — Polaris equity-at-the-feed holds`,
);
process.exit(failures ? 1 : 0);
