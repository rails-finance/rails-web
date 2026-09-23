// Dolomite (Ethereum L1) provenance vocabulary — the timeline lanes.
// ----------------------------------------------------------------------------
// One core contract (DolomiteMargin), and every action event carries a
// BalanceUpdate per touched balance: (deltaWei, newPar). Two lanes, and the
// grading is the point:
//
//   • deltaWei — `emitted`: the token amount this leg moved, a field in the
//     log itself, decoded and never recomputed.
//   • newPar — `state`, NOT emitted-graded despite riding in the log: the
//     emitted figure IS the stored slot's absolute after-state
//     (getAccountPar re-reads exactly it at any block), so the replay is
//     last-write-wins over slot values — no running sum exists to drift.
//
// Both of this explorer's lanes are `state`-class — the replayed par equals a
// slot the chain stores, unlike the roster's usual indexed-principal lanes —
// and the receipts say so. Par is a SCALED balance: par × the market's
// interest index (per-second, accrues on read) = tokens; no surface labels a
// par figure as principal.
//
// Values replay the captured margin-core events (dolomite_*). The `contract`
// is always the one core — every market lives inside it.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { DOLOMITE_ADDRESSES } from "./asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Custody, not origin — the via line's leading segment only.
const DOLOMITE_VIA = "captured DolomiteMargin events (dolomite_*)";

const MARGIN = { name: "DolomiteMargin", address: DOLOMITE_ADDRESSES.MARGIN };

export interface DolomiteCoords {
  txHash?: string;
  blockNumber?: number;
  /** Position owner. */
  owner?: string;
  /** uint256 account number — STRING. */
  accountNumber?: string;
  /** Dolomite's numeric market key. */
  marketId?: number;
}

const atBlock = (coords?: DolomiteCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Log-anatomy via segment: `field: <raw>` when the transform delivered the
 *  log's raw integer, plain `field` until it does. */
const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: DolomiteCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

function eventInputs(coords: DolomiteCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.owner) inputs.push({ label: "owner", value: coords.owner, kind: "chain", note: "account owner" });
  if (coords?.accountNumber != null)
    inputs.push({
      label: "account number",
      value: coords.accountNumber,
      kind: "chain",
      note: "uint256 — the second half of Account.Info",
    });
  if (coords?.marketId != null)
    inputs.push({ label: "market", value: String(coords.marketId), kind: "chain", note: "Dolomite's numeric key" });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords?.txHash) inputs.push({ label: "tx", value: coords.txHash, kind: "chain", note: "captured log" });
  return inputs;
}

/** The emitting log behind each leg's BalanceUpdate. */
const LEG_ORIGIN: Record<string, string> = {
  deposit: "LogDeposit",
  withdraw: "LogWithdraw",
  transfer_in: "LogTransfer",
  transfer_out: "LogTransfer",
  trade_taker: "LogSell",
  trade_maker: "LogSell",
  liquidation: "LogLiquidate",
  seize_out: "LogLiquidate",
  seize_in: "LogLiquidate",
  liquidation_payout: "LogLiquidate",
  vaporize: "LogVaporize",
};

// ── the two lanes ─────────────────────────────────────────────────────────────

/** Signed token amount this leg moved — the BalanceUpdate's deltaWei. */
export const weiDeltaProv = (
  sym: string,
  eventType: string,
  coords: DolomiteCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The ${sym} this leg moved — the BalanceUpdate's own \`deltaWei\`, exactly as the margin core emitted it${atBlock(coords)}, scaled by the token's decimals. One ${LEG_ORIGIN[eventType] ?? "action"} log carries a BalanceUpdate per touched balance (a liquidation touches four); this is this leg's. Decoded from the log, never recomputed.`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · ${LEG_ORIGIN[eventType] ?? "action"} log · ${fieldSeg("deltaWei", raw)}`,
  inputs: eventInputs(coords),
});

/** Par balance AFTER this event — the emitted ABSOLUTE, which equals the
 *  stored slot. Graded `state`, not emitted: getAccountPar re-reads exactly
 *  this figure. */
