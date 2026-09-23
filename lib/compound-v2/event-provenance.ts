// Compound V2 (Ethereum L1) provenance vocabulary.
// ----------------------------------------------------------------------------
// Original Compound V2: twenty governance-listed cToken markets, every action
// a typed cToken event. Three replay lanes with DIFFERENT step classes — the
// grading is the point:
//   • emitted — fields the event itself carries (amounts, mintTokens,
//     accountBorrows, seizeTokens). accountBorrows is special: the borrower's
//     TOTAL debt after the event, interest accrued to that moment INCLUDED
//     (per-BLOCK accrual, settled on every market touch), emitted verbatim.
//   • state   — the cToken balance: the full-Transfer replay equals the
//     accountTokens slot (`balanceOf`) at every block, archive-verifiable
//     (proven wei-exact against chain before the index shipped: legacy cWBTC,
//     32,837 transfers genesis→head, Σ holder balances == totalSupply with
//     diff 0). The three seize_* legs are part of this lane — a seizure moves
//     cTokens like any Transfer, it just wasn't the borrower's act.
//   • indexed — the supply PRINCIPAL: Σ(mint − redeem) over captured events;
//     no on-chain slot holds it (a full exit nets negative by earned interest).
// The interpreted figures Compound's own UI showed (borrow capacity, net APY)
// are deliberately absent — they would be layers.
//
// Values replay the captured compound_v2_* events. The `contract` is the
// per-market cToken (passed in as `coords.ctoken`) — each market is its own
// contract.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const COMPOUND_V2_VIA = "captured cToken events (compound_v2_*)";

export interface CompoundV2Coords {
  txHash?: string;
  blockNumber?: number;
  /** The market's cToken address — the contract every value cites. */
  ctoken?: string;
  /** cToken label, e.g. "cDAI" (catalog-labeled: cSAI / cWBTC2 for the two
   *  collisions the chain's own symbol() cannot separate). */
  marketLabel?: string;
  /** Position owner. */
  account?: string;
}

const ctokenContract = (coords?: CompoundV2Coords) => ({
  name: coords?.marketLabel ? `cToken (${coords.marketLabel})` : "cToken",
  address: coords?.ctoken ?? "0x0000000000000000000000000000000000000000",
});

const atBlock = (coords?: CompoundV2Coords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: CompoundV2Coords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

/** State-read proof: re-run the named cToken view yourself (an archive node
 *  for a historical block). */
const stateVerify = (method: string, block?: number | null): ProvVerify => ({
  kind: "recompute",
  text:
    block != null
      ? `Re-run the cToken.${method} eth_call at block ${block} against an archive node`
      : `Re-run the cToken.${method} eth_call against any node`,
});

function eventInputs(coords: CompoundV2Coords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.account) inputs.push({ label: "account", value: coords.account, kind: "chain", note: "position owner" });
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

/** The emitting event + param behind each action's underlying `amount`. */
const AMOUNT_ORIGIN: Record<string, { event: string; param: string }> = {
  mint: { event: "Mint", param: "mintAmount" },
  redeem: { event: "Redeem", param: "redeemAmount" },
  borrow: { event: "Borrow", param: "borrowAmount" },
  repay: { event: "RepayBorrow", param: "repayAmount" },
};

// ── per-event deltas (emitted) ───────────────────────────────────────────────

/** Signed underlying amount this event moved (the event's own amount param). */
export const assetsDeltaProv = (
  sym: string,
  eventType: "mint" | "redeem" | "borrow" | "repay",
  coords: CompoundV2Coords,
  raw?: string | null,
): Provenance => {
  const o = AMOUNT_ORIGIN[eventType];
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `The ${sym} this operation moved — the amount the event itself carries, exactly as the cToken emitted it${atBlock(coords)}, scaled by the underlying's decimals. Decoded from the log, never recomputed.`,
    contract: ctokenContract(coords),
    via: `${COMPOUND_V2_VIA} · ${o.event} log · ${fieldSeg(o.param, raw)}`,
    inputs: eventInputs(coords),
  };
};

/** cTokens this mint/redeem created or burned (mintTokens / redeemTokens). */
export const cTokensDeltaProv = (
  cSym: string,
  eventType: "mint" | "redeem",
  coords: CompoundV2Coords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${cSym} this operation ${eventType === "mint" ? "created" : "burned"} — the cToken amount the event itself carries, exactly as the cToken emitted it${atBlock(coords)}, scaled by the cToken's 8 decimals. The cToken is the position's receipt token; its balance × the exchange rate is the underlying claim.`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · ${eventType === "mint" ? "Mint" : "Redeem"} log · ${fieldSeg(eventType === "mint" ? "mintTokens" : "redeemTokens", raw)}`,
  inputs: eventInputs(coords),
});

