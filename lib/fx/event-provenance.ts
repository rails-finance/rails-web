// f(x) Protocol V2 provenance vocabulary.
// ----------------------------------------------------------------------------
// f(x) V2 positions are ERC721 xPOSITIONs on two AaveFundingPools (wstETH /
// WBTC) hanging off one PoolManager; debt is fxUSD (18 dp, NOT $1-pinned —
// fxUSD amounts render as fxUSD tokens, never equated to USD). Two replay
// lanes with DIFFERENT step classes — the grading is the point:
//   • emitted — fields the event itself carries (Operate.deltaColls /
//     deltaDebts, LiquidatePosition.colls / fxUSDDebts / stableDebts, and the
//     same-tx PositionSnapshot's tick / shares / oracle price).
//   • state   — the SETTLED lane: the pool's own getPosition /
//     getPositionDebtRatio / ownerOf views, swept server-side at a named head
//     block. This is the ONLY valid source for current state: funding (the
//     collateral index fed by Aave's borrow index), socialized rebalances
//     (RebalanceTick / Rebalance; ticks also migrate silently via
//     TickMovement) and bad-debt write-offs at liquidation all mutate
//     positions with NO per-position event.
//   • indexed — the event-implied running debt: Σ of the position's own event
//     debt deltas. No on-chain slot holds it, and it is deliberately NOT the
//     position's true debt — its gap vs the settled debt IS the socialized
//     lane, rendered as an explicit reconciliation (spike-verified: wstETH
//     #285 implied 25,178 fxUSD vs settled 0).
//
// TWO COLLATERAL UNIT SYSTEMS, never mixed (chain-verified 2026-07-14):
// Operate.deltaColls is TOKEN units (wstETH 18 dp / WBTC 8 dp);
// getPosition.rawColls / LiquidatePosition.colls / the snapshot oracle price
// are RATE-NORMALIZED 1e18 units (wstETH pool: stETH-equivalent via
// stEthPerToken; WBTC pool: the same quantity in 18 dp). Every summary names
// which system its value is in.
//
// Values replay the captured fx_* events. The `contract` is the per-pool
// AaveFundingPool (passed in as `coords.pool`) — each pool is its own
// contract and its own ERC721, like Compound's per-market Comet.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const FX_VIA = "captured AaveFundingPool events (fx_*)";

export interface FxCoords {
  txHash?: string;
  blockNumber?: number;
  /** The pool's AaveFundingPool address — the contract every value cites. */
  pool?: string;
  /** Pool label, e.g. "wstETH pool". */
  poolLabel?: string;
  /** The position NFT id within its pool. */
  positionId?: string;
}

const poolContract = (coords?: FxCoords) => ({
  name: coords?.poolLabel ? `AaveFundingPool (${coords.poolLabel})` : "AaveFundingPool",
  address: coords?.pool ?? "0x0000000000000000000000000000000000000000",
});

const atBlock = (coords?: FxCoords): string => (coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "");

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: FxCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

/** State-read proof: re-run the named pool view yourself (an archive node for
 *  a historical block). */
const stateVerify = (method: string, block?: number | null): ProvVerify => ({
  kind: "recompute",
  text:
    block != null
      ? `Re-run the pool.${method} eth_call at block ${block} against an archive node`
      : `Re-run the pool.${method} eth_call against any node`,
});

function eventInputs(coords: FxCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.positionId)
    inputs.push({ label: "position", value: `#${coords.positionId}`, kind: "chain", note: "the position NFT id" });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords?.txHash)
    inputs.push({
      label: "tx",
      value: coords.txHash,
      kind: "chain",
      note: "captured log",
    });
  return inputs;
}

// ── per-event deltas (emitted) ───────────────────────────────────────────────

/** Signed collateral delta this operate moved — Operate.deltaColls, in TOKEN
 *  units (the collateral as transferred: wstETH 18 dp / WBTC 8 dp). */