export const parAfterProv = (sym: string, coords: DolomiteCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the core's getAccountPar eth_call at block ${coords.blockNumber} against an archive node — the emitted newPar IS the stored slot, so the read reproduces this figure exactly. Both of this explorer's lanes are state-class: unusual on this roster, where a balance lane is normally an indexed replay.`
        : "Re-run the core's getAccountPar eth_call — the emitted newPar IS the stored slot, so the read reproduces this figure exactly. Both of this explorer's lanes are state-class: unusual on this roster, where a balance lane is normally an indexed replay.",
  },
  summary: `${sym} PAR balance this account held AFTER this event — the BalanceUpdate's \`newPar\`, the account's absolute after-state emitted by the core itself${atBlock(coords)}. Dolomite emits the scaled balance, so the index's replay is last-write-wins over slot values, not a running sum — there is nothing to drift. Par is the SCALED balance: multiply by the market's interest index (per-second, accrues on read) for tokens; a negative par IS debt (the core has no Borrow action).`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · ${fieldSeg("newPar", raw)} (the emitted absolute = the getAccountPar slot)`,
  inputs: eventInputs(coords),
});

/** Par balance BEFORE this event — lag(newPar) at the same grain: the
 *  PREVIOUS event's emitted absolute, never a sum. */
export const parBeforeProv = (sym: string, coords: DolomiteCoords, raw?: string | null): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the core's getAccountPar eth_call at block ${coords.blockNumber - 1} against an archive node`
        : "Re-run the core's getAccountPar eth_call just before this event",
  },
  summary: `${sym} PAR balance this account held BEFORE this event — the previous event's own emitted \`newPar\` at the same (owner, account number, market) grain: a lag of the emitted absolutes, never a running sum, so every before-value is anchored to a figure the core itself emitted (and the getAccountPar slot stored).`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · lag(newPar) at the same balance grain${raw ? ` = ${raw}` : ""}`,
  inputs: eventInputs(coords, [
    { label: "previous newPar", kind: "chain", pclass: "state", note: "the prior event's emitted absolute" },
  ]),
});

/** The PAR-axis change of this event — newPar − the previous newPar: a
 *  difference of two emitted absolutes. ⚠️ NOT the leg's deltaWei: par is the
 *  scaled balance, and the two axes differ by the market's index factor. */
export const parDeltaProv = (sym: string, coords: DolomiteCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: txVerify(coords),
  summary: `The ${sym} PAR change this event made — this event's emitted \`newPar\` minus the previous event's, a difference of two emitted absolutes (each equal to the getAccountPar slot at its block). This is the PAR axis: it differs from the leg's emitted \`deltaWei\` (the token amount) by the market's interest index factor, which is why the two figures are traced separately rather than reconciled into one lane.`,
  contract: MARGIN,
  via: "newPar − previous newPar (two emitted absolutes)",
  formula: "after − before",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "state", note: "this event's emitted newPar" },
    { label: "before", kind: "chain", pclass: "state", note: "the previous event's emitted newPar" },
  ]),
});

/** The header's per-leg receipt for whichever lane this eventType renders — the
 *  SAME switch the header used to inline, extracted so the card's spine echo
 *  can call the identical builder with the identical args (byte-identical
 *  `info`, the entryKey's other half). */
export function movedDeltaProv(
  eventType: string,
  sym: string,
  coords: DolomiteCoords,
  raw?: string | null,
): Provenance {
  switch (eventType) {
    case "liquidation":
      return liquidationDebtProv(sym, coords, raw);
    case "seize_out":
    case "seize_in":
    case "liquidation_payout":
      return liquidationLegProv(sym, eventType, coords, raw);
    case "trade_taker":
    case "trade_maker":
      return tradeLegProv(sym, eventType, coords, raw);
    case "transfer_in":
    case "transfer_out":
      return transferLegProv(sym, eventType === "transfer_in" ? "in" : "out", coords, raw);
    default:
      return weiDeltaProv(sym, eventType, coords, raw);
  }
}

// ── liquidation legs ──────────────────────────────────────────────────────────

/** The borrower's owed-market leg of a LogLiquidate — debt written down by
 *  the liquidator's repayment. */
export const liquidationDebtProv = (sym: string, coords: DolomiteCoords, raw?: string | null): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `${sym} debt cleared from this account in a liquidation — the liquid account's owed-market BalanceUpdate the LogLiquidate itself carries${atBlock(coords)}. ⚠️ The log's INDEXED owner is the LIQUIDATOR; this account is the unindexed liquidAccountOwner — a seizure is not something the borrower did, and this row renders it as debt being cleared, not a repayment the borrower made.`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · LogLiquidate · liquid account's owed leg · ${fieldSeg("deltaWei", raw)}`,
  inputs: eventInputs(coords),
});

