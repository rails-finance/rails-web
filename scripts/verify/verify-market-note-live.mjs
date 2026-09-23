// The market-notes toolbar pill, and the LIVE note at the head of the
// timeline — the position's own quantity read at the chain head against its
// newest event that carries it.
// ---------------------------------------------------------------------------
// The change moves the
// "Market notes" toggle off the eye menu onto its own pressed-state pill
// beside it, reading "Market notes · N", and adds a live note in a dedicated
// head slot (above the newest row newest-first, below it oldest-first) for
// any OPEN position whose live read exists — unthresholded, because "nothing
// has moved" is itself the fact.
//
// Every EARLIER end below is a historical fact, read from the position's own
// timeline route and safe to pin (it does not move). Every LATER end is a
// live chain read and is NEVER pinned: it is re-fetched from the same routes
// the page reads, right before the assertion, and compared with a tolerance
// — a fixed number would go stale on the next block and read as a false
// failure forever after.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3416 node scripts/verify/verify-market-note-live.mjs

import { chromium } from "playwright";
import { drawnRows, drawWholeList } from "../lib/timeline-draw.mjs";
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

async function api(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

// ── Formatting, restated independently of lib/shared/market-note.ts ────────
const formatPrice = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPercent0 = (n) => `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`;
const formatChangeMagnitude = (n) =>
  `${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const formatRatePercent = (n) =>
  `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const formatDeltaPpMagnitude = (n) =>
  `${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pp`;
const formatStableAmount = (n) => {
  const opts =
    Math.abs(n) >= 1000
      ? { notation: "compact", maximumFractionDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return n.toLocaleString("en-US", opts);
};
const formatShareRate = (n) => n.toLocaleString("en-US", { minimumSignificantDigits: 5, maximumSignificantDigits: 6 });
// Mirrors lib/shared/market-note.ts formatRatio: a multiplier at a doubling or
// more (or a halving), the unsigned percentage move under that.
const formatRatio = (n) => {
  if (!(n > 0) || n >= 2 || n <= 0.5) return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}×`;
  const pct = Math.abs(n - 1) * 100;
  const text =
    pct >= 1
      ? pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : pct.toLocaleString("en-US", { maximumSignificantDigits: 2 });
  return `${text}%`;
};
const blk = (n) => n.toLocaleString("en-US");

/** A rendered block number is a live figure's own echo of whichever
 *  route answered it — never string-pinned. Extract the "after" integer of
 *  the `label` stat card's before→after pair and assert it sits within `tol`
 *  blocks of a route read taken moments apart on this same run. */
function blockNear(text, label, wantBlock, tol) {
  const re = new RegExp(`${label}.*?[\\d,]+\\s*→\\s*([\\d,]+)`);
  const m = re.exec(text);
  if (!m) return { ok: false, got: null };
  const got = Number(m[1].replace(/,/g, ""));
  return { ok: Math.abs(got - wantBlock) <= tol, got };
}

const pctWithin = (got, want, tolFrac) => Math.abs(got - want) <= Math.abs(want) * tolFrac + 1e-9;

/** The number right after the LAST "→" following `label` in the note's text —
 *  the "after" half of a before→after stat card, e.g. "Oracle price (…) 5,003.96
 *  → 5,378.75" yields 5378.75 for label "Oracle price". Used to compare a
 *  page's own rendered live figure against a fresh route read numerically,
 *  with a tolerance, rather than string-matching a value that can have ticked
 *  a block between the two reads. */
function afterArrow(text, label) {
  const re = new RegExp(`${label}.*?([\\d.,]+)\\s*(?:%|pp)?\\s*→\\s*([\\d.,]+)`);
  const m = re.exec(text);
  return m ? Number(m[2].replace(/,/g, "")) : null;
}

console.log("Market notes — the toolbar pill and the live note\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1600 },
  permissions: ["clipboard-read", "clipboard-write"],
});

async function open(url, waitForNoteMs = 15000) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page
    .locator('[data-market-note$="-head"]')
    .first()
    .waitFor({ state: "attached", timeout: waitForNoteMs })
    .catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

async function openNote(row) {
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { expanded: false }).first().click();
  await row.page().waitForTimeout(250);
  const trig = row.getByRole("button", { name: /how this note was derived/i });
  if (await trig.count()) await trig.click();
  await row.page().waitForTimeout(200);
  return (await row.innerText()).replace(/\s+/g, " ");
}

// ── 1. usdp/8 — two live notes in the head slot ─────────────────────────────

const chain8 = await api("/api/chain/polaris/position?market=usdp&id=8");
check("0a. usdp/8's chain overlay answers, open, priced", chain8.isOpen === true && chain8.price != null);

const page8 = await open(`${BASE}/sepolia/polaris/usdp/8`);
const ids8 = await page8
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
// ⚠️ THE COUNT IS READ, NOT PINNED — and the three surfaces are then held to
// each other. It was pinned at 29 until 2026-09-20 and the page drew 22, with
// the pill and the markdown export BOTH saying 22 as well, so the page is
// internally consistent and the pin is what moved. Nobody can say which figure
// is right: no baseline exists from before the plain-words commit, and a
// Sepolia CDP's note count moves with whoever touches it (TO-DO-ui-jobs §38 —
// the fall from 29 to 22 is the suspicious direction, since a touch only ever
// adds an endpoint, and it is recorded there rather than pinned over).
//
// So what this run asserts is the claim a pinned number could never make: the
// row count, the toolbar pill and the export all state ONE number (checks 7a
// and 9a), and the two live notes are the pinned ones by id (1b). A pill that
// drifted from its own rows is the defect this pair is for, and it survives a
// count that moves.
const NOTE_COUNT_8 = ids8.length;
check("1a. usdp/8 draws its live notes and some history", NOTE_COUNT_8 >= 3, `${NOTE_COUNT_8} note rows`);
check(
  "1b. the two live rows are in the head slot, above every historical row (DOM order, newest-first default)",
  ids8[0] === "price-gap:usdp:11610231-head" && ids8[1] === "rate-step:usdp:11610231-head",
  ids8.slice(0, 3).join(", "),
);

const priceRow8 = page8.locator('[data-market-note="price-gap:usdp:11610231-head"]');
const rateRow8 = page8.locator('[data-market-note="rate-step:usdp:11610231-head"]');
const priceText8 = await openNote(priceRow8.first());
const rateText8 = await openNote(rateRow8.first());

// Fresh read, right before the assertion — the live end is never pinned. Used
// as the independent, external cross-check (1e/1f below prove the page's own
// figures track a route read taken moments apart); the CR recomputation
// (1g) instead uses the price the PAGE ITSELF rendered (gotPrice8), so that
// check cannot go red from cross-read drift between two separate fetches —
// only from a wrong multiplication.
const liveChain8 = await api("/api/chain/polaris/position?market=usdp&id=8");
const FROM_PRICE_8 = 5003.958117092452;
const FROM_RATE_8 = 0.09343584279726581;
const FROM_COLL_8 = 2459.00427746329139381;
const FROM_DEBT_8 = 9191687.015714981855337009;
const crBefore8 = ((FROM_COLL_8 * FROM_PRICE_8) / FROM_DEBT_8) * 100;

check(
  "1c. the price note names its earlier end as this CDP's adjustment at block 11,610,231",
  /this is a live note:.*the earlier price: this cdp.s adjustment at block 11,610,231/i.test(priceText8),
  priceText8.slice(0, 200),
);
check(
  "1d. the price note's earlier price is the pinned historical figure",
  priceText8.includes(formatPrice(FROM_PRICE_8)),
  `wanted ${formatPrice(FROM_PRICE_8)}`,
);
const gotPrice8 = afterArrow(priceText8, "Oracle price");
check(
  "1e. the price note's later price is within 0.5% of the freshly-read overlay price",
  gotPrice8 != null && pctWithin(gotPrice8, liveChain8.price.pethInDebt, 0.005),
  `page ${gotPrice8}, overlay ${liveChain8.price.pethInDebt}`,
);
const priceBlock8 = blockNear(priceText8, "Blocks", liveChain8.blockNumber, 200);
check(
  "1f. the price note's later block is within 200 blocks of the overlay's blockNumber",
  priceBlock8.ok,
  `page states ${priceBlock8.got}, overlay ${liveChain8.blockNumber}`,
);
const crAfter8 = gotPrice8 != null ? (crBefore8 * gotPrice8) / FROM_PRICE_8 : NaN;
check(
  "1g. the price note's CR is recomputed from the pinned state and the page's own live price",
  priceText8.includes(formatPercent0(crBefore8)) && priceText8.includes(formatPercent0(crAfter8)),
  `wanted ${formatPercent0(crBefore8)} → ${formatPercent0(crAfter8)}`,
);
check(
  '1h. the price note names the quantity "oracle price"',
  priceText8.includes("oracle price"),
  priceText8.slice(0, 80),
);

check(
  "2a. the rate note is a LIVE note naming the CDP's own last touch, block 11,610,231",
  /this is a live note:.*this cdp.s own last touch/i.test(rateText8) &&
    /yearly interest on the debt at block 11,610,231/i.test(rateText8),
  rateText8.slice(0, 260),
);
check(
  "2b. the rate note's earlier rate is the pinned historical figure",
  rateText8.includes(formatRatePercent(FROM_RATE_8)),
  `wanted ${formatRatePercent(FROM_RATE_8)}`,
);
const gotRatePct8 = afterArrow(rateText8, "Primary rate");
check(
  "2c. the rate note's later rate is within 0.05pp of the freshly-read overlay primaryRate",
  gotRatePct8 != null && Math.abs(gotRatePct8 - liveChain8.primaryRate * 100) <= 0.05,
  `page ${gotRatePct8}%, overlay ${(liveChain8.primaryRate * 100).toFixed(2)}%`,
);
const interestBefore8 = FROM_DEBT_8 * FROM_RATE_8;
// The "after" interest is recomputed from the OVERLAY'S full-precision
// primaryRate, not the 2-decimal rate the row displays — a compact 2-sig-fig
// dollar figure is sensitive enough to input precision that reusing the
// DISPLAYED "1.37%" (rounded from e.g. 1.3697…%) rather than the underlying
// value produces a different compact figure than the page actually computed.
// Check 2c above already proved the overlay's rate is within 0.05pp of what
// the page rendered, so this is the same reading, at the precision the page
// itself used internally.
const interestAfter8 = FROM_DEBT_8 * liveChain8.primaryRate;
check(
  "2d. the rate note's yearly-interest figures are recomputed from the pinned debt and each rate",
  rateText8.includes(formatStableAmount(interestBefore8)) && rateText8.includes(formatStableAmount(interestAfter8)),
  `wanted ${formatStableAmount(interestBefore8)} → ${formatStableAmount(interestAfter8)}`,
);
check(
  '2e. the rate note names the quantity "primary rate"',
  rateText8.includes("primary rate"),
  rateText8.slice(0, 80),
);

// ── 2. usdp/27 and usdp/166 — no live note, historical counts unchanged ────

for (const [id, wantCount] of [
  ["27", 1],
  ["166", 1],
]) {
  const chain = await api(`/api/chain/polaris/position?market=usdp&id=${id}`);
  const p = await open(`${BASE}/sepolia/polaris/usdp/${id}`, 3000);
  // Same reason as 4 below: a note is drawn beside its row, so the list is
  // drawn whole before the notes on it are counted.
  const drawn = await drawWholeList(p);
  const ids = await p
    .locator("[data-market-note]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
  const liveOnes = ids.filter((i) => i.endsWith("-head"));
  check(
    `3. usdp/${id} (closed=${chain.isOpen === false}) shows no live note`,
    liveOnes.length === 0,
    `${liveOnes.length} live note(s): ${liveOnes.join(", ")}`,
  );
  check(
    `3. usdp/${id}'s historical price-gap count is unchanged at ${wantCount}`,
    drawn.complete && ids.filter((i) => i.startsWith("price-gap:")).length === wantCount,
    `got ${ids.filter((i) => i.startsWith("price-gap:")).length}, list ${drawn.drawn} of ${drawn.loaded} rows`,
  );
  await p.close();
}