export const collDeltaProv = (tokenSym: string, coords: FxCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${tokenSym} this operation moved — the signed collateral delta the Operate event itself carries, exactly as the pool emitted it${atBlock(coords)}, scaled by ${tokenSym}'s decimals. TOKEN units — the collateral as transferred, NOT the rate-normalized unit the settled amounts are in; the two systems never mix. Decoded from the log, never recomputed.`,
  contract: poolContract(coords),
  via: `${FX_VIA} · Operate log · ${fieldSeg("deltaColls", raw)}`,
  inputs: eventInputs(coords),
});

/** Signed fxUSD debt delta this operate moved — Operate.deltaDebts. */
export const debtDeltaProv = (coords: FxCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The fxUSD debt this operation drew or repaid — the signed debt delta the Operate event itself carries, exactly as the pool emitted it${atBlock(coords)}, scaled by fxUSD's 18 decimals. An fxUSD token amount, not a USD figure (fxUSD is not $1-pinned). Event deltas are history only: socialized rebalances and write-offs mutate the position's true debt with no per-position event.`,
  contract: poolContract(coords),
  via: `${FX_VIA} · Operate log · ${fieldSeg("deltaDebts", raw)}`,
  inputs: eventInputs(coords),
});

/** Protocol fee this operate charged — Operate.protocolFees, in NORMALIZED
 *  collateral units. */
export const protocolFeesProv = (normalizedSym: string, coords: FxCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The protocol fee this operation charged — the field the Operate event itself carries, exactly as the pool emitted it${atBlock(coords)}. NORMALIZED collateral units (${normalizedSym}, 1e18) — the rate-converted system the pool accounts in, not the token as transferred.`,
  contract: poolContract(coords),
  via: `${FX_VIA} · Operate log · ${fieldSeg("protocolFees", raw)}`,
  inputs: eventInputs(coords),
});

/** Collateral seized in a liquidation — LiquidatePosition.colls, NORMALIZED
 *  units. */
export const liqCollsProv = (normalizedSym: string, coords: FxCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Collateral seized in this liquidation — the amount the LiquidatePosition event itself carries, exactly as the pool emitted it${atBlock(coords)}. NORMALIZED units (${normalizedSym}, 1e18 — rate-converted via the pool's token-rate provider), NOT the token-as-transferred unit an operate's deltaColls is in; the two systems never mix or sum.`,
  contract: poolContract(coords),
  via: `${FX_VIA} · LiquidatePosition log · ${fieldSeg("colls", raw)}`,
  inputs: eventInputs(coords),
});

/** Debt cleared by the liquidator — LiquidatePosition.fxUSDDebts or
 *  .stableDebts (both fxUSD-denominated legs of the same log). */
export const liqDebtRepaidProv = (which: "fxusd" | "stable", coords: FxCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `${which === "fxusd" ? "fxUSD debt" : "Stable-side (USDC-leg) debt"} the liquidator cleared in this liquidation — the field the LiquidatePosition event itself carries, exactly as the pool emitted it${atBlock(coords)}, scaled by 18 decimals. A terminal bad-debt write-off beyond what the liquidator covered leaves NO event field — it shows up only in the settled reconciliation (the socialized lane).`,
  contract: poolContract(coords),
  via: `${FX_VIA} · LiquidatePosition log · ${fieldSeg(which === "fxusd" ? "fxUSDDebts" : "stableDebts", raw)}`,
  inputs: eventInputs(coords),
});

/** The liquidation's total debt delta = fxUSDDebts + stableDebts — two emitted
 *  fields of the SAME log, one addition. */
export const liqDebtTotalProv = (coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Total debt this liquidation cleared — the LiquidatePosition log's own \`fxUSDDebts\` plus its own \`stableDebts\`: two emitted fields of the same log, one addition. Any bad-debt write-off beyond it emitted no field and lives in the settled reconciliation (the socialized lane).`,
  contract: poolContract(coords),
  via: "fxUSDDebts + stableDebts (same log)",
  formula: "fxUSD leg + stable leg",
  inputs: eventInputs(coords, [
    { label: "fxUSD leg", kind: "chain", pclass: "emitted", note: "the log's own fxUSDDebts" },
    { label: "stable leg", kind: "chain", pclass: "emitted", note: "the log's own stableDebts" },
  ]),
});

