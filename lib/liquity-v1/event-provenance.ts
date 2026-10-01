// Liquity V1 (LUSD) provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// Liquity V1's TroveUpdated(borrower, debt, coll, stake, operation) emits the
// Trove's ABSOLUTE debt + collateral after every change. That makes the after-
// values directly EMITTED from the chain (kind "chain", pclass "emitted") — stronger
// than Spark, where a balance is a replayed SUM of deltas. The BEFORE-values are the
// previous TroveUpdated's emitted values (kind "chain", one step less direct →
// pclass "indexed"), and the signed DELTA this event applied is after − before:
// deterministic arithmetic over two chain values, so kind "chain-derived" — it
// survives the chain-state gate (unlike Spark's derived before-values).
//
// Liquity V1 charges NO ongoing interest (a one-time borrowing fee only), so the
// emitted debt is the Trove's exact obligation, not a principal approximation. The
// live-read vocabulary (ratio, price, queue) lives in ./position-provenance.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { formatExact } from "@/lib/utils/format";
import { LIQUITY_V1_ADDRESSES } from "./asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const TROVE_MANAGER = { name: "Liquity V1 TroveManager", address: LIQUITY_V1_ADDRESSES.TROVE_MANAGER };

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const LIQUITY_V1_VIA = "captured Liquity V1 events (liquity_v1_*)";

export interface LiquityV1Coords {
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
}

const atBlock = (coords?: LiquityV1Coords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Etherscan tx-logs link for an emitted event field — zero-RPC, link only. */
const txVerify = (coords?: LiquityV1Coords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

function eventInputs(coords: LiquityV1Coords | undefined): ProvInput[] {
  const inputs: ProvInput[] = [];
  if (coords?.wallet) inputs.push({ label: "borrower", value: coords.wallet, kind: "chain", note: "Trove owner" });
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

// ── Header: the signed collateral / debt this event applied ──────────────────
// TroveUpdated emits absolutes, not a delta, so the moved amount is after − before —
// deterministic arithmetic over two emitted values → "chain-derived" (survives the
// on-chain-only view). openTrove's delta is the full opening amount (before = 0).

/** Operand value a caller threads in (the same number the card renders);
 *  absent/non-numeric values leave the row label-only. */
const opVal = (v: number | string | null | undefined): string | undefined => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? formatExact(n) : undefined;
};

/** Operand values for the delta reconstructions — pass the emitted after and
 *  the reconstructed previous-event value so the receipt traces both. */
export interface DeltaOps {
  after?: number | string | null;
  before?: number | string | null;
}

export const collDeltaProv = (coords: LiquityV1Coords, ops?: DeltaOps): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: txVerify(coords),
  summary: `The ETH collateral this operation moved — the change in the Trove's emitted collateral across this event (after − the previous event's balance)${atBlock(coords)}. Absolute balances are emitted; the delta is exact arithmetic over two of them.`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · TroveUpdated logs · Δ_coll · ÷10^18`,
  formula: "coll after − coll before",
  inputs: [
    {
      label: "coll after",
      value: opVal(ops?.after),
      kind: "chain",
      pclass: "emitted",
      note: "this TroveUpdated's _coll",
    },
    {
      label: "coll before",
      value: opVal(ops?.before),
      kind: "chain",
      pclass: "emitted",
      note: "the previous TroveUpdated's _coll",
    },
    ...eventInputs(coords),
  ],
});

export const debtDeltaProv = (coords: LiquityV1Coords, ops?: DeltaOps): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: txVerify(coords),
  summary: `The LUSD debt this operation moved — the change in the Trove's emitted debt across this event (after − the previous event's debt)${atBlock(coords)}. Liquity V1 has no ongoing interest, so this is the exact debt change (draw / repay / fee / redemption).`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · TroveUpdated logs · Δ_debt · ÷10^18`,
  formula: "debt after − debt before",
  inputs: [
    {
      label: "debt after",
      value: opVal(ops?.after),
      kind: "chain",
      pclass: "emitted",
      note: "this TroveUpdated's _debt",
    },
    {
      label: "debt before",
      value: opVal(ops?.before),
      kind: "chain",
      pclass: "emitted",
      note: "the previous TroveUpdated's _debt",
    },
    ...eventInputs(coords),
  ],
});

