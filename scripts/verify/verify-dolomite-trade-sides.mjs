// Verify a Dolomite trade names BOTH markets it moves.
// ----------------------------------------------------------------------------
// A field-classification survey found `DolomiteContext.otherMarketId` /
// `.otherMarketSymbol` declared (lib/shared/types/event-shape.ts) and read by
// two consumers — the asset filter (lib/shared/event-filter-helpers.ts) and
// the trade explainer (lib/dolomite/explainer-clauses.tsx) — but never SET by
// lib/sources/api/dolomite-timeline.ts. Both consumers degraded silently: the
// asset filter under-counted a trade (indexed under one market when it
// touches two), and the explainer rendered a truncated sentence ("Traded
// away 5 USD1 — the spent side of a swap routed through an exchange
// wrapper." with no "into {market}"). The type system cannot catch this
// class — the field is optional, so a transform that never assigns it is
// never wrong at compile time — which is why this is a RUNTIME assertion.
//
// The fix reads the sibling leg off the SAME underlying log: Dolomite's
// mv_dolomite_events un-pivots one LogSell/LogBuy/LogTrade into per-account
// legs that share (tx_hash, log_index) and differ in market_id — confirmed
// against a real chain log (see the fixture below), not invented.
//
// Fixture: owner 0x52256ef863a713ef349ae6e97a7e8f35785145de, account number
// 110529762135786682830592444075231579177472998369851358890702192257666445082895
// — a Zap-style sell (tx 0x9ed962…dad1417, LogSell topic0
// 0xcc3330184b6d88cad87f9e9543b4d4110a6a3eaf20164ca5252d598d0acba3f1, block
// 22790276): USD1 (market 1) spent for WETH (market 0), sized via a transfer
// in from and back out to account 0. Both sides are real, chain-observed
// figures, never guessed.
//
// Run with the dev server up: BASE=http://localhost:3711 node scripts/verify/verify-dolomite-trade-sides.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3711";
const OWNER = "0x52256ef863a713ef349ae6e97a7e8f35785145de";
const NUM = "110529762135786682830592444075231579177472998369851358890702192257666445082895";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

// ── §1 the transform, via this app's own proxy route ────────────────────────
// The route runs buildDolomiteTimeline over the real backend rows (no mock),
// so this is the same code path the position page renders from.
const qs = new URLSearchParams({ owner: OWNER, accountNumber: NUM, limit: "50" });
const res = await fetch(`${BASE}/api/dolomite/timeline?${qs}`);
check("timeline API responds 200", res.ok, `status ${res.status}`);
const json = await res.json();

const trades = (json.events ?? []).filter((e) => {
  const t = e.context?.data?.eventType;
  return t === "trade_taker" || t === "trade_maker";
});
check("fixture carries two trade legs", trades.length === 2, `found ${trades.length}`);

const taker = trades.find((e) => e.context.data.eventType === "trade_taker");
const maker = trades.find((e) => e.context.data.eventType === "trade_maker");
check(
  "trade_taker (USD1, spent) names the other side as WETH",
  taker?.context.data.marketSymbol === "USD1" &&
    taker?.context.data.otherMarketId === 0 &&
    taker?.context.data.otherMarketSymbol === "WETH",
  JSON.stringify({
    own: taker?.context.data.marketSymbol,
    otherId: taker?.context.data.otherMarketId,
    other: taker?.context.data.otherMarketSymbol,
  }),
);
check(
  "trade_maker (WETH, received) names the other side as USD1",
  maker?.context.data.marketSymbol === "WETH" &&
    maker?.context.data.otherMarketId === 1 &&
    maker?.context.data.otherMarketSymbol === "USD1",
  JSON.stringify({
    own: maker?.context.data.marketSymbol,
    otherId: maker?.context.data.otherMarketId,
    other: maker?.context.data.otherMarketSymbol,
  }),
);

// A transfer leg (no other side to a plain transfer) must stay unset — never
// a guessed value where none exists.
const transfers = (json.events ?? []).filter((e) => {
  const t = e.context?.data?.eventType;
  return t === "transfer_in" || t === "transfer_out";
});
check(
  "transfer legs carry no otherMarket (nothing to guess)",
  transfers.length > 0 &&
    transfers.every((e) => e.context.data.otherMarketId == null && e.context.data.otherMarketSymbol == null),
  `${transfers.length} transfer legs`,
);

// ── §2 the rendered explainer prose ─────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(`${BASE}/dolomite/${OWNER}/${NUM}`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1000);

async function explainerTextFor(labelText) {
  const card = page.locator('[data-skel-section="detail-event"]').filter({ hasText: labelText });
  await card.locator('.group\\/evt[role="button"], [role="button"].group\\/evt').first().click();
  await page.waitForTimeout(300);
  const explainBtn = card.locator('button[aria-label="Show explanation"]').first();
  if ((await explainBtn.count()) === 0) return null;
  await explainBtn.click();
  await page.waitForTimeout(300);
  return card.first().textContent();
}

const spentText = await explainerTextFor("Trade (spent)");
check(
  "explainer names the destination market on the spent leg",
  /into WETH/.test(spentText ?? ""),
  spentText ?? "(no card)",
);

const receivedText = await explainerTextFor("Trade (received)");
check(
  "explainer names the source market on the received leg",
  /out of USD1/.test(receivedText ?? ""),
  receivedText ?? "(no card)",
);

// ── §3 the asset filter cross-indexes the trade under BOTH markets ──────────
const allButtons = page.locator("button", { hasText: "All" });
await allButtons.nth(1).click();
await page.waitForTimeout(300);
const assetMenuText = (await page.locator('[role="menu"], [role="listbox"], .absolute').allTextContents()).join(" ");
check(
  "asset filter lists both USD1 and WETH with count 3 (2 own + 1 cross-referenced each)",
  /USD1[^\d]*3/.test(assetMenuText) && /WETH[^\d]*3/.test(assetMenuText),
  assetMenuText.replace(/\s+/g, " ").slice(0, 200),
);

check("no page errors across the run", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