/** cTokens moved by a wallet↔wallet Transfer (the standard ERC-20 amount). */
export const transferAmountProv = (
  cSym: string,
  direction: "in" | "out",
  coords: CompoundV2Coords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${cSym} this transfer moved ${direction === "in" ? "into" : "out of"} the position — the amount the ERC-20 Transfer event itself carries, exactly as the cToken emitted it${atBlock(coords)}, scaled by the cToken's 8 decimals. cTokens are freely transferable: moving them moves the underlying claim, with no mint/redeem event.`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · Transfer log · ${fieldSeg("amount", raw)}`,
  inputs: eventInputs(coords),
});

/** The emitted accountBorrows — the borrower's TOTAL debt after this event.
 *  A liquidation's comes from the repay leg the liquidation itself emitted
 *  (one on-chain liquidation emits BOTH RepayBorrow and LiquidateBorrow; the
 *  index pairs them into one row). */
export const accountBorrowsProv = (
  sym: string,
  coords: CompoundV2Coords,
  raw?: string | null,
  fromLiquidation?: boolean,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Total ${sym} debt the position owed AFTER this event — the \`accountBorrows\` field the cToken emitted verbatim${atBlock(coords)}. Interest accrued up to this moment is INCLUDED (Compound V2 accrues per block and settles interest before every borrow/repay), so this is the contract's own reckoning of the debt, not a replayed sum.${
    fromLiquidation
      ? " On a liquidation the figure comes from the RepayBorrow log the liquidation itself emitted in the same transaction (liquidateBorrowFresh calls repayBorrowFresh internally) — one event, one row."
      : ""
  }`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · ${fromLiquidation ? "same-tx RepayBorrow log (the liquidation's own repay leg)" : "Borrow/RepayBorrow log"} · ${fieldSeg("accountBorrows", raw)}`,
  inputs: eventInputs(coords),
});

/** Debt BEFORE this event = the emitted accountBorrows ∓ the event's own
 *  amount — two emitted fields of the SAME log, one subtraction. */
export const debtBeforeProv = (
  sym: string,
  eventType: "borrow" | "repay" | "liquidation",
  coords: CompoundV2Coords,
): Provenance => {
  const repayLike = eventType !== "borrow";
  return {
    kind: "chain-derived",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: `Total ${sym} debt the position owed BEFORE this event — the log's own \`accountBorrows\` (after) ${repayLike ? "plus" : "minus"} its own \`${repayLike ? "repayAmount" : "borrowAmount"}\`: two emitted fields of the same log, one subtraction. The gap between this figure and the PREVIOUS event's after-value is interest that accrued between the two events (per-block accrual) — real, not a replay artifact.`,
    contract: ctokenContract(coords),
    via: `accountBorrows ${repayLike ? "+" : "−"} ${repayLike ? "repayAmount" : "borrowAmount"} (same log)`,
    formula: "after − change",
    inputs: eventInputs(coords, [
      { label: "after", kind: "chain", pclass: "emitted", note: "the log's own accountBorrows" },
      { label: "change", kind: "chain", pclass: "emitted", note: "the log's own amount (signed)" },
    ]),
  };
};

/** Debt repaid by the liquidator (LiquidateBorrow `repayAmount`). */
export const liqDebtRepaidProv = (sym: string, coords: CompoundV2Coords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Debt (${sym}) the liquidator repaid in this liquidation — exactly as the borrowed market's cToken emitted it${atBlock(coords)}, scaled by the underlying's decimals. Capped by the close factor (50% of one borrowed market per liquidation), which is why liquidations here are PARTIAL and the account usually lives on. The debt movement itself is the same-transaction RepayBorrow log the liquidation emitted — merged into this one row.`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · LiquidateBorrow log · ${fieldSeg("repayAmount", raw)}`,
  inputs: eventInputs(coords),
});

/** Collateral-market cTokens seized in a liquidation (`seizeTokens` — the SUM
 *  of the liquidator's leg and the protocol's burned cut). */
export const seizeTokensProv = (cSym: string, coords: CompoundV2Coords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Collateral seized in this liquidation — ${cSym} (the collateral market's receipt token) taken from the borrower, exactly as the borrowed market's cToken emitted it${atBlock(coords)}, scaled by the cToken's 8 decimals. This figure is the SUM of the seizure's two legs: the liquidator's share and the protocol's own cut (protocolSeizeShare), which is burned. Each leg is its own Transfer in the same transaction, so both also appear on the collateral market's balance lane — as seizures, not as transfers the borrower made.`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · LiquidateBorrow log · ${fieldSeg("seizeTokens", raw)}`,
  inputs: eventInputs(coords),
});

/** One NAMED seizure leg (seize_out / seize_in / seize_burn) — a Transfer log
 *  the index attributed to a same-tx LiquidateBorrow, bounded between the
 *  liquidation's own repay leg and the LiquidateBorrow itself. */
export const seizeLegProv = (
  cSym: string,
  leg: "seize_out" | "seize_in" | "seize_burn",
  coords: CompoundV2Coords,
  raw?: string | null,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary:
    leg === "seize_out"
      ? `${cSym} taken from this position in a liquidation seizure — the borrower→liquidator Transfer leg the seize emitted${atBlock(coords)}, scaled by the cToken's 8 decimals. The leg is attributed to the same-transaction LiquidateBorrow (its position between the liquidation's repay leg and the LiquidateBorrow log is the chain fact), so it renders as collateral being TAKEN — not as a transfer the borrower made.`
      : leg === "seize_in"
        ? `${cSym} this wallet received as the liquidator in a seizure — the borrower→liquidator Transfer leg the seize emitted${atBlock(coords)}, scaled by the cToken's 8 decimals, attributed to the same-transaction LiquidateBorrow. Worth the repaid debt plus the liquidation incentive, less the protocol's own burned cut.`
        : `The protocol's cut of this seizure — the borrower→cToken Transfer leg (protocolSeizeShare, 2.8% of the seize), burned: totalSupply drops and no wallet receives it${atBlock(coords)}. A real loss to the borrower with no counterparty, which is why it is named rather than dropped as a structural transfer. Liquidations before the protocolSeizeShare upgrade (2021) have no such leg.`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · Transfer log (seize leg, paired to same-tx LiquidateBorrow) · ${fieldSeg("amount", raw)}`,
  inputs: eventInputs(coords),
});