// ── 3. TROVE_B — one live note ──────────────────────────────────────────────

// RE-PINNED 2026-09-20. The old fixture
// (`29779854367542649123526514384205099621162281315544372345570836626121545773770`)
// was closed on chain at block 25,963,791 — `closeTrove`, debt 0 — and a trove
// that owes nothing has no runway, so no live note can exist and check 3 was
// red on an absence. Chosen from the 82 open WETH troves carrying debt: 187%
// CR (the furthest from the branch minimum among the candidates with enough
// history), 269,949 BOLD on 203.49 WETH, 40 transactions, and **no
// redemptions ever** — the old one was redeemed so often its newest endpoint
// moved inside a single evening.
//
// 🔑 Its ten historical notes were confirmed to EQUAL this script's own
// arithmetic before it was pinned, which is what check 4b compares. Four of
// the six candidates did not: the page drew fewer notes than the same formula
// over the same timeline predicts, always dropping the OLDEST ones (trove
// `6993997275523863…` drew 7 where the arithmetic gives 9, missing blocks
// 23,764,772 and 23,983,783, on a 70-row life the page renders whole). That is
// a real disagreement and it is recorded in TO-DO-ui-jobs §38 rather than
// pinned around quietly — a fixture picked for agreeing is a check that has
// been steered away from what it is for.
const TROVE_B = "44560592591009195935177350759434193903980268875508162801605009277761763394257";
const ENDPOINT_TYPES = new Set(["trove", "liquidation", "redemption"]);
const logIndexOf = (e) => Number(e.id.split("_").pop());
const troveTimeline = await api(`/api/trove/WETH/${TROVE_B}/timeline?limit=500`);
const troveEnds = troveTimeline.events
  .filter((e) => {
    const d = e.context?.data;
    return d && ENDPOINT_TYPES.has(d.eventType) && d.collateralPrice > 0;
  })
  .sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a) - logIndexOf(b));
