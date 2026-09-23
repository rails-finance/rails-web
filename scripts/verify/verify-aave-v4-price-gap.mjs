// Aave V4 price-gap market notes — the rule, and the rows it draws.
// ---------------------------------------------------------------------------
// The change puts the price-gap kind
// on the Aave V4 spoke position page. What is new here, and what this script
// exists to prove, is that a note is PER ASSET rather than per position: an
// Aave account holds several collaterals against several debts in one spoke,
// so a note states ONE asset's oracle price at two of the position's own rows,
// and the figure it moves is the health factor of the whole basket the earlier
// row recorded.
//
// Two independent things are checked, and the order matters:
//
//   1. THE RULE. A replica of §0's rule — written here, reading the same
//      /api/aave-v4/timeline and /api/chain/aave-v4/spoke-position routes the
//      page reads, importing nothing from lib/aave-v4/market-notes.ts —
//      reproduces the tables pinned in the plan's §1 exactly: the blocks, the
//      prices, the health factors to four decimals and the consumed share to
//      three. Never derive an expected value from the code under test.
//
//   2. THE PAGE. Every fixture's rendered rows are then compared against that
//      same replica, so a bug in the shipped selector shows up as a difference
//      between the page and a rule that never imported it.
//
// Every HISTORICAL end below is a fact of the position's own timeline route,
// read once and safe to pin.
//
// A LIVE NOTE NOW READS BOTH OF ITS ENDS FROM THE FEEDS (backend eb7f775,
// web 32f1db63). It used to take its earlier end from the price the newest row
// STATED, which comes from the historic-price lane — and that lane's live
// writer covers eight of the registry's feeds, so on 2026-09-07 a September
// wstETH row carried May's price and the note reported an 18.5% "move" that
// never happened. Step 1 (backend `70cf563`) made a stalled lane an ABSENT
// price rather than a wrong one, which only turned the note absent; the note
// was withheld for a day, and this restores it reading both ends from
// GET /api/oracle/aave-v4 — at head for the later end, and pinned to the
// earlier row's own block (`?block=B`) for the earlier one.
//
// AND THE LANE ITSELF IS NO LONGER EIGHT FEEDS (backend `f7dff0a` +
// `5ee993d`, 2026-09-08). scripts/fill-aave-v4-prices.mjs prices the whole
// oracle registry at every V4 event block, so the eight aggregators the live
// writer follows are no longer the only assets a row can state — wstETH,
// weETH, GHO and the rest carry the feed's own number at the row's own block,
// and the $1 stable pin is gone. That is why §8b and §9b now find the earlier
// rows priced, and why the one closed-control note whose debt held GHO moved
// in its fourth decimal (see PIN_CLOSED). No note's own asset price changed:
// every one of them was already a lane the live writer covered.
//
// So the two ends are pinned DIFFERENTLY here, and it matters:
//
//   THE EARLIER END IS A CHAIN FACT AT A FIXED BLOCK. §0's new checks pin
//   three of them outright (the plan's §2.4 table, archive-read on 2026-09-07
//   through the api container's own client), including one at a block where
//   the lane's own writer was live — where lane and chain agree to the last
//   digit, which is the cross-check that the pinned read is the same feed the
//   index captured.
//
//   THE BLOCK'S ANSWER IS FIXED. THE ORACLE BEHIND IT IS NOT — and this file
//   said "immutable" of both until server migration 314 (2026-09-22) proved
//   the difference. That migration re-sourced the stored price history to the
//   spoke's own `AaveOracle` (`getReservePrice`) where it had been reading a
//   Chainlink aggregator, so every pinned figure below moved without a block
//   moving: wstETH at 25,919,931 answers 3099.13972221 where §2.4 archive-read
//   3082.92570795, AAVE at 25,898,748 answers 134.36554609 against the lane's
//   134.3569. A pin here is a read of one oracle at one block; re-source the
//   oracle and the pin is stale though the chain never moved.
//
//   THE LATER END IS NEVER PINNED. It is re-read from the same route right
//   before each assertion and compared with a 1% tolerance, its block within
//   200 of the map's own.
//
// The open fixtures act again, and two of them have. Where a live fixture's
// earlier row has moved on, the run states which branch it took: the pinned
// price where the block is still the pinned one, and otherwise the page's own
// earlier price against the route's `?block=<that block>` answer — with the
// §2.4 anchors asserted either way, so a moving position can never leave the
// correctness check unmade.
//
// THE PRICE TABLES BELOW ARE STALE, AND KNOWN-RED PENDING RE-DERIVATION.
// `PIN_A`, `PIN_B`, `PIN_C`, `PIN_CLOSED`, `PINNED_READS`, `PIN_C_LIVE` and
// `LANE_AGREEMENT_BLOCK` all hold pre-314 Chainlink figures. They are re-read
// from an archive `getReservePrice` the way verify-aave-v4-price-stamp.mjs
// does — not from the route this script tests — and only on a quiet box,
// because a loaded one has twice answered partially here and had the partial
// answer pinned as fact. Until then these 29 stay red and not one of them is a
// finding about the page (run 2026-09-22, 29 of 90): 0e, 0g, 1a, 1b, 1c-ii,
// 1e-ii, 2e, 2i–2l, 4e, 4f, 4g-*, 8c. Two more are red at one remove, because
// re-pricing moves which stretches clear the consumed threshold and so which
// notes exist at all: 1e-ii-b, and 5c, whose pinned MEMBERSHIP is what fails
// and not the window it is written against. 1c-iii is the same shape and
// passes today; it holds the literal 10 and the same re-pricing can move it.
//
// TWO THINGS TO FIX WHILE RE-DERIVING, both found by the run that made the
// counts derived. `PIN_A[0]` is fixture A's OLDEST note and the window no
// longer draws it, so 2i–2l read an empty row and fail on the absence before
// they reach the figures: the row §2 opens has to be chosen from the ones the
// page drew, the way §4 chooses `liqDrawn`. And `PIN_C_LIVE` pins a live
// note's earlier BLOCK (25,880,197), which moved to 25,941,157 when the wallet
// acted — 4f and every 4g- with it. A live note's earlier end is a block the
// position picks, so §4 wants the branch §2 and §8 already take.
//
// EVERY COUNT IN THIS FILE IS DERIVED, NOT PINNED (2026-09-22). Six positions
// here are open and act, the timeline draws a window over the newest rows, and
// a count written down is a count that goes red on a wallet, not on a bug. So
// the row counts are floors with the route's own property asserted beside
// them, the note counts come from the replica, and the toggle's count is the
// one the page itself stated a moment earlier.
//
// WHY THE PRICED ANSWER IS THE TRUTH, and an empty one is a failure. On
// 2026-09-06 this route answered fixture C both with and without its snapshot
// item prices, from one request to the next, and the first pins were taken from
// the empty answer. That was never a property of the data: the API's pg pool
// (max 10, a 2 s connect wait) saturated under three verifier runs at once —
// 208 connect timeouts in an hour — and the timeline's snapshot-price fetch
// swallowed the timeout with a `.catch(() => new Map())`, so a POOL FAILURE
// rendered as "this row states no price" and the rule, correctly, made
// price-only notes of it. Backend `cda7b4c` widens the pool to
// 20 / 10 s and logs that catch, and fixture C now answers every one of its
// items priced on every read. The count itself is not stated here: it is the
// EQUALITY that is the fact, and 1c-i asserts it against the run's own read.
//
// So check 1c-i asserts the FULL pricing, and a run that ever sees it partial
// should be read as the pool failing again rather than as the index changing
// its mind. One benign way it can go red against a healthy backend: an edge
// cache entry written DURING the failure is still inside its TTL, so the plain
// URL is served an empty answer the origin would no longer give — re-read it
// with a cache-buster before chasing the pool.
//
// AND A SECOND WAY AN ABSENCE LIED. Until 2026-09-07 this script pinned "the
// closed control's rows state no snapshot item prices" as an observation
// about that position. It was the snapshot-price query's own 5 s statement
// timeout: 478 rows against an unbounded at-or-before scan took over five
// seconds, the route swallowed the timeout, and the empty map read as a fact.
// The freshness window bounds the scan (0.44 s for the same wallet), every one
// of the control's 2,183 items is priced, and its six price-only notes turned
// out to be fifty, forty-nine of them with a health payload. 1e-i now asserts
// the full pricing; 1e-ii pins the fifty.
//
// AND IT LIED AGAIN ON 2026-09-08, the same way, for a new reason. 1e-i went
// red at 144 of 2,183 items priced, cache-buster and all, while every other
// fixture answered fully priced — and the api log names it: "aave-v4 snapshot
// prices unavailable; serving rows without them" on this wallet, "canceling
// statement due to statement timeout", once a minute. The freshness window
// bounds the scan per row, but `aave_v4_historic_prices` had just grown by the
// whole registry at every V4 event block (backend `f7dff0a`, step 3 of the same
// programme), and 478 rows against the larger table crosses the 5 s timeout
// again. So the diagnosis order for a red 1e-i is: read the api log for that
// wallet FIRST — a timeout there is a backend fact, not a claim about this
// position. It is not the live note: 1e's checks are historical, and the live
// sections stand or fall on their own.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3416 node scripts/verify/verify-aave-v4-price-gap.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};
const note = (text) => console.log(`      · ${text}`);

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
const formatHf = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const blk = (n) => n.toLocaleString("en-US");
const pctWithin = (got, want, tolFrac) => Math.abs(got - want) <= Math.abs(want) * tolFrac + 1e-9;
/** Relative equality, for comparing a chain read against the lane's own row. */
const relEq = (a, b, tol = 1e-6) => Math.abs(a - b) <= Math.abs(b) * tol + 1e-12;

// ═══════════════════════════════════════════════════════════════════════════
// The replica of §0's rule. Nothing below imports the shipped selector.
// ═══════════════════════════════════════════════════════════════════════════

const RUNWAY_SHARE = 0.25;

// What a LIVE gap has to state to be worth a row. A live note is otherwise
// unthresholded — it runs from the position's last touch to the chain head,
// and "nothing has moved since" is the fact — but on a basket of pegged assets
// that draws a row reading the same at both ends. So one of the two questions
// a gap answers has to have an answer: the move cleared a floor, or it
// consumed a share of this position's own runway. A position with no runway
// left (`consumed` = Infinity) is under the line already and always renders.
// Shipped in web `2fac3aae`; the numbers are `LIVE_GAP_MOVE_FLOOR` and
// `LIVE_GAP_RUNWAY_SHARE` in lib/shared/market-note.ts, restated here the way
// the rest of the replica is restated.
const LIVE_GAP_MOVE_FLOOR = 0.0005;
const LIVE_GAP_RUNWAY_SHARE = 0.05;
const liveGapStatesAChange = (move, consumed) =>
  Number.isFinite(move) && (move >= LIVE_GAP_MOVE_FLOOR || consumed >= LIVE_GAP_RUNWAY_SHARE);

const logIndexOf = (id) => {
  const cut = id.lastIndexOf("-");
  if (cut < 0) return -1;
  const n = Number(id.slice(cut + 1));
  return Number.isFinite(n) ? n : -1;
};