// ── Detail: absolute after-values (directly emitted) ─────────────────────────

export const collAfterProv = (coords: LiquityV1Coords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `ETH collateral the Trove held AFTER this event — the absolute balance the TroveManager emitted at this event${atBlock(coords)}, scaled by 18 decimals. Emitted whole, not a reconstructed sum.`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · TroveUpdated log · _coll · ÷10^18`,
  inputs: eventInputs(coords),
});

export const debtAfterProv = (coords: LiquityV1Coords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `LUSD debt the Trove owed AFTER this event — the absolute debt the TroveManager emitted at this event${atBlock(coords)}, scaled by 18 decimals. Interest-free protocol, so this is the Trove's whole debt (LUSD received + one-time fees + the 200 LUSD liquidation reserve).`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · TroveUpdated log · _debt · ÷10^18`,
  inputs: eventInputs(coords),
});

// ── Detail: before-values (the previous event's emitted absolute) ────────────

export const collBeforeProv = (coords: LiquityV1Coords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `ETH collateral the Trove held BEFORE this event — the absolute balance the previous event emitted for this borrower (the Trove's state entering this event), joined by block order${atBlock(coords)}. An emitted chain value, one step less direct than this event's own.`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · previous TroveUpdated log · _coll · ÷10^18`,
  inputs: eventInputs(coords),
});

export const debtBeforeProv = (coords: LiquityV1Coords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `LUSD debt the Trove owed BEFORE this event — the absolute debt the previous event emitted for this borrower, joined by block order${atBlock(coords)}. An emitted chain value, one step less direct than this event's own.`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · previous TroveUpdated log · _debt · ÷10^18`,
  inputs: eventInputs(coords),
});

// ── Liquidation forensics (the valued legs) ──────────────────────────────────
//
// V1 liquidates the WHOLE trove: all collateral seized (to the Stability Pool
// or redistributed), all debt cleared. The ETH leg is valued at the protocol's
// own PriceFeed.lastGoodPrice captured at the event's block (mig 110) — the
// figure liquidate() itself read via fetchPrice() before acting. The LUSD leg
// needs no price: the protocol's own ICR math counts debt at $1 redemption
// face value (the convention of the Lifetime flows panel). The premium
// (seized ÷ cleared − 1 = the trove's ICR at fire − 1) is what the Stability
// Pool depositors — or, in a redistribution, the surviving troves — realized.

