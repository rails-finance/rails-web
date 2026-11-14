// Provenance vocabulary for the live Pool reads on the SparkLend position view —
// getUserAccountData and getReserveData at head. The near-clone of
// lib/aave-v3/position-provenance (SparkLend is an Aave V3 fork, verified by
// scripts/verify-spark-fork-deltas.mjs). SparkLend has one deployment, on
// Ethereum, so every receipt names that Pool.

import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import { serverReadVia } from "@/lib/aave-v3/position-provenance";
import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { SPARK_ADDRESSES } from "@/lib/spark/asset-catalog";
import { APY_FORMULA } from "@/lib/aave-family/apy";

const POOL_CONTRACT: Provenance["contract"] = { name: "SparkLend Pool", address: SPARK_ADDRESSES.POOL };

/** A state read's proof: the reader makes the same call against any node. No third-party
 *  deep link (explorers only read current head). */
const STATE_VERIFY: ProvVerify = {
  kind: "recompute",
  text: "To check: make the same call to the Pool contract on any node.",
};

const ACCOUNT_VIA = "GET /api/chain/spark/position · Pool.getUserAccountData @ head";

/** A field of the wallet's aggregate account state, read from
 *  Pool.getUserAccountData at the latest block (the max LTV, the liquidation
 *  threshold, available borrows, the oracle-priced USD totals). SparkLend's own
 *  oracle-priced account math — not an event-replay approximation. */
export function accountDataProv(
  what: string,
  field: string,
  readBy?: PositionHeadStamp & { block: number },
): Provenance {
  const via = readBy
    ? `${ACCOUNT_VIA.replace("@ head", `@ block ${readBy.block.toLocaleString("en-US")}`)}${serverReadVia(readBy)} · ${field}`
    : `${ACCOUNT_VIA} · ${field}`;
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — read from SparkLend's Pool.getUserAccountData for this wallet, at the latest block. The protocol's own oracle-priced account state, not an event-replay approximation.`,
    contract: POOL_CONTRACT,
    via,
  };
}

/** A rate as the receipt's input states it: the Pool's annual rate as a
 *  fraction, the stored ray divided by 10^27 (rails-server serves the
 *  fraction, not the ray integer). */
const rateFraction = (apr: number): string => apr.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");

/** One borrowed reserve's borrow APY: its variable borrow rate from
 *  Pool.getReserveData @ head, compounded each second for a year
 *  (lib/aave-family/apy.ts; ui-jobs 611). */
export function borrowApyProv(symbol: string | undefined, apr: number | null | undefined): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `Borrow APY${symbol ? ` on ${symbol}` : ""}. The reserve's variable borrow rate, read from SparkLend's Pool.getReserveData at the latest block as a rate a year (ray-scaled, 10^27 = 100%), compounded every second over a 365-day year.`,
    contract: POOL_CONTRACT,
    via: `GET /api/chain/spark/position · getReserveData @ head · currentVariableBorrowRate ÷ 10^27, compounded`,
    formula: APY_FORMULA,
    inputs: [
      {
        label: "rate",
        ...(apr != null ? { value: rateFraction(apr) } : {}),
        kind: "chain",
        pclass: "state",
        note: "currentVariableBorrowRate ÷ 10^27, a year",
      },
      { label: "seconds a year", value: "31,536,000", kind: "chain-derived", definition: true, note: "365 days" },
    ],
  };
}

/** The debt-weighted average borrow APY across the borrowed reserves. */
export function avgBorrowApyProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Average borrow APY across the borrowed reserves. Each reserve's currentVariableBorrowRate from Pool.getReserveData at the latest block, compounded every second over a 365-day year, then weighted by its oracle-valued debt (chain debt balance × IAaveOracle price).",
    contract: POOL_CONTRACT,
    via: "GET /api/chain/spark/position · getReserveData @ head · Σ APY × debt USD ÷ Σ debt USD",
    formula: `Σ (APY × debt USD) ÷ Σ debt USD, APY = ${APY_FORMULA}`,
    inputs: [
      {
        label: "rates",
        kind: "chain",
        pclass: "state",
        note: "currentVariableBorrowRate ÷ 10^27 per borrowed reserve",
      },
      { label: "debt USD", kind: "chain-derived", note: "chain debt balance × IAaveOracle getAssetPrice" },
    ],
  };
}
