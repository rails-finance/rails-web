// Provenance vocabulary for the live Pool reads on an Aave-V3-shaped position
// view — getUserAccountData and getReserveData at head. Every builder takes the
// Pool the read hit: the page's own identity (useV3Pool, set per market on
// Ethereum and per lender on Base), so a receipt never names another chain's
// or another market's Pool.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { AAVE_V3_MARKETS } from "@/lib/aave-v3/asset-catalog";

/** A state read's proof: re-run the eth_call yourself against any node. No third-party
 *  deep link (explorers only read current head) — the verification is the re-run. */
const STATE_VERIFY: ProvVerify = {
  kind: "recompute",
  text: "Re-run the eth_call against any node",
};

const ETHEREUM_POSITION_ROUTE = "/api/chain/aave-v3/position";

/** Which Pool a live read hit, and through which route. A string is the Pool
 *  address alone (the Ethereum pages pass `chain.pool`, and the market is
 *  resolved from it); an object is the page's own identity — a Base lender
 *  names its Pool and its route here, so the receipt never cites Ethereum's. */
export type V3PoolLane = string | { name: string; address: string; positionRoute?: string };

const laneRoute = (pool: V3PoolLane): string =>
  typeof pool === "object" && pool.positionRoute ? pool.positionRoute : ETHEREUM_POSITION_ROUTE;
const accountVia = (pool: V3PoolLane): string => `GET ${laneRoute(pool)} · Pool.getUserAccountData @ head`;

/** The contract slot for a live-Pool read — named for the MARKET's Pool when the
 *  caller passes the address it read (Core / Prime / EtherFi are separate
 *  Pools); the lane's own name when the caller passes an identity. */
function poolContractFor(pool: V3PoolLane): Provenance["contract"] {
  if (typeof pool === "object") return { name: pool.name, address: pool.address.toLowerCase() };
  const addr = pool.toLowerCase();
  const market = AAVE_V3_MARKETS.find((m) => m.pool === addr);
  return { name: market ? `Aave V3 ${market.name} Pool` : "Aave V3 Pool", address: addr };
}

/** How the Pool writes each account figure as a whole number. The one call
 *  answers in four different scales, so the sentence is per field; a field with
 *  no entry gets none rather than a guessed one (receipts grammar §5). */
const ACCOUNT_SCALE: Record<string, string> = {
  healthFactor: "The Pool writes a health factor with 18 decimal places, so 10^18 stands for a factor of 1.",
  ltv: "The Pool writes this share in hundredths of a percent, so 8000 stands for 80%.",
  currentLiquidationThreshold: "The Pool writes this share in hundredths of a percent, so 8250 stands for 82.5%.",
  availableBorrowsBase: "The Pool answers in US dollars with 8 decimal places.",
  totalCollateralBase: "The Pool answers in US dollars with 8 decimal places.",
  totalDebtBase: "The Pool answers in US dollars with 8 decimal places.",
};

/** A field of the wallet's aggregate account state, read from
 *  Pool.getUserAccountData at the latest block (the max LTV, the
 *  liquidation threshold, available borrows, the oracle-priced USD totals).
 *  `pool` names the market's Pool the read hit. */
export function accountDataProv(what: string, field: string, pool: V3PoolLane): Provenance {
  const scale = ACCOUNT_SCALE[field];
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — the figure the Pool gives for this wallet when it is asked for the account's state at the latest block. The Pool values every reserve at the price its oracle reports and weighs each one by that value, which is the arithmetic it liquidates by.${scale ? ` ${scale}` : ""}`,
    contract: poolContractFor(pool),
    via: `${accountVia(pool)} · ${field}`,
  };
}

/** A ratio derived from the account's oracle-priced USD totals (current LTV =
 *  debt ÷ collateral). Both totals are themselves getUserAccountData @ head
 *  reads and the division mirrors the protocol's own account math, so the ratio
 *  is chain-derived (it survives the on-chain-only gate) and exact at that block. */
export function accountRatioProv(what: string, formula: string, pool: V3PoolLane): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what} — the wallet's total debt in US dollars divided by its total collateral in US dollars, both as the Pool reports them at the latest block. The Pool values each reserve at the price its oracle reports, and answers both totals in US dollars with 8 decimal places; the division leaves a share with no unit.`,
    contract: poolContractFor(pool),
    via: `${accountVia(pool)} · derived ratio`,
    formula,
    inputs: [
      { label: "total debt (USD)", kind: "chain", pclass: "state", note: "getUserAccountData @ head" },
      { label: "total collateral (USD)", kind: "chain", pclass: "state", note: "getUserAccountData @ head" },
    ],
  };
}

/** The scale sentence for a reserve field the Pool answers as a ray. */
const RAY_SENTENCE = "The Pool writes a rate as a fraction with 27 decimal places, where 10^27 a year means 100%.";
const RAY_FIELDS = new Set(["currentLiquidityRate", "currentVariableBorrowRate", "currentStableBorrowRate"]);

/** A reserve-level economics field read from Pool.getReserveData @ head — the
 *  current supply / variable-borrow APR, the reserve factor, or the reserve's
 *  utilization. Pool-wide reserve state at the latest block, not the wallet's
 *  position; read once with the same call that yields the per-asset balances. */
export function reserveDataProv(what: string, field: string, asset: string | undefined, pool: V3PoolLane): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: STATE_VERIFY,
    summary: `${what}${asset ? ` for ${asset}` : ""} — the figure the Pool gives for this whole reserve at the latest block. It belongs to the reserve and to every account in it: how much of the reserve has been borrowed sets it, and no account picks it.${RAY_FIELDS.has(field) ? ` ${RAY_SENTENCE}` : ""}`,
    contract: poolContractFor(pool),
    via: `GET ${laneRoute(pool)} · getReserveData @ head · ${field}`,
    inputs: asset ? [{ label: "reserve", value: asset, kind: "chain" }] : undefined,
  };
}

/** Debt-USD-weighted average variable borrow APR across the borrowed reserves —
 *  the card's one-figure debt caption when the position borrows several
 *  reserves at once. Every leg on-chain: each rate is Pool.getReserveData @
 *  head; the weights are the chain debt balances valued at Aave's own oracle. */
export function avgBorrowRateProv(pool: V3PoolLane): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: STATE_VERIFY,
    summary:
      "Average variable borrow rate across the borrowed reserves — each reserve's rate at the latest block, weighted by what this position's debt in that reserve is worth at the price the Pool's oracle reports. One figure for a debt side spread over several reserves. " +
      RAY_SENTENCE,
    contract: poolContractFor(pool),
    via: `GET ${laneRoute(pool)} · getReserveData @ head · Σ rate × debt USD ÷ Σ debt USD`,
    formula: "Σ (rate × debt USD) ÷ Σ debt USD",
    inputs: [
      { label: "rates", kind: "chain", pclass: "state", note: "currentVariableBorrowRate per borrowed reserve" },
      { label: "debt USD", kind: "chain-derived", note: "chain debt balance × IAaveOracle getAssetPrice" },
    ],
  };
}