/** The price a row STATES for one asset, or 0 where it states none. */
function assetPriceOn(row, symbol) {
  const d = row.context?.data;
  if (!d) return 0;
  for (const item of [...(d.allSupplies ?? []), ...(d.allDebts ?? [])]) {
    if (item.symbol === symbol && item.price && item.price.usd > 0) return item.price.usd;
  }
  if (d.eventType === "liquidation") {
    if (d.collateralSymbol === symbol && d.collateralPrice?.usd > 0) return d.collateralPrice.usd;
    if (d.reserveSymbol === symbol && d.debtPrice?.usd > 0) return d.debtPrice.usd;
  }
  if (d.reserveSymbol === symbol && d.price?.usd > 0) return d.price.usd;
  return 0;
}

/** The basket the row's own snapshot states, at the thresholds the spoke
 *  reports now. `priced` is false wherever any leg is unpriced, any
 *  collateral's LT is unknown, or the row carries no debt at all. */
function basketAt(row, lts) {
  const d = row.context?.data ?? {};
  const supplies = d.allSupplies ?? [];
  const debts = d.allDebts ?? [];
  let priced = debts.length > 0;
  let collateralUsd = 0;
  let debtUsd = 0;
  const collateral = [];
  const debt = [];
  for (const it of supplies) {
    const price = it.price?.usd > 0 ? it.price.usd : 0;
    const lt = lts[it.symbol] ?? 0;
    const amount = Number(it.amount);
    if (!(price > 0) || !(lt > 0) || !Number.isFinite(amount)) priced = false;
    collateralUsd += (Number.isFinite(amount) ? amount : 0) * price * lt;
    collateral.push({ symbol: it.symbol, amount: Number.isFinite(amount) ? amount : 0, price, lt });
  }
  for (const it of debts) {
    const price = it.price?.usd > 0 ? it.price.usd : 0;
    const amount = Number(it.amount);
    if (!(price > 0) || !Number.isFinite(amount)) priced = false;
    debtUsd += (Number.isFinite(amount) ? amount : 0) * price;
    debt.push({ symbol: it.symbol, amount: Number.isFinite(amount) ? amount : 0, price });
  }
  return { priced, collateralUsd, debtUsd, collateral, debt };
}

/** What one asset's move did to the basket, holding the rest fixed. */
function assetMove(row, symbol, priceA, priceB, lts) {
  const b = basketAt(row, lts);
  if (!b.priced || !(b.debtUsd > 0)) return null;
  const asColl = b.collateral.find((l) => l.symbol === symbol);
  const asDebt = asColl ? undefined : b.debt.find((l) => l.symbol === symbol);
  const leg = asColl ?? asDebt;
  if (!leg) return null;
  const hfBefore = b.collateralUsd / b.debtUsd;
  const legBefore = asColl ? leg.amount * priceA * leg.lt : leg.amount * priceA;
  const legAfter = asColl ? leg.amount * priceB * leg.lt : leg.amount * priceB;
  const hfAfter = asColl
    ? (b.collateralUsd - legBefore + legAfter) / b.debtUsd
    : b.collateralUsd / (b.debtUsd - legBefore + legAfter);
  const runway = legBefore > 0 ? (b.collateralUsd - b.debtUsd) / legBefore : 0;
  const move = Math.abs(priceB / priceA - 1);
  return { hfBefore, hfAfter, runway, consumed: runway > 0 ? move / runway : Infinity };
}

const heldAt = (row, symbol) => {
  const d = row.context?.data ?? {};
  return (d.allSupplies ?? []).some((i) => i.symbol === symbol) || (d.allDebts ?? []).some((i) => i.symbol === symbol);
};
const carriesDebt = (row) => (row.context?.data?.allDebts ?? []).length > 0;

function spokeRows(events, spokeName) {
  return events
    .filter((e) => e.context?.protocol === "aave-v4" && (e.context.data.spokeName ?? "Main") === spokeName)
    .sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a.id) - logIndexOf(b.id));
}

function assetUniverse(rows) {
  const out = new Set();
  for (const r of rows) {
    const d = r.context.data;
    for (const it of [...(d.allSupplies ?? []), ...(d.allDebts ?? [])]) out.add(it.symbol);
    if (d.collateralSymbol) out.add(d.collateralSymbol);
    if (d.reserveSymbol) out.add(d.reserveSymbol);
  }
  return [...out];
}

/** §0's rule, over the route's own rows. Returns one record per note, sorted
 *  the way the plan's §1 tables read (by the later block). */
function replicaNotes(events, spokeKey, spokeName, lts) {
  const rows = spokeRows(events, spokeName);
  const out = [];
  for (const symbol of assetUniverse(rows)) {
    const obs = [];
    for (const row of rows) {
      const p = assetPriceOn(row, symbol);
      if (p > 0) obs.push({ row, price: p });
    }
    for (let i = 0; i < obs.length - 1; i++) {
      const a = obs[i];
      const b = obs[i + 1];
      const da = a.row.context.data;
      const db = b.row.context.data;
      if (da.eventType === "liquidation") continue;
      if (!heldAt(a.row, symbol)) continue;
      if (!carriesDebt(a.row)) continue;
      if (b.row.blockNumber <= a.row.blockNumber) continue;
      if (a.price === b.price) continue;
      const endsInLiquidation = db.eventType === "liquidation";
      const seized = endsInLiquidation && db.collateralSymbol === symbol;
      if (endsInLiquidation && !seized) continue;
      const m = assetMove(a.row, symbol, a.price, b.price, lts);
      if (!seized) {
        if (!m) continue;
        if (!(m.consumed >= RUNWAY_SHARE)) continue;
      }
      out.push({
        id: `price-gap:aave-v4-${spokeKey}-${symbol.toLowerCase()}:${a.row.blockNumber}-${b.row.blockNumber}`,
        symbol,
        from: a.row.blockNumber,
        to: b.row.blockNumber,
        priceA: a.price,
        priceB: b.price,
        endsIn: db.eventType,
        health: m,
      });
    }
  }
  out.sort((x, y) => x.to - y.to || x.from - y.from);
  return out;
}

/** The live builder's rule, restated. Two things changed with the chain read:
 *  the earlier row no longer has to STATE the asset's price (it only has to
 *  have held it against debt), and every price the health payload uses comes
 *  from the read pinned at that row's block rather than from the row.
 *
 *  `heldAsCollateral` reads the snapshot first and the row's own running
 *  balance second — a row whose `reserveSymbol` is the asset and whose
 *  `supplyAfter` is positive left the position holding it, whatever the
 *  snapshot enumerated. */
const heldAsCollateral = (row, symbol) => {
  const d = row.context?.data ?? {};
  if ((d.allSupplies ?? []).some((i) => i.symbol === symbol)) return true;
  return d.reserveSymbol === symbol && Number(d.supplyAfter ?? 0) > 0;
};

/** The row a live note about `symbol` runs from: the position's newest
 *  non-liquidation row that carried debt and held the asset. */
function liveEarlierRow(rows, symbol) {
  let a = null;
  for (const row of rows) {
    const d = row.context.data;
    if (d.eventType === "liquidation" || !carriesDebt(row) || !heldAsCollateral(row, symbol)) continue;
    a = row;
  }
  return a;
}

/** The basket at the earlier row, valued at the PINNED prices where the read
 *  has them and the row's own field only where it does not. */
function assetMovePinned(row, symbol, priceA, priceB, lts, pinned) {
  const patched = {
    ...row,
    context: {
      ...row.context,
      data: {
        ...row.context.data,
        allSupplies: (row.context.data.allSupplies ?? []).map((i) =>
          pinned[i.symbol] > 0 ? { ...i, price: { usd: pinned[i.symbol] } } : i,
        ),
        allDebts: (row.context.data.allDebts ?? []).map((i) =>
          pinned[i.symbol] > 0 ? { ...i, price: { usd: pinned[i.symbol] } } : i,
        ),
      },
    },
  };
  return assetMove(patched, symbol, priceA, priceB, lts);
}

/** The live notes the rule draws, and the ones it WITHHOLDS. `pinnedFor(block)`
 *  answers the symbol→USD map the route gives at that block.
 *
 *  A gap that clears neither the floor nor the runway share is built and then
 *  held back, and the record is kept in `withheld` so a page that drew it
 *  anyway fails with the figures that say why it should not have. */
function replicaLiveNotes(events, spokeKey, spokeName, lts, held, headPrices, pinnedFor) {
  const rows = spokeRows(events, spokeName);
  const notes = [];
  const withheld = [];
  for (const symbol of held) {
    const priceB = headPrices[symbol];
    if (!(priceB > 0)) continue;
    const a = liveEarlierRow(rows, symbol);
    if (!a) continue;
    const pinned = pinnedFor(a.blockNumber);
    const priceA = pinned?.[symbol];
    if (!(priceA > 0)) continue;
    const health = assetMovePinned(a, symbol, priceA, priceB, lts, pinned);
    const move = Math.abs(priceB / priceA - 1);
    const record = {
      id: `price-gap:aave-v4-${spokeKey}-${symbol.toLowerCase()}:${a.blockNumber}-head`,
      symbol,
      from: a.blockNumber,
      priceA,
      priceB,
      move,
      statedByRow: assetPriceOn(a, symbol),
      health,
    };
    (liveGapStatesAChange(move, health?.consumed ?? 0) ? notes : withheld).push(record);
  }
  return { notes, withheld };
}

// ═══════════════════════════════════════════════════════════════════════════
// §1's pins (2026-09-06). Historical facts only — never a live figure.
// ═══════════════════════════════════════════════════════════════════════════

// `minRows` is a FLOOR, not a count. These positions are open and act, so an
// equality here is a tripwire that goes off on a wallet rather than on a bug —
// it was re-pinned twice in three days and was 8 rows adrift by 2026-09-22.
// What the tripwire is for is that the route still answers this fixture's
// history on the spoke the fixture names, and 0a asserts that as a property:
// the floor, every event the route serves an `aave-v4` one, and the named
// spoke among the spokes those events carry. A wallet can only gain rows, so
// the floor never needs moving. Where a fixture exists to exercise a moving
// live end (WSTETH, WEETH) there is no floor either — only that the route
// answers rows for it.
const FIXTURES = {
  A: { spoke: "main", wallet: "0x4806d62da928d608f91ae41ab6ec62aad6fd28da", minRows: 94 },
  B: { spoke: "bluechip", wallet: "0x82786b1a0a7a5e31f17f2ecff68b00df645ac0a4", minRows: 36 },
  C: { spoke: "bluechip", wallet: "0x38e38427791a27f5b15424970962087d96b4bd84", minRows: 165 },
  OPEN: { spoke: "bluechip", wallet: "0xcd5adcb3a1f63180f8d4f75d8f12de8883f7c641", minRows: 20 },
  CLOSED: { spoke: "bluechip", wallet: "0xba325093f3da06d5b0425d8b8668a77be04de466", minRows: 478 },
  SUPPLY_ONLY: { spoke: "bluechip", wallet: "0xa2fa9866c1081bda6ac7d0d6c2706246d61d37b8", minRows: 20 },
  // The stalled-lane fixture: on 2026-09-07 this position's newest row stated
  // NO wstETH price at all (the lane's last wstETH write was the May backfill,
  // and the freshness gate withholds a stale one), yet the live note is
  // present — which is the whole point of reading the earlier end from the
  // feed. Where step 3's fill has since given the row a price, §8b asserts it
  // is the same number the chain answers.
  WSTETH: { spoke: "bluechip", wallet: "0x76679eeff5ee2f4c22741734a0c001bcd70e1aab", minRows: null },
  // The composed-feed fixture: weETH is priced weETH/ETH × ETH/USD, two feeds
  // multiplied, and the pinned read must compose them at the past block too.
  WEETH: { spoke: "etherfi", wallet: "0x142a1690671db35337b3ed8007aa9c6e90b5f439", minRows: null },
};