/** One held-market leg of a LogLiquidate: seize_out (the borrower's
 *  collateral taken), seize_in (the liquidator's receipt), or the
 *  liquidator's owed-market payout leg. */
export const liquidationLegProv = (
  sym: string,
  leg: "seize_out" | "seize_in" | "liquidation_payout",
  coords: DolomiteCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary:
    leg === "seize_out"
      ? `${sym} collateral TAKEN from this account in a liquidation — the liquid account's held-market BalanceUpdate the LogLiquidate itself carries${atBlock(coords)}, worth the cleared debt plus the liquidation spread. Rendered as a seizure, never a send: the log's indexed owner is the liquidator, and this account is the unindexed borrower.`
      : leg === "seize_in"
        ? `${sym} this account received as the LIQUIDATOR in a seizure — the solid account's held-market BalanceUpdate the LogLiquidate carries${atBlock(coords)}: the seized collateral, worth the repaid debt plus the liquidation spread.`
        : `${sym} this account (the liquidator) put toward the borrower's debt — the solid account's owed-market BalanceUpdate the LogLiquidate carries${atBlock(coords)}. The liquidator's balance in the owed market falls (or goes negative — a negative balance IS debt here) by what was repaid on the borrower's behalf.`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · LogLiquidate · ${
    leg === "seize_out"
      ? "liquid account's held leg"
      : leg === "seize_in"
        ? "solid account's held leg"
        : "solid account's owed leg"
  } · ${fieldSeg("deltaWei", raw)}`,
  inputs: eventInputs(coords),
});

// ── liquidation forensics (the valued two-leg block) ─────────────────────────
//
// Every figure below is anchored to the EVENT'S OWN BLOCK: the legs are the
// LogLiquidate's emitted deltaWei amounts, and the prices are the core's own
// getMarketPrice read back at that block by archive eth_call — the exact
// figures the risk engine judged with when it fired. The premium is derived
// from the two legs alone; the pair spread (getLiquidationSpreadForPair, read
// at the same block) renders beside it as the constant the engine sized the
// seizure by, so the card audits itself.

/** The core's own oracle price for one market, read back AT the event's
 *  block — an archive eth_call, not a captured series. */
export const dolomiteLiqAtBlockPriceProv = (sym: string, coords: DolomiteCoords, priceRaw?: string): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the core's getMarketPrice eth_call at block ${coords.blockNumber} against an archive node — the same read the risk engine valued accounts with in that block.`
        : "Re-run the core's getMarketPrice eth_call at the event's block against an archive node.",
  },
  summary: `${sym}'s USD price AT the block this liquidation fired — the margin core's own \`getMarketPrice\` read back at that block (scale 1e(36 − decimals)). This is the figure the risk engine judged the account with when it fired: the core routes every margin check and every seizure through this oracle read, so valuing the legs at it reproduces the engine's own arithmetic.`,
  contract: MARGIN,
  via: `archive eth_call @ event block · getMarketPrice${priceRaw ? ` · raw: ${priceRaw}` : ""}`,
  inputs: eventInputs(coords),
});

/** One leg of the liquidation valued at the block's own oracle read —
 *  seized collateral or cleared debt. */
