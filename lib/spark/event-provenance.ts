// SparkLend provenance vocabulary (event surfaces).
// ----------------------------------------------------------------------------
// Every position value traces to a SparkLend Pool event field or a truth-
// preserving sum of them (the replayed per-reserve supply / debt balance) — the
// chain-state baseline, every Provenance here `kind:"chain"`. Riding on top of
// it, `kind:"chain-derived"`: the at-block USD builders below (atBlockPriceProv,
// snapshotUsdProv, liqLegUsdProv, liqPremiumProv) value those chain-state
// figures at SparkLend's own IAaveOracle price captured at the event's block
// (mig 092) — a chain read pinned to that block, not an off-chain feed and not
// today's price. Health factor, collateral ratio, liquidation price, and APR
// stay absent: those would be `<Layer>`s, not part of this surface.
//
// Replays the captured spark_* events. SparkLend is an Aave V3 fork, so the
// fields named here (Supply / Withdraw / Borrow / Repay / LiquidationCall
// `amount`) are the Aave V3 ones.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import type { OriginEnvelope } from "@/lib/shared/types/event-shape";
import { SPARK_ADDRESSES } from "./asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { counterpartyNameInput } from "@/lib/aave-v3/event-provenance";

const SPARK = { name: "SparkLend Pool", address: SPARK_ADDRESSES.POOL };

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const SPARK_VIA = "captured SparkLend events (spark_*)";

export interface SparkCoords {
  txHash?: string;
  blockNumber?: number;
  reserve?: string;
  wallet?: string;
}

const atBlock = (coords?: SparkCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Full origin anatomy when the transform stamped an envelope — the emitting
 *  event, the ABI param, the untouched uint256, and the divisor exponent. */
const originSeg = (o: OriginEnvelope | null | undefined, fallback: string): string =>
  o ? `${o.event} log · ${fieldSeg(o.param, o.raw)} · ÷10^${o.scale}` : fallback;

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: SparkCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

function eventInputs(coords: SparkCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.reserve)
    inputs.push({ label: "reserve", value: coords.reserve, kind: "chain", note: "reserve token address" });
  if (coords?.wallet) inputs.push({ label: "wallet", value: coords.wallet, kind: "chain", note: "position owner" });
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

/** Signed amount of the reserve token this event moved (the event's `amount`). */
export const assetsDeltaProv = (
  sym: string,
  side: "supply" | "debt",
  coords: SparkCoords,
  raw?: string | null,
  origin?: OriginEnvelope | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this operation moved on the ${side === "supply" ? "collateral/supply" : "borrow/debt"} side — the amount the event itself carries, exactly as the SparkLend Pool emitted it${atBlock(coords)}, scaled by the token's decimals. Decoded from the log, never recomputed.`,
  contract: SPARK,
  via: `${SPARK_VIA} · ${originSeg(origin, fieldSeg("amount", raw))}`,
  inputs: eventInputs(coords),
});

/** Third-party action: the parties behind an event the owner didn't execute.
 *  Both leaves are chain facts — the transaction envelope's `from` and the
 *  event's own party param (Supply/Borrow `user`, Repay `repayer` = msg.sender
 *  at the Pool); the "someone else" judgment is their comparison against the
 *  owner, hence chain-derived. */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; poolCaller: string },
  coords: SparkCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType} was executed by a third party: the position owner neither signed the transaction nor made the Pool call. The transaction sender and the Pool's msg.sender (the ${args.eventType === "repay" ? "Repay event's repayer param" : `${args.eventType} event's user param`}) are both chain facts${atBlock(coords)}; each is compared against the owner. Routed flows keep the owner as signer and contract-owned positions keep the owner as Pool caller — this event has the owner as neither.`,
  contract: SPARK,
  via: `${SPARK_VIA} · tx envelope from + ${args.eventType === "repay" ? "repayer" : "user"} param vs owner`,
  inputs: eventInputs(coords, [
    { label: "position owner", value: args.owner, kind: "chain", note: "whose position this event moved (onBehalfOf)" },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    {
      label: "Pool caller",
      value: args.poolCaller,
      kind: "chain",
      note: "msg.sender at the Pool (the event's party param)",
    },
  ]),
});