// The plan's §2.4 table — five archive reads of the feeds on 2026-09-07,
// through the api container's own client, before any of this shipped. A past
// block's price cannot change, so these are pinned outright and are the
// correctness anchor every live section falls back on when a fixture's own
// earlier row has moved on.
const PINNED_READS = [
  [25919931, "wstETH", 3082.92570795],
  [25919931, "WETH", 2490.67794072],
  // The composed feed's own rounding: weETH/ETH 1.10283531054743355 ×
  // ETH/USD 2478.77522824, as the route serves the product.
  [25918931, "weETH", 2733.680848613346],
  [25923196, "wstETH", 3114.19737825],
];
// A block where the lane's OWN writer was live (AAVE is one of the eight
// aggregators the lane still writes). The chain read there must equal the
// price the timeline route states on that row to the last digit — the
// cross-check that the pinned read is the same feed the index captured.
const LANE_AGREEMENT_BLOCK = 25898748;

// [from, to, priceA, priceB, hfA, hfB, consumed] — every AAVE, every one with a
// health payload. The Main-spoke fixture is a single-collateral AAVE borrower:
// 28 notes on 92 rows, a density the plan states as a fact to carry, not a
// reason to raise the threshold.
const PIN_A = [
  [24795621, 24864416, 94.31057, 89.68939, 1.2193, 1.1595, 0.272],
  [24864416, 24903869, 89.68939, 115.35698, 1.2822, 1.6491, 1.3],
  [24903869, 24915678, 115.35698, 90.53098511, 1.4888, 1.1684, 0.656],
  [24925563, 24968145, 91.0473, 97.38103707, 1.3066, 1.3975, 0.296],
  [25098477, 25105672, 96.77009122, 91.55812, 1.1985, 1.134, 0.325],
  [25147380, 25196972, 87.72374517, 80.56938038, 1.2479, 1.1461, 0.411],
  [25227484, 25246296, 79.43998228, 71.8279953, 1.2154, 1.0989, 0.541],
  [25246296, 25252963, 71.8279953, 62.30835, 1.2044, 1.0447, 0.781],
  [25305156, 25326687, 64.23311, 73.76006083, 1.1142, 1.2794, 1.447],
  [25326687, 25334341, 73.76006083, 77.24884, 1.1945, 1.251, 0.291],
  [25334341, 25342146, 77.24884, 73.5733, 1.1836, 1.1273, 0.307],
  [25356723, 25382151, 75.13829, 71.65770554, 1.1471, 1.094, 0.361],
  [25382151, 25399357, 71.65770554, 84.20776698, 1.1439, 1.3442, 1.392],
  [25399357, 25410855, 84.20776698, 94.00523512, 1.2588, 1.4053, 0.566],
  [25417702, 25420589, 88.82980834, 94.02755717, 1.1809, 1.25, 0.382],
  [25420589, 25432548, 94.02755717, 85.08151758, 1.1919, 1.0785, 0.591],
  [25453882, 25504288, 87.37878509, 96.18957499, 1.1929, 1.3132, 0.623],
  [25532689, 25560227, 99.27808061, 88.06873, 1.2343, 1.0949, 0.595],
  [25576086, 25598240, 89.27234, 96.22175661, 1.1483, 1.2377, 0.603],
  [25598240, 25611025, 96.22175661, 91.894629, 1.2018, 1.1478, 0.268],
  [25611025, 25649469, 91.894629, 100.21162, 1.1216, 1.2231, 0.835],
  [25653664, 25657944, 96.6482877, 91.97342212, 1.1982, 1.1403, 0.292],
  [25657944, 25696021, 91.97342212, 88.542923, 1.1661, 1.1226, 0.262],
  [25710780, 25799181, 90.73054, 97.6747616, 1.1725, 1.2623, 0.52],
  [25801085, 25815321, 100.73758, 123.18659009, 1.1962, 1.4628, 1.358],
  [25815321, 25822031, 123.18659009, 139.13724692, 1.364, 1.5407, 0.485],
  [25822031, 25894261, 139.13724692, 127.05258768, 1.4344, 1.3099, 0.287],
  [25894261, 25898748, 127.05258768, 134.3569, 1.2779, 1.3513, 0.264],
].map(([from, to, priceA, priceB, hfA, hfB, consumed]) => ({
  id: `price-gap:aave-v4-main-aave:${from}-${to}`,
  symbol: "AAVE",
  from,
  to,
  priceA,
  priceB,
  hfA,
  hfB,
  consumed,
}));

const PIN_B = [
  [25100107, 25250237, 80434.83818369, 63156.98, 2.0746, 1.629, 0.415],
  [25781111, 25825787, 64227.07059256, 79444.2, 1.6247, 2.0097, 0.616],
].map(([from, to, priceA, priceB, hfA, hfB, consumed]) => ({
  id: `price-gap:aave-v4-bluechip-wbtc:${from}-${to}`,
  symbol: "WBTC",
  from,
  to,
  priceA,
  priceB,
  hfA,
  hfB,
  consumed,
}));

// Forty-eight notes across three collaterals, every one of them with a health
// payload: this position's rows price the whole basket, so every stretch has a
// runway to be measured against. Ten of the forty-eight are liquidation-ended,
// drawn whatever the move and only for the asset that liquidation seized.
// [symbol, from, to, priceA, priceB, hfA, hfB, consumed, the later end's kind]
const PIN_C = [
  ["cbBTC", 24822442, 24832829, 69671.5095, 71599.73211693, 1.0752, 1.1049, 0.396, "supply"],
  ["cbBTC", 24832934, 24857744, 71599.73211693, 72870.264312, 1.06, 1.0788, 0.314, "supply"],
  ["WBTC", 24858583, 24863944, 73453.19922, 71006.06, 1.0312, 1.018, 0.425, "supply"],
  ["cbBTC", 24858583, 24863944, 73453.19922, 71006.06, 1.0312, 1.0102, 0.675, "supply"],
  ["WBTC", 24863944, 24877675, 71006.06, 74399.45080969, 1.0149, 1.0333, 1.238, "borrow"],
  ["cbBTC", 24863944, 24877675, 71006.06, 74399.45080969, 1.0149, 1.045, 2.025, "borrow"],
  ["WBTC", 24877675, 24905522, 74399.45080969, 77029.95930482, 1.0522, 1.0663, 0.271, "borrow"],
  ["cbBTC", 24877675, 24905522, 74399.45080969, 77029.95930482, 1.0522, 1.0753, 0.443, "borrow"],
  ["cbBTC", 24915655, 24928823, 74850.53398082, 75876.99, 1.0335, 1.0422, 0.26, "borrow"],
  ["WBTC", 24928823, 24937857, 75876.99, 78601.223, 1.0283, 1.0426, 0.503, "borrow"],
  ["cbBTC", 24928823, 24937857, 75876.99, 78601.223, 1.0283, 1.051, 0.801, "borrow"],
  ["WBTC", 24937857, 24972472, 78601.223, 76948.229, 1.0274, 1.0191, 0.304, "repay"],
  ["cbBTC", 24937857, 24972472, 78601.223, 76948.229, 1.0274, 1.0141, 0.484, "repay"],
  ["WBTC", 24972472, 25000669, 76948.229, 78761.25841, 1.0303, 1.0396, 0.309, "borrow"],
  ["cbBTC", 24972472, 25000669, 76948.229, 78761.25841, 1.0303, 1.0452, 0.492, "borrow"],
  ["cbBTC", 25000669, 25019797, 78761.25841, 79992.13483, 1.0298, 1.0397, 0.332, "borrow"],
  ["cbBTC", 25019797, 25034570, 79992.13483, 81581.36, 1.0384, 1.051, 0.33, "supply"],
  ["WBTC", 25044305, 25044374, 79773.3172193, 79978.01726254, 1.0029, 1.0041, 0.412, "supply"],
  ["cbBTC", 25044305, 25044374, 79773.3172193, 79978.01726254, 1.0029, 1.0043, 0.485, "supply"],
  ["WBTC", 25056815, 25070742, 80232.83010343, 80712.44945133, 1.0032, 1.0061, 0.892, "supply"],
  ["cbBTC", 25056815, 25070742, 80232.83010343, 80712.44945133, 1.0032, 1.0063, 0.98, "supply"],
  ["cbBTC", 25095305, 25100902, 81807.24, 79278.23129, 1.0311, 1.0157, 0.497, "liquidation"],
  ["WBTC", 25100974, 25118572, 78832.24374137, 77106.71271105, 1.0261, 1.0106, 0.592, "liquidation"],
  ["WBTC", 25124679, 25156592, 76794.07364452, 75259.1584, 1.0332, 1.0212, 0.36, "liquidation"],
  ["WBTC", 25156906, 25160617, 74521.72, 76813.95, 1.0337, 1.0496, 0.472, "supply"],
  ["cbBTC", 25156906, 25160617, 74521.72, 76813.95, 1.0337, 1.0496, 0.472, "supply"],
  ["WBTC", 25174464, 25182201, 77541.256, 75960.2100452, 1.038, 1.0276, 0.274, "repay"],
  ["cbBTC", 25174464, 25182201, 77541.256, 75960.2100452, 1.038, 1.0273, 0.283, "repay"],
  ["WBTC", 25182209, 25187277, 75960.2100452, 74769.39244974, 1.0261, 1.0179, 0.316, "repay"],
  ["cbBTC", 25182209, 25187277, 75960.2100452, 74769.39244974, 1.0261, 1.0183, 0.299, "repay"],
  ["WBTC", 25189520, 25191105, 74507.95760132, 74068.81120821, 1.0153, 1.0124, 0.192, "liquidation"],
  ["cbBTC", 25208184, 25222424, 73502.03, 72249.776149, 1.0338, 1.022, 0.351, "repay"],
  ["cbBTC", 25222427, 25222986, 72249.776149, 71314.72813624, 1.0237, 1.0149, 0.37, "repay"],
  ["cbBTC", 25222986, 25223644, 71314.72813624, 70619.22233, 1.0161, 1.0097, 0.401, "liquidation"],
  ["cbBTC", 25223767, 25230294, 70977.79568, 67557.34274464, 1.0582, 1.0326, 0.44, "liquidation"],
  ["WBTC", 25230323, 25240023, 67897.69889372, 64599.49, 1.0702, 1.0183, 0.74, "liquidation"],
  ["WBTC", 25240784, 25253066, 62973.28081966, 59685.82, 1.0834, 1.0268, 0.678, "liquidation"],
  ["WBTC", 25256951, 25273033, 61126.98, 63556.84922351, 1.141, 1.1864, 0.322, "supply"],
  ["WBTC", 25273033, 25280705, 63556.84922351, 61445.75, 1.1487, 1.1106, 0.257, "borrow"],
  ["WBTC", 25292638, 25317029, 62589.84197526, 64146.00312927, 1.0914, 1.1186, 0.297, "supply"],
  ["WBTC", 25317030, 25321184, 64146.00312927, 65691.084, 1.0786, 1.1046, 0.331, "borrow"],
  ["WBTC", 25330420, 25339389, 65969.1149, 64331.81397663, 1.0593, 1.033, 0.443, "repay"],
  ["WBTC", 25339389, 25345297, 64331.81397663, 63152.73, 1.0472, 1.028, 0.407, "liquidation"],
  ["WBTC", 25345476, 25366410, 62508.68397868, 64050.39112582, 1.0779, 1.1045, 0.341, "borrow"],
  ["WBTC", 25374176, 25380632, 64967.01163287, 62049.92399, 1.0898, 1.0421, 0.532, "repay"],
  ["WBTC", 25382521, 25388444, 62280.49220852, 60532.85621, 1.0797, 1.0503, 0.369, "repay"],
  ["WBTC", 25389032, 25395094, 59390.95742346, 58441.37225866, 1.0644, 1.0481, 0.252, "liquidation"],
  ["WBTC", 25409076, 25880197, 60250.39035144, 78709.416, 1.0977, 1.4114, 3.209, "borrow"],
].map(([symbol, from, to, priceA, priceB, hfA, hfB, consumed, toKind]) => ({
  id: `price-gap:aave-v4-bluechip-${symbol.toLowerCase()}:${from}-${to}`,
  symbol,
  from,
  to,
  priceA,
  priceB,
  hfA,
  hfB,
  consumed,
  toKind,
}));