const troveHistoricalCount = (() => {
  const MCR = 1.1;
  const RUNWAY_SHARE = 0.25;
  const ZOMBIE = new Set(["adjustZombieTrove", "adjustUnredeemableZombieTrove"]);
  let n = 0;
  for (let i = 0; i < troveEnds.length - 1; i++) {
    const a = troveEnds[i];
    const b = troveEnds[i + 1];
    const da = a.context.data;
    const db = b.context.data;
    if (da.eventType !== "trove") continue;
    if (b.blockNumber <= a.blockNumber) continue;
    const pa = da.collateralPrice;
    const pb = db.collateralPrice;
    if (pa === pb) continue;
    const state = da.stateAfter;
    const debt = state?.debt ?? 0;
    const coll = state?.coll ?? 0;
    if (!(debt > 0) || !(coll > 0)) continue;
    const crBefore = state && state.collateralRatio > 0 ? state.collateralRatio : ((coll * pa) / debt) * 100;
    const runway = 1 - MCR / (crBefore / 100);
    const move = Math.abs(pb / pa - 1);
    const consumed = runway > 0 ? move / runway : Infinity;
    const endedBy =
      db.eventType === "liquidation"
        ? "liquidation"
        : db.eventType === "redemption" || ZOMBIE.has(db.operation)
          ? "redemption"
          : "adjustment";
    if (endedBy === "adjustment" && !(consumed >= RUNWAY_SHARE)) continue;
    n++;
  }
  return n;
})();
// TROVE_B is redeemed often (its newest endpoint moved from 25,916,252 to
// 25,920,903 inside one evening), so the earlier end is READ from the route
// rather than pinned: the timeline is an input to the page, not the thing
// under test, and the live note must name whichever priced endpoint is
// newest at run time. What IS pinned is the shape — a priced trove /
// redemption / liquidation row carrying the debt and collateral the CR is
// recomputed from.
const newestTrovePriced = troveEnds[troveEnds.length - 1];
const newestDataB = newestTrovePriced.context.data;
const END_LABELS_B = {
  openTrove: "opening",
  openTroveAndJoinBatch: "opening",
  adjustTrove: "adjustment",
  adjustTroveInterestRate: "interest-rate change",
  adjustZombieTrove: "zombie adjustment",
  adjustUnredeemableZombieTrove: "zombie adjustment",
  applyPendingDebt: "pending-debt application",
  closeTrove: "close",
  liquidate: "liquidation",
  redeemCollateral: "redemption",
  setInterestBatchManager: "batch join",
  removeFromBatch: "batch exit",
};
const endLabelB = END_LABELS_B[newestDataB.operation] ?? newestDataB.operation;
check(
  "0b. TROVE_B's newest priced endpoint is a priced trove/redemption/liquidation row stating debt and collateral",
  newestDataB.collateralPrice > 0 && newestDataB.stateAfter?.debt > 0 && newestDataB.stateAfter?.coll > 0,
  `${newestTrovePriced.blockNumber} (${newestDataB.eventType} / ${newestDataB.operation}), price ${newestDataB.collateralPrice}`,
);
const FROM_BLOCK_B = newestTrovePriced.blockNumber;