/** The seized collateral on a LiquidationCall (`liquidatedCollateralAmount`). */
export const seizedCollateralProv = (
  sym: string,
  coords: SparkCoords,
  raw?: string | null,
  origin?: OriginEnvelope | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Collateral (${sym}) seized in this liquidation — the collateral the liquidator took, exactly as the Pool emitted it${atBlock(coords)}, scaled by the token's decimals.`,
  contract: SPARK,
  via: `${SPARK_VIA} · ${originSeg(origin, `LiquidationCall log · ${fieldSeg("liquidatedCollateralAmount", raw)}`)}`,
  inputs: eventInputs(coords),
});

/** The debt covered on a LiquidationCall (`debtToCover`). */
export const debtRepaidProv = (
  sym: string,
  coords: SparkCoords,
  raw?: string | null,
  origin?: OriginEnvelope | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Debt (${sym}) repaid by the liquidator — the debt this liquidation cleared, exactly as the Pool emitted it${atBlock(coords)}, scaled by the token's decimals.`,
  contract: SPARK,
  via: `${SPARK_VIA} · ${originSeg(origin, `LiquidationCall log · ${fieldSeg("debtToCover", raw)}`)}`,
  inputs: eventInputs(coords),
});

/** The underlying moved by an spToken transfer between two accounts — the
 *  BalanceTransfer log's scaled value × the liquidity index the SAME log
 *  emitted (the underlying worth of the spTokens at that moment). Both leaves
 *  are params of one log; the multiplication is ours, hence chain-derived.
 *  A position move, not a supply/withdraw — custody changes hands and the
 *  value never leaves the Pool. */
export const transferDeltaProv = (sym: string, dir: "in" | "out", coords: SparkCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this transfer moved ${dir === "in" ? "into" : "out of"} the position — the spToken BalanceTransfer log's scaled value multiplied by the liquidity index the same log emitted${atBlock(coords)}: the underlying the spTokens were worth at that moment. A position move between two accounts — custody changed hands without a supply or withdraw, and the value never left the Pool.`,
  contract: SPARK,
  via: `${SPARK_VIA} · BalanceTransfer log · value × index`,
  formula: "scaled value × index at transfer",
  inputs: eventInputs(coords, [
    { label: "value", kind: "chain", pclass: "emitted", note: "BalanceTransfer `value` (scaled units)" },
    { label: "index", kind: "chain", pclass: "emitted", note: "BalanceTransfer `index` (liquidity index, ray)" },
  ]),
});

/** The OTHER account in an spToken transfer — the sender on an _in (the log's
 *  `from`), the recipient on an _out (the log's `to`). A counterparty of the
 *  move itself, not a verdict about who signed. */
export const transferCounterpartyProv = (dir: "in" | "out", coords: SparkCoords, counterparty?: string): Provenance => {
  // SparkLend is Ethereum-only; the registry name and its receipt leaf are the
  // Aave V3 twin's (lib/aave-v3/event-provenance.ts).
  const named = counterparty ? getProtocolContract(counterparty, MAINNET_CHAIN_ID) : undefined;
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${dir === "in" ? "sending" : "receiving"} account on the other side of this position transfer — the ${dir === "in" ? "from" : "to"} address the spToken's BalanceTransfer log carries${atBlock(coords)}. The counterparty of the move itself, not who signed the transaction.${named ? ` Rails names the address ${named.name}: its verified contract source is \`${named.contractName}\`, ${named.role}.` : ""}`,
    contract: SPARK,
    via: `${SPARK_VIA} · BalanceTransfer log · ${dir === "in" ? "from" : "to"}`,
    inputs: eventInputs(
      coords,
      named && counterparty
        ? [counterpartyNameInput(named, explorerUrl(MAINNET_CHAIN_ID, "address", counterparty))]
        : [],
    ),
  };
};