/** Fixture C's three live notes: one per collateral the spoke shows held, all
 *  three from the position's own row at block 25,880,197. The earlier prices
 *  are now CHAIN reads at that block, and they come out equal to the prices the
 *  row itself states (2026-09-08: every one of the row's five snapshot legs is
 *  a lane the live writer still covers, so lane and chain agree to the last
 *  digit) — which is why `hfA` is the same 1.1928 the lane-priced note stated.
 *  Check 4g asserts that equality rather than assuming it. The later price and
 *  its block are NEVER pinned — re-read and compared with a tolerance. */
const PIN_C_LIVE = [
  ["WETH", 25880197, 2472.86, 1.1928],
  ["WBTC", 25880197, 78709.416, 1.1928],
  ["cbBTC", 25880197, 78709.416, 1.1928],
].map(([symbol, from, priceA, hfA]) => ({
  id: `price-gap:aave-v4-bluechip-${symbol.toLowerCase()}:${from}-head`,
  symbol,
  from,
  priceA,
  hfA,
}));

// Fifty notes on the closed control (re-pinned 2026-09-07, when its rows first
// answered priced — see the header). Nine end in a liquidation; one is
// price-only, the rest carry a health payload. Same columns as PIN_C.
//
// SIXTEEN ROWS MOVED on 2026-09-08 and they are the only pins in this file the
// price lane changed — every one of them here, none in A, B or C. Each of the
// sixteen holds GHO in its debt basket, and GHO was on the transformer's
// temporary $1 pin until backend `f7dff0a` retired it: the scheduled lane
// (scripts/fill-aave-v4-prices.mjs) now writes GHO's own Chainlink feed at
// every V4 event block, so those rows carry 0.9981–0.9990 instead of 1.00.
// The block-pinned archive read of the feed answers the same figures at those
// blocks, independently of the lane, which is how they were confirmed before
// being written down here.
//
// A smaller USD debt is a larger health factor, so each moved up by one to
// eleven in the FOURTH decimal — the size of GHO's own deviation, weighted by
// GHO's share of that row's debt. The consumed share moves further (2.146 →
// 1.959 on the first) because these positions' runways are thousandths and the
// share is the move divided by the runway. 25,531,960 → 25,534,869 is the one
// worth reading twice: at the pin its later health factor was exactly 1, the
// liquidation line itself; at the feed's GHO it is 1.0012, just above it.
//
// No PRICE column changed. Every note's own asset is WETH or WBTC, both of
// them lanes the live writer already covered.
const PIN_CLOSED = [
  ["WETH", 25233769, 25234228, 1856.4, 1833.62, 1.0093, 0.9969, 1.332, "liquidation"],
  ["WETH", 25243352, 25248250, 1757.38, 1732.79276708, 1.0096, 0.9955, 1.465, "liquidation"],
  ["WBTC", 25474048, 25474172, 61691.115, 61947.93, 1.002, 1.0059, 1.959, "supply"],
  ["WBTC", 25474184, 25475121, 61947.93, 63650.3707113, 1.0514, 1.0774, 0.508, "supply"],
  ["WBTC", 25476820, 25480338, 64129.75123, 63125.55, 1.0316, 1.0174, 0.45, "repay"],
  ["WBTC", 25484291, 25486737, 63594.285, 62046.38082656, 1.0756, 1.0528, 0.301, "withdraw"],
  ["WBTC", 25486898, 25486950, 62046.38082656, 61716.33169, 1.0158, 1.0112, 0.291, "repay"],
  ["WBTC", 25487440, 25488138, 62061.506, 61724.79892959, 1.0044, 1.0007, 0.848, "liquidation"],
  ["WETH", 25488304, 25509149, 1730.7954, 1795.58828622, 1.0212, 1.0594, 1.803, "borrow"],
  ["WETH", 25509169, 25518099, 1795.58828622, 1819.2906, 1.0522, 1.0657, 0.259, "borrow"],
  ["WETH", 25518099, 25518235, 1819.2906, 1819.97, 1.0056, 1.0059, 0.066, "liquidation"],
  ["WETH", 25520313, 25520459, 1827.6067, 1815.44, 1.0051, 0.9987, 1.245, "liquidation"],
  ["WETH", 25531960, 25534869, 1874.19447488, 1866.3756, 1.0049, 1.0012, 0.758, "liquidation"],
  ["WETH", 25558189, 25563524, 1842.44259, 1858.39666335, 1.0141, 1.0189, 0.341, "supply"],
  ["WBTC", 25558189, 25563524, 63951.18729, 64736.4447097, 1.0141, 1.0197, 0.401, "supply"],
  ["WETH", 25566794, 25575137, 1864.12279172, 1897.77509291, 1.0329, 1.0515, 0.567, "repay"],
  ["WETH", 25600170, 25618011, 1878.76443512, 1907.1745, 1.0598, 1.0758, 0.268, "borrow"],
  ["WETH", 25618011, 25625023, 1907.1745, 1932.9007, 1.006, 1.0195, 2.27, "supply"],
  ["WETH", 25699156, 25699298, 1902.6813, 1897.66051596, 1.0028, 1.001, 0.65, "liquidation"],
  ["WBTC", 25725001, 25725034, 64843.468, 64477.87, 1.0132, 1.0099, 0.252, "repay"],
  ["WETH", 25750287, 25751862, 1889.05301951, 1873.71490443, 1.0178, 1.0129, 0.275, "repay"],
  ["WETH", 25771322, 25772562, 1872.39576101, 1902.25, 1.042, 1.0546, 0.3, "withdraw"],
  ["WETH", 25775049, 25775205, 1897.68703983, 1904.66593902, 1.0068, 1.0096, 0.412, "supply"],
  ["WETH", 25787052, 25790254, 1909.19913781, 2100.01915559, 1.0193, 1.1212, 5.27, "withdraw"],
  ["WETH", 25790847, 25792820, 2085.43573908, 2269.6765, 1.0218, 1.112, 4.149, "borrow"],
  ["WETH", 25795746, 25796764, 2291.39, 2271.5135962, 1.0255, 1.0183, 0.28, "repay"],
  ["WETH", 25796764, 25799179, 2271.5135962, 2319.64, 1.0286, 1.0461, 0.611, "withdraw"],
  ["WETH", 25799469, 25801851, 2317.913, 2370.5588, 1.0236, 1.044, 0.865, "borrow"],
  ["WETH", 25803343, 25804380, 2368.1814, 2401.26086057, 1.0253, 1.0371, 0.47, "borrow"],
  ["WETH", 25804380, 25804618, 2401.26086057, 2389.22846061, 1.014, 1.0098, 0.301, "supply"],
  ["WETH", 25804618, 25806164, 2389.22846061, 2449.39, 1.0278, 1.0494, 0.775, "borrow"],
  ["WETH", 25806164, 25806579, 2449.39, 2527.03303084, 1.0201, 1.0471, 1.344, "supply"],
  ["WETH", 25808319, 25808330, 2510.39189835, 2523.13, 1.0113, 1.016, 0.413, "supply"],
  ["WETH", 25808461, 25808490, 2523.13, 2510.48, 1.0079, 1.0031, 0.602, "repay"],
  ["WETH", 25808958, 25810053, 2428.4177, 2405.69622852, 1.0216, 1.0132, 0.39, "supply"],
  ["WETH", 25810085, 25810102, 2392.55222627, 2404.8115, 1.015, 1.0201, 0.341, "repay"],
  ["WETH", 25813769, 25818184, 2421.61867208, 2450.96467312, 1.0334, 1.0459, 0.375, "supply"],
  ["WETH", 25818501, 25818531, 2464.03411691, 2398.05, 1.0108, 0.9837, 2.512, "liquidation"],
  ["WETH", 25819283, 25820564, 2446.55322768, 2476.7488438, 1.0514, 1.0644, 0.252, "borrow"],
  ["WETH", 25820564, 25821050, 2476.7488438, 2450.91766677, 1.0256, 1.0149, 0.418, "repay"],
  ["WETH", 25821050, 25825295, 2450.91766677, 2514.83028102, 1.0337, 1.0607, 0.799, "borrow"],
  ["WETH", 25825909, 25825917, 2513.68660548, 2527.71507978, 1.014, 1.0193, 0.375, "supply"],
  ["WETH", 25825923, 25826928, 2527.71507978, 2472.09, 1.0428, 1.0214, 0.501, "supply"],
  ["WETH", 25830467, 25831521, 2511.53030434, 2472.19223515, 1.0294, 1.0172, 0.415, "supply"],
  ["WETH", 25832160, 25834849, 2467.41803544, 2427.71, 1.0212, 1.0087, 0.59, "supply"],
  ["WETH", 25834849, 25835237, 2427.71, 2440.4605, 1.0075, 1.0115, 0.533, "supply"],
  ["WBTC", 25834849, 25835237, 77943.56780173, 78748.71, 1.0075, 1.01, 0.333, "supply"],
  ["WETH", 25835607, 25835716, 2449.67522511, 2436.98848485, 1.0133, 1.0093, 0.302, "repay"],
  ["WETH", 25854716, 25854812, 2490.57203915, 2458.45, null, null, null, "liquidation"],
  ["WETH", 25888092, 25889077, 2427.79, 2364.88149683, 1.1048, 1.0761, 0.273, "repay"],
].map(([symbol, from, to, priceA, priceB, hfA, hfB, consumed, toKind]) => ({
  id: `price-gap:aave-v4-bluechip-${symbol.toLowerCase()}:${from}-${to}`,
  symbol,
  from,
  to,
  priceA,
  priceB,
  hfA: hfA ?? undefined,
  hfB: hfB ?? undefined,
  consumed: consumed ?? undefined,
  toKind,
}));