/** The header's per-leg receipt for the lanes that also carry a spine token
 *  flank — the shared switch extracted so the card's echo calls the identical
 *  builder with the identical args. Liquidation (two legs, its own delta
 *  shape) and the borrower-loss seize_out/seize_burn legs (no spine flank —
 *  the card renders them on the warning icon, not a token row) stay in the
 *  header's own branches; this covers mint/redeem/borrow/repay (underlying),
 *  transfer_in/transfer_out and seize_in (cToken). */
export function movedDeltaProv(
  eventType: string,
  marketSymbol: string,
  cSym: string,
  coords: CompoundV2Coords,
  raw?: string | null,
): Provenance | undefined {
  switch (eventType) {
    case "mint":
    case "redeem":
    case "borrow":
    case "repay":
      return assetsDeltaProv(marketSymbol, eventType, coords, raw);
    case "transfer_in":
    case "transfer_out":
      return transferAmountProv(cSym, eventType === "transfer_in" ? "in" : "out", coords, raw);
    case "seize_in":
      return seizeLegProv(cSym, "seize_in", coords, raw);
    default:
      return undefined;
  }
}

// ── liquidation forensics (oracle-at-block, mig 151) ─────────────────────────
// The valued two-leg breakdown of a liquidation at Compound's OWN
// getUnderlyingPrice captured at the event block — ETH-denominated before the
// oracle migration at block 10,678,764, USD after (each leg summary names the
// unit). The premium is a ratio of two SAME-BLOCK legs, so it is
// numeraire-invariant and lands on the liquidation incentive read at that block.

/** The oracle-at-block price of one market's underlying — the same
 *  getUnderlyingPrice the Comptroller reads for its liquidation math, from
 *  whichever oracle comptroller.oracle() had registered at the event block. */
export const liqAtBlockPriceProv = (sym: string, numeraire: "ETH" | "USD", coords: CompoundV2Coords): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run comptroller.oracle() at block ${coords.blockNumber}, then that oracle's getUnderlyingPrice for this market at the same block`
        : "Re-run comptroller.oracle() then that oracle's getUnderlyingPrice for this market",
  },
  summary: `${sym} priced in ${numeraire} at the liquidation's own block — Compound's oracle \`getUnderlyingPrice\`, read from whichever oracle \`comptroller.oracle()\` had registered at that block (governance swapped it ~6× over the protocol's life, so it is resolved per block, never pinned to head). This is the SAME price the Comptroller used for the seizure math in this very transaction. Before block 10,678,764 the oracle speaks ETH (getUnderlyingPrice(cETH) == 1.0); after it, USD — this leg is ${numeraire}.`,
  contract: { name: "Compound Open Price Feed (Comptroller oracle)", address: "" },
  via: `comptroller.oracle() · getUnderlyingPrice${atBlock(coords)}`,
  inputs: eventInputs(coords),
});