/** Supplied balance of a reserve AFTER this event = Σ supply/withdraw/transfer/seizure deltas. */
export const supplyAfterProv = (sym: string, coords: SparkCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Supplied ${sym} the position held AFTER this event — replayed by summing the signed amounts of the position's own supplies, withdrawals and spToken transfers (and liquidation seizures) on this reserve, in log order up to this block${atBlock(coords)}. This is the nominal supplied principal — interest the aToken accrues since each deposit is not added (that is a derived layer).`,
  contract: SPARK,
  via: `${SPARK_VIA} · Σ ±amount across Supply/Withdraw/BalanceTransfer/LiquidationCall logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Borrowed balance of a reserve AFTER this event = Σ (borrow − repay − liquidation) deltas. */
export const debtAfterProv = (sym: string, coords: SparkCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Borrowed ${sym} (PRINCIPAL) the position owed AFTER this event — replayed by summing the signed amounts of the position's own draws and repayments (and liquidation cover) on this reserve, in log order up to this block${atBlock(coords)}. Principal only: interest accrued since each draw is excluded — current debt with interest needs the reserve index (a derived layer).`,
  contract: SPARK,
  via: `${SPARK_VIA} · Σ ±amount across Borrow/Repay/LiquidationCall logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Supplied balance of a reserve BEFORE this event = supply after − the moved
 *  amount (for a liquidation, minus the seized collateral). Arithmetic over two
 *  on-chain figures (the replayed after and the logged amount) — every leaf is
 *  on-chain, so chain-derived and it stays in the chain-state view. Nominal
 *  supplied principal, same basis as the after (aToken interest is a separate layer). */
export const supplyBeforeProv = (sym: string, coords: SparkCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Supplied ${sym} the position held BEFORE this event — the after-balance minus this event's own \`amount\` (after − change; for a liquidation, minus the seized collateral), reconstructed in the browser from the replayed after and the logged delta, not a distinct chain read. Nominal supplied principal, same basis as the after (aToken interest is a separate layer).`,
  contract: SPARK,
  via: "supply after − amount",
  formula: "after − change",
  // Operand rows: the driver (reconstructTransition) fills the values it
  // actually subtracted; the vocabulary owns the labels + grain.
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: `replayed supplied ${sym} after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own `amount` (signed)" },
  ]),
});

/** Borrowed PRINCIPAL of a reserve BEFORE this event = debt after − the moved
 *  amount (for a liquidation, minus the debtToCover). Every leaf on-chain, so
 *  chain-derived; principal basis. */
export const debtBeforeProv = (sym: string, coords: SparkCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} (PRINCIPAL) the position owed BEFORE this event — the after-balance minus this event's own \`amount\` (after − change; for a liquidation, minus the \`debtToCover\`), reconstructed in the browser from the replayed after and the logged delta, not a distinct chain read. Principal only, same basis as the after (interest since each draw needs the reserve index — a derived layer).`,
  contract: SPARK,
  via: "debt after − amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: `replayed borrowed ${sym} principal after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own `amount` (signed)" },
  ]),
});

/** Position-card supplied balance for one reserve — the scaled-balance reduction
 *  (0008/0011): every leg a chain event or the on-chain index formula, so
 *  chain-derived, and the figure INCLUDES accrued interest (it equals the
 *  aToken's `balanceOf` at the indexed head). */
export const positionSupplyProv = (sym: string, atBlockNum?: number): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Supplied ${sym} the position holds${atBlockNum ? ` at block ${atBlockNum}` : ""} — the position's own Supply/Withdraw/LiquidationCall amounts and spToken transfers, each ÷ the reserve's supply index at its block (from SparkLend's own ReserveDataUpdated logs), summed and × the current index. The rebased balance the spToken's \`balanceOf\` returns — accrued interest included, not an event-replay principal.`,
  contract: SPARK,
  via: `${SPARK_VIA} · Σ scaled deltas (Supply/Withdraw/LiquidationCall/BalanceTransfer ÷ index at event) × index now (ReserveDataUpdated)`,
});