// ── the same-tx PositionSnapshot (emitted) ───────────────────────────────────

/** The oracle USD price per NORMALIZED unit at this event's block — the
 *  same-tx PositionSnapshot's price field: a real chain read at a named
 *  block, never a pin. */
export const snapOraclePriceProv = (normalizedSym: string, coords: FxCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `The oracle USD price per NORMALIZED unit (${normalizedSym}, 1e18) at this event's block — the price the pool's own oracle returned when this touch executed, written into the same-transaction PositionSnapshot log${atBlock(coords)}. A real chain read at a named block, usable for USD at event time on NORMALIZED amounts only — never on an operate's token-unit deltas, and never a convenience pin.`,
  contract: poolContract(coords),
  via: `${FX_VIA} · PositionSnapshot log (same tx) · ${fieldSeg("price", raw)}`,
  inputs: eventInputs(coords),
});

// ── the settled lane (state: the pool's own views, swept server-side) ────────

/** Settled collateral — getPosition.rawColls at the sweep's named block. */
export const settledCollateralProv = (normalizedSym: string, atBlockNum?: number | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify("getPosition", atBlockNum ?? null),
  summary: `Collateral the position holds${atBlockNum != null ? ` at block ${atBlockNum}` : ""} — the pool's own \`getPosition\` view (rawColls), read server-side in the settled sweep. NORMALIZED units (${normalizedSym}, 1e18). This is the ONLY valid current figure: funding, socialized rebalances and tick migrations all mutate collateral with no per-position event, so no event replay can state it.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "pool getPosition (eth_call) · rawColls",
});

/** Settled fxUSD debt — getPosition.rawDebts at the sweep's named block. */
export const settledDebtProv = (atBlockNum?: number | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify("getPosition", atBlockNum ?? null),
  summary: `fxUSD debt the position owes${atBlockNum != null ? ` at block ${atBlockNum}` : ""} — the pool's own \`getPosition\` view (rawDebts), read server-side in the settled sweep. This is the contract's own reckoning: socialized rebalances and bad-debt write-offs are all applied. The event-implied running debt beside it is history only — the gap between the two IS the socialized lane, shown explicitly. An fxUSD token amount, not a USD figure.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "pool getPosition (eth_call) · rawDebts",
});

/** Settled debt ratio — the pool's own getPositionDebtRatio view. */
export const settledDebtRatioProv = (atBlockNum?: number | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify("getPositionDebtRatio", atBlockNum ?? null),
  summary: `The position's debt ratio${atBlockNum != null ? ` at block ${atBlockNum}` : ""} — the pool's own \`getPositionDebtRatio\` view, read server-side in the settled sweep and scaled from 1e18 to 0–1. The contract's own risk figure — the same math its liquidation path runs — not a Rails recomputation. The pool oracle quotes three prices and this ratio is judged at the ANCHOR leg: chain-verified as debts × 1e36 ÷ (colls × anchor price), BigInt-exact on both pools (scripts/verify-fx-chain.mjs). The collateral's USD figure beside it uses the oracle's conservative min (liquidate) leg instead — a deliberately different price, named where it renders.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "pool getPositionDebtRatio (eth_call)",
});

// ── the ownership lane (pool ERC721 Transfer logs; fx_v2_transfer) ───────────

/** A transfer row's holder chip — the Transfer log's own from/to topic. */
export const transferPartyProv = (which: "from" | "to", coords: FxCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The position's ${which === "to" ? "receiving" : "sending"} holder — the \`${which}\` topic of the pool's own ERC721 Transfer log${atBlock(coords)} (the pool contract is itself the position NFT). \`from\` = 0x0 is the mint. Decoded from the log, never recomputed.`,
  contract: poolContract(coords),
  via: `pool ERC721 Transfer log · ${which}`,
  inputs: eventInputs(coords),
});