/** Seized-collateral leg value — seizeTokens × the collateral cToken's
 *  exchangeRateStored(at block) → underlying, valued at that market's
 *  oracle-at-block price. */
export const liqSeizedValueProv = (
  collSym: string,
  numeraire: "ETH" | "USD",
  coords: CompoundV2Coords,
  vals: { amount: string; price: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `What the seized ${collSym} collateral was worth in ${numeraire} at the liquidation's block — the emitted seizeTokens (8-dp cTokens) converted to underlying by the collateral cToken's \`exchangeRateStored\` read at the block, then valued at that market's oracle \`getUnderlyingPrice\` at the same block. Every leg is a chain read from the block the liquidation fired; today's price never enters.`,
  contract: { name: "Compound Open Price Feed (Comptroller oracle)", address: "" },
  via: "seizeTokens × exchangeRateStored → underlying × oracle price (all at block)",
  formula: "underlying × oracle price",
  inputs: eventInputs(coords, [
    {
      label: "seized",
      value: vals.amount,
      kind: "chain-derived",
      pclass: "state",
      note: "seizeTokens × exchangeRateStored → underlying",
    },
    {
      label: "price",
      value: `${vals.price} ${numeraire}`,
      kind: "chain",
      pclass: "oracle",
      note: "collateral getUnderlyingPrice at block",
    },
  ]),
});

/** Cleared-debt leg value — the covered repayAmount valued at the debt market's
 *  oracle-at-block price. */
export const liqClearedValueProv = (
  debtSym: string,
  numeraire: "ETH" | "USD",
  coords: CompoundV2Coords,
  vals: { amount: string; price: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `What the cleared ${debtSym} debt was worth in ${numeraire} at the liquidation's block — the \`repayAmount\` the liquidator covered (the LiquidateBorrow log's own field), valued at the debt market's oracle \`getUnderlyingPrice\` read at the same block. Capped by the close factor (≤50% of one borrowed market per liquidation), so this is the covered slice, not the whole debt.`,
  contract: { name: "Compound Open Price Feed (Comptroller oracle)", address: "" },
  via: "repayAmount × oracle price (both at block)",
  formula: "repaid × oracle price",
  inputs: eventInputs(coords, [
    { label: "repaid", value: vals.amount, kind: "chain", pclass: "emitted", note: "LiquidateBorrow repayAmount" },
    {
      label: "price",
      value: `${vals.price} ${numeraire}`,
      kind: "chain",
      pclass: "oracle",
      note: "debt getUnderlyingPrice at block",
    },
  ]),
});

/** The realized premium = seized ÷ cleared − 1 — the ratio that should
 *  reproduce the liquidation incentive read at the same block. */
export const liqPremiumProv = (
  coords: CompoundV2Coords,
  vals: { seized: string; cleared: string; numeraire: "ETH" | "USD" },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The premium the seizure realized — the seized collateral value (${vals.seized}) over the cleared debt value (${vals.cleared}), minus one. Both legs are valued in ${vals.numeraire} at the SAME block, so the ratio is numeraire-invariant: it lands on the liquidation incentive the Comptroller enforced at that block (shown beneath it) whether the era priced in ETH or USD. This is the whole self-audit — a well-sized seizure reproduces the incentive exactly; one small enough for the settled legs to quantize visibly does not.`,
  contract: { name: "Compound Open Price Feed (Comptroller oracle)", address: "" },
  via: "seized value ÷ cleared value − 1 (both at block)",
  formula: "seized ÷ cleared − 1",
  inputs: eventInputs(coords, [
    { label: "seized", value: vals.seized, kind: "chain-derived", pclass: "oracle", note: "collateral value at block" },
    { label: "cleared", value: vals.cleared, kind: "chain-derived", pclass: "oracle", note: "debt value at block" },
  ]),
});

/** The liquidation incentive read at the event block — the Comptroller constant
 *  the premium above should reproduce (1.05 in 2019→~Mar 2020, 1.08 after; READ
 *  at-block, never assumed). */
export const liqIncentiveRefProv = (coords: CompoundV2Coords): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run comptroller.liquidationIncentiveMantissa() at block ${coords.blockNumber} against an archive node`
        : "Re-run comptroller.liquidationIncentiveMantissa() against any node",
  },
  summary: `The liquidation incentive the Comptroller enforced at this block — \`liquidationIncentiveMantissa\` read at the event block, not assumed. Governance raised it from 1.05 (a 5% bonus) to 1.08 (8%) around March 2020, so an early liquidation carries the smaller premium; reading at-block is the point. The realized premium above should reproduce this figure exactly for a well-sized seizure.`,
  contract: { name: "Comptroller (Unitroller)", address: "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b" },
  via: `comptroller.liquidationIncentiveMantissa()${atBlock(coords)}`,
  inputs: eventInputs(coords),
});