/** Position-card borrowed balance for one reserve — the scaled-balance reduction
 *  (0008/0011) on the variable-debt side; interest included (equals the
 *  variableDebtToken's `balanceOf` at the indexed head). */
export const positionDebtProv = (sym: string, atBlockNum?: number): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} the position owes${atBlockNum ? ` at block ${atBlockNum}` : ""} — the position's own Borrow/Repay/LiquidationCall amounts, each ÷ the reserve's borrow index at its block (from SparkLend's own ReserveDataUpdated logs), summed and × the current index. The rebased balance the variableDebtToken's \`balanceOf\` returns — accrued interest included, not an event-replay principal.`,
  contract: SPARK,
  via: `${SPARK_VIA} · Σ scaled deltas (Borrow/Repay/LiquidationCall ÷ index at event) × index now (ReserveDataUpdated)`,
});

/** Terminal-card peak supplied balance for one reserve — the largest running
 *  balance the scaled-delta reducer (0008/0011) records: every captured flow
 *  (supplies, withdrawals, spToken transfers in and out, collateral a
 *  liquidation seized) ÷ the reserve's liquidity index at its block, summed,
 *  with the largest claim valued × the index at the moment it stood. Interest
 *  accrued to that moment is included — the balance the spToken's balanceOf
 *  showed then. */
export const sparkPeakSupplyProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The highest supplied ${sym} balance this account recorded — every captured flow (supplies, withdrawals, spToken transfers in and out, collateral a liquidation seized), each ÷ the reserve's liquidity index at its block (from SparkLend's own ReserveDataUpdated logs), summed as a running claim; the largest claim is valued × the index at the moment it stood. The balance the spToken's \`balanceOf\` showed at that event — interest to that moment included. The index kept accruing between events, so the true maximum can sit slightly above a figure recorded at event boundaries.`,
  contract: SPARK,
  via: `${SPARK_VIA} · max running Σ scaled deltas (each flow ÷ index at its block; spToken transfers included) × index at the peak's block`,
});

/** Terminal-card peak borrowed balance for one reserve — the largest running
 *  debt the scaled-delta reducer (0008/0011) records: Borrow/Repay/
 *  LiquidationCall amounts ÷ the borrow index at each block, summed, with the
 *  largest scaled debt valued × the index at the moment it stood. Interest
 *  accrued to that moment is included — the debt the variableDebtToken's
 *  balanceOf showed then. */
export const sparkPeakBorrowProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The highest borrowed ${sym} balance this account recorded — the position's own Borrow/Repay/LiquidationCall amounts, each ÷ the reserve's borrow index at its block (from SparkLend's own ReserveDataUpdated logs), summed as a running debt; the largest is valued × the index at the moment it stood. The debt the variableDebtToken's \`balanceOf\` showed at that event — interest to that moment included. The index kept accruing between events, so the debt just before a repayment can sit slightly above a figure recorded at event boundaries.`,
  contract: SPARK,
  via: `${SPARK_VIA} · max running Σ scaled deltas (Borrow/Repay/LiquidationCall ÷ index at event) × index at the peak's block`,
});

/** SparkLend IAaveOracle — the same oracle the Pool reads to price collateral. */
const SPARK_ORACLE = { name: "SparkLend IAaveOracle", address: SPARK_ADDRESSES.ORACLE };

/** On-chain-oracle USD for a card/tower total. Both legs are on-chain — the
 *  chain-state token balance and SparkLend's own oracle price (getAssetPrice) — so
 *  the product is chain-derived and stays in the chain-state view (unlike a
 *  DefiLlama market cache). Mirrors Compound's `compoundUsdProvOnchain`. */