/** The protocol's own ETH:USD at the event's block. */
export const atBlockPriceProv = (coords: LiquityV1Coords, priceUsd: number): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the PriceFeed.lastGoodPrice eth_call at block ${coords.blockNumber} against an archive node`
        : "Re-run the PriceFeed.lastGoodPrice eth_call against an archive node",
  },
  summary: `ETH:USD at this event's block — the protocol's own PriceFeed.lastGoodPrice (Chainlink with Tellor fallback), read at the block and captured into the index. liquidate() calls fetchPrice() before acting, so this IS the figure the TroveManager judged and executed this liquidation at — not a market approximation.`,
  contract: { name: "Liquity V1 PriceFeed", address: LIQUITY_V1_ADDRESSES.PRICE_FEED },
  via: "PriceFeed.lastGoodPrice eth_call at the event's block · ÷10^18",
  inputs: [
    { label: "ETH price", value: formatExact(priceUsd), kind: "chain", note: "lastGoodPrice, at block" },
    ...eventInputs(coords),
  ],
});

/** The seized-collateral leg — the whole trove's ETH × the at-block price. */
export const liqSeizedUsdProv = (coords: LiquityV1Coords, vals: { amount: string; priceUsd: number }): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "collateral × price at block",
  verify: txVerify(coords),
  summary: `What the seized collateral was worth when the trove was liquidated — the trove's entire ETH (the previous TroveUpdated's emitted balance; V1 liquidates whole troves) times the protocol's own PriceFeed price at the event's block. Both factors are chain values pinned to this block.`,
  contract: TROVE_MANAGER,
  via: "collateral × lastGoodPrice at block",
  inputs: [
    { label: "collateral", value: vals.amount, kind: "chain", note: "the trove's ETH entering the event" },
    { label: "price at block", value: formatExact(vals.priceUsd), kind: "chain", note: "PriceFeed.lastGoodPrice" },
    ...eventInputs(coords),
  ],
});

/** The cleared-debt leg — LUSD at the protocol's own $1 redemption face. */
export const liqClearedFaceProv = (coords: LiquityV1Coords, vals: { amount: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  formula: "debt at $1 redemption face value",
  verify: txVerify(coords),
  summary: `What the cleared debt counts as — the trove's entire LUSD obligation (the previous TroveUpdated's emitted debt) at the $1 redemption face value the protocol itself uses: the ICR math that judged this liquidation (collateral × price ÷ debt) counts each LUSD as one dollar, and redemptions enforce that face on chain. No market price for LUSD is asserted.`,
  contract: TROVE_MANAGER,
  via: "debt · $1 redemption face (the protocol's own ICR denominator)",
  inputs: [
    { label: "debt cleared", value: vals.amount, kind: "chain", note: "the trove's LUSD entering the event" },
    ...eventInputs(coords),
  ],
});

/** The premium — seized ÷ cleared − 1 (= the trove's ICR at fire − 1). */
export const liqPremiumProv = (
  coords: LiquityV1Coords,
  vals: { seizedUsd: string; clearedUsd: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "seized ÷ cleared − 1",
  verify: txVerify(coords),
  summary: `The premium realized on this liquidation — seized collateral value over cleared debt, minus one. Because V1 wipes the whole trove, this is exactly the trove's collateral ratio at liquidation minus 100%: what the Stability Pool depositors (or, in a redistribution, the surviving troves) gained for absorbing the debt. A trove liquidates below the 110% minimum, so the premium tops out near +10%.`,
  contract: TROVE_MANAGER,
  via: "seized ÷ cleared − 1 · both legs at the block's own figures",
  inputs: [
    { label: "seized", value: vals.seizedUsd, kind: "chain", note: "collateral × price at block" },
    { label: "cleared", value: vals.clearedUsd, kind: "chain", note: "debt at $1 face" },
    ...eventInputs(coords),
  ],
});

// ── Position card: current Trove state ───────────────────────────────────────

export const positionCollateralProv = (atBlockNum?: number): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `ETH collateral the Trove currently holds — the latest absolute balance the TroveManager emitted for this borrower${atBlockNum ? ` at block ${atBlockNum}` : ""}. Emitted whole.`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · latest TroveUpdated log · _coll · ÷10^18`,
});

export const positionDebtProv = (atBlockNum?: number): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `LUSD debt the Trove currently owes — the latest absolute debt the TroveManager emitted for this borrower${atBlockNum ? ` at block ${atBlockNum}` : ""}. Interest-free, so this is the exact obligation, not a principal approximation.`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · latest TroveUpdated log · _debt · ÷10^18`,
});

// ── Closed-life peaks — the terminal card's headline figures ──────────────────
//
// A closed or liquidated life ends at zero, so its card face carries what it
// held at its height: the LARGEST of the absolute balances the TroveUpdated
// events emitted across that life. Each candidate is an emitted whole (V1
// emits absolutes, not deltas); the index selects the maximum. The two peaks
// are each their own lifetime maximum — the collateral peak and the debt peak
// can come from different moments of the life.

export const peakCollateralProv = (): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary:
    "The highest ETH collateral this Trove life recorded — the largest of the absolute balances the TroveManager emitted across the life's TroveUpdated events. Its own lifetime maximum: the debt peak beside it can come from a different moment.",
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · max(_coll) over this life's TroveUpdated logs · ÷10^18`,
});

export const peakDebtProv = (): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary:
    "The highest LUSD debt this Trove life recorded — the largest of the absolute debts the TroveManager emitted across the life's TroveUpdated events. Interest-free, so every candidate is an exact obligation; its own lifetime maximum, from whichever moment the debt peaked.",
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · max(_debt) over this life's TroveUpdated logs · ÷10^18`,
});

// ── The event's receipt (/api/chain/liquity-v1/event) ─────────────────────────
//
// Figures the TroveUpdated stream does not carry, read from the event's
// transaction receipt: the borrowing fee, the LUSD the owner received or burned,
// the reserve, where a liquidation's debt and ETH went, and the PriceFeed price
// at the end of the block, which values the collateral ratio either side.