/** The overlay's own thresholds, as §1 pins them per fixture. */
const PIN_LT = {
  A: { AAVE: 0.76, USDC: 0.78 },
  B: { WBTC: 0.845 },
  C: { WETH: 0.86, WBTC: 0.845, cbBTC: 0.845 },
};

// ═══════════════════════════════════════════════════════════════════════════

console.log("Aave V4 price-gap market notes — the rule, and the rows it draws\n");
console.log(`BASE ${BASE}\n`);

/** Everything the two routes say about a fixture, read once. One read is
 *  enough now that the pool no longer drops the snapshot-price fetch — the
 *  `priced`/`items` pair below is what checks 1c-i and 1e-i state, and a
 *  partial answer is a pool failure to chase, not a retry to absorb. */
async function readFixture(name) {
  const f = FIXTURES[name];
  const timeline = await api(`/api/aave-v4/timeline?wallet=${f.wallet}`);
  const overlay = await api(`/api/chain/aave-v4/spoke-position?wallet=${f.wallet}&spoke=${f.spoke}`);
  const lts = {};
  const addresses = {};
  for (const r of overlay.reserves ?? []) {
    if (r.lt > 0) lts[r.symbol] = r.lt;
    addresses[r.symbol] = (r.address ?? "").toLowerCase();
  }
  const rows = spokeRows(timeline.events, overlay.spokeName);
  let items = 0;
  let priced = 0;
  for (const r of rows) {
    for (const it of [...(r.context.data.allSupplies ?? []), ...(r.context.data.allDebts ?? [])]) {
      items++;
      if (it.price?.usd > 0) priced++;
    }
  }
  return { ...f, name, timeline, overlay, lts, addresses, rows, items, priced };
}

const fx = {};
for (const name of Object.keys(FIXTURES)) fx[name] = await readFixture(name);

// ── The oracle reads ───────────────────────────────────────────────────────
// The head map is re-read wherever a later end is asserted; a pinned map is
// read once per block and kept, because the route's answer for a past block
// cannot change.

const oracle = await api("/api/oracle/aave-v4");
const head = await api("/api/head");

const pinnedCache = new Map();
async function pinnedAt(block) {
  if (!pinnedCache.has(block)) pinnedCache.set(block, await api(`/api/oracle/aave-v4?block=${block}`));
  return pinnedCache.get(block);
}

/** The route's raw answer, headers and all — for the immutability check. */
async function rawOracle(query) {
  const res = await fetch(`${BASE}/api/oracle/aave-v4${query}`);
  return { status: res.status, cacheControl: res.headers.get("cache-control") ?? "", body: await res.json() };
}

/** A price map keyed by SYMBOL, matched the way the page matches it: by the
 *  overlay's reserve address first, then by the map entry's own symbol. */
const priceBySymbol = (map, reserves) => {
  const out = {};
  for (const r of reserves ?? []) {
    const direct = r.address ? map.prices?.[r.address.toLowerCase()] : undefined;
    const entry = direct ?? Object.values(map.prices ?? {}).find((p) => p.symbol === r.symbol);
    if (entry && entry.usd > 0) out[r.symbol] = entry.usd;
  }
  return out;
};

/** The collateral the overlay shows held right now — the live builder's own
 *  input, empty where the position carries no debt or the overlay is stale. */
function heldNow(f) {
  if (!(f.overlay.debtAssetCount > 0) || f.overlay.chainStale) return [];
  return (f.overlay.reserves ?? [])
    .filter((r) => r.isCollateral && BigInt(r.supplyBalanceRaw ?? "0") > 0n)
    .map((r) => r.symbol);
}

/** What the rule says this fixture's live rows are, over the same routes the
 *  page reads. Fetches one pinned read per earlier-row block. */
async function liveExpect(f, headMap) {
  const held = heldNow(f);
  const headPrices = priceBySymbol(headMap, f.overlay.reserves);
  const rows = spokeRows(f.timeline.events, f.overlay.spokeName);
  const pinnedBySymbolBlock = new Map();
  for (const symbol of held) {
    const a = liveEarlierRow(rows, symbol);
    if (a && !pinnedBySymbolBlock.has(a.blockNumber)) {
      pinnedBySymbolBlock.set(a.blockNumber, priceBySymbol(await pinnedAt(a.blockNumber), f.overlay.reserves));
    }
  }
  const { notes, withheld } = replicaLiveNotes(
    f.timeline.events,
    f.spoke,
    f.overlay.spokeName,
    f.lts,
    held,
    headPrices,
    (b) => pinnedBySymbolBlock.get(b),
  );
  return { held, headPrices, notes, withheld };
}

/** What a live section has to say for itself when the rule draws no row: which
 *  gaps the gate held back and on what figures, or that the position holds
 *  nothing to draw one from. Goes in a check's detail, so a page that drew a
 *  row anyway reports why it should not have. */
function liveRuleSays(rule, symbol = null) {
  const held = symbol ? rule.withheld.filter((w) => w.symbol === symbol) : rule.withheld;
  if (held.length > 0) {
    return held
      .map(
        (w) =>
          `${w.symbol} withheld: ${(w.move * 100).toFixed(4)}% move under the ${LIVE_GAP_MOVE_FLOOR * 100}% floor, ` +
          `consuming ${((w.health?.consumed ?? 0) * 100).toFixed(2)}% of the runway against ${LIVE_GAP_RUNWAY_SHARE * 100}%`,
      )
      .join(" · ");
  }
  return `no gap to draw — the spoke shows ${rule.held.length ? rule.held.join(", ") : "no collateral"} held`;
}

// ── 0. Preconditions from the routes ───────────────────────────────────────

for (const name of Object.keys(FIXTURES)) {
  const f = fx[name];
  // The property, for every fixture: the route answers aave-v4 rows, and the
  // spoke this fixture names is one of the spokes they carry. The floor rides
  // on top of it where there is one.
  const stray = f.timeline.events.filter((e) => e.context?.protocol !== "aave-v4");
  const spokes = new Set((f.timeline.events ?? []).map((e) => e.context?.data?.spokeName ?? "Main"));
  const onSpoke = f.rows.length > 0 && spokes.has(f.overlay.spokeName);
  const floor = f.minRows ?? 1;
  check(
    `0a-${name}. the timeline route serves at least ${floor} aave-v4 row(s) on the ${f.spoke} spoke, and serves nothing else`,
    f.rows.length >= floor && onSpoke && stray.length === 0,
    `${f.rows.length} rows on ${f.overlay.spokeName}` +
      `${stray.length ? ` · ${stray.length} non-aave-v4 row(s), first ${stray[0]?.context?.protocol}` : ""}` +
      `${onSpoke ? "" : ` · spokes served: ${[...spokes].join(", ") || "none"}`}`,
  );
}
for (const [name, want] of Object.entries(PIN_LT)) {
  const got = fx[name].lts;
  const same =
    Object.keys(want).every((s) => got[s] === want[s]) && Object.keys(got).length === Object.keys(want).length;
  check(`0b-${name}. the overlay's liquidation thresholds are the pinned ones`, same, JSON.stringify(got));
}
check(
  "0c. the oracle map answers with a block and a full asset roster",
  oracle.success === true && oracle.blockNumber > 0 && Object.keys(oracle.prices ?? {}).length >= 20,
  `block ${oracle.blockNumber}, ${Object.keys(oracle.prices ?? {}).length} assets`,
);
check("0d. /api/head answers with a block and its timestamp", head.blockNumber > 0 && head.blockTimestamp > 0);

// 0e. The §2.4 anchors. These four figures were archive-read from the feeds on
// 2026-09-07, before the route could answer at a block at all, so they are not
// derived from the thing under test. A past block's answer is immutable, which
// is what the flag and the Cache-Control state.
const bad0e = [];
for (const [block, symbol, want] of PINNED_READS) {
  const answer = await pinnedAt(block);
  const entry = Object.values(answer.prices ?? {}).find((p) => p.symbol === symbol);
  if (!(answer.success === true && answer.pinned === true && answer.blockNumber === block && entry?.usd === want)) {
    bad0e.push(
      `${symbol}@${block}: wanted ${want}, got ${entry?.usd} (block ${answer.blockNumber}, pinned ${answer.pinned})`,
    );
  }
}
check(
  `0e. the four pinned reads answer their §2.4 figures exactly, flagged as pinned`,
  bad0e.length === 0,
  bad0e[0] ?? `${PINNED_READS.length} reads`,
);
const rawPinned = await rawOracle("?block=25919931");
check(
  "0e-ii. and a pinned answer is served immutable — a past block's price cannot change",
  rawPinned.status === 200 &&
    /immutable/.test(rawPinned.cacheControl) &&
    /max-age=31536000/.test(rawPinned.cacheControl),
  `${rawPinned.status} · ${rawPinned.cacheControl || "no cache-control"}`,
);

// 0f. Out of range is refused rather than answered with head.
const rawLow = await rawOracle("?block=1");
check(
  "0f. ?block=1 is refused with 400",
  rawLow.status === 400,
  `${rawLow.status} ${JSON.stringify(rawLow.body).slice(0, 120)}`,
);

// 0g. Lane and chain are the same feed. AAVE is one of the eight aggregators
// the lane's live writer still covers, so at a block the lane wrote, the
// archive read must reproduce its price to the last digit. The lane figure
// here is PIN_A's own last `priceB`, read off the timeline route.
const laneRow = PIN_A[PIN_A.length - 1];
const laneChain = Object.values((await pinnedAt(LANE_AGREEMENT_BLOCK)).prices ?? {}).find((p) => p.symbol === "AAVE");
check(
  `0g. at block ${blk(LANE_AGREEMENT_BLOCK)}, where the lane's own writer was live, the pinned chain read equals the lane's AAVE price`,
  laneRow.to === LANE_AGREEMENT_BLOCK && laneChain?.usd === laneRow.priceB,
  `lane ${laneRow.priceB}, chain ${laneChain?.usd}`,
);

// ── 1. The rule: the replica reproduces §1's tables exactly ────────────────
// The replica above reads the same routes and imports nothing from
// lib/aave-v4/market-notes.ts. This is the check that the rule in the plan's §0
// is what the pinned tables say it is.

/** Compare a replica list against a pinned table, figure by figure.
 *
 *  Both sides are put in the same total order first — later block, then earlier
 *  block, then the id. Two assets can bracket the SAME pair of rows (cbBTC and
 *  WBTC share a BTC/USD feed, so fixture C's rows price both at once), and
 *  without the id as a final tiebreak the two lists can hold the same notes in
 *  a different order and read as a mismatch. */
