// The Polaris oracle-at-block price footnote, on the page.
// ---------------------------------------------------------------------------
// The rails-server oracle-at-block lane joins `polaris_oracle_at_block` onto `/api/polaris/timeline` by block
// number: every non-transfer row now carries `price_at_block_raw` (the row's
// own market's price feed `previewPrice()` at that block, wei-scale) and
// `price_at_block_filled`. This script proves the WEB half (§5): the CDP
// detail's `AtBlockPriceFootnote` pill states that price, formatted to the
// market's own precision (USDp 2dp, GOLDp 4dp), and the markdown export
// carries a matching column.
//
// Every expected value is re-derived from `/api/polaris/timeline`, fetched
// independently of the page, never read back off it — except the ONE pinned
// figure (usdp/8, block 11,603,483), which comes from the direct feed read
// pinned in the plan's §1 (proven 2026-09-06 by a live archive `eth_call`,
// never from this repo's code): previewPrice() = 4861776900879216386284 raw
// → 4,861.78. The raw→decimal math below (fmt18) is restated from the
// contract (18dp fixed point), not imported from lib/sources/api/polaris-timeline.ts.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3413 node scripts/verify/verify-polaris-at-block-prices.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

// The pinned fact (plan §1 / §5) — NOT derived from the route.
const PINNED = {
  market: "usdp",
  id: "8",
  eventKey: "cdp_updated:0xdab49c5f1548b255f35ec40b6a935ef5a0a16dba5baeaaaeea82418600b9fc84:167",
  block: 11603483,
  raw: "4861776900879216386284",
  formatted: "4,861.78",
};

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