// ── running balances (the three lanes) ───────────────────────────────────────

/** Exact cToken balance AFTER this event — the full-Transfer replay. */
export const cTokensAfterProv = (cSym: string, coords: CompoundV2Coords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the cToken balanceOf eth_call at block ${coords.blockNumber} against an archive node — the full-Transfer replay matches exactly`
        : "Re-run the cToken balanceOf eth_call — the full-Transfer replay matches exactly",
  },
  summary: `${cSym} the position held AFTER this event — replayed from EVERY cToken Transfer touching this wallet (mint/redeem legs, wallet↔wallet moves, the named seizure legs), in log order up to this block${atBlock(coords)}. This equals the cToken's own accountTokens slot — \`balanceOf\` at this block — exactly (proven wei-exact against chain: Σ holder balances == totalSupply across the full genesis→head Transfer history).`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · Σ ±amount across Transfer logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** cToken balance BEFORE this event = after − this event's own cToken delta. */
export const cTokensBeforeProv = (cSym: string, coords: CompoundV2Coords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: stateVerify("balanceOf", coords.blockNumber != null ? coords.blockNumber - 1 : null),
  summary: `${cSym} the position held BEFORE this event — the after-balance minus this event's own cToken amount (after − change), reconstructed in the browser from the replayed after and the logged delta. Same slot-exact basis as the after: it equals \`balanceOf\` just before this event.`,
  contract: ctokenContract(coords),
  via: "cToken balance after − amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "state", note: `replayed ${cSym} balance after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own cToken amount (signed)" },
  ]),
});

/** Supply PRINCIPAL after this event = Σ(mint − redeem) in underlying. */
export const supplyAfterProv = (sym: string, coords: CompoundV2Coords, raw?: string | null): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} supply PRINCIPAL after this event — replayed by summing the underlying amounts of the position's own mints and redeems, in log order up to this block${atBlock(coords)}. No on-chain slot holds this figure (the chain stores cTokens, not deposited principal): it is the index's replay, clamped at zero — a full exit nets negative by exactly the interest earned. The cToken lane beside it is the slot-exact reading.`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · Σ ±amount across Mint/Redeem logs${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords),
});

/** Supply principal BEFORE this event = after − this event's own amount. */
export const supplyBeforeProv = (sym: string, coords: CompoundV2Coords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} supply PRINCIPAL before this event — the after-value minus this event's own underlying amount (after − change), reconstructed in the browser from the replayed after and the logged delta. Same amounts-only basis as the after (no on-chain slot holds principal).`,
  contract: ctokenContract(coords),
  via: "supply principal after − amount",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain-derived", pclass: "indexed", note: `replayed ${sym} principal after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "this event's own `amount` (signed)" },
  ]),
});

// ── identity ─────────────────────────────────────────────────────────────────

/** Third-party action: the position owner neither signed the transaction nor
 *  was the event's own party (RepayBorrow `payer` — a third party, or the
 *  Maximillion helper fronting a cETH repay). Each fact alone over-marks;
 *  a genuine external action fails both. */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; caller: string },
  coords: CompoundV2Coords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType.replace(/_/g, " ")} was executed by a third party: the position owner neither signed the transaction nor was the event's own party (${args.eventType === "repay" ? "the RepayBorrow payer — who provided the funds; on the cETH market this is often the Maximillion helper fronting a native-ETH repay" : "the event's emitted actor"}). Both facts are chain values${atBlock(coords)}; each is compared against the owner.`,
  contract: ctokenContract(coords),
  via: `${COMPOUND_V2_VIA} · tx envelope from + ${args.eventType === "repay" ? "payer" : "minter"} param vs owner`,
  inputs: eventInputs(coords, [
    { label: "position owner", value: args.owner, kind: "chain", note: "whose position this event moved" },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    {
      label: "event party",
      value: args.caller,
      kind: "chain",
      note: "the event's own party param",
    },
  ]),
});

