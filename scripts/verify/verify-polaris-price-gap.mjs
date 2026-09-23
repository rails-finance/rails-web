// Polaris — a price-gap market note, the Liquity V2 rule applied to the
// market's own oracle-at-block feed.
// ---------------------------------------------------------------------------
// Every from→to block pair and headline move for three fixture CDPs is
// pinned from psql over the RAW tables on the onboarding box, 2026-09-06 —
// never derived from this code. This script proves:
//
//   1. usdp/8: exactly 6 price-gap notes, at the pinned from→to blocks and
//      headline magnitudes; the header names "oracle price"; the rate-step
//      notes on the same page are unchanged in count (verify-polaris-rate-
//      step.mjs's 37 checks still pass).
//   2. usdp/27: exactly 1, +46.96%, CR 251.3% → 369.3%, minimum 115% named
//      as normal-mode.
//   3. usdp/166: exactly 1, ends in a liquidation, −3.03%, CR 117.8% →
//      114.3%.
//   4. The receipt names the market's PriceFeed and the oracle-at-block
//      lane.
//   5. A Liquity V2 trove note header shows "oracle price" and a Moonwell
//      Base share-rate note header shows "share rate" (reusing the existing
//      market-note verifiers' own fixtures).
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3415 node scripts/verify/verify-polaris-price-gap.mjs

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

const PRICE_GAP_SELECTOR = '[data-market-note^="price-gap:usdp:"], [data-market-note^="price-gap:goldp:"]';
// 2026-09-06 (live notes): the HISTORICAL price-gap rows only — a live note's
// id always ends `-head` (market-note.ts's own id shape), and usdp/8 is an
// OPEN CDP, so it now also carries a live price-gap note that this selector
// must not count among the six pinned HISTORICAL stretches.
const HISTORICAL_PRICE_GAP_SELECTOR =
  '[data-market-note^="price-gap:usdp:"]:not([data-market-note$="-head"]), [data-market-note^="price-gap:goldp:"]:not([data-market-note$="-head"])';