export const sparkUsdProvOnchain = (what: string): Provenance => ({
  kind: "chain-derived",
  // Both legs on-chain; the oracle price is the furthest class, so it leads.
  pclass: "oracle",
  summary: `${what} valued in USD from SparkLend's own on-chain oracle — the chain-state token balance multiplied by the same IAaveOracle price the Pool reads to price collateral (\`getAssetPrice\`, 8-dec USD), not an off-chain market feed.`,
  contract: SPARK_ORACLE,
  via: "chain balance × on-chain oracle price",
  formula: "balance × oracle price",
  inputs: [
    { label: "balance", kind: "chain", note: "replayed position balance" },
    { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
  ],
});

/** A lifetime gross flow (Σ withdrawn / repaid / liquidated on one reserve) —
 *  the signed sum of the position's own emitted Pool amounts across its whole
 *  captured history (the Spark index is genesis-complete: deploy block → head).
 *  Every input is an on-chain event amount, so chain-derived. Pool flows only —
 *  spToken transfers (captured and shown on the timeline as their own events)
 *  move custody without a Pool flow: they are neither deposits nor withdrawals,
 *  so they stay out of these sums (stated, not hidden). */
export const sparkLifetimeFlowProv = (
  flow: "withdrawn" | "repaid" | "liquidated collateral" | "liquidated debt",
  sym: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} (${sym}) — the sum of every ${sym} amount this position's own Pool events ${flow === "withdrawn" ? "withdrew" : flow === "repaid" ? "repaid" : "moved in liquidations"} across its whole captured history (complete from SparkLend's deploy block). Pool flows only — spToken transfers move custody between accounts without a Pool flow; they appear on the timeline as their own events and are not counted as deposits or withdrawals here.`,
  contract: SPARK,
  via: `${SPARK_VIA} · Σ amount across the position's own logs · genesis → head`,
});

/** Net borrowed PRINCIPAL on one reserve across the whole captured history —
 *  Σ (borrow − repay − liquidation cover) from the position's own Pool events.
 *  The tower's debt base line when the interest split renders: principal only,
 *  the accrued segment sits on top (principal + interest = the rebased
 *  balanceOf). Every input an on-chain event amount → chain-derived. */
export const sparkDebtPrincipalProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} PRINCIPAL — the net of every draw, repayment and liquidation cover the position's own Pool events moved, across its whole captured history (complete from SparkLend's deploy block). Principal only — the interest accrued since each draw is the separate accrued segment above it.`,
  contract: SPARK,
  via: `${SPARK_VIA} · Σ (borrow − repay − liquidation cover) · genesis → head`,
});

/** The card's "incl. $X interest" stat caption — accrued interest included in
 *  one side's balance, valued in USD: per reserve, the current rebased balance
 *  (the scaled-balance reduction, equal to the spToken / variableDebtToken
 *  `balanceOf` at the indexed head) minus the net principal replayed from the
 *  position's own Pool events, × SparkLend's own oracle price, summed. Every
 *  leg on-chain → chain-derived. Gated by the caller (any reserve whose
 *  principal doesn't attribute cleanly nulls the caption —
 *  computeSparkCardCaptions). */
export const sparkInterestCaptionProv = (side: "supply" | "debt"): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    side === "supply"
      ? "Accrued supply interest included in the collateral balance above — per reserve, the current rebased balance (equal to the spToken's balanceOf at the indexed head) minus the net principal replayed from the position's own Supply/Withdraw/LiquidationCall events, valued at SparkLend's own on-chain oracle price. Interest grew the collateral, so it is part of the headline figure, not a separate holding."
      : "Accrued borrow interest included in the debt balance above — per reserve, the current rebased debt (equal to the variableDebtToken's balanceOf at the indexed head) minus the net principal replayed from the position's own Borrow/Repay/LiquidationCall events, valued at SparkLend's own on-chain oracle price. Interest grew the debt, so it is part of the headline figure, not an amount repaid.",
  contract: SPARK,
  via: "(current rebased balance − Σ net event principal) × IAaveOracle getAssetPrice, per reserve",
  formula: "(current − net principal) × oracle price",
  inputs: [
    {
      label: "current",
      kind: "chain-derived",
      pclass: "indexed",
      note: "scaled-balance reduction (interest included)",
    },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed Pool event amounts" },
    { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
  ],
});

/** Single-collateral liquidation price for the health-factor caption — the
 *  oracle price at which the position becomes liquidatable: current on-chain
 *  oracle price ÷ health factor. Both legs on-chain (IAaveOracle price, Pool
 *  getUserAccountData HF), so chain-derived. Anchored on the one reserve
 *  carrying ≥99.5% of the priced collateral (dust doesn't block the anchor);
 *  holds while the debt's USD value stands still. */
export const sparkLiqPriceProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Liquidation price for the ${sym} collateral — the oracle price at which this position becomes liquidatable, derived as the current on-chain oracle price divided by the health factor (both from SparkLend's own contracts). ${sym} carries ≥99.5% of the oracle-priced collateral, so it anchors the read; the figure assumes the debt's USD value holds.`,
  contract: SPARK_ORACLE,
  via: "IAaveOracle getAssetPrice ÷ Pool getUserAccountData health factor",
  formula: "oracle price ÷ HF",
  inputs: [
    { label: "oracle price", kind: "chain", note: "IAaveOracle getAssetPrice" },
    { label: "health factor", kind: "chain", pclass: "state", note: "Pool getUserAccountData" },
  ],
});