// ── position card / tower ────────────────────────────────────────────────────

/** Position-card CURRENT supply value — cTokens × exchangeRateStored: the
 *  underlying claim including accrued interest, a slot-read product. */
export const positionSupplyCurrentProv = (sym: string, cSym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: `Re-run the cToken's balanceOf and exchangeRateStored eth_calls and multiply — or call balanceOfUnderlying directly; both reproduce this figure`,
  },
  summary: `${sym} the position's supply is worth NOW — the exact ${cSym} balance (slot-verified Transfer replay) × the cToken's \`exchangeRateStored\` read at head. The exchange rate grows as the market accrues interest, so this figure INCLUDES the interest earned since deposit — it is what \`balanceOfUnderlying\` returns. Both legs are chain reads, so the product is chain-derived.`,
  contract: { name: `cToken (${cSym})`, address: "" },
  via: "cToken balance × exchangeRateStored (eth_call at head)",
  formula: "cTokens × exchange rate",
  inputs: [
    { label: "cTokens", kind: "chain", pclass: "state", note: "exact Transfer replay (= balanceOf)" },
    { label: "exchange rate", kind: "chain", pclass: "state", note: "cToken exchangeRateStored at head" },
  ],
});

/** Position-card supply PRINCIPAL — the indexed lane (no slot holds it). */
export const positionSupplyPrincipalProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${sym} supply PRINCIPAL — Σ(mint − redeem) of the position's own captured events, complete from the market's deploy block. No on-chain slot holds deposited principal (the chain stores cTokens); this is the index's replay, clamped at zero. Interest earned since deposit is NOT in this figure — the current-value reading (cTokens × exchange rate) carries it. A position received by transfer or seizure can show zero principal while holding real cTokens: the cToken lane is the exact one.`,
  contract: { name: "cToken", address: "" },
  via: `${COMPOUND_V2_VIA} · Σ ±amount across Mint/Redeem logs · deploy → head`,
});

/** Position-card debt — the last event's emitted accountBorrows. */
export const positionDebtProv = (sym: string, atBlockNum?: number): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `${sym} debt the position owed at its LAST borrow/repay/liquidation event${atBlockNum ? ` (as of block ${atBlockNum})` : ""} — the \`accountBorrows\` field that event emitted verbatim, interest accrued to that moment included (per-block accrual). A liquidation counts: its merged repay leg re-states the debt, so an account liquidated since its last voluntary repay is NOT stale here. Interest accrued SINCE that event is not in this figure — the live \`borrowBalanceStored\` read carries it when the detail page's chain lane lands.`,
  contract: { name: "cToken", address: "" },
  via: `${COMPOUND_V2_VIA} · latest Borrow/RepayBorrow/liquidation log · accountBorrows`,
});

/** Closed-card peak supply — the highest principal-lane balance-after. */
export const peakSupplyProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `The highest ${sym} supply PRINCIPAL this wallet ever recorded — the maximum of the replayed principal lane (each captured event's own supplied-balance-after) across its whole history. The index's arithmetic over the emitted amounts, not an on-chain slot. Interest lives in the exchange rate outside this lane, so the claim's value at its height sat above this figure; cTokens that arrived by transfer or seizure never entered it.`,
  contract: { name: "cToken", address: "" },
  via: `${COMPOUND_V2_VIA} · max(supply-after) across Mint/Redeem logs`,
});

/** Closed-card peak debt — the highest emitted accountBorrows. */
export const peakDebtProv = (sym: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `The highest ${sym} debt this wallet ever recorded — the maximum of the emitted \`accountBorrows\` (the contract's own debt-after, carried verbatim on every borrow, repay and liquidation event) across its whole history. Interest is included to each event's own moment; debt accrues between events unrecorded, so the true peak between two events can sit slightly above the largest emitted figure.`,
  contract: { name: "cToken", address: "" },
  via: `${COMPOUND_V2_VIA} · max(accountBorrows) across Borrow/RepayBorrow/liquidation logs`,
});

/** On-chain-oracle USD for a card/tower total. Both legs are on-chain — the
 *  replayed token balance and Compound's own oracle price (getUnderlyingPrice,
 *  the SAME price the Comptroller reads for liquidity and liquidation math) —
 *  so the product is chain-derived. `includesFixed` when any contributing
 *  market's price is a stored constant with no feed behind it. */