const BORROWER_OPS = { name: "Liquity V1 BorrowerOperations", address: LIQUITY_V1_ADDRESSES.BORROWER_OPERATIONS };
const LUSD_TOKEN = { name: "LUSD", address: LIQUITY_V1_ADDRESSES.LUSD };
const RECEIPT_VIA = "the transaction receipt, read over RPC";

/** The PriceFeed's ETH price at the end of the event's block. */
export const eventPriceProv = (coords: LiquityV1Coords, priceUsd: number): Provenance => ({
  kind: "chain",
  pclass: "oracle",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the PriceFeed.lastGoodPrice eth_call at block ${coords.blockNumber} against an archive node`
        : "Re-run the PriceFeed.lastGoodPrice eth_call against an archive node",
  },
  summary: `ETH price at this event's block — Liquity V1's PriceFeed.lastGoodPrice (Chainlink, with Tellor as fallback) read at the end of the block. The TroveManager and BorrowerOperations value collateral at this price.`,
  contract: { name: "Liquity V1 PriceFeed", address: LIQUITY_V1_ADDRESSES.PRICE_FEED },
  via: "PriceFeed.lastGoodPrice eth_call at the event's block · ÷10^18",
  inputs: [
    { label: "ETH price", value: formatExact(priceUsd), kind: "chain", note: "lastGoodPrice, at block" },
    ...eventInputs(coords),
  ],
});

/** Collateral value at the event's price. */
export const collUsdAtBlockProv = (
  coords: LiquityV1Coords,
  vals: { coll: string; priceUsd: number; side: "before" | "after" },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `Collateral value ${vals.side} this event, in USD — the Trove's ETH ${vals.side} the event times the PriceFeed price at this block.`,
  formula: "collateral × price at block",
  inputs: [
    { label: "collateral", value: vals.coll, kind: "chain", note: vals.side },
    { label: "price at block", value: formatExact(vals.priceUsd), kind: "chain", pclass: "oracle" },
  ],
});

/** What a surplus claim paid the owner, valued at the price at the claim's block. */
export const claimPaidUsdProv = (coords: LiquityV1Coords, vals: { eth: number; priceUsd: number }): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary:
    "ETH the claim paid the owner, in USD — the amount the CollSurplusPool sent, times the PriceFeed price at the claim's block.",
  formula: "ETH paid × price at block",
  inputs: [
    { label: "ETH paid", value: formatExact(vals.eth), kind: "chain" },
    { label: "price at block", value: formatExact(vals.priceUsd), kind: "chain", pclass: "oracle" },
    ...eventInputs(coords),
  ],
});

/** Collateral ratio either side of the event, both at this block's price. */
export const ratioAtBlockProv = (
  coords: LiquityV1Coords,
  vals: { coll: string; debt: string; priceUsd: number; side: "before" | "after" },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `Collateral ratio ${vals.side} this event — the Trove's ETH ${vals.side} the event, valued at the PriceFeed price at this block, divided by its LUSD debt counted at $1. The same formula the TroveManager checks against the 110% minimum.`,
  formula: "collateral × price ÷ debt",
  inputs: [
    { label: "collateral", value: vals.coll, kind: "chain", note: vals.side },
    { label: "debt", value: vals.debt, kind: "chain", note: vals.side },
    { label: "price at block", value: formatExact(vals.priceUsd), kind: "chain", pclass: "oracle" },
    ...eventInputs(coords),
  ],
});

/** The one-time borrowing fee, emitted by BorrowerOperations. */
export const borrowingFeeProv = (coords: LiquityV1Coords, fee: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Borrowing fee — the one-time fee this draw added to the Trove's debt, from BorrowerOperations' LUSDBorrowingFeePaid log for this borrower. The fee's LUSD is minted to LQTY stakers.`,
  contract: BORROWER_OPS,
  via: `${RECEIPT_VIA} · LUSDBorrowingFeePaid(_borrower, _LUSDFee) · ÷10^18`,
  inputs: [{ label: "fee", value: fee, kind: "chain", pclass: "emitted" }, ...eventInputs(coords)],
});