const pageB = await open(`${BASE}/ethereum/liquity-v2/trove/WETH/${TROVE_B}`);
// A NOTE IS DRAWN BESIDE ITS ROW, so a census taken over the first render
// window counts the window's notes and not the position's. Draw the whole
// loaded list first — and say so, because a count taken on an undrawn list is
// not a smaller count, it is a different question (§38, 2026-09-21).
const drawnB = await drawWholeList(pageB);
check(
  "4. TROVE_B's list is drawn whole before its notes are counted",
  drawnB.complete,
  `${drawnB.drawn} of ${drawnB.loaded} rows, ${drawnB.presses} press(es)`,
);
const idsB = await pageB
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
const liveB = idsB.filter((i) => i.endsWith("-head"));
check("4a. TROVE_B shows exactly one live note", liveB.length === 1, `${liveB.length}: ${liveB.join(", ")}`);
check(
  "4b. TROVE_B's historical price-gap count is unchanged",
  idsB.filter((i) => i.startsWith("price-gap:") && !i.endsWith("-head")).length === troveHistoricalCount,
  `wanted ${troveHistoricalCount}, got ${idsB.filter((i) => i.startsWith("price-gap:") && !i.endsWith("-head")).length}`,
);
// 4c — THE INVARIANT THAT WOULD HAVE ENDED THIS IN A MINUTE. The pill counts
// every note the rule found, whatever the list has drawn; the drawn notes are
// the ones a reader can see. On a whole list the two are the same number, and
// where they are not, one of them is wrong. Four troves were recorded as
// disagreeing with their own arithmetic on 2026-09-20 because the page drew 50
// of 70 rows: the pill said 10 throughout and nothing was reading it.
const pillTextB = await pageB
  .getByRole("button", { name: /^Market notes/i })
  .first()
  .textContent()
  .catch(() => null);
