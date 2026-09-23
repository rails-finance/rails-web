#!/usr/bin/env node
// Market-note placement and eligibility — the two pure rules, run directly.
// ----------------------------------------------------------------------------
// A market note is a receipted fact about the MARKET, placed between two of the
// account's own events (lib/shared/market-note.ts). One placement rule and one
// selector per kind decide where a note lands and whether it exists at all, and
// every one of them is the kind of rule that fails silently: a note anchored one
// row early still renders, still reads well, and claims an ordering the chain
// never stated; a selector whose eligibility test is too loose renders a slice
// for an account that held nothing, or a price move read off a row that carries
// a stale price.
//
// So all are proved here against the FILE THE PAGE IMPORTS, not a restatement
// of it — node loads the TypeScript module directly under type stripping
// (`--experimental-strip-types`; the script re-executes itself with the flag,
// so `node scripts/verify/…` and run-all both work). Every import in that
// module is `import type`, which is what makes this possible: type imports are
// erased before resolution, so there is no bundler, no `@/` alias to resolve
// and no build step between this check and the code that ships.
//
// NO SERVER, SO NO ROUTE-READ CHECK 0. The house pattern is a check 0 read from
// a route, so the fixture cannot come from the thing under test. There is no
// route here: this file runs the rules over synthetic event lists. Its check 0
// is the equivalent control — that the module actually loaded and the two
// functions came from it — because a run that silently judged nothing is the
// one outcome worse than a red one. The one real-world fixture below (the
// blocks around the MAMO share-rate step) is pinned from the DEPLOYED site and
// from the market-wide series measured on the server, 2026-09-03/04, not
// derived from this code:
//
//   wallet 0x719eae70d4a83f35bf82a2740699f5db84be919d, 2,405 events
//   its last MAMO mint at block 50,516,316
//   the step: 50,516,524 → 50,516,566, 0.020513 → 0.075460, 3.6787×
//   BOTH ends are other wallets' redeems — 0x54fc…6d69 (tx 0xc5c3…66d3, log
//   27) and 0x8407…17c3 — and four more wallets redeemed between the
//   account's mint and the step's opening observation, all still at 0.020513
//   the first of the account's events at or past 50,516,566: 50,516,570,
//   id 0x6bac80e2797127c7c8de61fb7d8b86b2e8264be924c89bab2c72c0882883a495-5
//
// Proved it can fail 2026-09-04 — three separate mutations of
// lib/shared/market-note.ts, each restored after its run, each landing on a
// DIFFERENT check and each exiting 1 rather than crashing:
//
//   A  `e.blockNumber >= note.to.block` → `>`  (the anchor rule)
//      FAIL  1a. asc — the event AT toBlock is the anchor — anchored
//            0x6bac…3a495-5, wanted e_to                     1 of 17 failed
//   B  the observation match `txHash + logIndex` → `blockNumber` (the link)
//      FAIL  5e. neither end is this account's event — eventId e_decoy-3
//                                                              1 of 17 failed
//   C  the eligibility filter loses `side === "supply" && mTokensAfter != null`
//      FAIL  5a / 5e / 5f / 6a / 6b / 6c                      6 of 17 failed
//
// (A's full run is recorded at the foot of this file.)
//
// The Liquity V2 price-gap arm (section 7) was proved the same way, 2026-09-04,
// by setting `RUNWAY_SHARE` from 0.25 to 1 in lib/shared/market-note.ts and
// restoring it after the run — the threshold no longer reaches the one real
// stretch, and four checks that depend on it go red while every check that does
// NOT depend on the threshold stays green, which is the point:
//
//   FAIL  7. the threshold is a share of the position's own runway, exported — RUNWAY_SHARE = 1
//   FAIL  7a. a move that consumes more than a quarter of the runway renders — 0 note(s) · consumed NaN% of a 34.8% runway (wanted 84%)
//   FAIL  7b. the two ratios hold the earlier state and move only the price — undefined% → undefined%
//   FAIL  7c. the change is signed against the earlier price — NaN%
//   PASS  7d–7l  (the terminal arms, the two data traps and the three non-stretches)
//   FAIL  7m. a price gap anchors on the later of its own two events — anchored undefined…
//   5 CHECK(S) FAILED of 31   (exit 1)
//
// Run: node scripts/verify/verify-market-note-placement.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Type stripping is a CLI flag, and run-all spawns `node <script>` with none.
// Re-exec once, with the flag, rather than making the suite special-case this
// file. `--disable-warning` keeps the experimental notice out of a run's output
// (run-all quotes the last line of a script it cannot classify).
if (!process.execArgv.includes("--experimental-strip-types")) {
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}

const mod = await import("../../lib/shared/market-note.ts");
const { anchorMarketNotes, shareRateNotesFor, priceGapNotesFor, rateStepNotesFor, RUNWAY_SHARE, RATE_STEP_MIN_PP } =
  mod;