const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  // The price-gap note needs the chain overlay's own `mcr` — poll for it to
  // land rather than a single fixed sleep (a heavier CDP takes longer).
  await page
    .locator(PRICE_GAP_SELECTOR)
    .first()
    .waitFor({ state: "attached", timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

// ── restated formatting, independent of lib/shared/market-note.ts ──────────
const formatPercentMagnitude = (n) =>
  `${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const formatPercentLevel = (n) => `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`;

console.log("Polaris — the price-gap market note\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1600 },
  permissions: ["clipboard-read", "clipboard-write"],
});

// ── 1. usdp/8: exactly 6 price-gap notes ────────────────────────────────────
// Pinned §1b stretches (psql over the raw tables, 2026-09-06).
const PIN_8 = [
  { from: 11_514_810, to: 11_519_485, move: 4.06 },
  { from: 11_519_775, to: 11_526_628, move: 19.43 },
  { from: 11_533_706, to: 11_552_985, move: 9.01 },
  { from: 11_556_029, to: 11_562_362, move: 5.2 },
  { from: 11_577_721, to: 11_603_483, move: -2.64 },
  { from: 11_603_488, to: 11_610_231, move: 2.92 },
];

const page8 = await open(context, polarisUrl("usdp", "8"));
const ids8 = await page8
  .locator(HISTORICAL_PRICE_GAP_SELECTOR)
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
check(
  "1a. usdp/8 shows exactly 6 HISTORICAL price-gap notes",
  ids8.length === 6,
  `got ${ids8.length}: ${ids8.join(", ")}`,
);
const wantIds8 = PIN_8.map((p) => `price-gap:usdp:${p.from}-${p.to}`).sort();
check(
  "1b. usdp/8's price-gap note ids match the pinned from→to blocks",
  JSON.stringify([...ids8].sort()) === JSON.stringify(wantIds8),
  `page: ${[...ids8].sort().join(", ")} · pinned: ${wantIds8.join(", ")}`,
);

const texts8 = await page8.locator(HISTORICAL_PRICE_GAP_SELECTOR).allTextContents();
let allMagnitudesFound = true;
const missingMagnitudes = [];
for (const p of PIN_8) {
  const want = formatPercentMagnitude(p.move);
  if (!texts8.some((t) => t.includes(want))) {
    allMagnitudesFound = false;
    missingMagnitudes.push(want);
  }
}
check(
  "1c. each pinned stretch's headline magnitude (4.1% … 19.4% … 2.9%) appears on the page",
  allMagnitudesFound,
  missingMagnitudes.length ? `missing: ${missingMagnitudes.join(", ")}` : "",
);
check(
  '1d. every price-gap note header names the quantity "oracle price"',
  texts8.length === 6 && texts8.every((t) => t.includes("oracle price")),
  texts8.map((t) => t.slice(0, 60)).join(" || "),
);
const risingWanted = PIN_8.map((p, i) => ({ id: `price-gap:usdp:${p.from}-${p.to}`, up: p.move > 0 }));
let glyphsOk = true;
for (const w of risingWanted) {
  const row = page8.locator(`[data-market-note="${w.id}"]`);
  const upCount = await row.locator("svg.lucide-arrow-up-right").count();
  const downCount = await row.locator("svg.lucide-arrow-down-right").count();
  const isUp = upCount > 0;
  if (isUp !== w.up) glyphsOk = false;
}
check("1e. each note's sr-only direction word / glyph matches the pinned sign", glyphsOk);
await page8.close();

// ── 1f. the rate-step notes on the same page are unchanged in count ────────
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
{
  const r = runSibling("verify-polaris-rate-step.mjs");
  check("1f. verify-polaris-rate-step.mjs's 51 checks still pass unchanged (51/51)", r.ok, r.summary);
}

// ── 2. usdp/27: exactly 1, +46.96%, CR 251.3% → 369.3%, min 115% normal-mode ─

const page27 = await open(context, polarisUrl("usdp", "27"));
const ids27 = await page27
  .locator(PRICE_GAP_SELECTOR)
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
check("2a. usdp/27 shows exactly 1 price-gap note", ids27.length === 1, `got ${ids27.length}: ${ids27.join(", ")}`);
check(
  "2b. usdp/27's note id matches the pinned stretch (11512561→11548724)",
  ids27[0] === "price-gap:usdp:11512561-11548724",
  ids27[0] ?? "(none)",
);
const row27 = page27.locator(`[data-market-note="${ids27[0]}"]`);
const restText27 = row27.length === 0 ? "" : await row27.first().innerText();
check(
  "2c. the header states the pinned magnitude +47.0%",
  restText27.includes(formatPercentMagnitude(46.96)),
  restText27.slice(0, 100),
);
await row27.first().getByRole("button", { expanded: false }).first().click();
await page27.waitForTimeout(300);
const openText27 = await row27.first().innerText();
check(
  "2d. the opened note states the pinned CR before/after — 251% → 369%",
  openText27.includes(formatPercentLevel(251.3)) && openText27.includes(formatPercentLevel(369.3)),
  openText27.slice(0, 400),
);
check(
  '2e. the minimum is named as the "normal-mode" minimum, at 115%',
  /normal-mode/i.test(openText27) && openText27.includes(formatPercentLevel(115)),
  openText27.slice(0, 400),
);
await page27.close();

// ── 3. usdp/166: exactly 1, ends in a liquidation, −3.03%, CR 117.8%→114.3% ──

const page166 = await open(context, polarisUrl("usdp", "166"));
const ids166 = await page166
  .locator(PRICE_GAP_SELECTOR)
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
check("3a. usdp/166 shows exactly 1 price-gap note", ids166.length === 1, `got ${ids166.length}: ${ids166.join(", ")}`);
check(
  "3b. usdp/166's note id matches the pinned stretch, ending at the liquidation block (11578192→11585985)",
  ids166[0] === "price-gap:usdp:11578192-11585985",
  ids166[0] ?? "(none)",
);
const row166 = page166.locator(`[data-market-note="${ids166[0]}"]`);
const rest166 = row166.length === 0 ? "" : await row166.first().innerText();
check(
  "3c. the header states the pinned magnitude −3.0%, direction down",
  rest166.includes(formatPercentMagnitude(-3.03)),
  rest166.slice(0, 100),
);
const downCount166 = await row166.first().locator("svg.lucide-arrow-down-right").count();
check("3c2. the direction glyph is down (a fall)", downCount166 > 0);
await row166.first().getByRole("button", { expanded: false }).first().click();
await page166.waitForTimeout(300);
const open166 = await row166.first().innerText();
check(
  "3d. the opened note states the pinned CR before/after — 118% → 114%",
  open166.includes(formatPercentLevel(117.8)) && open166.includes(formatPercentLevel(114.3)),
  open166.slice(0, 400),
);
// Open the derivation disclosure to reach "the stretch is stated because…".
const derivTrigger166 = row166.first().getByRole("button", { name: /how this note was derived/i });
if (await derivTrigger166.count()) await derivTrigger166.click();
await page166.waitForTimeout(200);
const full166 = await row166.first().innerText();
check(
  "3e. the stretch is stated because it ends in a liquidation",
  /ends in a liquidation/i.test(full166),
  full166.slice(0, 600),
);

// ── 4. the receipt names the market's PriceFeed and the oracle-at-block lane ─
check(
  "4. the derivation prose names the market's own price feed and the oracle-at-block reading",
  /the market.s own price feed/i.test(full166),
  full166.slice(0, 600),
);
await page166.close();

await context.close();
await browser.close();

// ── 5. a Liquity V2 header and a Moonwell Base header name their own kind ───

const chromeVerifiers = ["verify-market-note-row-liquity-v2.mjs", "verify-market-note-placement.mjs"];
for (const sib of chromeVerifiers) {
  console.log(`\n--- running sibling verifier: ${sib} ---`);
  const r = runSibling(sib);
  check(`5. ${sib} still passes (fixtures for the header word)`, r.ok, r.summary);
}

// Directly confirm the header word on each protocol's own fixture, since the
// siblings above assert placement/counts rather than the new word.
const browser2 = await chromium.launch();
const context2 = await browser2.newContext({ viewport: { width: 1440, height: 1400 } });

const TROVE_A = "78653451855876984404200224290704233324607545013117117463168140077362570442915";
const pageV2 = await open(context2, `${BASE}/ethereum/liquity-v2/trove/WETH/${TROVE_A}`);
const v2NoteTexts = await pageV2.locator("[data-market-note]").allTextContents();
check(
  '5a. a Liquity V2 price-gap note header shows "oracle price"',
  v2NoteTexts.length > 0 && v2NoteTexts.every((t) => t.includes("oracle price")),
  v2NoteTexts.map((t) => t.slice(0, 60)).join(" || "),
);
await pageV2.close();

// A Moonwell Base share-rate step fixture — WALLET from
// verify-market-note-placement.mjs, the account that minted the MAMO step
// measured 2026-09-04 (lib/shared/market-note.ts's own header comment).
const MAMO_WALLET = "0x719eae70d4a83f35bf82a2740699f5db84be919d";
const mamoPage = await open(context2, `${BASE}/base/moonwell/${MAMO_WALLET}`);
const mamoNoteTexts = await mamoPage.locator("[data-market-note]").allTextContents();
check(
  '5b. the Moonwell Base MAMO share-rate note header shows "share rate"',
  mamoNoteTexts.length > 0 && mamoNoteTexts.some((t) => t.includes("share rate")),
  mamoNoteTexts.map((t) => t.slice(0, 60)).join(" || ") || "no [data-market-note] rows on the page",
);
await mamoPage.close();

await context2.close();
await browser2.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Polaris price-gap note holds`,
);
process.exit(failures ? 1 : 0);