const pillCountB = Number((pillTextB ?? "").replace(/[^\d]/g, ""));
check(
  "4c. the toolbar pill's count is the count of notes on the drawn list",
  drawnB.complete && Number.isFinite(pillCountB) && pillCountB === idsB.length,
  `pill ${pillTextB?.trim() ?? "absent"} vs ${idsB.length} drawn`,
);

// ── 4d/4e — THE TRAP ITSELF, on a subject DISCOVERED at run time ───────────
// TROVE_B is 26 rows and fits inside one render window, so 4c can pass there
// without the window ever binding — an invariant nothing exercises is the
// vacuous pass in its other costume. A trove with more rows than the window
// is the only subject that proves it: undrawn, its notes are FEWER than the
// pill states; drawn whole, the two agree. Where the roster holds no such
// trove today that is SAID, not passed.
const notePill = async (p) => {
  const t = await p
    .getByRole("button", { name: /^Market notes/i })
    .first()
    .textContent()
    .catch(() => null);
  return Number((t ?? "").replace(/[^\d]/g, ""));
};
const wideRoster = await api("/api/troves?collateralType=WETH&status=open&limit=200");
let windowed = null;
for (const t of (wideRoster.data ?? []).filter((r) => Number(r.activity?.transactionCount ?? 0) > 60).slice(0, 4)) {
  const p = await open(`${BASE}/ethereum/liquity-v2/trove/WETH/${t.id}`, 3000);
  const rows = await drawnRows(p);
  if (rows.loaded != null && rows.drawn < rows.loaded) {
    windowed = { id: t.id, page: p, rows };
    break;
  }
  await p.close();
}
if (
  check(
    "4d. a trove whose list is WINDOWED was found at run time",
    windowed != null,
    windowed
      ? `${windowed.id.slice(0, 10)}… draws ${windowed.rows.drawn} of ${windowed.rows.loaded} rows`
      : "NO EVIDENCE — no open WETH trove in the first 200 draws short of its loaded rows, so 4c is unexercised",
  )
) {
  const pillBefore = await notePill(windowed.page);
  const drawnBefore = await windowed.page.locator("[data-market-note]").count();
  check(
    "4e. undrawn, it shows FEWER notes than the pill states — the trap §38 recorded",
    pillBefore > drawnBefore,
    `pill ${pillBefore} vs ${drawnBefore} drawn, ${windowed.rows.drawn} of ${windowed.rows.loaded} rows`,
  );
  const whole = await drawWholeList(windowed.page);
  const drawnAfter = await windowed.page.locator("[data-market-note]").count();
  check(
    "4f. drawn whole, the pill and the list agree",
    whole.complete && (await notePill(windowed.page)) === drawnAfter && drawnAfter === pillBefore,
    `${drawnBefore} → ${drawnAfter} notes over ${whole.drawn} of ${whole.loaded} rows, ${whole.presses} press(es)`,
  );
  await windowed.page.close();
}