/** Accrued interest on the debt leg — the current rebased debt (scaled-balance
 *  reduction, = variableDebtToken balanceOf) minus the net borrowed principal
 *  replayed from the position's own Pool events. Both legs chain-derived, so the
 *  difference is too. Gated by the caller (only shown when the arithmetic is
 *  attributable — see legInterest in lib/spark/economics.ts). */
export const sparkDebtInterestProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Accrued interest on the ${sym} debt — the current rebased debt (the scaled-balance reduction, equal to the variableDebtToken's balanceOf at the indexed head) minus the net principal replayed from the position's own Borrow/Repay/LiquidationCall events. Exact arithmetic over two chain-derived figures — "owed now minus drawn", not an annualized-rate estimate.`,
  contract: SPARK,
  via: "current rebased debt − Σ (borrow − repay − liquidation cover)",
  formula: "current − net principal",
  inputs: [
    {
      label: "current",
      kind: "chain-derived",
      pclass: "indexed",
      note: "scaled-balance reduction (interest included)",
    },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed Pool event amounts" },
  ],
});

/** An asset's USD price AT THIS EVENT'S BLOCK — SparkLend's own oracle read at
 *  the block by the oracle-price filler (archive `getAssetPrice`, 8-dec USD)
 *  and captured into the index. A chain read pinned to the event's block: the
 *  same figure the Pool itself was pricing with — not a market feed, and not
 *  today's price. */
export const atBlockPriceProv = (sym: string, coords: SparkCoords, priceUsd: number): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  summary: `${sym} priced in USD by SparkLend's own oracle at this event's block${atBlock(coords)} — the same IAaveOracle the Pool reads to validate liquidations (getAssetPrice, 8-dec USD), called at the block and captured into the index. The price the protocol itself was using at fire time, not an off-chain feed and not today's price.`,
  contract: SPARK_ORACLE,
  via: `${SPARK_VIA} · IAaveOracle getAssetPrice at the event's block = $${priceUsd}`,
  inputs: eventInputs(coords),
});

/** The touched reserve's after-balance valued at the block's own oracle price
 *  — the replayed after-balance × the captured at-block price. Both operands
 *  on-chain (a truth-preserving sum of logged amounts, a pinned oracle read),
 *  so the product is chain-derived. The debt side is PRINCIPAL, the same basis
 *  as the balance it prices (interest since each draw is a derived layer). */
