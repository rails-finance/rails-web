#!/usr/bin/env node
// The grain a market note's figures are stated at, and what a LIVE price gap
// has to state to be worth a row.
// ----------------------------------------------------------------------------
// Two rules, both of which fail SILENTLY and both of which produced the same
// symptom on the Aave V4 forex spoke (Miles, 2026-09-11: "this is a pretty
// meaningless market note"):
//
//   THE GRAIN. Every figure in a note is a before → after pair, and every
//   formatter was fixed at the decimals an asset quoted in thousands wants.
//   On a pegged asset that renders "1.00 → 1.00" beside a "0.0%" headline —
//   four figures, no information, and nothing about the row says the numbers
//   were rounded into agreement. The rule now: a pair is stated at the fewest
//   decimals at which its two ends do not render alike (`separatingDecimals`),
//   from the site's floor up to a cap.
//
//   THE LIVE GATE. A live gap runs from the position's last touch to the chain
//   head and was unthresholded by design — "nothing has moved" is itself the
//   fact. True of an asset that can move; on a basket of pegged assets it
//   guarantees a row that says nothing at any grain. It now renders when the
//   move clears a floor OR consumed a share of THIS position's own runway.
//
// Proved against the FILE THE PAGE IMPORTS, under node's type stripping, the
// way verify-market-note-placement.mjs is (every import in lib/shared/
// market-note.ts is `import type`, so there is no alias to resolve and no
// build step between this check and the code that ships). Check 0 is the
// control: a run that silently judged nothing is worse than a red one.
//
// THE ONE REAL-WORLD FIXTURE is read from the DEPLOYED oracle route, not from
// this code — GET /api/oracle/aave-v4 and ?block=, preview, 2026-09-11:
//
//   spoke forex, 0xdd647ce113505b34c62412d2a804ce1bfbcfc737, HF 1.03
//   USDC  block 25,944,619  0.99988513  →  head 25,952,170  0.99989181
//   USDT  block 25,944,619  0.99980827  →  head 25,952,170  0.99965692
//
// which is +0.00067% and −0.015% — under a tenth of the floor, and under a
// hundredth of a 1.03-health-factor position's runway. Those are the two rows
// in the screenshot, and checks 5a/5b are the statement that they are gone.
//
// Proved it can fail 2026-09-11 — three mutations of lib/shared/market-note.ts,
// each restored after its run, each landing on a different check:
//
//   A  PRICE_DECIMALS_CAP = 2 (the old fixed grain)
//      FAIL  2a. the two prices do not render alike — 1.00 → 1.00
//      (the §1 checks pass their own cap in, deliberately: they prove the
//      helper, and it is §2 that proves the constant the page ships with)
//   B  changeDigits' significant-digit arm removed (always one decimal)
//      FAIL  3a. a move too small for one decimal states itself — 0.0%
//   C  LIVE_GAP_MOVE_FLOOR = 0, LIVE_GAP_RUNWAY_SHARE = 0
//      FAIL  5a. the USDC row is withheld — move 0.00067%
//      FAIL  5b. the USDT row is withheld — move 0.01514%
//      FAIL  5c. a move at the floor renders, whatever the position
//      FAIL  6a. a flat live price states no note — 1 note
//      FAIL  6b. nor does a move under the floor on a roomy trove
//
// Run: node scripts/verify/verify-market-note-grain.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
const {
  separatingDecimals,
  priceDecimals,
  healthDecimals,
  priceGapFigures,
  liveGapStatesAChange,
  livePriceGapNote,
  priceGapNotesFor,
  LIVE_GAP_MOVE_FLOOR,
  LIVE_GAP_RUNWAY_SHARE,
  PRICE_DECIMALS_FLOOR,
  PRICE_DECIMALS_CAP,
} = mod;