const noteRowB = pageB.locator(`[data-market-note="price-gap:weth:${FROM_BLOCK_B}-head"]`);
const textB = await openNote(noteRowB.first());
const [headB, oracleB] = await Promise.all([api("/api/head"), api("/api/oracle/liquity-v2")]);
const FROM_PRICE_B = newestDataB.collateralPrice;
const FROM_DEBT_B = newestDataB.stateAfter.debt;
const FROM_COLL_B = newestDataB.stateAfter.coll;
const crBeforeB = ((FROM_COLL_B * FROM_PRICE_B) / FROM_DEBT_B) * 100;
check(
  `5a. TROVE_B's live note names its earlier end as this trove's ${endLabelB} at block ${FROM_BLOCK_B.toLocaleString("en-US")}`,
  new RegExp(
    `this is a live note:.*the earlier price: this trove.s ${endLabelB} at block ${FROM_BLOCK_B.toLocaleString("en-US")}`,
    "i",
  ).test(textB),
  textB.slice(0, 200),
);
check(
  `5b. the note's earlier price is the route's own figure for that row, ${formatPrice(FROM_PRICE_B)}`,
  textB.includes(formatPrice(FROM_PRICE_B)),
  textB.slice(0, 120),
);
const gotPriceB = afterArrow(textB, "Oracle price");
check(
  "5c. the note's later price is within 0.5% of the WETH oracle route's price, read just now",
  gotPriceB != null && pctWithin(gotPriceB, oracleB.data.weth, 0.005),
  `page ${gotPriceB}, route ${oracleB.data.weth}`,
);
const blockB = blockNear(textB, "Blocks", headB.blockNumber, 200);
check(
  "5d. the note's later block is within 200 blocks of /api/head",
  blockB.ok,
  `page ${blockB.got}, head ${headB.blockNumber}`,
);
// CR recomputed from the price the PAGE ITSELF rendered — see usdp/8's own
// 1g for why this avoids cross-read drift between two separate fetches.
const crAfterB = gotPriceB != null ? (crBeforeB * gotPriceB) / FROM_PRICE_B : NaN;
check(
  "5e. the note's CR is recomputed from the row's own state and the page's own live price",
  textB.includes(formatPercent0(crBeforeB)) && textB.includes(formatPercent0(crAfterB)),
  `wanted ${formatPercent0(crBeforeB)} → ${formatPercent0(crAfterB)}`,
);
check("5f. the note names the branch minimum, 110%", textB.includes(formatPercent0(110)), "");
check(
  "5g. the note states the sub-line about the position card's own live ratio carrying accrued interest",
  /position card.s live ratio also carries the interest accrued since then/i.test(textB),
  textB.slice(-300),
);