let failures = 0;
let checked = 0;
function check(name, cond, detail = "") {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

console.log("Market notes — placement + eligibility (pure, no server)\n");

// ── fixtures ────────────────────────────────────────────────────────────────

const WALLET = "0x719eae70d4a83f35bf82a2740699f5db84be919d";
/** The two wallets whose redeems bracket the step. NEITHER is the account: the
 *  series is the market's, and four more wallets redeemed between the
 *  account's last mint and the step's opening observation, all still at
 *  0.020513. A rule that assumed the near end was the account's own event
 *  would have found nothing here. */
const FROM_WALLET = "0x54fc16fe6c49cb06417e56bbadf235650dd76d69";
const TO_WALLET = "0x8407699e359ae158bd7ec0668600cc19a79f17c3";
const MARKET = { address: "0x2f90bb22eb3979f5ffad31ea6c3f0792ca66da32", key: "mamo", symbol: "MAMO" };
const MINT_BLOCK = 50_516_316;
const FROM_BLOCK = 50_516_524;
const TO_BLOCK = 50_516_566;

/** The step as the share-rate endpoint states it (plan §4.4), with the bracket
 *  measured on the market-wide series 2026-09-04. */
const STEP = {
  fromBlock: FROM_BLOCK,
  toBlock: TO_BLOCK,
  fromRate: 0.020513,
  toRate: 0.07546,
  ratio: 3.6787,
  from: {
    txHash: "0xc5c304aab49debce74892c5fbb65340e29841f3891aaa2902994292156fd66d3",
    logIndex: 27,
    wallet: FROM_WALLET,
    kind: "redeem",
  },
  to: { txHash: `0x${"b".repeat(64)}`, logIndex: 7, wallet: TO_WALLET, kind: "redeem" },
};

/** A plain event at a block — only the block and the id matter to placement. */
const ev = (id, blockNumber) => ({
  id,
  txHash: `0x${id
    .replace(/[^0-9a-f]/gi, "0")
    .padEnd(64, "0")
    .slice(0, 64)}`,
  blockNumber,
  timestamp: 0,
  wallet: WALLET,
  actionType: "borrow",
  actionLabel: "Borrow",
  flows: [],
  etherscanUrl: "",
});

/** A Moonwell supply event that states an mToken balance after it — what the
 *  eligibility rule reads. */
const supply = (id, blockNumber, mTokensAfter, market = MARKET.key) => ({
  ...ev(id, blockNumber),
  actionType: "mint",
  actionLabel: "Supply",
  context: {
    protocol: "moonwell",
    data: {
      eventType: "mint",
      market,
      marketSymbol: MARKET.symbol,
      side: "supply",
      mTokensAfter: String(mTokensAfter),
    },
  },
});

/** A borrow in the SAME market: no mToken balance of its own, and it moves
 *  none. The eligibility rule must read past it to the mint below. */
const borrow = (id, blockNumber) => ({
  ...ev(id, blockNumber),
  context: {
    protocol: "moonwell",
    data: { eventType: "borrow", market: MARKET.key, marketSymbol: MARKET.symbol, side: "debt" },
  },
});

/** The account's own history around the step, oldest first. Its last supply
 *  into the market is at 50,516,316 — 208 blocks before the step opens, with
 *  borrows of its own in between. */
const HISTORY = [
  supply("e_mint1-1", 50_512_452, 4_874_297.65),
  supply("e_mint3-1", MINT_BLOCK, 735_562_000),
  borrow("e_borrow-3", 50_516_400),
  ev("0x6bac80e2797127c7c8de61fb7d8b86b2e8264be924c89bab2c72c0882883a495-5", 50_516_570),
  ev("e_liq-27", 50_516_849),
];
const desc = (list) => [...list].reverse();
const note = (over = {}) => ({
  id: "share-rate-step:mamo:step",
  kind: "share-rate-step",
  marketSymbol: "MAMO",
  marketAddress: MARKET.address,
  unitLabel: "MAMO per mMAMO",
  from: {
    block: FROM_BLOCK,
    timestamp: 0,
    value: 0.020513,
    txHash: STEP.from.txHash,
    logIndex: STEP.from.logIndex,
    wallet: FROM_WALLET,
    kind: "redeem",
  },
  to: {
    block: TO_BLOCK,
    timestamp: 0,
    value: 0.07546,
    txHash: STEP.to.txHash,
    logIndex: STEP.to.logIndex,
    wallet: TO_WALLET,
    kind: "redeem",
  },
  ratio: 3.6787,
  ...over,
});

const anchorOf = (notes, events, dir) => {
  const map = anchorMarketNotes(notes, events, dir);
  const keys = [...map.keys()];
  return keys.length === 1 ? keys[0] : keys.length === 0 ? null : keys;
};

// ── 0. control: the rules under test came from the shipped module ───────────

check(
  "0. the module loaded and all three rules are functions from it",
  typeof anchorMarketNotes === "function" &&
    typeof shareRateNotesFor === "function" &&
    typeof priceGapNotesFor === "function",
  `lib/shared/market-note.ts exports ${Object.keys(mod).length} names`,
);

// ── 1. the anchor is the first displayed event at or past to.block ──────────
// "At or past" is the whole rule: the step is known to have happened BY
// to.block, so an event exactly there is already after it. An off-by-one here
// places the note before an event that precedes the step.

const atBoundary = [...HISTORY.slice(0, 3), ev("e_to", TO_BLOCK), ...HISTORY.slice(3)];
check(
  "1a. asc — the event AT toBlock is the anchor",
  anchorOf([note()], atBoundary, "asc") === "e_to",
  `anchored ${anchorOf([note()], atBoundary, "asc")}, wanted e_to`,
);
check(
  "1b. asc — with no event at toBlock, the next one past it anchors (the deployed shape)",
  anchorOf([note()], HISTORY, "asc") === HISTORY[3].id,
  `anchored ${anchorOf([note()], HISTORY, "asc")}, wanted block ${HISTORY[3].blockNumber}`,
);
check(
  "1c. desc — the SAME event anchors when the list is drawn newest-first",
  anchorOf([note()], desc(HISTORY), "desc") === HISTORY[3].id,
  `anchored ${anchorOf([note()], desc(HISTORY), "desc")}`,
);

// ── 2. an anchor inside a run maps to a member id ──────────────────────────
// The timeline attaches the note to the RUN ROW by taking the union over the
// run's member ids, so all this rule owes is a member id.

const RUN_MEMBERS = [ev("e_run-1", TO_BLOCK + 4), ev("e_run-2", TO_BLOCK + 9), ev("e_run-3", TO_BLOCK + 12)];
const withRun = [...HISTORY.slice(0, 3), ...RUN_MEMBERS];
check(
  "2. anchor inside a collapsed run → the note maps to a member of that run",
  RUN_MEMBERS.some((m) => m.id === anchorOf([note()], withRun, "asc")),
  `anchored ${anchorOf([note()], withRun, "asc")} · run members ${RUN_MEMBERS.map((m) => m.id).join(", ")}`,
);

// ── 3. nothing at or past to.block → the note is dropped ───────────────────

const beforeOnly = HISTORY.filter((e) => e.blockNumber < TO_BLOCK);
check(
  "3. no displayed event at or past toBlock → the note does not render",
  anchorMarketNotes([note()], beforeOnly, "asc").size === 0,
  `${beforeOnly.length} events, all before block ${TO_BLOCK}`,
);
check("3b. no events at all → the note does not render", anchorMarketNotes([note()], [], "desc").size === 0);

// ── 4. the anchor filtered out → the next surviving event anchors ──────────

const filtered = HISTORY.filter((e) => e.id !== HISTORY[3].id);
check(
  "4. anchor filtered out of the displayed list → the next event past toBlock anchors",
  anchorOf([note()], filtered, "asc") === HISTORY[4].id,
  `anchored ${anchorOf([note()], filtered, "asc")}, wanted ${HISTORY[4].id}`,
);

// ── 5. eligibility ─────────────────────────────────────────────────────────

const notes = (events, steps = [STEP]) => shareRateNotesFor(steps, MARKET, events);
check(
  "5a. held the market's mTokens across the step → one note, with a slice",
  notes(HISTORY).length === 1 && notes(HISTORY)[0].slice?.units === 735_562_000,
  `${notes(HISTORY).length} note(s), slice units ${notes(HISTORY)[0]?.slice?.units} — read past a borrow of its own` +
    ` at block 50,516,400, which states no mToken balance and moves none`,
);
const emptied = [supply("e_mint1-1", 50_512_452, 4_874_297.65), supply("e_out-1", FROM_BLOCK, 0), ...HISTORY.slice(2)];
check(
  "5b. the last supply-side event before the step left 0 mTokens → no note",
  notes(emptied).length === 0,
  `${notes(emptied).length} note(s)`,
);
const late = HISTORY.filter((e) => e.blockNumber > FROM_BLOCK);
check(
  "5c. the step's fromBlock precedes the position's first event → no note",
  notes(late).length === 0,
  `first event at block ${late[0].blockNumber}, step opens at ${FROM_BLOCK}`,
);
const otherMarket = HISTORY.map((e) =>
  e.context?.data.side === "supply" ? supply(e.id, e.blockNumber, e.context.data.mTokensAfter, "weth") : e,
);
check(
  "5d. the position's mTokens are in ANOTHER market → no note",
  notes(otherMarket).length === 0,
  `${notes(otherMarket).length} note(s)`,
);

// The account's OWN event in the very block of the opening observation is the
// trap: the ends of a step belong to whoever transacted next in the market, so
// a match on block would claim that unrelated row as the observation and link
// the receipt at it.
const decoy = [...HISTORY, ev("e_decoy-3", FROM_BLOCK)];
// Guarded: a mutation that produces NO note must read as a red check, not as
// a crash — run-all treats a script that dies before its verdict as evidence
// of nothing at all, which is the worst of the three outcomes.
const EMPTY_NOTE = { from: { wallet: "" }, to: { wallet: "" }, slice: { units: NaN, before: NaN, after: NaN } };
const both = notes(decoy)[0] ?? EMPTY_NOTE;
check(
  "5e. neither end is this account's event → no eventId, even with an event of its own in that block",
  both.from.eventId === undefined &&
    both.to.eventId === undefined &&
    both.from.wallet === FROM_WALLET &&
    both.from.kind === "redeem" &&
    both.from.logIndex === STEP.from.logIndex &&
    both.to.wallet === TO_WALLET,
  `from ${both.from.wallet.slice(0, 8)}\u2026 ${both.from.kind} log ${both.from.logIndex} \u00b7 to ${both.to.wallet.slice(0, 8)}\u2026 \u00b7 eventId ${both.from.eventId ?? "(none)"}`,
);
const ownLog = [
  ...HISTORY,
  { ...ev("owned-27", FROM_BLOCK), txHash: STEP.from.txHash, id: `${STEP.from.txHash}-${STEP.from.logIndex}` },
];
check(
  "5f. an end that IS an event on this page is linked to it, matched on tx + log index",
  (notes(ownLog)[0] ?? EMPTY_NOTE).from.eventId === `${STEP.from.txHash}-${STEP.from.logIndex}`,
  `eventId ${(notes(ownLog)[0] ?? EMPTY_NOTE).from.eventId ?? "(none)"}`,
);

// ── 6. slice arithmetic ────────────────────────────────────────────────────
// 735.56M mMAMO at 0.020513 and at 0.075460 MAMO per mMAMO. The expected
// figures are the deployed site's own (15.09M / 55.5M), computed here from the
// pinned rates rather than read back from the note.

const slice = (notes(HISTORY)[0] ?? EMPTY_NOTE).slice;
const near = (a, b) => Math.abs(a - b) / b < 0.001;
check(
  "6a. slice before = units × the rate at the last observation before the step",
  near(slice.before, 735_562_000 * 0.020513),
  `${slice.before.toLocaleString("en-US")} MAMO (≈15.09M)`,
);
check(
  "6b. slice after = units × the rate at the first observation after it",
  near(slice.after, 735_562_000 * 0.07546),
  `${slice.after.toLocaleString("en-US")} MAMO (≈55.5M)`,
);
check(
  "6c. the two ends stand in the step's own ratio",
  near(slice.after / slice.before, STEP.toRate / STEP.fromRate),
  `${(slice.after / slice.before).toFixed(4)}× vs ${(STEP.toRate / STEP.fromRate).toFixed(4)}×`,
);

// ── 7. Liquity V2 price gaps — the endpoint rule and the threshold ─────────
// The second kind of note (plan §11). Its two silent-failure modes are the
// mirror of the share-rate ones: an endpoint rule that accepts a row whose
// price is stale or missing states a move that never happened, and a threshold
// that is not measured against THIS position's own runway papers a timeline
// with stretches that meant nothing to it.
//
// The real-world fixture below is read from the DEPLOYED timeline route
// (/api/trove/WETH/78653…2915/timeline, 2026-09-04) and not from this code:
//
//   adjust  block 24,354,005  price 2,643.20398  debt 41,043.73  coll 26.209  CR 168.79%
//   adjust  block 24,393,692  price 1,865.53                                  (−29.42%)
//   liquidation block 25,252,291 price 1,550.01512377
//
// (Plan §11.1 illustrates the copy with a 206% → 145% trove; that is not this
// trove's state — its own ratio at 24,354,005 is 168.79%, and the ratios in
// checks 7f/7g are computed here from the pinned debt, collateral and prices.)

const BRANCH = { collateralType: "WETH", mcr: 1.1, priceFeed: `0x${"c".repeat(40)}` };

/** A Liquity V2 row. Only the fields the two rules read are set; the id
 *  carries its log index the way the backend writes it (`${txHash}_${n}`),
 *  which is the separator the chain-order tie-break has to know about. */
const trove = (n, blockNumber, collateralPrice, over = {}) => {
  const { eventType = "trove", operation = "adjustTrove", debt = 41_043.73, coll = 26.209, cr } = over;
  const txHash = `0x${String(n).padStart(2, "0").repeat(32).slice(0, 64)}`;
  return {
    id: `${txHash}_${n}`,
    txHash,
    blockNumber,
    timestamp: 0,
    wallet: WALLET,
    actionType: operation,
    actionLabel: operation,
    flows: [],
    etherscanUrl: "",
    context: {
      protocol: "liquity-v2-troves",
      data: {
        eventType,
        operation,
        collateralType: "WETH",
        collateralPrice,
        stateAfter: {
          debt,
          coll,
          collateralRatio: cr ?? (debt > 0 ? ((coll * collateralPrice) / debt) * 100 : 0),
        },
      },
    },
  };
};

const A_BLOCK = 24_354_005;
const B_BLOCK = 24_393_692;
const LIQ_BLOCK = 25_252_291;
const PRICE_A = 2_643.20398;
const PRICE_B = 1_865.53;
const PRICE_LIQ = 1_550.01512377;
const gaps = (events) => priceGapNotesFor(events, BRANCH);

check(
  "7. the threshold is a share of the position's own runway, exported",
  RUNWAY_SHARE === 0.25,
  `RUNWAY_SHARE = ${RUNWAY_SHARE}`,
);

// 7a. The real stretch: −29.42% against a trove whose own ratio left it 34.8%
// above the branch minimum. Expected consumed is computed here from the pinned
// figures, never read back off the note.
const WANT_CR_A = ((26.209 * PRICE_A) / 41_043.73) * 100;
const WANT_RUNWAY = 1 - 1.1 / (WANT_CR_A / 100);
const WANT_CONSUMED = Math.abs(PRICE_B / PRICE_A - 1) / WANT_RUNWAY;
const pair = [trove(1, A_BLOCK, PRICE_A), trove(2, B_BLOCK, PRICE_B)];
const g = gaps(pair)[0] ?? { from: {}, to: {}, position: {}, consumed: NaN, changePct: NaN, endedBy: "" };
check(
  "7a. a move that consumes more than a quarter of the runway renders",
  gaps(pair).length === 1 && near(g.consumed, WANT_CONSUMED) && g.endedBy === "adjustment",
  `${gaps(pair).length} note(s) · consumed ${(g.consumed * 100).toFixed(0)}% of a ${(WANT_RUNWAY * 100).toFixed(1)}% runway (wanted ${(WANT_CONSUMED * 100).toFixed(0)}%)`,
);
check(
  "7b. the two ratios hold the earlier state and move only the price",
  near(g.position.crBefore, WANT_CR_A) && near(g.position.crAfter, (WANT_CR_A * PRICE_B) / PRICE_A),
  `${g.position.crBefore?.toFixed(2)}% → ${g.position.crAfter?.toFixed(2)}% against the branch minimum ${g.position.mcrPct}%`,
);
check(
  "7c. the change is signed against the earlier price",
  near(g.changePct, (PRICE_B / PRICE_A - 1) * 100),
  `${g.changePct?.toFixed(2)}%`,
);

// 7d/7e. The threshold does work in both directions. A tiny move on a roomy
// trove is not a note; the same tiny move ending in a liquidation always is.
const roomy = { debt: 41_043.73, coll: (41_043.73 * 2.4444444) / PRICE_A };
const smallMove = [trove(1, A_BLOCK, PRICE_A, roomy), trove(2, B_BLOCK, PRICE_A * 0.98, roomy)];
check(
  "7d. a 2% move on a 55% runway is not stated",
  gaps(smallMove).length === 0,
  `${gaps(smallMove).length} note(s) — consumed ≈ ${((0.02 / (1 - 1.1 / 2.4444444)) * 100).toFixed(0)}%, under the ${(RUNWAY_SHARE * 100).toFixed(0)}% threshold`,
);
const smallToLiq = [
  trove(1, A_BLOCK, PRICE_A, roomy),
  trove(2, B_BLOCK, PRICE_A * 0.98, { ...roomy, eventType: "liquidation", operation: "liquidate" }),
];
check(
  "7e. the SAME move renders when the stretch ends in a liquidation",
  gaps(smallToLiq).length === 1 && gaps(smallToLiq)[0].endedBy === "liquidation",
  `${gaps(smallToLiq).length} note(s), endedBy ${gaps(smallToLiq)[0]?.endedBy}`,
);
const smallToRedemption = [
  trove(1, A_BLOCK, PRICE_A, roomy),
  trove(2, B_BLOCK, PRICE_A * 0.98, { ...roomy, eventType: "redemption", operation: "redeemCollateral" }),
];
const smallToZombie = [
  trove(1, A_BLOCK, PRICE_A, roomy),
  trove(2, B_BLOCK, PRICE_A * 0.98, { ...roomy, operation: "adjustZombieTrove" }),
];
check(
  "7f. so does a redemption, and a zombie adjustment reads as redemption-class",
  gaps(smallToRedemption)[0]?.endedBy === "redemption" && gaps(smallToZombie)[0]?.endedBy === "redemption",
  `redemption → ${gaps(smallToRedemption)[0]?.endedBy}, adjustZombieTrove → ${gaps(smallToZombie)[0]?.endedBy}`,
);

// 7g. The zero-price data trap (plan §11.2), which would otherwise state a
// move that was never read. 7h. A batch_manager row, a trap until server
// mig 294 priced it at its own position, is now an end.
const zeroPriced = [trove(1, A_BLOCK, PRICE_A), trove(2, B_BLOCK, 0), trove(3, LIQ_BLOCK, PRICE_LIQ)];
const zg = gaps(zeroPriced);
check(
  "7g. a row whose collateralPrice is 0 is not an endpoint — the stretch spans it",
  zg.length === 1 && zg[0].from.block === A_BLOCK && zg[0].to.block === LIQ_BLOCK,
  `${zg.length} note(s), ${zg[0]?.from.block} → ${zg[0]?.to.block} (never ${B_BLOCK}, whose price is 0)`,
);
const batched = [
  trove(1, A_BLOCK, PRICE_A),
  trove(2, B_BLOCK, PRICE_B, { eventType: "batch_manager", operation: "setBatchManagerAnnualInterestRate" }),
  trove(3, LIQ_BLOCK, PRICE_LIQ),
];
const bg = gaps(batched);
check(
  "7h. a batch_manager row ends a stretch (priced at its own position since server mig 294) and cannot start one",
  bg.length === 1 &&
    bg[0].from.block === A_BLOCK &&
    bg[0].to.block === B_BLOCK &&
    bg[0].to.kind === "setBatchManagerAnnualInterestRate",
  `${bg.length} note(s), ${bg[0]?.from.block} → ${bg[0]?.to.block} (${bg[0]?.to.kind})`,
);

// 7i–7k. Three things that are not a stretch at all.
const sameBlock = [trove(1, A_BLOCK, PRICE_A), trove(2, A_BLOCK, PRICE_B)];
check(
  "7i. two rows in the SAME block are one moment, not a stretch",
  gaps(sameBlock).length === 0,
  `${gaps(sameBlock).length} note(s)`,
);
const samePrice = [trove(1, A_BLOCK, PRICE_A), trove(2, B_BLOCK, PRICE_A)];
check("7j. two identical readings state no move", gaps(samePrice).length === 0, `${gaps(samePrice).length} note(s)`);
const opensOnRedemption = [
  trove(1, A_BLOCK, PRICE_A, { eventType: "redemption", operation: "redeemCollateral" }),
  trove(2, B_BLOCK, PRICE_B),
];
check(
  "7k. a stretch opens on one of the trove's OWN operations, never on a redemption",
  gaps(opensOnRedemption).length === 0,
  `${gaps(opensOnRedemption).length} note(s)`,
);
const noDebt = [trove(1, A_BLOCK, PRICE_A, { debt: 0 }), trove(2, B_BLOCK, PRICE_B, { debt: 0 })];
check("7l. no debt is no runway, so no note", gaps(noDebt).length === 0, `${gaps(noDebt).length} note(s)`);

// 7m. The anchor rule is shared, so a price gap lands on B itself.
const anchoredGap = anchorMarketNotes(gaps(pair), pair, "desc");
check(
  "7m. a price gap anchors on the later of its own two events",
  anchoredGap.size === 1 && [...anchoredGap.keys()][0] === pair[1].id,
  `anchored ${[...anchoredGap.keys()][0]?.slice(0, 12)}… · B is ${pair[1].id.slice(0, 12)}…`,
);

// ── 8. Polaris primary-rate step — the third kind, both ends the CDP's own ─
// The real-world fixture below (the primary stretch) was pinned by psql
// over the RAW tables (polaris_cdp_updated + polaris_primary_rate_set) on
// the onboarding box, 2026-09-05 — never derived from this code. usdp CDP 27's
// first
// rate-step stretch:
//
//   A  block 11,512,561  rate 0.059560109811460596 (raw 59560109811460596)
//      debt 77.459136 USDp   set 11,512,518 log 284, ordinal 52
//   B  block 11,548,724  rate 0                     (raw 0)
//      set 11,548,232 log 254, ordinal 832
//   Δ = -5.956 pp · 780 sets in between · interest 4.61 → 0.00 USDp/yr
//
// A polaris event id is `cdp_updated:<txHash>:<logIndex>` — the ids below are
// the fixture's own `a_key`/`b_key`, so this section doubles as proof that
// `polarisLogIndexOf` reads the real id shape (`logIndexOf`'s `-`/`_` split
// would land inside "cdp_updated"'s own underscore and return -1).

const RS_MARKET = { key: "usdp", stableSymbol: "USDp", cdpManager: "0xbdc1fe97e787ae7f653ffbccd74ec49814fe6aa1" };

/** A polaris cdp_updated row — only the fields the selector and the receipts
 *  read are set. `rateSet` is the backend's per-row PrimaryRateSet join
 *  (plan §3); omitted, a note still forms off the CDP's own two touches. */
const polarisEv = (id, blockNumber, primaryRate, over = {}) => {
  const { eventType = "adjust", newDebt = "0", rateSet } = over;
  const txHash = id.split(":")[1];
  return {
    id,
    txHash,
    blockNumber,
    timestamp: 0,
    wallet: "0x3f8d5618bb449f27d34f8381cb4e30e34e3db1d6",
    actionType: eventType,
    actionLabel: eventType,
    flows: [],
    etherscanUrl: "",
    context: {
      protocol: "polaris",
      data: {
        eventType,
        market: "usdp",
        cdpId: "27",
        stableSymbol: "USDp",
        primaryRate,
        newDebt,
        ...(rateSet ? { rateSet } : {}),
      },
    },
  };
};

// The pinned real stretch — usdp CDP 27's first note.
const RS_A_ID = "cdp_updated:0x29835870055bcb254df6c4efe1441899eb02303f58719ab487f40136a7dd1cf8:125";
const RS_B_ID = "cdp_updated:0x0be66d8695c82b84a29be3319739ab936249affb05bcdf3200ee9b4ad5196ef2:97";
const RS_A = polarisEv(RS_A_ID, 11_512_561, 0.059560109811460596, {
  eventType: "open",
  newDebt: "77.459136",
  rateSet: {
    block: 11_512_518,
    logIndex: 284,
    txHash: "0x5fb95c3741d8bbd1bfe3466b13d99bdf88ad1c0e8e3ca136b192be05f96b5630",
    txFrom: "0x3f8d5618bb449f27d34f8381cb4e30e34e3db1d6",
    timestamp: 1787024376,
    ordinal: 52,
  },
});
const RS_B = polarisEv(RS_B_ID, 11_548_724, 0, {
  eventType: "adjust",
  newDebt: "43.711757",
  rateSet: {
    block: 11_548_232,
    logIndex: 254,
    txHash: "0x4beb71dbdd5f22b4b442d98c43b8da2873530888f7aa2db233cf22bc7616aa5b",
    txFrom: "0x22f23610da519045488393a205e9236a6bca3507",
    timestamp: 1787466060,
    ordinal: 832,
  },
});

const rsReal = rateStepNotesFor([RS_A, RS_B], RS_MARKET);
check(
  "8. RATE_STEP_MIN_PP is 1 percentage point, exported",
  RATE_STEP_MIN_PP === 1,
  `RATE_STEP_MIN_PP = ${RATE_STEP_MIN_PP}`,
);
check(
  "8a. the pinned real stretch (usdp/27) renders one note, id and Δ matching the raw-table fixture",
  rsReal.length === 1 && rsReal[0].id === "rate-step:usdp:11512561-11548724" && near(rsReal[0].deltaPp, -5.956),
  `${rsReal.length} note(s), id ${rsReal[0]?.id}, Δ ${rsReal[0]?.deltaPp?.toFixed(4)} pp (wanted -5.956)`,
);
check(
  "8b. setsBetween = to.ordinal − from.ordinal (832 − 52 = 780, the fixture's own count)",
  rsReal[0]?.setsBetween === 780,
  `setsBetween ${rsReal[0]?.setsBetween}`,
);
check(
  "8c. the interest slice holds A's debt fixed and moves only the rate (77.459136 USDp × rate)",
  near(rsReal[0]?.interest?.before ?? NaN, 77.459136 * 0.059560109811460596) && rsReal[0]?.interest?.after === 0,
  `${rsReal[0]?.interest?.before?.toFixed(4)} → ${rsReal[0]?.interest?.after} USDp/yr`,
);
check(
  "8d. a polaris id's trailing `:N` is read as the log index (125 / 97), not -1",
  rsReal[0]?.from.logIndex === 125 && rsReal[0]?.to.logIndex === 97,
  `from.logIndex ${rsReal[0]?.from.logIndex}, to.logIndex ${rsReal[0]?.to.logIndex}`,
);
const rsAnchored = anchorMarketNotes(rsReal, [RS_A, RS_B], "asc");
check(
  "8e. placement anchors on B (to.block = B's block) — the shared rule, unchanged for this kind",
  rsAnchored.size === 1 && [...rsAnchored.keys()][0] === RS_B.id,
  `anchored ${[...rsAnchored.keys()][0]}`,
);

// ── synthetic edge cases — clean numbers, so the threshold arithmetic is
// exact rather than fighting float noise on the real fixture's own rates.
const rsMarket2 = { key: "usdp", stableSymbol: "USDp", cdpManager: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
const rsPair = (rateA, rateB, over = {}) => [
  polarisEv("cdp_updated:0x01:1", 500_000, rateA, { eventType: "open", newDebt: "1000", ...over.a }),
  polarisEv("cdp_updated:0x02:2", over.bBlock ?? 500_100, rateB, { eventType: "adjust", ...over.b }),
];

check(
  "8f. a 1.5 pp step (above threshold) renders one note",
  (() => {
    const n = rateStepNotesFor(rsPair(0.05, 0.065), rsMarket2);
    return n.length === 1 && near(n[0].deltaPp, 1.5);
  })(),
);
check(
  "8g. a 0.9 pp step (below threshold) renders none",
  rateStepNotesFor(rsPair(0.05, 0.059), rsMarket2).length === 0,
);
check(
  "8h. exactly 1.0 pp is INCLUSIVE (the gate is `< RATE_STEP_MIN_PP`, not `<=`)",
  rateStepNotesFor(rsPair(0, 0.01), rsMarket2).length === 1,
);
check("8i. equal rates state no move", rateStepNotesFor(rsPair(0.05, 0.05), rsMarket2).length === 0);
check(
  "8j. two touches in the SAME block are one moment, not a stretch",
  rateStepNotesFor(rsPair(0.05, 0.065, { bBlock: 500_000 }), rsMarket2).length === 0,
);

// (k) a transfer row between A and B is not an end and does not split the
// stretch — the note still spans A → B directly.
const rsTransfer = polarisEv("cdp_updated:0x03:3", 500_050, null, { eventType: "transfer" });
const [rsA15, rsB15] = rsPair(0.05, 0.065);
const rsWithTransfer = rateStepNotesFor([rsA15, rsTransfer, rsB15], rsMarket2);
check(
  "8k. a transfer row between A and B is not an end and does not split the stretch",
  rsWithTransfer.length === 1 && rsWithTransfer[0].from.block === 500_000 && rsWithTransfer[0].to.block === 500_100,
  `${rsWithTransfer.length} note(s), ${rsWithTransfer[0]?.from.block} → ${rsWithTransfer[0]?.to.block}`,
);

// (l) a null-rate row (before the market's first PrimaryRateSet) is not an end.
const rsNullRate = polarisEv("cdp_updated:0x04:4", 500_075, null, { eventType: "adjust" });
const rsWithNull = rateStepNotesFor([rsA15, rsNullRate, rsB15], rsMarket2);
check(
  "8l. a null-rate row is not an end — the stretch still spans A → B",
  rsWithNull.length === 1 && rsWithNull[0].from.block === 500_000 && rsWithNull[0].to.block === 500_100,
  `${rsWithNull.length} note(s), ${rsWithNull[0]?.from.block} → ${rsWithNull[0]?.to.block}`,
);

// (m) the interest slice is present iff A's debt is positive.
const rsZeroDebt = rateStepNotesFor(rsPair(0.05, 0.065, { a: { newDebt: "0" } }), rsMarket2);
check(
  "8m. no interest slice when A's own debt is 0",
  rsZeroDebt.length === 1 && rsZeroDebt[0].interest === undefined,
  `interest ${JSON.stringify(rsZeroDebt[0]?.interest)}`,
);
const rsWithDebt = rateStepNotesFor(rsPair(0.05, 0.065), rsMarket2);
check(
  "8n. the interest slice is debt × rate at each end, debt held fixed",
  near(rsWithDebt[0].interest.before, 1000 * 0.05) && near(rsWithDebt[0].interest.after, 1000 * 0.065),
  `${rsWithDebt[0]?.interest?.before} → ${rsWithDebt[0]?.interest?.after}`,
);

// (o) mixing a `-`-id share-rate-step note with a `:`-id rate-step note in one
// anchorMarketNotes call proves the new polaris parser is additive: the other
// kind's placement is unaffected.
const mixedNotes = [note(), rsReal[0]];
const mixedEvents = [...HISTORY, RS_A, RS_B].sort((a, b) => a.blockNumber - b.blockNumber);
const mixedAnchors = anchorMarketNotes(mixedNotes, mixedEvents, "asc");
check(
  "8o. a share-rate-step note (`-` id) and a rate-step note (`:` id) anchor together, neither disturbing the other",
  mixedAnchors.size === 2,
  `${mixedAnchors.size} anchor(s)`,
);

// ── summary ────────────────────────────────────────────────────────────────

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — placement and eligibility hold`,
);
process.exit(failures ? 1 : 0);

// ── the proved-to-fail run, in full ─────────────────────────────────────────
//
// 2026-09-04, with `e.blockNumber >= note.to.block` flipped to `>` in
// lib/shared/market-note.ts (`anchorMarketNotes`), everything else untouched:
//
//   PASS  0. the module loaded and both rules are functions from it — lib/shared/market-note.ts exports 5 names
//   FAIL  1a. asc — the event AT toBlock is the anchor — anchored 0x6bac80e2797127c7c8de61fb7d8b86b2e8264be924c89bab2c72c0882883a495-5, wanted e_to
//   PASS  1b. asc — with no event at toBlock, the next one past it anchors (the deployed shape)
//   PASS  1c. desc — the SAME event anchors when the list is drawn newest-first
//   PASS  2. anchor inside a collapsed run → the note maps to a member of that run
//   PASS  3 / 3b / 4 / 5a–5f / 6a–6c
//   1 CHECK(S) FAILED of 17   (exit 1)
//
// The flip is invisible everywhere else in the suite: only 1a puts an event
// exactly ON toBlock, which is why that fixture exists.
