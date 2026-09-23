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
  summary: `LUSD debt the Trove owed AFTER this event — the absolute debt the TroveManager emitted at this event${atBlock(coords)}, scaled by 18 decimals. Interest-free protocol, so this is the Trove's exact obligation (drawn LUSD + one-time fee + 200 LUSD gas reserve).`,
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
// face value (same convention as the position economics tower). The premium
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
  summary: `The premium realized on this liquidation — seized collateral value over cleared debt, minus one. Because V1 wipes the whole trove, this is exactly the trove's collateral ratio at fire minus 100%: what the Stability Pool depositors (or, in a redistribution, the surviving troves) gained for absorbing the debt. A trove liquidates below the 110% minimum, so the premium tops out near +10%.`,
  contract: TROVE_MANAGER,
  via: "seized ÷ cleared − 1 · both legs at the block's own figures",
  inputs: [
    { label: "seized", value: vals.seizedUsd, kind: "chain", note: "collateral × price at block" },
    { label: "cleared", value: vals.clearedUsd, kind: "chain", note: "debt at $1 face" },
    ...eventInputs(coords),
  ],
});

// ── Position card + economics tower: current Trove state ─────────────────────

export const positionCollateralProv = (atBlockNum?: number): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  summary: `ETH collateral the Trove currently holds — the latest absolute balance the TroveManager emitted for this borrower${atBlockNum ? ` at block ${atBlockNum}` : ""}. Emitted whole, not a reconstructed sum.`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · latest TroveUpdated log · _coll · ÷10^18`,
});

// ── Economics tower: lifetime flow sums ───────────────────────────────────────

export type LiquityV1LifetimeFlow =
  | "deposited"
  | "withdrawn"
  | "borrowed"
  | "repaid"
  | "liquidated collateral"
  | "liquidated debt"
  | "redeemed collateral"
  | "redeemed debt";

const FLOW_STORY: Record<LiquityV1LifetimeFlow, string> = {
  deposited: "ETH added to the Trove (open + top-ups)",
  withdrawn: "ETH voluntarily withdrawn from the Trove",
  borrowed: "LUSD drawn against the Trove (including the one-time borrowing fee and the 200 LUSD gas reserve)",
  repaid: "LUSD voluntarily repaid",
  "liquidated collateral": "ETH seized when the Trove was liquidated",
  "liquidated debt": "LUSD debt cleared when the Trove was liquidated",
  "redeemed collateral":
    "ETH exchanged away by redemptions (LUSD holders redeeming at face value against the lowest-ratio troves)",
  "redeemed debt": "LUSD debt repaid by redemptions",
};

/** A lifetime gross flow — the sum of one kind of signed TroveUpdated delta
 *  across the Trove's life. Each delta is exact arithmetic over two emitted
 *  absolutes (chain-derived) and the sum only renders when the whole replay
 *  reconciles to the current emitted balance, so the total stays chain-derived. */
export const lifetimeFlowProv = (flow: LiquityV1LifetimeFlow): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Lifetime ${flow} — ${FLOW_STORY[flow]}, summed across the Trove's life. Each event's delta is exact arithmetic over two consecutive emitted TroveUpdated absolutes; the sum renders only when the full replay reconciles to the Trove's current emitted balance.`,
  contract: TROVE_MANAGER,
  via: `${LIQUITY_V1_VIA} · Σ TroveUpdated deltas (${flow}) · ÷10^18`,
  formula: "Σ (after − before) over this flow's events",
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
