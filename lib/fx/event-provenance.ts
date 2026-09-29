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
// TWO COLLATERAL UNIT SYSTEMS, never mixed (chain-verified 2026-07-14, and
// for the seizure fields 2026-09-29): Operate.deltaColls / protocolFees,
// LiquidatePosition.colls and RebalanceTick/Rebalance colls are TOKEN units
// (wstETH 18 dp / WBTC 8 dp) — the manager scales a seizure down to the token
// and subtracts its share of the bonus before it emits; getPosition.rawColls
// and the snapshot oracle price are RATE-NORMALIZED 1e18 units (wstETH pool:
// stETH-equivalent via stEthPerToken; WBTC pool: the same quantity in 18 dp).
// Every summary names which system its value is in.
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

/** Protocol fee this operate charged — Operate.protocolFees, in TOKEN units
 *  (the manager scales the pool's fee down to the token before it emits). */
export const protocolFeesProv = (tokenSym: string, coords: FxCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The protocol fee this operation charged — the Operate event's protocolFees field${atBlock(coords)}, in ${tokenSym} as transferred (the manager scales the pool's fee to the token before it emits). The manager of September 2025 onward emits zero here and charges its fee schedule instead.`,
  contract: poolContract(coords),
  via: `${FX_VIA} · Operate log · ${fieldSeg("protocolFees", raw)}`,
  inputs: eventInputs(coords),
});

/** Collateral sent to the liquidator — LiquidatePosition.colls, TOKEN units
 *  net of the protocol's share of the bonus. */
export const liqCollsProv = (tokenSym: string, coords: FxCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Collateral sent to the liquidator — the LiquidatePosition event's colls field${atBlock(coords)}, in ${tokenSym} as transferred. The manager scales the seized amount down to the token and subtracts the protocol's share of the bonus before it emits and transfers it (PoolManager _afterRebalanceOrLiquidate).`,
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
export const tickRebalanceHitProv = (tick: number | undefined, coords: FxCoords, poolWide = false): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: txVerify(coords),
  summary: `This position's shares sat in tick ${tick ?? "?"} when the ${poolWide ? "pool-wide rebalance moved it" : "pool rebalanced it"}${atBlock(coords)} — attributed by replaying the position's PositionSnapshot tick anchors forward through every TickMovement in (block, transaction, log) order, then matching ${poolWide ? "a TickMovement of that tick earlier in the transaction of the pool-wide Rebalance log" : "the RebalanceTick log against the walked tick"}.`,
  contract: poolContract(coords),
  via: poolWide
    ? "PositionSnapshot anchors → TickMovement chain → same-tx Rebalance"
    : "PositionSnapshot anchors → TickMovement chain → RebalanceTick match",
  inputs: eventInputs(coords),
});

/** A tick-level rebalance amount — the WHOLE tick's clear, as emitted. */
export const tickRebAmountProv = (
  which: "colls" | "fxusd" | "stable",
  unit: string,
  coords: FxCoords,
  raw?: string | null,
  poolWide = false,
  liquidate = false,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${unit} the whole ${poolWide ? "pool" : "tick"} gave up in this ${liquidate ? "liquidation run" : "rebalance"} — the ${liquidate ? "Liquidate" : poolWide ? "Rebalance" : "RebalanceTick"} event's ${which === "colls" ? "collateral field, in the token as transferred to the keeper, net of the protocol's share of the bonus" : which === "fxusd" ? "fxUSD debt field" : "stable-side debt field"}${atBlock(coords)}. Shared across every position ${poolWide ? "the sweep touched" : "in the tick"}; this position's change is the getPosition read beside it.`,
  contract: poolContract(coords),
  via: `captured ${liquidate ? "Liquidate" : poolWide ? "Rebalance" : "RebalanceTick"} log · ${fieldSeg(which === "colls" ? "colls" : which === "fxusd" ? "fxUSDDebts" : "stableDebts", raw)}`,
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

/** The position on chain after this event: getPosition at the block. */
export const chainAfterProv = (side: "coll" | "debt", sym: string, coords: FxCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify("getPosition", coords.blockNumber),
  summary: `${side === "coll" ? `Collateral (${sym}, rate-normalized)` : "fxUSD debt"} the position held AFTER this event${atBlock(coords)} — the pool's getPosition(${coords.positionId ?? "id"}) read at the block, ${side === "coll" ? "rawColls" : "rawDebts"}. Funding, rebalances and any bad-debt share up to the block are in it.`,
  contract: poolContract(coords),
  via: `archive eth_call · getPosition · ${side === "coll" ? "rawColls" : "rawDebts"} ÷ 10^18 (stored in fx_position_boundary)`,
  inputs: eventInputs(coords),
});