/** LUSD minted to the borrower on an open or a draw. */
export const lusdReceivedProv = (coords: LiquityV1Coords, amount: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `LUSD the owner received — the LUSD minted to the borrower in this transaction, from the LUSD token's Transfer log out of the zero address. The debt added is this plus the borrowing fee (and on an open, the 200 LUSD reserve).`,
  contract: LUSD_TOKEN,
  via: `${RECEIPT_VIA} · Transfer(0x0 → borrower) · ÷10^18`,
  inputs: [{ label: "minted", value: amount, kind: "chain", pclass: "emitted" }, ...eventInputs(coords)],
});

/** The 200 LUSD reserve minted to, or burned from, the GasPool. */
export const reserveProv = (coords: LiquityV1Coords, how: "minted" | "burned"): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary:
    how === "minted"
      ? "Liquidation reserve — 200 LUSD minted to the GasPool when the Trove opened, from the LUSD token's Transfer log. It counts in the debt and pays whoever liquidates the Trove; on a close or a full redemption it is burned."
      : "Liquidation reserve burned — the 200 LUSD the GasPool held for this Trove, burned when it closed, from the LUSD token's Transfer log. It cancels the last 200 LUSD of the debt, so the owner repaid the debt less 200.",
  contract: LUSD_TOKEN,
  via: `${RECEIPT_VIA} · Transfer(${how === "minted" ? "0x0 → GasPool" : "GasPool → 0x0"}) · ÷10^18`,
  inputs: eventInputs(coords),
});

/** LUSD the owner burned on a close. */
export const ownerRepaidProv = (coords: LiquityV1Coords, amount: string): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `LUSD the owner repaid — the LUSD burned from the borrower's wallet in this transaction, from the LUSD token's Transfer log into the zero address.`,
  contract: LUSD_TOKEN,
  via: `${RECEIPT_VIA} · Transfer(borrower → 0x0) · ÷10^18`,
  inputs: [{ label: "burned", value: amount, kind: "chain", pclass: "emitted" }, ...eventInputs(coords)],
});

/** Where a liquidation's debt and ETH went. */
export const liqRouteProv = (
  coords: LiquityV1Coords,
  leg: "stability pool debt" | "stability pool eth" | "liquidator" | "redistributed" | "surplus",
): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: {
    "stability pool debt":
      "Debt the Stability Pool cleared — the LUSD burned out of the Stability Pool in this liquidation, from the LUSD token's Transfer log into the zero address.",
    "stability pool eth":
      "ETH the Stability Pool received — the ActivePool's EtherSent log to the Stability Pool in this liquidation. Its depositors share it in proportion to their deposits.",
    liquidator:
      "Liquidator's compensation — the 200 LUSD reserve the GasPool paid out (LUSD Transfer log) and 0.5% of the liquidated ETH the ActivePool sent (EtherSent log) to the address that called the liquidation.",
    redistributed:
      "Redistributed to other Troves — the liquidation's debt and ETH the Stability Pool did not cover: the TroveManager's Liquidation log totals less what the Stability Pool burned and received. Every other open Trove takes a share in proportion to its collateral.",
    surplus:
      "Surplus to the owner — ETH the ActivePool sent to the CollSurplusPool in this liquidation (EtherSent log). A Recovery Mode liquidation takes collateral worth 110% of the debt and leaves the rest there for the owner to claim.",
  }[leg],
  contract: TROVE_MANAGER,
  via: `${RECEIPT_VIA} · Transfer / EtherSent / Liquidation logs · ÷10^18`,
  inputs: eventInputs(coords),
});