// ── 4. Moonwell wallet — one live MAMO note ─────────────────────────────────

const MAMO_WALLET = "0x719eae70d4a83f35bf82a2740699f5db84be919d";
const MAMO_MARKET = "0x2f90bb22eb3979f5ffad31ea6c3f0792ca66da32";
const chainMoonwell = await api(`/api/chain/moonwell-base/position?wallet=${MAMO_WALLET}`);
const mamoMarket = chainMoonwell.markets.find((m) => m.market.toLowerCase() === MAMO_MARKET);
check("0c. the fixture wallet's MAMO market answers on the overlay", mamoMarket != null && mamoMarket.entered === true);

const mamoPage = await open(`${BASE}/base/moonwell/${MAMO_WALLET}`, 25000);
const idsMamo = await mamoPage
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
const liveMamo = idsMamo.filter((i) => i.endsWith("-head"));
check(
  "6a. the wallet shows exactly one live MAMO note",
  liveMamo.length === 1,
  `${liveMamo.length}: ${liveMamo.join(", ")}`,
);
const liveMamoId = `share-rate-step:${MAMO_MARKET}:50516316-head`;
check(
  "6b. the live note's id matches the pinned earlier end, block 50,516,316",
  liveMamo[0] === liveMamoId,
  liveMamo[0] ?? "(none)",
);

const mamoRow = mamoPage.locator(`[data-market-note="${liveMamoId}"]`);
const mamoText = await openNote(mamoRow.first());
const freshMoonwell = await api(`/api/chain/moonwell-base/position?wallet=${MAMO_WALLET}`);
const freshMamo = freshMoonwell.markets.find((m) => m.market.toLowerCase() === MAMO_MARKET);
const FROM_RATE_MAMO = 7100000 / 346117650.66876537;
check(
  "6c. the note's earlier rate is the pinned historical implied rate, 0.020513",
  mamoText.includes(formatShareRate(FROM_RATE_MAMO)),
  `wanted ${formatShareRate(FROM_RATE_MAMO)}`,
);
const gotRateMamo = afterArrow(mamoText, "Share rate");
check(
  "6d. the note's later rate is within 0.5% of the freshly-read overlay exchangeRate",
  gotRateMamo != null && pctWithin(gotRateMamo, freshMamo.exchangeRate, 0.005),
  `page ${gotRateMamo}, overlay ${freshMamo.exchangeRate}`,
);
const wantUnits = Number(freshMamo.mtokenBalanceRaw) / 1e8;
check(
  "6e. the wallet's live mMAMO holding matches the pinned figure, 0.13887953",
  Math.abs(wantUnits - 0.13887953) < 1e-6,
  `overlay states ${wantUnits}`,
);
check(
  "6e2. the note states that same holding, 0.139 mMAMO (formatUnits' 3-decimal display)",
  mamoText.includes("0.139"),
  mamoText.slice(0, 300),
);
check('6f. the note names the quantity "share rate"', mamoText.includes("share rate"), mamoText.slice(0, 80));

// ── 5. Toolbar — the pill, the toggle, the eye menu, the no-notes page ─────