/** The position just before this event: the read at block − 1 on a
 *  liquidation; on an operate the after less the event's own delta. */
export const chainBeforeProv = (side: "coll" | "debt", sym: string, coords: FxCoords, read: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: read
    ? `${side === "coll" ? `Collateral (${sym}, rate-normalized)` : "fxUSD debt"} the position held just BEFORE this event — getPosition read at the block before${coords.blockNumber != null ? ` (${coords.blockNumber - 1})` : ""}.`
    : "fxUSD debt the position held just BEFORE this event — the getPosition debt after it less the event's own debt delta. The pool's stored reads at both blocks match this to within share rounding.",
  contract: poolContract(coords),
  via: read ? "archive eth_call · getPosition at block − 1" : "getPosition rawDebts after − Operate deltaDebts",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "state", note: "getPosition at the event block" },
    { label: "change", kind: "chain-derived", pclass: "state", note: "after − before" },
  ]),
});

/** A liquidation's change to the position: getPosition after less before. */
export const chainChangeProv = (side: "coll" | "debt", sym: string, coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `${side === "coll" ? `Collateral (${sym}, rate-normalized)` : "fxUSD debt"} this liquidation moved — getPosition at the block less getPosition at the block before. It can differ from the log's own figures where the pool wrote off a share of bad debt in the same block.`,
  contract: poolContract(coords),
  via: "getPosition at the block − getPosition at block − 1",
  formula: "after − before",
  inputs: eventInputs(coords),
});

/** What moved the debt between the previous event and this one. */
export const debtSincePreviousProv = (coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `fxUSD the position's debt moved between its previous event and this one${atBlock(coords)} — the debt just before this event less getPosition's debt at the previous event's block. No event of the position's own moved it: funding, tick rebalances and any socialized bad debt did.`,
  contract: poolContract(coords),
  via: "debt before this event − getPosition rawDebts at the previous event block",
  formula: "debt before − previous debt after",
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
      : `the ${intervals} most recent quiet stretch${intervals === 1 ? "" : "es"} read so far`
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

// ── USD (chain oracle at a named block) ──────────────────────────────────────

/** Position collateral valued in USD — settled colls (NORMALIZED units) × the
 *  pool oracle's USD price per normalized unit, naming the price block. */
export const fxPositionUsdProv = (normalizedSym: string, priceBlock?: number | null): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The position's collateral valued in USD — the settled collateral (the pool's own getPosition, NORMALIZED ${normalizedSym} units) multiplied by the pool oracle's USD price per normalized unit${priceBlock != null ? `, read at block ${priceBlock}` : ""}. Both legs are chain reads at named blocks — the same oracle the pool's own liquidation math consults. The oracle quotes three prices (anchor / min / max) and this figure uses the MIN leg — the conservative price the protocol itself calls getLiquidatePrice, chain-verified as the one the sweep snapshots (scripts/verify-fx-chain.mjs). The debt ratio beside it is judged at the ANCHOR leg instead, so the two figures deliberately sit at different prices. Normalized amounts only: an operate's token-unit deltas are never priced with this figure.`,
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

// ── per-row reads (getPosition at block − 1 and at the block) ────────────────