export const snapshotUsdProv = (
  sym: string,
  side: "supply" | "debt",
  coords: SparkCoords,
  vals: { amount: string; priceUsd: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `The ${side === "supply" ? "supplied" : "borrowed"} ${sym} balance after this event, valued at the block's own oracle price — the replayed after-balance × SparkLend's IAaveOracle price captured at this event's block${atBlock(coords)}.${side === "debt" ? " Principal basis, same as the balance it prices (interest since each draw needs the reserve index — a derived layer)." : ""} What the balance was worth at that moment, at the prices the Pool itself was reading — not at today's prices.`,
  contract: SPARK,
  via: "after-balance × oracle price at the event's block",
  formula: "after × price at block",
  inputs: eventInputs(coords, [
    {
      label: "after",
      value: `${vals.amount} ${sym}`,
      kind: "chain",
      pclass: "indexed",
      note: `replayed ${side === "supply" ? "supplied" : "borrowed"} ${sym}${side === "debt" ? " principal" : ""} after this event`,
    },
    {
      label: "price at block",
      value: `$${vals.priceUsd}`,
      kind: "chain",
      pclass: "oracle",
      note: "IAaveOracle getAssetPrice at the event's block",
    },
  ]),
});

/** One liquidation leg valued at the block's own oracle price — the emitted
 *  amount × the captured at-block price. Both legs on-chain (an emitted log
 *  field, a pinned oracle read), so the product is chain-derived. */
export const liqLegUsdProv = (
  leg: "seized collateral" | "cleared debt",
  sym: string,
  coords: SparkCoords,
  vals: { amount: string; priceUsd: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `The ${leg} (${sym}) valued at the block's own oracle price — the LiquidationCall's emitted ${leg === "seized collateral" ? "liquidatedCollateralAmount" : "debtToCover"} × SparkLend's IAaveOracle price captured at this event's block${atBlock(coords)}. What this leg was worth at fire time, at the prices the Pool itself was reading — not at today's prices.`,
  contract: SPARK,
  via: "emitted amount × oracle price at the event's block",
  formula: "amount × price at block",
  inputs: eventInputs(coords, [
    {
      label: "amount",
      value: vals.amount,
      kind: "chain",
      pclass: "emitted",
      note: `LiquidationCall ${leg === "seized collateral" ? "liquidatedCollateralAmount" : "debtToCover"} (${sym})`,
    },
    {
      label: "price at block",
      value: `$${vals.priceUsd}`,
      kind: "chain",
      pclass: "oracle",
      note: "IAaveOracle getAssetPrice at the event's block",
    },
  ]),
});

/** The liquidator's realized premium — seized-leg value over cleared-leg value,
 *  both at the block's own oracle prices. Pure arithmetic over two
 *  chain-derived figures. The liquidation bonus as this call actually realized
 *  it, not the market's configured bonus parameter. */
export const liqPremiumProv = (coords: SparkCoords, vals: { seizedUsd: string; clearedUsd: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `The liquidator's realized premium — the seized collateral's at-block value minus the cleared debt's at-block value, as a share of the debt cleared. SparkLend grants a per-asset liquidation bonus to make liquidations worth executing; this is that bonus as this call actually realized it, at the oracle prices the Pool itself was reading${atBlock(coords)}.`,
  via: "(seized value − cleared value) ÷ cleared value, both at the block's oracle prices",
  formula: "seized ÷ cleared − 1",
  inputs: eventInputs(coords, [
    {
      label: "seized value",
      value: vals.seizedUsd,
      kind: "chain-derived",
      pclass: "oracle",
      note: "seized collateral × oracle price at block",
    },
    {
      label: "cleared value",
      value: vals.clearedUsd,
      kind: "chain-derived",
      pclass: "oracle",
      note: "cleared debt × oracle price at block",
    },
  ]),
});