export const dolomiteLiqLegValueProv = (
  leg: "seized collateral" | "cleared debt",
  sym: string,
  coords: DolomiteCoords,
  vals: { amount: string; price: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `What the ${leg} was worth when the liquidation fired — the LogLiquidate's own emitted \`deltaWei\` for this leg (${vals.amount}) × the core's \`getMarketPrice\` for ${sym} read back at the same block ($${vals.price}). Amount from the log, price from the block's own archive read: the product is the value the risk engine itself was seeing.`,
  contract: MARGIN,
  via: `LogLiquidate deltaWei × getMarketPrice @ event block`,
  formula: "emitted amount × oracle price at block",
  inputs: eventInputs(coords, [
    { label: "amount", value: vals.amount, kind: "chain", pclass: "emitted", note: "the leg's emitted deltaWei" },
    { label: "price", value: `$${vals.price}`, kind: "chain", pclass: "oracle", note: "getMarketPrice at the block" },
  ]),
});

/** The premium the seizure realized — seized ÷ cleared − 1, both legs valued
 *  at the block's own oracle reads. */
export const dolomiteLiqPremiumProv = (
  coords: DolomiteCoords,
  vals: { seizedUsd: string; clearedUsd: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  verify: txVerify(coords),
  summary: `The margin this seizure realized over the debt it cleared — seized value (${vals.seizedUsd}) ÷ cleared value (${vals.clearedUsd}) − 1, both legs valued at the core's own oracle reads from the event's block. The engine SIZES the seizure from the pair's liquidation spread, so a liquidation with collateral to spare lands on that constant exactly; one that exhausted the collateral lands under it (the shortfall then vaporizes).`,
  contract: MARGIN,
  via: "seized value ÷ cleared value − 1 · both at the event block's own prices",
  formula: "seized ÷ cleared − 1",
  inputs: eventInputs(coords, [
    {
      label: "seized",
      value: vals.seizedUsd,
      kind: "chain-derived",
      pclass: "oracle",
      note: "held leg × price at block",
    },
    {
      label: "cleared",
      value: vals.clearedUsd,
      kind: "chain-derived",
      pclass: "oracle",
      note: "owed leg × price at block",
    },
  ]),
});

/** The liquidation spread the engine set for THIS account and pair, read at
 *  the event's block — the constant the premium above should land on. */
export const dolomiteLiqSpreadRefProv = (
  coords: DolomiteCoords,
  pair: { heldSym: string; owedSym: string },
): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run getLiquidationSpreadForAccountAndPair(liquidated account, held, owed) at block ${coords.blockNumber} against an archive node — on an account with no risk override it rebuilds as the global getLiquidationSpread × (1 + each market's getMarketSpreadPremium).`
        : "Re-run getLiquidationSpreadForAccountAndPair(liquidated account, held, owed) at the event's block against an archive node.",
  },
  summary: `The liquidation spread the core set for the seized account on this exact pair (${pair.heldSym} held, ${pair.owedSym} owed) at the block the liquidation fired — the core's own \`getLiquidationSpreadForAccountAndPair\`: the global base spread multiplied up by each market's own premium, unless the account carries a risk override (the LST/ETH and BTC categories), which seizes at the override's own spread with premiums skipped. The engine sized the seizure from this constant, so the realized premium beside it is a check against the protocol's own parameter, never a restatement of it.`,
  contract: MARGIN,
  via: "archive eth_call @ event block · getLiquidationSpreadForAccountAndPair(account, held, owed)",
  formula: "base spread × (1 + held premium) × (1 + owed premium), or the account's override spread",
  inputs: eventInputs(coords),
});

/** A LogSell leg — the taker (spent) or maker (received) side of one trade on
 *  the same account, two markets in one log. */