const rowReadVerify = (block?: number): ProvVerify => ({
  kind: "recompute",
  text:
    block != null
      ? `Re-run the pool.getPosition / getPositionDebtRatio eth_calls at blocks ${block - 1} and ${block} against an archive node`
      : "Re-run the pool.getPosition eth_call at the block and the block before",
});

/** The position before or after a row: getPosition / getPositionDebtRatio at
 *  block − 1 or at the block, read when the row is opened. */
export const rowStateProv = (
  side: "coll" | "debt" | "ratio",
  when: "before" | "after",
  sym: string,
  coords: FxCoords,
): Provenance => {
  const block = coords.blockNumber != null ? (when === "before" ? coords.blockNumber - 1 : coords.blockNumber) : null;
  const what =
    side === "coll" ? `Collateral (${sym})` : side === "debt" ? "fxUSD debt" : "Debt ratio (anchor oracle price)";
  return {
    kind: "chain",
    pclass: "state",
    verify: rowReadVerify(coords.blockNumber),
    summary: `${what} ${when === "before" ? "just before" : "after"} this row — the pool's ${side === "ratio" ? "getPositionDebtRatio" : `getPosition ${side === "coll" ? "rawColls" : "rawDebts"}`} for position #${coords.positionId ?? "?"}${block != null ? ` at block ${block}` : ""}.`,
    contract: poolContract(coords),
    via: `archive eth_call · ${side === "ratio" ? "getPositionDebtRatio" : "getPosition"} at block${when === "before" ? " − 1" : ""}`,
    inputs: eventInputs(coords),
  };
};

/** A change across a row: the read at the block less the read at block − 1. */
export const rowChangeProv = (side: "coll" | "debt" | "ratio", sym: string, coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: rowReadVerify(coords.blockNumber),
  summary: `${side === "coll" ? `Collateral (${sym})` : side === "debt" ? "fxUSD debt" : "Debt ratio"} this row moved — getPosition${side === "ratio" ? "DebtRatio" : ""} at the block less the same read at the block before. Everything else in the block that touched the position is in it.`,
  contract: poolContract(coords),
  via: "read at the block − read at block − 1",
  formula: "after − before",
  inputs: eventInputs(coords),
});

/** wstETH → stETH at a block: wstETH.stEthPerToken. */
export const wstethRateProv = (coords: FxCoords): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text: `Re-run wstETH.stEthPerToken()${coords.blockNumber != null ? ` at block ${coords.blockNumber}` : ""}`,
  },
  summary: `stETH per wstETH at this block — wstETH's stEthPerToken()${atBlock(coords)}, the rate the pool converts wstETH by (its registered rate provider).`,
  contract: { name: "wstETH", address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0" },
  via: "archive eth_call · wstETH.stEthPerToken",
  inputs: eventInputs(coords),
});

/** A token amount restated in the pool's stETH-equivalent unit. */
export const stethEquivalentProv = (what: string, coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `${what} in stETH — the wstETH amount times stEthPerToken at this block, the conversion the pool applies to every wstETH amount.`,
  contract: { name: "wstETH", address: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0" },
  via: "wstETH amount × stEthPerToken",
  formula: "wstETH × rate",
  inputs: eventInputs(coords),
});

/** What the protocol kept of a seizure: the position's collateral change less
 *  what reached the keeper. */
export const protocolShareProv = (sym: string, coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The protocol's share of the bonus — the collateral the position lost (getPosition at block − 1 less at the block) minus what reached the keeper, both in ${sym}. The manager keeps getLiquidationExpenseRatio of the bonus.`,
  contract: poolContract(coords),
  via: "collateral lost − collateral sent to the keeper",
  formula: "(before − after) − sent",
  inputs: eventInputs(coords),
});

/** fxUSD debt a liquidation left unpaid, spread over every other position. */
export const unpaidDebtProv = (coords: FxCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Debt the collateral did not cover — the position's debt just before (getPosition at block − 1) less the debt the liquidator repaid. The pool removed it from the position and raised its debt index, so every remaining position owes a share of it.`,
  contract: poolContract(coords),
  via: "debt before − fxUSD repaid − stable repaid",
  formula: "before − repaid",
  inputs: eventInputs(coords),
});