const pill8 = page8.getByRole("button", { name: /^Market notes/i }).first();
check(
  `7a. usdp/8's pill states the same count as the rows it governs, ${NOTE_COUNT_8}`,
  (await pill8.textContent())?.trim() === `Market notes \u00b7 ${NOTE_COUNT_8}`,
  await pill8.textContent(),
);
const pressedBefore = await pill8.getAttribute("aria-pressed");
await pill8.click();
await page8.waitForTimeout(300);
const pressedAfter = await pill8.getAttribute("aria-pressed");
const notesAfterToggle = await page8.locator("[data-market-note]").count();
check(
  "7b. pressing the pill hides every note row (historical and live) and flips aria-pressed",
  pressedBefore === "true" && pressedAfter === "false" && notesAfterToggle === 0,
  `aria-pressed ${pressedBefore} → ${pressedAfter}, ${notesAfterToggle} note(s) left`,
);
await pill8.click();
await page8.waitForTimeout(300);

// The eye/Display menu — same trigger-finding handle the sibling verifiers use.
const countSpan8 = page8.getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/).first();
const row8 = countSpan8.locator(
  'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " gap-2 ") and contains(concat(" ", normalize-space(@class), " "), " items-center ")][1]',
);
const eyeTrigger8 = row8.locator("div.relative.inline-flex.items-center > button").last();
await eyeTrigger8.click();
await page8.waitForTimeout(400);
const eyeHasItem = await page8.getByRole("button", { name: /^Market notes$/i }).count();
check('7c. the eye menu has no "Market notes" item', eyeHasItem === 0, `${eyeHasItem} found`);
await page8.keyboard.press("Escape").catch(() => {});
await page8.close();

// The no-notes page — a Liquity V1 trove: no note kind exists there at all.
const v1Roster = await api("/api/liquity-v1/positions?status=active&limit=1");
const v1Wallet = v1Roster.data?.[0]?.wallet;
check("8a. a Liquity V1 wallet with an open trove was found for the control", !!v1Wallet, v1Wallet ?? "NO EVIDENCE");
if (v1Wallet) {
  const v1Page = await open(`${BASE}/ethereum/liquity-v1/${v1Wallet}`, 3000);
  const v1Notes = await v1Page.locator("[data-market-note]").count();
  const v1Pill = await v1Page.getByRole("button", { name: /^Market notes/i }).count();
  check(
    "8b. the no-notes page (Liquity V1 trove) shows no note and no pill",
    v1Notes === 0 && v1Pill === 0,
    `${v1Notes} note(s), pill ${v1Pill}`,
  );
  await v1Page.close();
} else {
  check("8b. the no-notes page (Liquity V1 trove) shows no note and no pill", false, "NO EVIDENCE — no fixture found");
}

// ── 6. Markdown export on usdp/8 carries both live sentences ───────────────

const exportPage = await open(`${BASE}/sepolia/polaris/usdp/8`);
const copyMarkdown = async () => {
  await exportPage
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await exportPage.getByRole("menuitem", { name: /Copy Position/i }).click();
  await exportPage.waitForTimeout(500);
  return exportPage.evaluate(() => navigator.clipboard.readText());
};
const md8 = await copyMarkdown();
check(
  `9a. the markdown export names "Market notes" and lists the same count, ${NOTE_COUNT_8}`,
  new RegExp(`\\*\\*Market notes:\\*\\*\\s*${NOTE_COUNT_8}\\b`).test(md8),
  md8.includes("Market notes") ? md8.match(/\*\*Market notes:\*\*[^\n]*/)?.[0] : "absent",
);
check(
  "9b. the export's Market notes section carries the price live sentence (since … at the latest block)",
  /Since this CDP.s adjustment at block 11,610,231 the pETH oracle price has moved/.test(md8),
);
check(
  "9c. the export's Market notes section carries the rate live sentence",
  /Since this CDP.s adjustment at block 11,610,231 the USDp market.s primary rate has moved/.test(md8),
);
const tableRows = (md) => (md.match(/^\| \d+ \| /gm) ?? []).length;
const usdp8Timeline = await api("/api/polaris/timeline?market=usdp&id=8");
check(
  "9d. the live notes add no row to the timeline table — its count is the route's own event count",
  tableRows(md8) === usdp8Timeline.events.length,
  `table ${tableRows(md8)} rows, route ${usdp8Timeline.events.length} events`,
);
await exportPage.close();

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the live market note holds`,
);
process.exit(failures ? 1 : 0);