export const tradeLegProv = (
  sym: string,
  leg: "trade_taker" | "trade_maker",
  coords: DolomiteCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `${sym} this account ${leg === "trade_taker" ? "put into" : "received from"} a trade — the ${
    leg === "trade_taker" ? "taker" : "maker"
  }-market BalanceUpdate of one LogSell${atBlock(coords)}: one trade moves two of the account's balances in one log, and each leg is its own row. A trade can move a balance through zero — a negative after-state IS debt (selling borrowed funds is how leverage opens here).`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · LogSell · ${leg === "trade_taker" ? "takerUpdate" : "makerUpdate"} · ${fieldSeg("deltaWei", raw)}`,
  inputs: eventInputs(coords),
});

/** A transfer leg — one side of a LogTransfer between two Account.Infos
 *  (often the same owner's Dolomite Balance ↔ a Borrow Position). */
export const transferLegProv = (
  sym: string,
  direction: "in" | "out",
  coords: DolomiteCoords,
  raw?: string | null,
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `${sym} this transfer moved ${direction === "in" ? "into" : "out of"} this account — this account's own BalanceUpdate of a LogTransfer between two Account.Infos${atBlock(coords)}. Transfers move balances between account numbers (commonly the owner's Dolomite Balance and an isolated Borrow Position) without touching the outside world; opening a Borrow Position IS such a transfer.`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · LogTransfer · this account's leg · ${fieldSeg("deltaWei", raw)}`,
  inputs: eventInputs(coords),
});

// ── identity ─────────────────────────────────────────────────────────────────

/** Third-party action: the account owner neither signed the transaction nor
 *  was the event's own party. */
export const externalActorProv = (
  args: { eventType: string; owner: string; txFrom: string; caller: string },
  coords: DolomiteCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `This ${args.eventType.replace(/_/g, " ")} was executed by a third party: the account owner neither signed the transaction nor was the event's own party. Both facts are chain values${atBlock(coords)}; each is compared against the owner. Dolomite owners are often Gnosis Safes or smart wallets whose operators act through modules — the owner rendered is Account.Info.owner, the contract's own key, with no hop.`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · tx envelope from + the event's own party vs owner`,
  inputs: eventInputs(coords, [
    { label: "account owner", value: args.owner, kind: "chain", note: "whose account this event moved" },
    { label: "transaction sender", value: args.txFrom, kind: "chain", note: "signed the transaction" },
    { label: "event party", value: args.caller, kind: "chain", note: "the event's own party param" },
  ]),
});

// ── position card / tower ────────────────────────────────────────────────────

/** Position-card CURRENT token value of one leg — |par| × the market's CURRENT
 *  index. ⚠️ chain-derived + `state`, set explicitly: the kind-default would
 *  drift this to oracle, and it is a slot product, not a price. */
export const positionCurrentProv = (sym: string, side: "supply" | "debt"): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the core's getAccountWei eth_call (or getAccountPar × getMarketCurrentIndex ÷ 1e18) — both legs are contract slots read at head, and the product reproduces this figure. Both of this explorer's lanes are state-class: unusual on this roster.",
  },
  summary: `${sym} this account's ${side === "supply" ? "balance is worth" : "debt stands at"} NOW — the replayed par (the emitted absolute, = the getAccountPar slot) × the market's CURRENT interest index (getMarketCurrentIndex, which accrues ON READ: interest here is per-second, so no stored figure is current). This is what the core's own getAccountWei returns. Both legs are chain state, so the product is chain-derived — not an oracle figure.`,
  contract: MARGIN,
  via: "par × getMarketCurrentIndex ÷ 1e18 (eth_call at head) — = getAccountWei",
  formula: "par × current index",
  inputs: [
    { label: "par", kind: "chain", pclass: "state", note: "the emitted absolute (= getAccountPar)" },
    { label: "current index", kind: "chain", pclass: "state", note: "getMarketCurrentIndex at head — accrues on read" },
  ],
});

/** Position-card PAR figure — the replayed emitted absolute (= the slot). */
export const positionParProv = (sym: string, side: "supply" | "debt"): Provenance => ({
  kind: "chain",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the core's getAccountPar eth_call — the emitted newPar IS the stored slot, so the read reproduces this figure exactly.",
  },
  summary: `${sym} PAR ${side === "supply" ? "balance" : "debt"} — the account's latest emitted \`newPar\` absolute, which equals the core's stored slot (getAccountPar re-reads exactly it). Par is the SCALED balance: multiply by the market's per-second interest index for tokens — interest lives in the index, never in this figure.`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · latest newPar at this balance grain (= the getAccountPar slot)`,
});

/** Oracle USD for a card/tower total — balance × getMarketPrice. `oracle`. */
export const dolomiteUsdProv = (what: string): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what} valued in USD from Dolomite's own on-chain oracle — the balance multiplied by the same \`getMarketPrice\` the core's risk engine values accounts with (scale 1e(36 − decimals)), not an off-chain market feed. All 21 feeds are live (anti-pin proven: USDC's price is not exactly 1e30); one nuance — wsrUSD reuses srUSD's price to the wei, a shared-oracle alias, live but not independent.`,
  contract: MARGIN,
  via: "chain balance × getMarketPrice (eth_call at head)",
  formula: "balance × oracle price",
  inputs: [
    { label: "balance", kind: "chain", pclass: "state", note: "par × current index" },
    { label: "oracle price", kind: "chain", pclass: "oracle", note: "getMarketPrice — the risk engine's own read" },
  ],
});