/** The fee schedule the manager applied to this transaction's caller. */
export const feeScheduleProv = (caller: string, coords: FxCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run PoolConfiguration.getPoolFeeRatio(pool, ${caller})${coords.blockNumber != null ? ` at block ${coords.blockNumber - 1}` : ""}`,
  },
  summary: `Fees the pool charged this caller — PoolConfiguration.getPoolFeeRatio(pool, ${caller}) at the block before, the caller being the account that called the PoolManager (the transaction's sender when it called the manager, else read from the transaction's call trace), and the fee the ratio times the amount on each leg. getPoolFeeRatio falls back to the pool's default schedule when the caller has none set; getPoolFeeRatio(pool, 0x0) at the same block is that default.`,
  contract: poolContract(coords),
  via: "archive eth_call · PoolConfiguration.getPoolFeeRatio",
  inputs: eventInputs(coords),
});

// ── the card's thresholds, trigger price and rebalance split ─────────────────

/** The anchor oracle price the debt ratio was judged at, recovered from the
 *  settled sweep: getPositionDebtRatio = debts ÷ (colls × anchor price). */
export const anchorPriceProv = (sym: string, block?: number | null): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The anchor price the debt ratio uses — the settled debt divided by the settled collateral times the debt ratio, all three from the pool's getPosition and getPositionDebtRatio${block != null ? ` at block ${block}` : ""}. The ratio is debts × 1e36 ÷ (colls × anchor price) on chain (scripts/verify-fx-chain.mjs check 5), so this recovers the anchor leg in USD per ${sym}.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "settled debts ÷ (settled colls × settled debt ratio)",
  formula: "debts ÷ (colls × ratio)",
});

/** The oracle's min leg, the price the collateral's USD figure uses. */
export const oracleMinPriceProv = (sym: string, block?: number | null): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  summary: `The oracle's min price — USD per ${sym} from the pool oracle's min (liquidate) leg${block != null ? `, as stamped at block ${block}` : ""}, the price the collateral's dollar figure uses.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "pool oracle getPrice · min leg (the sweep's pool_oracle_price)",
});

/** A pool line: rebalance or liquidation debt ratio, with its bonus. */
export const poolLineProv = (which: "rebalance" | "liquidate", block?: number | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: stateVerify(which === "rebalance" ? "getRebalanceRatios" : "getLiquidateRatios", block ?? null),
  summary: `The pool's ${which === "rebalance" ? "rebalance" : "liquidation"} line — the debt ratio from which a keeper may ${which === "rebalance" ? "rebalance a tick" : "liquidate"}, and its bonus: the pool's ${which === "rebalance" ? "getRebalanceRatios" : "getLiquidateRatios"}${block != null ? ` at block ${block}` : ""}.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: `pool ${which === "rebalance" ? "getRebalanceRatios" : "getLiquidateRatios"} (eth_call)`,
});