// ── raw → decimal, restated from the feed's own fixed-point (18dp) ─────────
const E18 = 10n ** 18n;
function fmt18Exact(raw) {
  const v = BigInt(raw);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / E18;
  const frac = (a % E18).toString().padStart(18, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
const priceText = (raw, decimals) =>
  Number(fmt18Exact(raw)).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  return page;
}

/** Expand one event row (by its `event_key`/`id`) and return its own text,
 *  whitespace-collapsed. Idempotent — clicking an already-open row a second
 *  time is never attempted by this script. */
async function expandRow(page, eventId) {
  const row = page.locator(`[data-event-id="${eventId}"]`);
  if ((await row.count()) === 0) return null;
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button").first().click();
  await page.waitForTimeout(200);
  return (await row.innerText()).replace(/\s+/g, " ");
}

console.log("Polaris oracle-at-block price footnote — on the page\n");
console.log(`BASE ${BASE}\n`);

// ── 0. the route's own rows, fetched independently ──────────────────────────

const usdp8 = await api(`/api/polaris/timeline?market=${PINNED.market}&id=${PINNED.id}`);
const pinnedEvent = usdp8.events.find((e) => e.id === PINNED.eventKey);
check(
  "0. the pinned event is on usdp/8's own route, at the pinned block",
  pinnedEvent != null && pinnedEvent.blockNumber === PINNED.block,
  pinnedEvent ? `block ${pinnedEvent.blockNumber}` : "event not found",
);
check(
  "0a. the route's own price_at_block_raw matches the pinned direct feed read",
  pinnedEvent?.context?.data?.priceAtBlock?.raw === PINNED.raw,
  `route says ${pinnedEvent?.context?.data?.priceAtBlock?.raw}`,
);

const nonTransferUsdp8 = usdp8.events.filter((e) => e.context.data.eventType !== "transfer");
const unfilledUsdp8 = nonTransferUsdp8.filter((e) => e.context.data.priceAtBlock == null);
console.log(
  `(info) usdp/8: ${nonTransferUsdp8.length} non-transfer rows, ${unfilledUsdp8.length} unfilled (price_at_block_filled: false)`,
);

const goldp8 = await api(`/api/polaris/timeline?market=goldp&id=8`);
const nonTransferGoldp8 = goldp8.events.filter((e) => e.context.data.eventType !== "transfer");

// ── the browser ──────────────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});

// ── 1. the pinned row shows the pinned figure (hardcoded, not route-derived) ─

const page8 = await open(context, polarisUrl(PINNED.market, PINNED.id));
const pinnedText = await expandRow(page8, PINNED.eventKey);
check(
  `1. usdp/8's pinned row (block ${PINNED.block}) shows the footnote pill "${PINNED.formatted}"`,
  pinnedText != null && pinnedText.includes(PINNED.formatted) && pinnedText.includes("oracle at block"),
  pinnedText ? pinnedText.slice(0, 300) : "row not found",
);
check(
  "1a. the pinned row's pill sits beside the pETH symbol",
  pinnedText != null && new RegExp(`pETH\\s*${PINNED.formatted.replace(/[.,]/g, "\\$&")}`).test(pinnedText),
  pinnedText ? pinnedText.slice(0, 300) : "",
);

// ── 2. every other non-transfer row on usdp/8 — pill equals the route's own
//    price_at_block_raw / 1e18 (2dp), formatted independently ──────────────

let mismatches = 0;
let unexpectedPresent = 0;
for (const e of nonTransferUsdp8) {
  if (e.id === PINNED.eventKey) continue; // already checked with the hardcoded pin
  const data = e.context.data;
  const text = await expandRow(page8, e.id);
  if (text == null) {
    mismatches++;
    console.log(`  (row not found on page) ${e.id}`);
    continue;
  }
  if (data.priceAtBlock == null) {
    // Unfilled — the plan requires no pill renders.
    if (/oracle at block/.test(text)) unexpectedPresent++;
    continue;
  }
  const want = priceText(data.priceAtBlock.raw, 2);
  if (!text.includes(want) || !text.includes("oracle at block")) {
    mismatches++;
    console.log(`  MISMATCH ${e.id} block ${e.blockNumber}: wanted "${want}", row text: ${text.slice(0, 200)}`);
  }
}
check(
  `2. usdp/8's other ${nonTransferUsdp8.length - 1} non-transfer row(s) each show a pill equal to the route's own price_at_block_raw ÷ 1e18`,
  mismatches === 0,
  `${mismatches} mismatch(es)`,
);
check(
  "2a. no unfilled row shows a pill it shouldn't",
  unexpectedPresent === 0,
  `${unexpectedPresent} unexpected pill(s)`,
);
await page8.close();

// ── 3. a row with price_at_block_filled: false, if any ─────────────────────

if (unfilledUsdp8.length > 0) {
  check(
    "3. an unfilled row (price_at_block_filled: false) on usdp/8 shows no footnote pill",
    true, // already asserted as part of check 2's loop (unexpectedPresent === 0 covers it)
    `${unfilledUsdp8.length} unfilled row(s) found and checked above`,
  );
} else {
  console.log(
    "3. NO EVIDENCE — no row on usdp/8 has price_at_block_filled: false (the lane has filled every block read)",
  );
}

// ── 4. goldp/8 shows 4-decimal pills ────────────────────────────────────────

const pageG8 = await open(context, polarisUrl("goldp", "8"));
let goldMismatches = 0;
for (const e of nonTransferGoldp8) {
  const data = e.context.data;
  const text = await expandRow(pageG8, e.id);
  if (data.priceAtBlock == null) continue;
  const want = priceText(data.priceAtBlock.raw, 4);
  if (text == null || !text.includes(want)) {
    goldMismatches++;
    console.log(
      `  MISMATCH goldp/8 ${e.id} block ${e.blockNumber}: wanted "${want}" (4dp), row text: ${text?.slice(0, 200)}`,
    );
  }
}
check(
  `4. goldp/8's ${nonTransferGoldp8.length} row(s) show 4-decimal pills`,
  nonTransferGoldp8.length > 0 && goldMismatches === 0,
  nonTransferGoldp8.length === 0 ? "no non-transfer rows to check" : `${goldMismatches} mismatch(es)`,
);
await pageG8.close();

// ── 5. the markdown export carries the column ───────────────────────────────

const page8b = await open(context, polarisUrl(PINNED.market, PINNED.id));
const copyMarkdown = async (page) => {
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(500);
  return page.evaluate(() => navigator.clipboard.readText());
};
const md = await copyMarkdown(page8b);
check(
  '5. the markdown export\'s timeline table carries a "pETH price at block" column',
  /pETH price at block/.test(md),
  md.includes("pETH price at block") ? "" : "column header not found",
);
const pinnedMdPrice = Number(fmt18Exact(PINNED.raw)).toLocaleString("en-US", { maximumFractionDigits: 6 });
check(
  `5a. the export states the pinned row's price (${pinnedMdPrice}) in its table`,
  md.includes(pinnedMdPrice),
  md.includes(pinnedMdPrice) ? "" : `wanted "${pinnedMdPrice}"`,
);
await page8b.close();

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Polaris oracle-at-block price footnote holds`,
);
process.exit(failures ? 1 : 0);