function comparePins(label, gotIn, wantIn) {
  const order = (a, b) => a.to - b.to || a.from - b.from || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const got = [...gotIn].sort(order);
  const want = [...wantIn].sort(order);
  check(`${label} — ${want.length} notes`, got.length === want.length, `got ${got.length}`);
  const bad = [];
  for (let i = 0; i < Math.min(got.length, want.length); i++) {
    const g = got[i];
    const w = want[i];
    const same =
      g.id === w.id &&
      g.symbol === w.symbol &&
      g.priceA === w.priceA &&
      g.priceB === w.priceB &&
      (w.hfA == null
        ? g.health == null
        : g.health != null &&
          g.health.hfBefore.toFixed(4) === w.hfA.toFixed(4) &&
          g.health.hfAfter.toFixed(4) === w.hfB.toFixed(4) &&
          g.health.consumed.toFixed(3) === w.consumed.toFixed(3));
    if (!same) {
      bad.push(
        `${w.id}: wanted ${w.priceA}→${w.priceB} ${w.hfA == null ? "price-only" : `${w.hfA}/${w.hfB}/${w.consumed}`}` +
          `; got ${g?.id} ${g?.priceA}→${g?.priceB} ${g?.health ? `${g.health.hfBefore.toFixed(4)}/${g.health.hfAfter.toFixed(4)}/${g.health.consumed.toFixed(3)}` : "price-only"}`,
      );
    }
  }
  // The length is part of this assertion, not just of the one above it: an
  // empty `got` compares nothing and would otherwise report that every figure
  // matched. Seen for real on 2026-09-08, when the closed control answered
  // unpriced and its fifty notes became none.
  check(
    `${label} — every block, price, health factor and consumed share matches`,
    bad.length === 0 && got.length === want.length,
    bad[0] ?? (got.length === want.length ? "" : `nothing compared: ${got.length} of ${want.length} notes`),
  );
}

const repA = replicaNotes(fx.A.timeline.events, "main", fx.A.overlay.spokeName, fx.A.lts);
comparePins("1a. fixture A (Main, single-collateral AAVE borrower)", repA, PIN_A);

const repB = replicaNotes(fx.B.timeline.events, "bluechip", fx.B.overlay.spokeName, fx.B.lts);
comparePins("1b. fixture B (Bluechip, WBTC against three stables)", repB, PIN_B);

// Every item priced is the truth about this position; a partial answer means
// the API's pg pool dropped the snapshot-price fetch again (see the header), and
// the rule would then correctly make price-only notes of a failure.
check(
  "1c-i. fixture C's rows state every snapshot item price",
  fx.C.priced === fx.C.items && fx.C.items > 0,
  `${fx.C.priced} of ${fx.C.items} items priced`,
);
const repC = replicaNotes(fx.C.timeline.events, "bluechip", fx.C.overlay.spokeName, fx.C.lts);
comparePins("1c-ii. fixture C (Bluechip, three collaterals, ten liquidations)", repC, PIN_C);
check(
  "1c-iii. ten of the forty-eight are liquidation-ended, and every one of the forty-eight carries a health payload",
  repC.filter((n) => n.endsIn === "liquidation").length === 10 && repC.every((n) => n.health != null),
  `${repC.filter((n) => n.endsIn === "liquidation").length} liquidation-ended, ${repC.filter((n) => n.health == null).length} without a payload`,
);

const repOpen = replicaNotes(fx.OPEN.timeline.events, "bluechip", fx.OPEN.overlay.spokeName, fx.OPEN.lts);
check("1d. the open control has no historical note", repOpen.length === 0, repOpen.map((n) => n.id).join(", "));

// Every item priced: the earlier "no prices" pin was the query's own timeout
// (see the header), never a property of this position.
check(
  "1e-i. the closed control's rows state every snapshot item price",
  fx.CLOSED.priced === fx.CLOSED.items && fx.CLOSED.items > 0,
  `${fx.CLOSED.priced} of ${fx.CLOSED.items} items priced`,
);
const repClosed = replicaNotes(fx.CLOSED.timeline.events, "bluechip", fx.CLOSED.overlay.spokeName, fx.CLOSED.lts);
comparePins("1e-ii. the closed control (Bluechip, 478 rows, nine liquidations)", repClosed, PIN_CLOSED);
check(
  "1e-ii-b. nine of the fifty are liquidation-ended and one is price-only",
  repClosed.filter((n) => n.endsIn === "liquidation").length === 9 &&
    repClosed.filter((n) => n.health == null).length === 1,
  `${repClosed.filter((n) => n.endsIn === "liquidation").length} liquidation-ended, ${repClosed.filter((n) => n.health == null).length} price-only`,
);
check("1e-iii. the closed control has no health factor at head (no debt)", fx.CLOSED.overlay.healthFactor === null);

const repSupply = replicaNotes(
  fx.SUPPLY_ONLY.timeline.events,
  "bluechip",
  fx.SUPPLY_ONLY.overlay.spokeName,
  fx.SUPPLY_ONLY.lts,
);
check(
  "1f. the supply-only control never borrowed on this spoke, so it has no note",
  repSupply.length === 0 && fx.SUPPLY_ONLY.rows.every((r) => (r.context.data.allDebts ?? []).length === 0),
  repSupply.map((n) => n.id).join(", "),
);

// ── The page ───────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1800 },
  permissions: ["clipboard-read", "clipboard-write"],
});

const urlFor = (f) => `${BASE}/ethereum/aave-v4/spoke/${f.spoke}/${f.wallet}`;

async function open(f, waitForLiveMs = 25000) {
  const page = await context.newPage();
  await page.goto(urlFor(f), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  // A live row waits on three reads (head map, /api/head, and the pinned read
  // at the earlier row's block) after the overlay lands; the controls that
  // have no live row pass 0 and fall through to the settle wait below.
  if (waitForLiveMs > 0) {
    await page
      .locator('[data-market-note$="-head"]')
      .first()
      .waitFor({ state: "attached", timeout: waitForLiveMs })
      .catch(() => {});
  }
  // The overlay lands after the timeline; the notes' thresholds come off it.
  await page.waitForTimeout(3000);
  return page;
}

const noteIds = (page) =>
  page.locator("[data-market-note]").evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));

/** Open a note row and read it. A row that is not on the page returns the
 *  empty string rather than throwing: a verifier whose first missing row aborts
 *  the run cannot show what else broke, which is exactly what the fail-first
 *  pass needs it to do. */
async function openNote(row) {
  if ((await row.count()) === 0) return "";
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { expanded: false }).first().click();
  await row.page().waitForTimeout(250);
  const trig = row.getByRole("button", { name: /how this note was derived/i });
  if (await trig.count()) await trig.click();
  await row.page().waitForTimeout(200);
  return (await row.innerText()).replace(/\s+/g, " ");
}