let failures = 0;
let checked = 0;
function check(name, cond, detail = "") {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

console.log("Market notes — figure grain + the live gate (pure, no server)\n");

// ── 0. control ──────────────────────────────────────────────────────────────
check(
  "0. the module under test loaded, and every rule came from it",
  [separatingDecimals, priceDecimals, healthDecimals, priceGapFigures, liveGapStatesAChange, livePriceGapNote].every(
    (f) => typeof f === "function",
  ) &&
    typeof LIVE_GAP_MOVE_FLOOR === "number" &&
    typeof LIVE_GAP_RUNWAY_SHARE === "number",
  `floor ${LIVE_GAP_MOVE_FLOOR}, runway share ${LIVE_GAP_RUNWAY_SHARE}, price grain ${PRICE_DECIMALS_FLOOR}–${PRICE_DECIMALS_CAP}`,
);

// The measured pairs (see the header).
const USDC_A = 0.99988513;
const USDC_B = 0.99989181;
const USDT_A = 0.99980827;
const USDT_B = 0.99965692;
/** A trove-scale pair, for the case the fixed grain was designed around. */
const WSTETH_A = 3114.2035;
const WSTETH_B = 2628.2712;

// ── 1. the grain a pair separates at ────────────────────────────────────────
check(
  "1a. a pair that differs at the floor is left at the floor",
  separatingDecimals(WSTETH_A, WSTETH_B, 2, 6) === 2,
  `${separatingDecimals(WSTETH_A, WSTETH_B, 2, 6)}`,
);
check(
  "1b. two identical readings read at the floor, not at the cap",
  separatingDecimals(1.5, 1.5, 2, 6) === 2,
  `${separatingDecimals(1.5, 1.5, 2, 6)}`,
);
check(
  "1c. a pegged pair separates four decimals in",
  separatingDecimals(USDT_A, USDT_B, 2, 6) === 4,
  `${separatingDecimals(USDT_A, USDT_B, 2, 6)}`,
);
check(
  "1d. a pair that never separates inside the cap returns the cap",
  separatingDecimals(1.0000000001, 1.0000000002, 2, 6) === 6,
  `${separatingDecimals(1.0000000001, 1.0000000002, 2, 6)}`,
);
check(
  "1e. the comparison is the RENDERED string — a pair either side of a rounding boundary separates where it rounds apart",
  separatingDecimals(1.004, 1.006, 2, 6) === 2 && separatingDecimals(1.0004, 1.0006, 2, 6) === 3,
  `${separatingDecimals(1.004, 1.006, 2, 6)} / ${separatingDecimals(1.0004, 1.0006, 2, 6)}`,
);

// ── 2. the figures a note renders ───────────────────────────────────────────
/** The smallest price gap the figure builder accepts: two ends and a change. */
const gap = (a, b, over = {}) => ({
  id: "price-gap:test",
  kind: "price-gap",
  marketSymbol: "USDT",
  marketAddress: "",
  unitLabel: "USD per USDT",
  from: { block: 25_944_619, timestamp: 0, value: a, txHash: "", logIndex: 0, wallet: "", kind: "supply" },
  to: { block: 25_952_170, timestamp: 0, value: b, txHash: "", logIndex: -1, wallet: "", kind: "head" },
  changePct: (b / a - 1) * 100,
  consumed: 0,
  runway: 0.03,
  endedBy: "head",
  live: true,
  ...over,
});

const peg = priceGapFigures(gap(USDT_A, USDT_B));
check("2a. the two prices do not render alike", peg.fromPrice !== peg.toPrice, `${peg.fromPrice} → ${peg.toPrice}`);
check(
  "2b. and they are the same reading either side — the grain is the pair's, not each end's",
  peg.fromPrice.length === peg.toPrice.length,
  `${peg.fromPrice} / ${peg.toPrice}`,
);
const big = priceGapFigures(gap(WSTETH_A, WSTETH_B, { marketSymbol: "wstETH" }));
check(
  "2c. a pair that separates at two decimals is left at two — no gratuitous precision",
  big.fromPrice === "3,114.20" && big.toPrice === "2,628.27",
  `${big.fromPrice} → ${big.toPrice}`,
);

// ── 3. the headline figure ──────────────────────────────────────────────────
check(
  "3a. a move too small for one decimal states itself rather than rounding to zero",
  peg.changeMagnitude !== "0.0%" && peg.changeMagnitude.startsWith("0.015"),
  peg.changeMagnitude,
);
check("3b. an ordinary move keeps its one decimal", big.changeMagnitude === "15.6%", big.changeMagnitude);
check("3c. and the signed form carries the typographic minus", big.change === "−15.6%", big.change);
check("3d. a pair with no move at all still reads as zero", priceGapFigures(gap(1, 1)).changeMagnitude === "0.0%");

// ── 4. the health factor pair ───────────────────────────────────────────────
const health = (before, after) => ({
  hfBefore: before,
  hfAfter: after,
  collateralUsd: 1_000_000,
  debtUsd: 970_000,
  atBlock: 25_944_619,
  ltSource: "chain-head",
});
const thin = priceGapFigures(gap(USDT_A, USDT_B, { health: health(1.031_19, 1.031_08) }));
check(
  "4a. two health factors that agree at two decimals separate further in",
  thin.hfBefore !== thin.hfAfter,
  `${thin.hfBefore} → ${thin.hfAfter}`,
);
const wide = priceGapFigures(gap(WSTETH_A, WSTETH_B, { health: health(1.42, 1.2) }));
check(
  "4b. an ordinary pair stays at the two decimals every other health factor on the page uses",
  wide.hfBefore === "1.42" && wide.hfAfter === "1.20",
  `${wide.hfBefore} → ${wide.hfAfter}`,
);
check(
  "4c. a pair that never separates is not dragged past the cap",
  healthDecimals(health(1.0000001, 1.0000002)) === 4,
  `${healthDecimals(health(1.0000001, 1.0000002))}`,
);

// ── 5. the live gate, on the rows in the screenshot ─────────────────────────
// Runway, holding the rest of the basket fixed, for a position at HF 1.03
// whose collateral is all one asset: (C − D) ÷ C = 1 − 1/HF.
const RUNWAY_AT_103 = 1 - 1 / 1.03;
const moveOf = (a, b) => Math.abs(b / a - 1);
const consumedOf = (a, b, runway) => moveOf(a, b) / runway;
const forex = (a, b) => liveGapStatesAChange(moveOf(a, b), consumedOf(a, b, RUNWAY_AT_103));
check(
  "5a. the USDC row is withheld",
  forex(USDC_A, USDC_B) === false,
  `move ${(moveOf(USDC_A, USDC_B) * 100).toFixed(5)}%`,
);
check(
  "5b. the USDT row is withheld",
  forex(USDT_A, USDT_B) === false,
  `move ${(moveOf(USDT_A, USDT_B) * 100).toFixed(5)}%`,
);
check(
  "5c. a move at the floor renders, whatever the position",
  liveGapStatesAChange(LIVE_GAP_MOVE_FLOOR, 0) === true &&
    liveGapStatesAChange(LIVE_GAP_MOVE_FLOOR * 0.99, 0) === false,
);
check(
  "5d. and a move UNDER the floor renders when it consumed this position's own runway — a knife-edge position is the case a flat floor loses",
  liveGapStatesAChange(0.0003, 0.0003 / 0.0005) === true,
  `3bp against a 0.05% runway consumes ${((0.0003 / 0.0005) * 100).toFixed(0)}%`,
);
check("5e. a position with no runway left always renders", liveGapStatesAChange(0.000001, Infinity) === true);
check("5f. an unreadable move renders nothing", liveGapStatesAChange(NaN, Infinity) === false);

// ── 6. the gate where the page meets it ─────────────────────────────────────
const WALLET = "0x1111111111111111111111111111111111111111";
const BRANCH = { collateralType: "WETH", mcr: 1.1, priceFeed: `0x${"c".repeat(40)}` };
const trove = (n, blockNumber, collateralPrice, over = {}) => {
  const { debt = 41_043.73, coll = 26.209 } = over;
  const txHash = `0x${String(n).padStart(2, "0").repeat(32).slice(0, 64)}`;
  return {
    id: `${txHash}_${n}`,
    txHash,
    blockNumber,
    timestamp: 0,
    wallet: WALLET,
    actionType: "adjustTrove",
    actionLabel: "adjustTrove",
    flows: [],
    etherscanUrl: "",
    context: {
      protocol: "liquity-v2-troves",
      data: {
        eventType: over.eventType ?? "trove",
        operation: over.operation ?? "adjustTrove",
        collateralType: "WETH",
        collateralPrice,
        stateAfter: { debt, coll, collateralRatio: ((coll * collateralPrice) / debt) * 100 },
      },
    },
  };
};
// A roomy trove: CR 168.79%, so its runway is a third of the price and no
// small move can reach the gate through the runway arm.
const PRICE_A = 2_643.20398;
const rows = [trove(1, 24_354_005, PRICE_A)];
const liveAt = (price) => livePriceGapNote(rows, BRANCH, { price, block: 25_252_291, timestamp: 0 });
check("6a. a flat live price states no note", liveAt(PRICE_A) === null, `${liveAt(PRICE_A) ? "1 note" : "none"}`);
check(
  "6b. nor does a move under the floor on a roomy trove",
  liveAt(PRICE_A * (1 + LIVE_GAP_MOVE_FLOOR * 0.5)) === null,
);
check("6c. a real move does", liveAt(PRICE_A * 0.9) != null, `${liveAt(PRICE_A * 0.9)?.changePct.toFixed(2)}%`);
check(
  "6d. and the note it states renders its two prices apart",
  (() => {
    const f = priceGapFigures(liveAt(PRICE_A * 0.9));
    return f.fromPrice !== f.toPrice;
  })(),
);

// ── 7. a HISTORICAL stretch is not gated by any of this ─────────────────────
// Its two ends are two things the index recorded, and a liquidation states
// itself whatever the move. Gating those would hide the price the protocol
// acted at.
const liquidated = [
  trove(1, 24_354_005, PRICE_A),
  trove(2, 24_393_692, PRICE_A * (1 - 0.0001), { eventType: "liquidation", operation: "liquidate" }),
];
check(
  "7a. a liquidation-ended stretch renders on a move a live note would withhold",
  priceGapNotesFor(liquidated, BRANCH).length === 1,
  `${priceGapNotesFor(liquidated, BRANCH).length} note(s)`,
);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} CHECK(S) FAILED`} of ${checked}`);
process.exit(failures === 0 ? 0 : 1);