export const compoundV2UsdProvOnchain = (what: string, includesFixed?: boolean): Provenance => ({
  kind: "chain-derived",
  // Both legs on-chain; the oracle price is the furthest class, so it leads.
  pclass: "oracle",
  summary: `${what} valued in USD from Compound's own on-chain oracle — the replayed token balance multiplied by the same price the Comptroller reads for liquidity and liquidation math (\`getUnderlyingPrice\`), not an off-chain market feed.${
    includesFixed
      ? " ⚠ At least one contributing market is priced by a CONSTANT stored in the oracle with no price feed behind it (read from the oracle's own getConfig — cSAI's constant is $14.4263 on a token that targets $1). The figure is the one the protocol itself would use, but nothing updates that leg."
      : ""
  }`,
  contract: { name: "Compound Open Price Feed (Comptroller oracle)", address: "" },
  via: "chain balance × on-chain oracle price",
  formula: "balance × oracle price",
  inputs: [
    { label: "balance", kind: "chain", note: "replayed position balance" },
    {
      label: "oracle price",
      kind: "chain",
      pclass: "oracle",
      note: includesFixed
        ? "oracle getUnderlyingPrice (a stored constant on the no-feed markets)"
        : "oracle getUnderlyingPrice",
    },
  ],
});

/** One line's oracle price where the oracle's own config says NO feed stands
 *  behind it — a stored constant nothing updates. */
export const fixedPriceLineProv = (sym: string): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text: "Re-run the oracle's getConfig eth_call for this market — priceFeed is the zero address and fixedPrice is the constant",
  },
  summary: `${sym} is priced by a constant stored in the oracle, with no price feed behind it — read from the oracle's own getConfig (priceFeed == 0), not inferred from the value. The number is the one the Comptroller itself would use, but nothing updates it. On cSAI the constant is $14.4263 for a token that targets $1.`,
  contract: { name: "Compound Open Price Feed (Comptroller oracle)", address: "" },
  via: "oracle getConfig · fixedPrice (priceFeed == 0)",
});

/** A lifetime gross flow (Σ redeemed / repaid / liquidation-covered on one
 *  market) — the sum of the position's own emitted amounts across its whole
 *  captured history (complete from each market's deploy block). */
export const compoundV2LifetimeFlowProv = (
  flow: "withdrawn" | "repaid" | "liquidated debt",
  sym: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} (${sym}) — the sum of every ${sym} amount this position's own events ${flow === "withdrawn" ? "redeemed" : flow === "repaid" ? "repaid" : "had cleared in liquidations"} across its whole captured history (complete from the market's deploy block; the oldest markets go back to 2019). cToken events only — wallet↔wallet cToken transfers and seizures move the supply claim without a Mint/Redeem log and are not in this sum (they live on the cToken lane).`,
  contract: { name: "cToken", address: "" },
  via: `${COMPOUND_V2_VIA} · Σ amount across the position's own logs · deploy → head`,
});

/** Net borrowed PRINCIPAL across the whole captured history — the tower's debt
 *  base line when the interest split renders. */
export const compoundV2DebtPrincipalProv = (sym: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Borrowed ${sym} PRINCIPAL — the net of every draw, repayment and liquidation-cleared amount the position's own events moved, across its whole captured history (complete from the market's deploy block). Principal only — the interest accrued is the separate accrued segment above it.`,
  contract: { name: "cToken", address: "" },
  via: `${COMPOUND_V2_VIA} · Σ (borrow − repay − liquidated) · deploy → head`,
});

/** Accrued interest on the debt leg — the current debt minus the net drawn
 *  principal. `live` when the current figure is the borrowBalanceStored read
 *  at head; the last event's emitted accountBorrows otherwise. */
export const compoundV2DebtInterestProv = (sym: string, live?: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: live ? "state" : "indexed",
  summary: live
    ? `Accrued interest on the ${sym} debt — the live debt (the cToken's \`borrowBalanceStored\` read at head, interest to the market's last accrual included) minus the net principal replayed from the position's own Borrow/RepayBorrow/liquidation amounts. Exact arithmetic — "owed now minus drawn", not an annualized-rate estimate.`
    : `Accrued interest on the ${sym} debt — the debt at the last borrow/repay/liquidation event (its emitted \`accountBorrows\`, interest to that moment included) minus the net principal replayed from the position's own event amounts. Exact arithmetic over the position's own logs — "owed then minus drawn", not an annualized-rate estimate. Interest accrued since the last event is not yet in either figure.`,
  contract: { name: "cToken", address: "" },
  via: live
    ? "borrowBalanceStored @ head − Σ (borrow − repay − liquidated)"
    : "last emitted accountBorrows − Σ (borrow − repay − liquidated)",
  formula: "current − net principal",
  inputs: [
    live
      ? { label: "current", kind: "chain", pclass: "state", note: "borrowBalanceStored at head" }
      : { label: "current", kind: "chain", pclass: "emitted", note: "the last event's accountBorrows" },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed event amounts" },
  ],
});