async function pillCount(page) {
  const pill = page.getByRole("button", { name: /^Market notes/i }).first();
  if ((await pill.count()) === 0) return null;
  const text = (await pill.innerText()).replace(/\s+/g, " ");
  const m = /Market notes\s*·\s*([\d,]+)/.exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** The historical ids the page should carry, newest-first: the replica's, by
 *  the later block descending — the order `anchorMarketNotes` renders them in
 *  on a descending list. */
const expectedDesc = (rep) => [...rep].sort((a, b) => b.to - a.to || (a.id < b.id ? 1 : -1)).map((n) => n.id);

/** The two figures a note row states as a transition, read off its text. */
const laterOf = (text, label) => {
  const m = new RegExp(`${label}.*?[\\d.,]+\\s*→\\s*([\\d.,]+)`).exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

/** The head map, re-read once per page and shared by that page's live rows.
 *  Re-read rather than pinned — the later end is never a fixed figure — but
 *  ONCE, not per row: each call can cost the backend a Multicall3 over the
 *  whole registry, and a run that made six of them was reading the RPC harder
 *  than the page it is checking ever does. */
const laterEnd = async () => api("/api/oracle/aave-v4");

/** The later end of a live row, checked against the head map read for this
 *  page — never pinned. */
async function checkLaterEnd(label, text, f, symbol, now) {
  const want = priceBySymbol(now, f.overlay.reserves)[symbol];
  const gotPrice = laterOf(text, "Oracle price");
  const gotBlock = laterOf(text, "Blocks");
  check(
    `${label}-i. its later price is within 1% of the ${symbol} price the oracle map answers when re-read`,
    gotPrice != null && want > 0 && pctWithin(gotPrice, want, 0.01),
    `page ${gotPrice}, oracle ${want}`,
  );
  check(
    `${label}-ii. and its later block is within 200 of the map's own`,
    gotBlock != null && Math.abs(gotBlock - now.blockNumber) <= 200,
    `page ${gotBlock}, oracle ${now.blockNumber}`,
  );
}

// ── 2. Fixture A: the historical rows the window draws, and the live row ───
// AAVE is one of the eight feeds the lane's own writer still covers, so this
// fixture is where the chain read and the lane are asserted to be the same
// number (0g pins that at a fixed block; here the live row is built on it).

const liveA_ = await liveExpect(fx.A, oracle);
const pageA = await open(fx.A);
const idsA = await noteIds(pageA);
const histA = idsA.filter((i) => !i.endsWith("-head"));
const liveA = idsA.filter((i) => i.endsWith("-head"));
// Fixture A has crossed the timeline's row window, so the page draws only the
// newest of its notes — the same shape §4 and §5 already assert, and the only
// one stable against a window that grows with the position.
const wantA = expectedDesc(repA);
check(
  "2a. fixture A draws a non-empty newest-first prefix of the rule's historical rows",
  histA.length > 0 && histA.length <= wantA.length,
  `${histA.length} of ${wantA.length} drawn`,
);
check(
  "2b. and those rows are the rule's own, in its order",
  JSON.stringify(wantA.slice(0, histA.length)) === JSON.stringify(histA),
  histA.slice(0, 2).join(", "),
);
// The live row is the gate's to give: `liveGapStatesAChange` withholds a live
// note that states no change, so what is asserted is that the page draws the
// rows the rule draws — one where the gate lets it through, none where it
// does not — never that one exists.
const liveIdsA = liveA_.notes.map((n) => n.id);
check(
  "2c. the page draws the live row the rule draws, and where there is one it heads the list",
  liveA.length === liveIdsA.length && (liveA.length === 0 || idsA[0] === liveA[0]),
  liveIdsA.length === 0 ? liveRuleSays(liveA_) : idsA[0],
);
check(
  "2d. it runs from the block the rule picks over the same route data",
  JSON.stringify(liveA) === JSON.stringify(liveIdsA),
  `page ${liveA.join(", ") || "none"}, rule ${liveIdsA.join(", ") || "none"}`,
);

const liveNoteA = liveA_.notes[0];
const earlierBlockA = liveNoteA?.from;
let liveTextA = "";
if (!liveNoteA) {
  note(`fixture A: the rule draws no live row — ${liveRuleSays(liveA_)}. §2's live checks stand down.`);
} else {
  const liveRowA = pageA.locator(`[data-market-note="${liveNoteA.id}"]`);
  liveTextA = await openNote(liveRowA.first());
  if (earlierBlockA === LANE_AGREEMENT_BLOCK) {
    note(`fixture A branch: PINNED — its earlier row is still block ${blk(LANE_AGREEMENT_BLOCK)}`);
    check(
      `2e. the live row's earlier price is the pinned ${formatPrice(PIN_A[PIN_A.length - 1].priceB)} at block ${blk(LANE_AGREEMENT_BLOCK)}`,
      liveTextA.includes(formatPrice(PIN_A[PIN_A.length - 1].priceB)),
      `wanted ${formatPrice(PIN_A[PIN_A.length - 1].priceB)}`,
    );
  } else {
    note(
      `fixture A branch: MOVED — its earlier row is now block ${blk(earlierBlockA ?? 0)}, past the pinned ${blk(LANE_AGREEMENT_BLOCK)}`,
    );
    check(
      `2e. the live row's earlier price is what /api/oracle/aave-v4?block=${earlierBlockA} answers for AAVE (${liveNoteA.priceA}), and the pinned block ${blk(LANE_AGREEMENT_BLOCK)} still answers ${PIN_A[PIN_A.length - 1].priceB}`,
      liveTextA.includes(formatPrice(liveNoteA.priceA)) && laneChain?.usd === PIN_A[PIN_A.length - 1].priceB,
      `page text has ${formatPrice(liveNoteA.priceA)}? ${liveTextA.includes(formatPrice(liveNoteA.priceA))}`,
    );
  }
  // The lane's own row states the same AAVE price the chain read gives, because
  // this asset's lane is live. Where the row states nothing, there is nothing to
  // compare and the check says so rather than passing on an absence.
  check(
    "2e-ii. and on this lane-live asset the row's own stated price equals the pinned chain read",
    liveNoteA.statedByRow > 0 && relEq(liveNoteA.statedByRow, liveNoteA.priceA),
    `row states ${liveNoteA.statedByRow}, chain ${liveNoteA.priceA}`,
  );
  await checkLaterEnd("2f", liveTextA, fx.A, "AAVE", await laterEnd());
  check("2h. the live row states an Elapsed cell", /Elapsed/.test(liveTextA), liveTextA.slice(0, 120));
  check(
    "2h-ii. and its receipt names the pinned read as the earlier end's source",
    liveTextA.includes(`/api/oracle/aave-v4?block=${earlierBlockA}`),
    liveTextA.slice(0, 400),
  );
}

const firstA = PIN_A[0];
const rowA = pageA.locator(`[data-market-note="${firstA.id}"]`);
const textA = await openNote(rowA.first());
check(
  `2i. the ${blk(firstA.from)} → ${blk(firstA.to)} row states the health factor at each price, ${formatHf(firstA.hfA)} → ${formatHf(firstA.hfB)}`,
  new RegExp(`Health factor at each price\\s*${formatHf(firstA.hfA)}\\s*→\\s*${formatHf(firstA.hfB)}`).test(textA),
  textA.slice(0, 300),
);
check("2j. and the sub line reads liquidation at 1.00", /liquidation at\s*1\.00/.test(textA), "");
check(
  "2k. its derivation names the earlier block and the threshold it is read against",
  textA.includes(blk(firstA.from)) && /threshold/i.test(textA),
  textA.slice(0, 200),
);
check(
  "2l. the row's two prices are the pinned ones",
  textA.includes(formatPrice(firstA.priceA)) && textA.includes(formatPrice(firstA.priceB)),
  `wanted ${formatPrice(firstA.priceA)} → ${formatPrice(firstA.priceB)}`,
);
// The pill counts NOTES, not the rows the window drew, so it is the rule's own
// total: the historical notes the replica builds over the route plus the live
// rows the gate lets through. The replica rather than PIN_A, because the pin's
// LENGTH moves with the re-pricing too — which stretches clear the consumed
// threshold is a function of the prices. That the replica matches the pin is
// 1a's assertion, and it belongs there and not here.
const notesA = repA.length + liveA_.notes.length;
check(
  "2m. the pill counts every note the rule draws, historical and live",
  (await pillCount(pageA)) === notesA,
  `pill ${await pillCount(pageA)}, rule ${repA.length} historical + ${liveA_.notes.length} live`,
);

// ── 3. Fixture B: 2 historical, 1 live ─────────────────────────────────────

const liveB_ = await liveExpect(fx.B, oracle);
const pageB = await open(fx.B);
const idsB = await noteIds(pageB);
const histB = idsB.filter((i) => !i.endsWith("-head"));
const liveB = idsB.filter((i) => i.endsWith("-head"));
check(
  "3a. fixture B shows the 2 pinned historical rows",
  JSON.stringify(histB) === JSON.stringify(expectedDesc(repB)),
  histB.join(", "),
);
const liveIdsB = liveB_.notes.map((n) => n.id);
check(
  "3b. its live WBTC rows are the ones the rule draws, from the block the rule picks over the same route data",
  JSON.stringify(liveB) === JSON.stringify(liveIdsB),
  liveIdsB.length === 0
    ? `page ${liveB.join(", ") || "none"} · ${liveRuleSays(liveB_)}`
    : `page ${liveB.join(", ") || "none"}, rule ${liveIdsB.join(", ")}`,
);
const notesB = repB.length + liveB_.notes.length;
check(
  "3c. the pill counts every note the rule draws",
  (await pillCount(pageB)) === notesB,
  `pill ${await pillCount(pageB)}, rule ${repB.length} historical + ${liveB_.notes.length} live`,
);
await pageB.close();

// ── 4. Fixture C: 48 historical rows across three collaterals, 3 live ─────

const liveC_ = await liveExpect(fx.C, oracle);
const pageC = await open(fx.C);
// One head re-read for this page's three live rows.
const headNowC = await laterEnd();
const idsC = await noteIds(pageC);
const histC = idsC.filter((i) => !i.endsWith("-head"));
const liveC = idsC.filter((i) => i.endsWith("-head"));
// 165 rows: like the closed control below, the timeline draws a window, so the
// rendered rows are the newest-first PREFIX of the pinned list while the pill —
// which counts notes, not rows — states the whole of it.
const wantC = expectedDesc(PIN_C);
check(
  "4a. fixture C's drawn rows are the newest-first prefix of the 48 pinned rows",
  histC.length > 0 && JSON.stringify(wantC.slice(0, histC.length)) === JSON.stringify(histC),
  `${histC.length} of ${wantC.length} drawn — ${histC.slice(0, 2).join(", ")}`,
);
check(
  "4b. the pill counts all 48 plus the 3 live rows, whatever the window drew",
  (await pillCount(pageC)) === PIN_C.length + PIN_C_LIVE.length,
  `pill ${await pillCount(pageC)}, pinned ${PIN_C.length + PIN_C_LIVE.length}`,
);
// The liquidation-ended rows the window drew, opened. Ten of the forty-eight
// end in a liquidation, and each one is about the asset that liquidation
// SEIZED — the price of the position's other collaterals across the same
// stretch is not the liquidation's story.
const liqDrawn = PIN_C.filter((n) => n.toKind === "liquidation" && histC.includes(n.id));
const cTexts = [];
for (const n of liqDrawn.slice(0, 3))
  cTexts.push(await openNote(pageC.locator(`[data-market-note="${n.id}"]`).first()));
check(
  "4c. every liquidation-ended row drawn names the asset the liquidation seized and does not claim the move caused it",
  cTexts.length > 0 && cTexts.every((t) => /only for the asset that liquidation seized/i.test(t)),
  cTexts.length === 0 ? "no liquidation-ended row drawn" : (cTexts[0]?.slice(0, 200) ?? ""),
);
check(
  "4d. and each one states the health factor at each price — this position's rows price the whole basket",
  // `every` over an empty list is true, so the count is asserted first: a page
  // that drew no row must not read as a page whose rows all behaved.
  cTexts.length > 0 && cTexts.every((t) => /Health factor at each price/.test(t)),
  cTexts.length === 0 ? "no rows read" : (cTexts.find((t) => !/Health factor/.test(t))?.slice(0, 160) ?? ""),
);
check(
  "4e. at the pinned figures, against liquidation at 1.00",
  liqDrawn.length > 0 &&
    cTexts.every((t, i) => {
      const n = liqDrawn[i];
      return (
        new RegExp(`Health factor at each price\\s*${formatHf(n.hfA)}\\s*→\\s*${formatHf(n.hfB)}`).test(t) &&
        /liquidation at\s*1\.00/.test(t) &&
        t.includes(formatPrice(n.priceA)) &&
        t.includes(formatPrice(n.priceB))
      );
    }),
  liqDrawn
    .slice(0, cTexts.length)
    .map((n) => `${n.symbol} ${n.from}→${n.to}: ${formatHf(n.hfA)} → ${formatHf(n.hfB)}`)
    .join(" · "),
);
check(
  "4f. three live rows, one per collateral the spoke shows held, all three from row 25,880,197",
  JSON.stringify([...liveC].sort()) === JSON.stringify(PIN_C_LIVE.map((n) => n.id).sort()),
  `page ${liveC.join(", ")} · pinned ${PIN_C_LIVE.map((n) => n.id).join(", ")}`,
);
// The earlier end of each live note is a chain read at a fixed block — pinned.
// The later end is re-read, never pinned.
for (const n of PIN_C_LIVE) {
  const fromRule = liveC_.notes.find((r) => r.symbol === n.symbol);
  check(
    `4g-${n.symbol}. the chain read at block ${blk(n.from)} equals the price the lane's own row states, ${n.priceA}`,
    fromRule?.from === n.from && fromRule?.priceA === n.priceA && relEq(fromRule.statedByRow, n.priceA),
    `chain ${fromRule?.priceA} at ${fromRule?.from}, row states ${fromRule?.statedByRow}`,
  );
  const text = await openNote(pageC.locator(`[data-market-note="${n.id}"]`).first());
  check(
    `4g-${n.symbol}-ii. the live row states that earlier price and the health factor ${formatHf(n.hfA)} it makes of the basket at that block`,
    text.includes(formatPrice(n.priceA)) &&
      new RegExp(`Health factor at each price\\s*${formatHf(n.hfA)}\\s*→`).test(text),
    text.slice(0, 220),
  );
  await checkLaterEnd(`4g-${n.symbol}-iii`, text, fx.C, n.symbol, headNowC);
}
// (4h is gone: it read the same pill as 4b against the literal 51 that 4b
// derives, so it stated nothing 4b had not.)
await pageC.close();

// ── 5. The three controls ──────────────────────────────────────────────────

const liveOpen_ = await liveExpect(fx.OPEN, oracle);
const pageOpen = await open(fx.OPEN);
const idsOpen = await noteIds(pageOpen);
const liveIdsOpen = liveOpen_.notes.map((n) => n.id);
check(
  "5a. the open control shows no historical row, and the live rows the rule draws — none where the gate withholds them",
  idsOpen.filter((i) => !i.endsWith("-head")).length === 0 &&
    JSON.stringify(idsOpen.filter((i) => i.endsWith("-head"))) === JSON.stringify(liveIdsOpen),
  `page ${idsOpen.join(", ") || "none"} · rule ${liveIdsOpen.join(", ") || liveRuleSays(liveOpen_)}`,
);
check(
  "5b. its pill counts every note the rule draws",
  // No note at all is no pill, and `pillCount` answers null for that.
  (await pillCount(pageOpen)) === (repOpen.length + liveOpen_.notes.length || null),
  `pill ${await pillCount(pageOpen)}, rule ${repOpen.length} historical + ${liveOpen_.notes.length} live`,
);
await pageOpen.close();

// A closed position has no debt, so it has no live note — the pill counts its
// historical rows alone. Nothing to wait for, so the live wait is skipped.
const pageClosed = await open(fx.CLOSED, 0);
const idsClosed = await noteIds(pageClosed);
// 478 rows: the timeline renders a window, and a note whose anchor row is not
// yet drawn does not render (anchorMarketNotes anchors against the DISPLAYED
// events). So the rendered rows are the newest-first PREFIX of the full list —
// while the pill, which counts the notes rather than the rows drawn, states all
// fifty.
const wantClosed = expectedDesc(PIN_CLOSED);
check(
  "5c. the closed control's drawn rows are the newest-first prefix of the 50 pinned rows",
  idsClosed.length > 0 &&
    JSON.stringify(wantClosed.slice(0, idsClosed.length)) === JSON.stringify(idsClosed) &&
    idsClosed.every((i) => !i.endsWith("-head")),
  `${idsClosed.length} of ${wantClosed.length} drawn — ${idsClosed.join(", ")}`,
);
check(
  "5d. its pill reads the pinned 50, whatever the window drew",
  (await pillCount(pageClosed)) === PIN_CLOSED.length,
  `pill ${await pillCount(pageClosed)}`,
);
await pageClosed.close();

const pageSupply = await open(fx.SUPPLY_ONLY, 0);
const idsSupply = await noteIds(pageSupply);
check(
  "5e. the supply-only control shows no note row and no pill",
  idsSupply.length === 0 && (await pillCount(pageSupply)) === null,
  `${idsSupply.length} note(s), pill ${await pillCount(pageSupply)}`,
);
await pageSupply.close();

// ── 6. The pill hides the rows and moves no count ──────────────────────────

/** Every count the toolbar and the timeline state, as text. */
async function readCounts(page) {
  const countText = await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .innerText();
  const cards = await page.locator("[data-event-id]").count();
  return { countText: countText.replace(/\s+/g, " "), cards };
}

const beforeCounts = await readCounts(pageA);
// The rows the page is drawing right now, for 6d to restore to. The property
// is that the toggle restores what it hid; a number written here instead would
// have to be re-pinned every time the render window grew.
const noteRowsBeforeToggle = await pageA.locator("[data-market-note]").count();
const pillA = pageA.getByRole("button", { name: /^Market notes/i }).first();
const pillPresent = (await pillA.count()) > 0;
const pressed = async () => (pillPresent ? await pillA.getAttribute("aria-pressed") : "ABSENT");
check("6a. the pill starts pressed", (await pressed()) === "true", `aria-pressed ${await pressed()}`);
if (pillPresent) {
  await pillA.click();
  await pageA.waitForTimeout(500);
}
check(
  "6b. pressing it hides every note row and flips aria-pressed",
  pillPresent && (await pageA.locator("[data-market-note]").count()) === 0 && (await pressed()) === "false",
  `${await pageA.locator("[data-market-note]").count()} row(s) left, aria-pressed ${await pressed()}`,
);
const afterCounts = await readCounts(pageA);
check(
  "6c. every count on the page is identical with the notes on and off",
  JSON.stringify(beforeCounts) === JSON.stringify(afterCounts),
  `${JSON.stringify(beforeCounts)} vs ${JSON.stringify(afterCounts)}`,
);
if (pillPresent) {
  await pillA.click();
  await pageA.waitForTimeout(500);
}
check(
  "6d. pressing it again brings back every row it hid, and no other",
  noteRowsBeforeToggle > 0 && (await pageA.locator("[data-market-note]").count()) === noteRowsBeforeToggle,
  `${await pageA.locator("[data-market-note]").count()} row(s) back, ${noteRowsBeforeToggle} before the toggle`,
);

// ── 7. Copy for LLM ────────────────────────────────────────────────────────

const md = await (async () => {
  try {
    await pageA
      .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
      .first()
      .click();
    await pageA.getByRole("menuitem", { name: /Copy Position/i }).click();
    await pageA.waitForTimeout(600);
    return await pageA.evaluate(() => navigator.clipboard.readText());
  } catch (e) {
    return `EXPORT UNREADABLE: ${String(e).split("\n")[0]}`;
  }
})();
// The export states the same total the pill does — 2m's number, and derived
// the same way.
check(
  `7a. the export names "Market notes" and lists the ${notesA} the rule draws`,
  new RegExp(`\\*\\*Market notes:\\*\\*\\s*${notesA}\\b`).test(md),
  md.match(/\*\*Market notes:\*\*[^\n]*/)?.[0] ?? "absent",
);
check(
  "7b. its Market notes section carries a receipt per note",
  (md.match(/^- Receipt: earlier price —/gm) ?? []).length === notesA,
  `${(md.match(/^- Receipt: earlier price —/gm) ?? []).length} receipts, rule ${notesA} notes`,
);
check(
  // The reads are Aave V4's own oracle (getReservePrice on the spoke's
  // AaveOracle), which server mig 314 made the stored history's source too —
  // so the export says "Aave's oracle", where it used to say Chainlink.
  // Where the gate withheld fixture A's live row there is no live sentence to
  // find, and the export must not carry one.
  liveNoteA
    ? "7c. it carries the live sentence, and its receipt names BOTH reads — the pinned one and the head one"
    : "7c. the gate withheld fixture A's live row, so the export carries no live sentence either",
  liveNoteA
    ? /Since this position's .* the AAVE oracle price has moved/.test(md) &&
        md.includes(`/api/oracle/aave-v4?block=${earlierBlockA}`) &&
        /later price — a live read of Aave's oracle \(\/api\/oracle\/aave-v4\)/.test(md)
    : !/Since this position's .* oracle price has moved/.test(md),
  md.match(/Since this position's[^\n]*/)?.[0]?.slice(0, 160) ?? "absent",
);
check(
  "7d. and a historical sentence with its health clause",
  /the position's health factor was 1\.22 at the earlier price and 1\.16 at the later one, against liquidation at 1\.00, at the liquidation threshold the spoke reports now/.test(
    md,
  ),
  md.match(/the position's health factor was[^\n]*/)?.[0]?.slice(0, 180) ?? "absent",
);
const tableRows = (md.match(/^\| \d+ \| /gm) ?? []).length;
check(
  "7e. the notes add no row to the timeline table — its count is the route's own spoke row count",
  tableRows === fx.A.rows.length,
  `table ${tableRows} rows, route ${fx.A.rows.length} rows`,
);
await pageA.close();

// ── 8 & 9. The two fixtures the lane could not serve ───────────────────────
// These are the reason the design changed. On 2026-09-07 neither position's
// newest qualifying row stated any price for its asset — wstETH's lane had
// been silent since the May backfill, and weETH's composed feed was never in
// the live writer's eight — so under the rule of that morning there was no
// live note to draw at all, and under the rule before it there was a wrong
// one. Step 3 of the same programme is filling those lanes, so a row here may
// now state a price; check `b` asserts whichever of the two is true, and a
// stated price must EQUAL the chain read. Both positions are open and act
// again, so each section also states which end-block branch it took.
//
// A LIVE ROW IS NOT OWED. The shipped gate withholds one that states no
// change, and a position that has since exited holds nothing to draw from, so
// `a` asserts that the page draws what the rule draws and the section stands
// down where that is nothing — never that a row exists.

async function checkStalledLaneFixture(section, name, symbol, anchorBlock, anchorPrice) {
  const f = fx[name];
  const rule = await liveExpect(f, oracle);
  const n = rule.notes.find((r) => r.symbol === symbol);
  const page = await open(f);
  const ids = await noteIds(page);
  const live = ids.filter((i) => i.endsWith("-head"));
  check(
    `${section}a. the ${symbol} fixture draws the live row the rule draws, from the block the rule picks over the same route data`,
    JSON.stringify(live) === JSON.stringify(n ? [n.id] : []),
    n ? `page ${live.join(", ")} · rule ${n.id}` : `page ${live.join(", ") || "none"} · ${liveRuleSays(rule, symbol)}`,
  );
  // A withheld row leaves nothing to read. The gate is the shipped rule
  // (`liveGapStatesAChange`, web `2fac3aae`) and a position that has exited
  // holds nothing to draw from at all — in both cases the page is right to
  // show no row, and the rest of this section has no subject.
  if (!n) {
    note(`fixture ${name}: the rule draws no live ${symbol} row — ${liveRuleSays(rule, symbol)}`);
    await page.close();
    return;
  }
  // The load-bearing fact, in whichever of its two forms is true on the day.
  // These fixtures were chosen because their lane was silent, and step 3 of the
  // same programme is filling it (backend `f7dff0a`), so the row may now state
  // a price where it stated none on 2026-09-07. Both branches assert something:
  // where the row says nothing the note stands on the chain read alone, and
  // where it says something it must be the SAME number the chain answers —
  // which is the disagreement that started all of this.
  if (n.statedByRow > 0) {
    note(`fixture ${name}: its earlier row now states a ${symbol} price of its own — the lane has been filled`);
    check(
      `${section}b. the ${symbol} price its earlier row states equals the chain read at that block`,
      relEq(n.statedByRow, n.priceA),
      `row states ${n.statedByRow}, chain ${n.priceA}`,
    );
  } else {
    note(`fixture ${name}: its earlier row states no ${symbol} price — the note stands on the chain read alone`);
    check(
      `${section}b. the note exists though its earlier row states NO ${symbol} price of its own`,
      n.priceA > 0,
      `row at ${n.from} states ${n.statedByRow}, chain ${n.priceA}`,
    );
  }
  const text = await openNote(page.locator(`[data-market-note="${n.id}"]`).first());
  const anchor = Object.values((await pinnedAt(anchorBlock)).prices ?? {}).find((p) => p.symbol === symbol);
  if (n.from === anchorBlock) {
    note(`fixture ${name} branch: PINNED — its earlier row is still block ${blk(anchorBlock)}`);
    check(
      `${section}c. its earlier price is the pinned ${anchorPrice} at block ${blk(anchorBlock)}`,
      text.includes(formatPrice(anchorPrice)) && n.priceA === anchorPrice,
      `page text · rule ${n.priceA}`,
    );
  } else {
    note(
      `fixture ${name} branch: MOVED — its earlier row is now block ${blk(n.from)}, past the §2.4 block ${blk(anchorBlock)}`,
    );
    check(
      `${section}c. its earlier price is what /api/oracle/aave-v4?block=${n.from} answers for ${symbol} (${n.priceA}), and the §2.4 block ${blk(anchorBlock)} still answers ${anchorPrice}`,
      text.includes(formatPrice(n.priceA)) && anchor?.usd === anchorPrice,
      `page has ${formatPrice(n.priceA)}? ${text.includes(formatPrice(n.priceA))} · anchor ${anchor?.usd}`,
    );
  }
  check(
    `${section}d. the row carries a health payload, built leg by leg on the pinned read`,
    n.health != null && /Health factor at each price/.test(text),
    `rule health ${n.health ? "yes" : "no"}`,
  );
  check(
    `${section}e. and its receipt names the pinned read as the earlier end's source`,
    text.includes(`/api/oracle/aave-v4?block=${n.from}`),
    text.slice(0, 400),
  );
  await checkLaterEnd(`${section}f`, text, f, symbol, await laterEnd());
  await page.close();
}

// wstETH: a direct Chainlink feed whose lane stalled at the May backfill.
await checkStalledLaneFixture("8", "WSTETH", "wstETH", 25919931, 3082.92570795);
// weETH: a COMPOSED feed (weETH/ETH × ETH/USD), which the pinned read has to
// compose at the past block exactly as it does at head.
await checkStalledLaneFixture("9", "WEETH", "weETH", 25918931, 2733.680848613346);

await context.close();
await browser.close();

note(`fixture A: ${fx.A.priced}/${fx.A.items} snapshot items priced · fixture C: ${fx.C.priced}/${fx.C.items}`);
console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Aave V4 price gap holds`,
);
process.exit(failures ? 1 : 0);