/** The two-fact external-actor verdict behind a pink marking. */
export const fxExternalActorProv = (facts: { owner: string; txFrom: string }, coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: txVerify(coords),
  summary: `A third party executed this operation: the transaction sender (${facts.txFrom}) is not the owner in force at this block (${facts.owner}), AND that owner is an EOA (eth_getCode empty) — so a differing signer cannot be the owner acting through their own contract. f(x)'s Operate carries no caller param, so this owner-kind check stands in as the second marking fact; contract-owned positions (Safes, managers) are never marked on the signer alone.`,
  contract: poolContract(coords),
  via: "tx sender vs owner-at-block (transfer lane) · owner eth_getCode",
  inputs: eventInputs(coords, [
    { label: "tx sender", value: facts.txFrom, kind: "chain", note: "the signer" },
    { label: "owner at block", value: facts.owner, kind: "chain", note: "EOA (eth_getCode empty)" },
  ]),
});

// ── the socialized lane (derived: tick-lineage replay) ───────────────────────

/** The attribution itself — why this rebalance appears on THIS timeline. */
export const tickRebalanceHitProv = (tick: number | undefined, coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: txVerify(coords),
  summary: `This position's shares sat in tick ${tick ?? "?"} when the pool rebalanced it${atBlock(coords)} — attributed by replaying the position's own PositionSnapshot tick anchors forward through every TickMovement (a tick's surviving shares migrate wholesale, with no position list), then matching the RebalanceTick log against the walked tick. The rebalance socialized its clear across every position in the tick with no per-position event; this derived row is that event, placed on the timeline it silently touched.`,
  contract: poolContract(coords),
  via: "PositionSnapshot anchors → TickMovement chain → RebalanceTick match",
  inputs: eventInputs(coords),
});

/** A tick-level rebalance amount — the WHOLE tick's clear, as emitted. */
export const tickRebAmountProv = (
  which: "colls" | "fxusd" | "stable",
  unit: string,
  coords: FxCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${unit} the WHOLE TICK gave up in this rebalance — the RebalanceTick event's own ${which === "colls" ? "collateral" : which === "fxusd" ? "fxUSD debt" : "stable-side debt"} field, exactly as the pool emitted it${atBlock(coords)}. A TICK-level amount socialized across every position inside — NOT this position's slice, which no log states; the position card's settled reconciliation carries the exact per-position drift.`,
  contract: poolContract(coords),
  via: `captured RebalanceTick log · ${fieldSeg(which === "colls" ? "colls" : which === "fxusd" ? "fxUSDDebts" : "stableDebts", raw)}`,
  inputs: eventInputs(coords),
});

// ── the indexed lane + reconciliations (replay arithmetic) ───────────────────

/** Event-implied running debt AFTER this event — Σ of the position's own event
 *  debt deltas up to and including this one. */