/** A redemption's ETH to the redeemer, and what a full redemption left over. */
export const redemptionLegProv = (
  coords: LiquityV1Coords,
  leg: "redeemer" | "surplus",
  vals: { debt: string; priceUsd: number; coll: string },
): Provenance =>
  leg === "redeemer"
    ? {
        kind: "chain-derived",
        pclass: "oracle",
        summary:
          "ETH to the redeemer — the debt the redeemer's LUSD cancelled, divided by the PriceFeed price at this block. On a full redemption the last 200 LUSD of the debt is the reserve, which the GasPool burns, so the redeemer pays for the debt less 200.",
        formula: "LUSD redeemed ÷ price at block",
        inputs: [
          { label: "LUSD redeemed", value: vals.debt, kind: "chain" },
          { label: "price at block", value: formatExact(vals.priceUsd), kind: "chain", pclass: "oracle" },
          ...eventInputs(coords),
        ],
      }
    : {
        kind: "chain-derived",
        pclass: "oracle",
        summary:
          "ETH left over — the Trove's collateral less the ETH that went to the redeemer. A fully redeemed Trove closes and this ETH moves to the CollSurplusPool, where the owner claims it through BorrowerOperations.claimCollateral().",
        formula: "collateral − ETH to the redeemer",
        inputs: [
          { label: "collateral", value: vals.coll, kind: "chain", note: "before" },
          { label: "price at block", value: formatExact(vals.priceUsd), kind: "chain", pclass: "oracle" },
          ...eventInputs(coords),
        ],
      };

/** A redemption's net outcome for the owner. */
export const redemptionNetProv = (
  coords: LiquityV1Coords,
  vals: { debt: string; eth: string; priceUsd: number; when: "redemption" | "today" },
): Provenance => ({
  kind: "derived",
  summary:
    vals.when === "redemption"
      ? "Net outcome at the redemption price — the debt cancelled, counted at $1 per LUSD, less the ETH the redeemer took, valued at the PriceFeed price at this block."
      : "Net outcome at today's price — the debt cancelled, counted at $1 per LUSD, less the ETH the redeemer took, valued at the PriceFeed price now.",
  formula: "debt cancelled − ETH taken × price",
  inputs: [
    { label: "debt cancelled", value: vals.debt, kind: "chain" },
    { label: "ETH taken", value: vals.eth, kind: "chain-derived" },
    {
      label: vals.when === "redemption" ? "price at block" : "price now",
      value: formatExact(vals.priceUsd),
      kind: "chain",
      pclass: "oracle",
    },
    ...eventInputs(coords),
  ],
});

/** What a close took from the owner's wallet: the debt less the reserve. */
export const closeRepaidProv = (coords: LiquityV1Coords, debtBefore: string): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: txVerify(coords),
  summary:
    "LUSD the owner repaid to close — the Trove's debt less the 200 LUSD liquidation reserve, which the GasPool burns in the same transaction (BorrowerOperations.closeTrove).",
  contract: BORROWER_OPS,
  formula: "debt before − 200 LUSD reserve",
  inputs: [{ label: "debt before", value: debtBefore, kind: "chain", pclass: "emitted" }, ...eventInputs(coords)],
});

// ── The CollSurplusPool: a full redemption's leftover ETH ─────────────────────

/** ETH a full redemption (or a capped Recovery Mode liquidation) left the owner,
 *  read at the head. */
export const surplusClaimableProv = (s: {
  pool: string;
  blockNumber: number;
  claimableRaw: string;
  claimed: { block: number | null; txHash: string | null } | null;
}): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: s.claimed
    ? "Surplus claimed — the ETH this Trove's closing left in the CollSurplusPool, which the owner has since claimed through BorrowerOperations.claimCollateral()."
    : "Claimable collateral — the ETH left over when this Trove closed, held in the CollSurplusPool until the owner claims it through BorrowerOperations.claimCollateral().",
  contract: { name: "Liquity V1 CollSurplusPool", address: s.pool },
  via: `the closing transaction's CollBalanceUpdated log for the owner, less the pool's balance for them the block before; ${
    s.claimed
      ? `a later CollBalanceUpdated(owner, 0)${s.claimed.block != null ? ` at block ${s.claimed.block.toLocaleString("en-US")}` : ""} is the claim`
      : `getCollateral(owner) at block ${s.blockNumber.toLocaleString("en-US")} still holds it`
  }`,
  source: { block: s.blockNumber },
  scaling: { raw: s.claimableRaw, from: "call", places: 18, why: "ETH has 18 decimals" },
});

export const surplusUsdProv = (claimable: number, priceUsd: number): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: "Claimable collateral in USD — the ETH still claimable, valued at the PriceFeed price now.",
  formula: "claimable ETH × price",
  inputs: [
    { label: "claimable", value: `${formatExact(claimable)} ETH`, kind: "chain", pclass: "state" },
    { label: "price", value: formatExact(priceUsd), kind: "chain", pclass: "oracle" },
  ],
});