/** One oracle leg read at the settled block (pool.priceOracle().getPrice()). */
export const oracleLegAtProv = (leg: "anchor" | "min", sym: string, block: number): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: { kind: "recompute", text: `Re-run pool.priceOracle().getPrice() at block ${block}` },
  summary:
    leg === "anchor"
      ? `The oracle's anchor price, USD per ${sym}, at block ${block} — the same block as the collateral and debt. getPositionDebtRatio divides by it, so the debt ratio and this dollar figure agree: debt ÷ (collateral × anchor) = the ratio.`
      : `The oracle's min price, USD per ${sym}, at block ${block} — the same block as the collateral and debt. The pool checks borrowing and withdrawing (the 85.5% ceiling), rebalancing (from 88%) and liquidation (from 95%) against it: BasePool.operate uses getExchangePrice, rebalance getPrice's min leg, liquidate getLiquidatePrice, all the min leg.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "pool.priceOracle() · getPrice() (archive eth_call at the settled block)",
});

/** The position's collateral valued at the anchor price of the settled block. */
export const anchorUsdProv = (sym: string, block: number | null): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The collateral in USD — the settled collateral (getPosition, ${sym}) times the oracle's anchor price${block != null ? ` at block ${block}` : ""}, the price the debt ratio uses, so the debt divided by this figure is the ratio.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "settled colls × anchor price (same block)",
  formula: "colls × anchor",
});

/** The debt ratio at the min price: debts ÷ (colls × min). */
export const minRatioProv = (block: number): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The debt ratio judged at the oracle's min price — the settled debt divided by the settled collateral times the min price, all at block ${block}. The pool's lines (85.5% for borrowing, 88% rebalance, 95% liquidation) compare against this figure.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "debts ÷ (colls × min price)",
  formula: "debts ÷ (colls × min)",
});

/** The min price at which the position reaches a line. */
export const minTriggerPriceProv = (line: string, sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The min price at which this position reaches ${line} — the debt divided by (the collateral times ${line}), in USD per ${sym}, and the fall from today's min price. It holds collateral and debt where they are now; funding keeps taking collateral, which raises this price slowly.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "debts ÷ (colls × line)",
  formula: "debts ÷ (colls × line)",
});

/** The anchor price at which the position's debt ratio reaches a line, with
 *  collateral and debt held where they are. */
export const triggerPriceProv = (line: string, sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `Price at which this position reaches ${line} — the anchor price times the debt ratio divided by ${line}, in USD per ${sym}. It holds collateral and debt where they are now; funding keeps taking collateral, which raises the ratio slowly.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "anchor price × debt ratio ÷ line",
  formula: "anchor × ratio ÷ line",
});

/** What rebalances cleared from the position: its debt at block − 1 less at the
 *  block, summed over the rebalance rows' blocks. */
export const rebalanceClearedProv = (count: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: { kind: "recompute", text: "Re-run getPosition at each rebalance row's block and the block before" },
  summary: `Debt cleared by rebalances — the position's getPosition debt at the block before each of its ${count} rebalance row${count === 1 ? "" : "s"} less the debt at that block, summed. The rows are the rebalances the tick replay placed on this position.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "Σ (getPosition debt at block − 1 − at block) over the rebalance blocks",
  formula: "Σ (before − after)",
});

/** Collateral the socialized rows took: Σ over their blocks of getPosition
 *  collateral at block − 1 less at the block. */
export const socializedCollTakenProv = (unit: string, count: number): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run getPosition at each rebalance or liquidation row's block and the block before",
  },
  summary: `Collateral (${unit}, rate-normalized) the rebalance and pool-wide liquidation rows took — the position's getPosition collateral at the block before each of its ${count} row${count === 1 ? "" : "s"} less the collateral at that block, summed.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "Σ (getPosition collateral at block − 1 − at block) over the rows' blocks",
  formula: "Σ (before − after)",
});

/** Funding: the collateral drift less what the rows took. */
export const fundingTakenProv = (unit: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Collateral (${unit}) funding took — the collateral that moved without the owner's transaction over every quiet stretch, less what the rebalance and liquidation rows took at their blocks. Funding is charged on collateral through the pool's collateral index with no event, so it is this remainder; a redemption against the position's tick would also land here (six redemptions exist on the manager in all).`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "Σ stretch collateral drift − Σ row-block collateral change",
  formula: "drift − rows",
});

/** The rest of the debt that moved without the owner's transaction. */
export const otherDebtMovesProv = (): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Debt added without the owner's transaction outside the rebalances — the settled debt less (the event-implied debt minus what rebalances cleared). It holds other positions' bad debt, which the pool adds to every position through its debt index, and any other pool-wide change to the position's debt.`,
  contract: { name: "AaveFundingPool", address: "" },
  via: "settled debt − (implied debt − rebalance-cleared debt)",
  formula: "settled − implied + cleared",
});