/** The live per-second borrow rate on one market, annualized. */
export const borrowRateProv = (sym?: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  verify: {
    kind: "recompute",
    text: "Re-run the core's getMarketInterestRate eth_call and multiply by 31,536,000 (seconds per year)",
  },
  summary: `The current borrow rate${sym ? ` on the ${sym} market` : ""} — the core's \`getMarketInterestRate\` read at head (a PER-SECOND rate: Dolomite accrues per timestamp, and the index settles on read), annualized by simple multiplication with seconds-per-year. Any live rate figure must come from this read — no stored value is current.`,
  contract: MARGIN,
  via: "getMarketInterestRate (eth_call at head) × 31,536,000",
  formula: "per-second rate × seconds per year",
  inputs: [{ label: "per-second rate", kind: "chain", pclass: "state", note: "getMarketInterestRate at head" }],
});

/** Debt-USD-weighted average borrow rate across several borrowed markets. */
export const avgBorrowRateProv = (): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    "Debt-weighted average of the markets' current borrow rates — averaged across the markets this account borrows: each market's getMarketInterestRate (per second, annualized by simple multiplication) weighted by that debt's USD value at the core's own getMarketPrice. All legs are chain reads at head.",
  contract: MARGIN,
  via: "Σ (rate × debt USD) ÷ Σ debt USD, per borrowed market",
  formula: "Σ (rate × weight) ÷ Σ weight",
  inputs: [
    { label: "rate", kind: "chain", pclass: "state", note: "getMarketInterestRate per market, annualized" },
    { label: "weight", kind: "chain-derived", pclass: "oracle", note: "debt × getMarketPrice" },
  ],
});

/** A closed/liquidated card's PEAK par for one market lane — the maximum
 *  over the account's own emitted newPar absolutes on that lane. */
export const dolomitePeakParProv = (sym: string, side: "supply" | "debt"): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The most ${sym} this account ever ${side === "supply" ? "held" : "owed"} on this market, in PAR — the maximum over its own emitted \`newPar\` absolutes (each equal to the getAccountPar slot at its block), replayed over the account's whole life. A closed account's latest absolutes are back at zero, so its headline states each lane's height instead. Par is the SCALED balance — multiply by the market's index at the peak's block for tokens — and no USD is stated: the oracle prices the present, not history.`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · max(|newPar|) over this lane's own legs`,
});

/** A lifetime gross flow (Σ deposited / withdrawn / repaid / borrowed /
 *  liquidation-cleared on one market) — sums of the legs' own emitted
 *  deltaWei amounts, bucketed by which side of zero the balance sat on. */
export const dolomiteLifetimeFlowProv = (
  flow: "deposited" | "withdrawn" | "borrowed" | "repaid" | "liquidated debt" | "seized collateral",
  sym: string,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  summary: `Lifetime ${flow} (${sym}) — the sum of the emitted \`deltaWei\` amounts of this account's own captured legs, complete from the core's deploy block. Dolomite has no Borrow action, so the buckets follow the balance's side of zero: a delta while the balance was negative is debt moving (borrow/repay), while positive it is the lending side (deposit/withdraw); a leg that crosses zero splits exactly at the par zero-crossing (the split is exact — both pieces of one leg scale by the same index).`,
  contract: MARGIN,
  via: `${DOLOMITE_VIA} · Σ deltaWei across the account's own legs · deploy → head`,
});