/** The card's "incl. $X interest" stat caption. `live` when the debt side's
 *  current figure is the borrowBalanceStored read at head. */
export const compoundV2InterestCaptionProv = (side: "supply" | "debt", live?: boolean): Provenance => ({
  kind: "chain-derived",
  pclass: side === "supply" || live ? "state" : "indexed",
  summary:
    side === "supply"
      ? "Accrued supply interest included in the collateral value above — per market, the current value (exact cToken balance × the exchange rate read at head, = balanceOfUnderlying) minus the net principal replayed from the position's own Mint/Redeem events, valued at Compound's own on-chain oracle price. Interest grew the claim, so it is part of the headline figure, not a separate holding."
      : live
        ? "Accrued borrow interest included in the debt above — per market, the live debt (borrowBalanceStored read at head) minus the net principal replayed from the position's own Borrow/RepayBorrow/liquidation events, valued at Compound's own on-chain oracle price. Interest grew the debt, so it is part of the headline figure, not an amount repaid."
        : "Accrued borrow interest included in the debt above — per market, the debt at the last borrow/repay/liquidation event (its emitted accountBorrows) minus the net principal replayed from the position's own events, valued at Compound's own on-chain oracle price. Interest grew the debt, so it is part of the headline figure, not an amount repaid.",
  contract: { name: "cToken", address: "" },
  via:
    side === "supply"
      ? "(cTokens × exchange rate − Σ net event principal) × oracle getUnderlyingPrice, per market"
      : live
        ? "(borrowBalanceStored @ head − Σ net event principal) × oracle getUnderlyingPrice, per market"
        : "(last emitted accountBorrows − Σ net event principal) × oracle getUnderlyingPrice, per market",
  formula: "(current − net principal) × oracle price",
  inputs: [
    {
      label: "current",
      kind: "chain-derived",
      pclass: side === "supply" || live ? "state" : "emitted",
      note:
        side === "supply"
          ? "cTokens × exchangeRateStored (interest included)"
          : live
            ? "borrowBalanceStored at head"
            : "the last event's accountBorrows",
    },
    { label: "net principal", kind: "chain-derived", pclass: "indexed", note: "Σ signed event amounts" },
    { label: "oracle price", kind: "chain", pclass: "oracle", note: "oracle getUnderlyingPrice" },
  ],
});

/** The live per-block borrow rate on one market, annualized on ITS model's
 *  own blocksPerYear (not one constant across the roster). */
export const borrowRateProv = (sym?: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the cToken.borrowRatePerBlock eth_call and multiply by the market's own interestRateModel.blocksPerYear()",
  },
  summary: `The current variable borrow rate${sym ? ` on the ${sym} market` : ""} — the cToken's \`borrowRatePerBlock\` read at head, annualized on the market's OWN interest rate model's \`blocksPerYear()\` constant. The roster does not agree on one: cETH's model says 2,628,000 while the others say 2,102,400, so the annualization is each model's own arithmetic, not a wall-clock estimate. Simple multiplication, not compounding.`,
  contract: { name: "cToken", address: "" },
  via: "cToken borrowRatePerBlock (eth_call at head) × interestRateModel.blocksPerYear()",
  formula: "per-block rate × the model's own blocks per year",
  inputs: [
    { label: "per-block rate", kind: "chain", pclass: "state", note: "borrowRatePerBlock at head" },
    { label: "blocks per year", kind: "chain", pclass: "state", note: "the market's own model's constant" },
  ],
});

/** Debt-USD-weighted average borrow rate across several borrowed markets. */
export const avgBorrowRateProv = (): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    "Debt-weighted average of the markets' current borrow rates — averaged across the markets this position borrows: each market's borrowRatePerBlock (annualized on its own model's blocksPerYear) weighted by that debt's USD value at Compound's own oracle price. All legs are chain reads at head.",
  contract: { name: "cToken", address: "" },
  via: "Σ (rate × debt USD) ÷ Σ debt USD, per borrowed market",
  formula: "Σ (rate × weight) ÷ Σ weight",
  inputs: [
    { label: "rate", kind: "chain", pclass: "state", note: "borrowRatePerBlock per market, annualized on its model" },
    { label: "weight", kind: "chain-derived", pclass: "oracle", note: "debt × oracle getUnderlyingPrice" },
  ],
});
