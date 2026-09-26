// Provenance vocabulary for the live Pool reads on the SparkLend position view —
// getUserAccountData and getReserveData at head. The near-clone of
// lib/aave-v3/position-provenance (SparkLend is an Aave V3 fork, verified by
// scripts/verify-spark-fork-deltas.mjs). SparkLend has one deployment, on
// Ethereum, so every receipt names that Pool.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { SPARK_ADDRESSES } from "@/lib/spark/asset-catalog";

const POOL_CONTRACT: Provenance["contract"] = { name: "SparkLend Pool", address: SPARK_ADDRESSES.POOL };

/** A state read's proof: re-run the eth_call yourself against any node. No third-party
 *  deep link (explorers only read current head) — the verification is the re-run. */
const STATE_VERIFY: ProvVerify = {
  kind: "recompute",
  text: "Re-run the eth_call against any node",
};

const ACCOUNT_VIA = "GET /api/chain/spark/position · Pool.getUserAccountData @ head";

/** A field of the wallet's aggregate account state, read from
 *  Pool.getUserAccountData at the latest block (the max LTV, the liquidation
 *  threshold, available borrows, the oracle-priced USD totals). SparkLend's own
 *  oracle-priced account math — not an event-replay approximation. */
export function accountDataProv(what: string, field: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — read from SparkLend's Pool.getUserAccountData for this wallet, at the latest block. The protocol's own oracle-priced account state, not an event-replay approximation.`,
    contract: POOL_CONTRACT,
    via: `${ACCOUNT_VIA} · ${field}`,
  };
}

/** A ratio derived from the account's oracle-priced USD totals (current LTV =
 *  debt ÷ collateral). Both totals are themselves getUserAccountData @ head
 *  reads and the division mirrors the protocol's own account math, so the ratio
 *  is chain-derived (it survives the on-chain-only gate) and exact at that block. */
export function accountRatioProv(what: string, formula: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — computed from the wallet's oracle-priced USD totals (Pool.getUserAccountData @ head).`,
    contract: POOL_CONTRACT,
    via: `${ACCOUNT_VIA} · derived ratio`,
    formula,
    inputs: [
      { label: "total debt (USD)", kind: "chain", pclass: "state", note: "getUserAccountData @ head" },
      { label: "total collateral (USD)", kind: "chain", pclass: "state", note: "getUserAccountData @ head" },
    ],
  };
}

/** A reserve-level economics field read from Pool.getReserveData @ head — the
 *  current supply / variable-borrow APR, the reserve factor, or the reserve's
 *  utilization. Pool-wide reserve state at the latest block, not the wallet's
 *  own position. */
export function reserveDataProv(what: string, field: string, asset?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what}${asset ? ` for ${asset}` : ""} — read from SparkLend's Pool.getReserveData at the latest block. The reserve's own pool-wide rate/state, not an event-replay approximation.`,
    contract: POOL_CONTRACT,
    via: `GET /api/chain/spark/position · getReserveData @ head · ${field}`,
    inputs: asset ? [{ label: "reserve", value: asset, kind: "chain" }] : undefined,
  };
}

/** Debt-USD-weighted average variable borrow APR across the borrowed reserves —
 *  the card's one-figure debt caption when the position borrows several
 *  reserves at once. Every leg on-chain: each rate is Pool.getReserveData @
 *  head; the weights are the chain debt balances valued at SparkLend's oracle. */
export function avgBorrowRateProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Average variable borrow rate across the borrowed reserves — each reserve's currentVariableBorrowRate from Pool.getReserveData at the latest block, weighted by its oracle-valued debt (chain debt balance × IAaveOracle price). One figure for a multi-reserve debt side; the per-reserve rates are in the Reserve rates panel below.",
    contract: POOL_CONTRACT,
    via: "GET /api/chain/spark/position · getReserveData @ head · Σ rate × debt USD ÷ Σ debt USD",
    formula: "Σ (rate × debt USD) ÷ Σ debt USD",
    inputs: [
      { label: "rates", kind: "chain", pclass: "state", note: "currentVariableBorrowRate per borrowed reserve" },
      { label: "debt USD", kind: "chain-derived", note: "chain debt balance × IAaveOracle getAssetPrice" },
    ],
  };
}