export const impliedDebtAfterProv = (coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Event-implied fxUSD debt after this event — the sum of every debt delta the position's own Operate and LiquidatePosition logs carry, in on-chain order up to this block${atBlock(coords)}. DELIBERATELY NOT the position's true debt: socialized rebalances and bad-debt write-offs mutate debt with no per-position event, so no on-chain slot holds this figure and event replay is history only. The gap vs the settled debt is the socialized lane, shown explicitly.`,
  contract: poolContract(coords),
  via: `${FX_VIA} · Σ ± debt deltas across Operate/LiquidatePosition logs`,
  inputs: eventInputs(coords),
});

/** Position-level event-implied debt — the indexed lane at the head of the
 *  captured history. */
export const impliedDebtProv = (): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    "Event-implied fxUSD debt — Σ of every debt delta the position's own captured events carry, complete from the pool's deploy block. DELIBERATELY NOT the position's true debt: socialized rebalances and bad-debt write-offs leave no per-position event, so this replay can only state what the events accounted for. The settled lane beside it (the pool's own getPosition) is the truth; the difference is the socialized reconciliation.",
  contract: { name: "AaveFundingPool", address: "" },
  via: `${FX_VIA} · Σ ± debt deltas · pool deploy → head`,
});

/** The socialized reconciliation — implied − settled: rebalances, write-offs
 *  and socialized bad debt over the position's whole life. `direction` names the sign:
 *  "cleared" (implied > settled — debt left the position with no event) or
 *  "accrued" (settled > implied — debt grew beyond what events account for).
 *  `impliedBelowZero` marks the tower's clamped accrual segment: the implied
 *  Σ has run negative, so the segment is the whole settled figure, smaller
 *  than the full implied-vs-settled gap the card's reconciliation states. */
export const socializedDebtProv = (
  direction: "cleared" | "accrued",
  settledBlock?: number | null,
  impliedBelowZero = false,
): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    direction === "cleared"
      ? `Socialized rebalances & write-offs — the event-implied debt (Σ of the position's own event deltas) minus the settled debt (the pool's own getPosition${settledBlock != null ? ` at block ${settledBlock}` : ""}). This fxUSD amount left the position with NO per-position event: tick-level rebalances (RebalanceTick), pool-level rebalances, and bad-debt write-offs at liquidation. Shown explicitly so the event history and the chain's own reckoning reconcile in the open — an event-implied sum is never presented as current state.`
      : impliedBelowZero
        ? `Debt accrued beyond the event record — here the position's own event deltas sum BELOW zero (its recorded repayments and liquidation clears exceed its recorded draws, because bad debt socialized from other positions' liquidations kept adding debt with no per-position event and the clears removed that too), so the position's entire settled debt (the pool's own getPosition${settledBlock != null ? ` at block ${settledBlock}` : ""}) stands as eventless accrual. This segment is that settled figure; the card's reconciliation line carries the full implied-vs-settled gap.`
        : `Debt accrued beyond the event record — the settled debt (the pool's own getPosition${settledBlock != null ? ` at block ${settledBlock}` : ""}) minus the event-implied debt (Σ of the position's own event deltas). This fxUSD amount attached to the position with NO per-position event (bad debt socialized from other positions' liquidations, via the AaveFundingPool's socialized accounting). Shown explicitly so the event history and the chain's own reckoning reconcile in the open.`,
  contract: { name: "AaveFundingPool", address: "" },
  via:
    direction === "cleared"
      ? "implied debt − settled debt"
      : impliedBelowZero
        ? "settled debt (implied Σ below zero — segment clamped)"
        : "settled debt − implied debt",
  formula:
    direction === "cleared"
      ? "Σ event deltas − getPosition.rawDebts"
      : impliedBelowZero
        ? "getPosition.rawDebts (Σ event deltas < 0)"
        : "getPosition.rawDebts − Σ event deltas",
  inputs: [
    {
      label: "implied",
      kind: "chain-derived",
      pclass: "indexed",
      note: "Σ of the position's own event debt deltas",
    },
    {
      label: "settled",
      kind: "chain",
      pclass: "state",
      note: `pool getPosition rawDebts${settledBlock != null ? ` at block ${settledBlock}` : ""}`,
    },
  ],
});

/** A lifetime gross fxUSD debt flow (Σ repaid / liquidation-cleared) — the sum
 *  of the position's own emitted debt deltas across its whole captured history
 *  (complete from the pool's deploy block). */
export const fxLifetimeFlowProv = (flow: "repaid" | "liquidated debt"): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} (fxUSD) — the sum of every fxUSD amount this position's own events ${flow === "repaid" ? "repaid through Operate" : "had cleared in LiquidatePosition events"} across its whole captured history (complete from the pool's deploy block). Emitted deltas only — the socialized lane (rebalances, write-offs, socialized bad debt) moved debt with no event and lives in the explicit reconciliation line, not in this sum.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: `${FX_VIA} · Σ debt deltas across the position's own logs · pool deploy → head`,
});

// ── the drift panel (archive boundary reads) ─────────────────────────────────

/** One quiet stretch between the position's own events — the interval row's
 *  block range. Boundaries are the indexed events' own blocks (the end
 *  boundary is the chain head while the stretch is still running). */
export const driftIntervalProv = (fromBlock: number, toBlock: number, toHead?: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `One quiet stretch of this position's life — from block ${fromBlock} to ${toHead ? `the chain head (${toBlock})` : `block ${toBlock}`}, the span between two of its own captured events${toHead ? " (still open-ended)" : ""}. The position emitted nothing inside it; the pool's own getPosition view is read at each boundary and the drift cells beside this range are their differences.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "captured event blocks (fx_*) · interval boundaries",
  inputs: [
    { label: "from block", value: String(fromBlock), kind: "chain", note: "the earlier event's block" },
    {
      label: "to block",
      value: String(toBlock),
      kind: "chain",
      note: toHead ? "the chain head at read time" : "the later event's block",
    },
  ],
});

/** A drift cell — getPosition at the interval's end minus getPosition at its
 *  start: two archive reads at named blocks, one subtraction. */
export const driftValueProv = (
  leg: "colls" | "debts",
  unit: string,
  fromBlock: number,
  toBlock: number,
  toHead?: boolean,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run pool.getPosition at blocks ${fromBlock} and ${toBlock} against an archive node and subtract`,
  },
  summary: `${leg === "colls" ? `Collateral drift (NORMALIZED ${unit} units)` : "fxUSD debt drift"} across this quiet stretch — the pool's own \`getPosition\` view read at block ${toHead ? `${toBlock} (the chain head)` : toBlock} minus the same read at block ${fromBlock}, both archive eth_calls. The position emitted no event inside the stretch, so the whole difference is the socialized lane: ${leg === "colls" ? "funding charges and rebalances" : "rebalances, write-offs, and bad debt socialized from other positions' liquidations"}. These rows decompose the position card's lifetime reconciliation figure interval by interval.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: `pool getPosition (archive eth_call ×2) · ${leg === "colls" ? "rawColls" : "rawDebts"} difference`,
  formula: "end read − start read",
  inputs: [
    {
      label: "start read",
      kind: "chain",
      pclass: "state",
      note: `pool getPosition ${leg === "colls" ? "rawColls" : "rawDebts"} at block ${fromBlock}`,
    },
    {
      label: "end read",
      kind: "chain",
      pclass: "state",
      note: `pool getPosition ${leg === "colls" ? "rawColls" : "rawDebts"} at block ${toBlock}${toHead ? " (head)" : ""}`,
    },
  ],
});

/** The card's collateral-side reconciliation — the socialized lane's
 *  collateral movement, summed over the drift intervals in hand. Funding is
 *  charged on collateral, so this line (not the debt-side socialized figure)
 *  is where a position's funding shows. */
export const lifetimeCollateralDriftProv = (
  unit: string,
  intervals: number,
  complete: boolean,
  headBlock: number | null,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run pool.getPosition at each of this position's event boundary blocks against an archive node, subtract per stretch, sum",
  },
  summary: `Collateral moved with no event of this position's own (NORMALIZED ${unit} units) — the sum of the collateral drift over ${
    complete
      ? `every quiet stretch of the position's life (${intervals} interval${intervals === 1 ? "" : "s"})`
      : `the ${intervals} most recent quiet stretch${intervals === 1 ? "" : "es"} read so far, not yet its whole life`
  }, each stretch being the pool's own \`getPosition\` view at its end minus the same read at its start. Funding is charged on collateral (the pool's collateral index), so this is where funding shows; tick and pool rebalances trim collateral here too. The last stretch ends at the settled sweep${
    headBlock != null ? ` (block ${headBlock})` : ""
  }, the same read the collateral figure above comes from, so this line and that figure are one accounting.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "Σ interval collateral drift · pool getPosition at the position's own event boundaries (archive eth_call)",
  formula: "Σ over stretches (end read − start read)",
  inputs: [
    {
      label: "stretches",
      value: String(intervals),
      kind: "chain-derived",
      pclass: "indexed",
      note: complete
        ? "every quiet stretch between the position's own events"
        : "the most recent stretches read so far",
    },
    {
      label: "boundary reads",
      kind: "chain",
      pclass: "state",
      note: `pool getPosition rawColls at each boundary block${headBlock != null ? `; the head is the settled sweep at block ${headBlock}` : ""}`,
    },
  ],
});

/** A rebalance card's own-position slice — this position's drift over the
 *  quiet stretch that holds the rebalance, one leg. With one rebalance in the
 *  stretch the debt leg is the position's exact slice of the tick's clear;
 *  the collateral leg also carries the funding charged over the stretch. */
export const driftSliceProv = (
  leg: "colls" | "debts",
  unit: string,
  fromBlock: number,
  toBlock: number,
  toHead: boolean,
  rebalances: number,
): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run pool.getPosition at blocks ${fromBlock} and ${toBlock} against an archive node and subtract`,
  },
  summary: `This position's own ${leg === "colls" ? `collateral drift (NORMALIZED ${unit} units)` : "fxUSD debt drift"} over the stretch holding this rebalance — the pool's own \`getPosition\` view at block ${toBlock}${
    toHead ? " (the settled sweep)" : ""
  } minus the same read at block ${fromBlock}, the position's share of what moved with no event of its own. ${
    rebalances === 1
      ? leg === "debts"
        ? "This is the only rebalance in the stretch, so the figure is this position's exact slice of the tick's debt clear."
        : "This is the only rebalance in the stretch, so the figure is this position's slice of the tick's collateral clear plus the funding charged over the stretch."
      : `${rebalances} rebalances sit in this stretch, so the figure is their joint slice${
          leg === "colls" ? " plus the funding charged over the stretch" : ""
        } — the logs never split it per rebalance.`
  } The whole tick's amounts beside it are a different quantity: every position caught in the tick, not this one's share.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: `pool getPosition (archive eth_call ×2) · ${leg === "colls" ? "rawColls" : "rawDebts"} difference over the stretch`,
  formula: "end read − start read",
  inputs: [
    {
      label: "start read",
      kind: "chain",
      pclass: "state",
      note: `pool getPosition ${leg === "colls" ? "rawColls" : "rawDebts"} at block ${fromBlock}`,
    },
    {
      label: "end read",
      kind: "chain",
      pclass: "state",
      note: `pool getPosition ${leg === "colls" ? "rawColls" : "rawDebts"} at block ${toBlock}${toHead ? " (the settled sweep)" : ""}`,
    },
    {
      label: "rebalances in stretch",
      value: String(rebalances),
      kind: "chain-derived",
      pclass: "indexed",
      note: "tick-lineage replay hits inside the stretch",
    },
  ],
});

// ── USD (chain oracle at a named block) ──────────────────────────────────────

/** Position collateral valued in USD — settled colls (NORMALIZED units) × the
 *  pool oracle's USD price per normalized unit, naming the price block. */
export const fxPositionUsdProv = (normalizedSym: string, priceBlock?: number | null): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The position's collateral valued in USD — the settled collateral (the pool's own getPosition, NORMALIZED ${normalizedSym} units) multiplied by the pool oracle's USD price per normalized unit${priceBlock != null ? `, read at block ${priceBlock}` : ""}. Both legs are chain reads at named blocks — the same oracle the pool's own liquidation math consults, not an off-chain market feed. The oracle quotes three prices (anchor / min / max) and this figure uses the MIN leg — the conservative price the protocol itself calls getLiquidatePrice, chain-verified as the one the sweep snapshots (scripts/verify-fx-chain.mjs). The debt ratio beside it is judged at the ANCHOR leg instead, so the two figures deliberately sit at different prices. Normalized amounts only: an operate's token-unit deltas are never priced with this figure.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "settled collateral × pool oracle min (liquidate) price (both eth_call at named blocks)",
  formula: "settled colls × oracle min (liquidate) price",
  inputs: [
    { label: "settled colls", kind: "chain", pclass: "state", note: "pool getPosition rawColls (the sweep)" },
    {
      label: "oracle price",
      kind: "chain",
      pclass: "oracle",
      note: `pool oracle min (liquidate) leg — USD per ${normalizedSym}${priceBlock != null ? ` at block ${priceBlock}` : ""}`,
    },
  ],
});
