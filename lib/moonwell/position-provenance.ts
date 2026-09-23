// Provenance vocabulary for the Moonwell live position reads — the risk
// surfaces' sources (/api/chain/moonwell/position). Moonwell (a Compound v2
// fork) cross-collateralises its four markets through one Comptroller, so the
// vocabulary names three kinds of source:
//
//   • STATE — a live eth_call at the latest block: per-market against the
//     mToken (balanceOf / borrowBalanceStored / exchangeRateStored / the
//     per-timestamp rates), or against the Comptroller (getAssetsIn, markets'
//     collateral factors, closeFactor, liquidationIncentive).
//   • VERDICT — the Comptroller's OWN account judgement (getAccountLiquidity:
//     liquidity still unborrowed, or shortfall — the account is liquidatable
//     the moment shortfall > 0) — chain-direct, stronger than any client
//     arithmetic.
//   • DERIVED AGGREGATE — Σ entered supply × oracle price × collateral factor
//     (the capacity line) and the health factor, arithmetic over those same
//     chain reads. The replica is proven EXACT against getAccountLiquidity —
//     including the Comptroller's own truncation order — by
//     scripts/verify-moonwell-chain.mjs.
//
// Prices are the Comptroller's own Chainlink-wrapper oracle
// (getUnderlyingPrice — the same read its liquidity math prices with), USD.
// One v2 particular the vocabulary must carry: minting alone does NOT enter a
// market — an un-entered supply backs nothing (verified live).

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { MOONWELL_ADDRESSES } from "./asset-catalog";

/** Which deployment a live read hit — its Comptroller and the route the read
 *  came through. Ethereum's when a caller passes none; a Base page passes its
 *  own so the receipt never cites Ethereum's Comptroller for a Base verdict. */
export interface MoonwellLane {
  comptroller: { name: string; address: string };
  positionRoute: string;
}

export const MOONWELL_ETHEREUM_LANE: MoonwellLane = {
  comptroller: { name: "Comptroller", address: MOONWELL_ADDRESSES.COMPTROLLER },
  positionRoute: "/api/chain/moonwell/position",
};

const laneVia = (lane?: MoonwellLane): string => `GET ${(lane ?? MOONWELL_ETHEREUM_LANE).positionRoute}`;
const comptrollerOf = (lane?: MoonwellLane) => (lane ?? MOONWELL_ETHEREUM_LANE).comptroller;
const ORACLE = { name: "Moonwell Chainlink Oracle", address: MOONWELL_ADDRESSES.ORACLE };

const mtokenContract = (marketLabel?: string, mtoken?: string) => ({
  name: marketLabel ? `mToken (${marketLabel})` : "mToken",
  address: mtoken ?? "",
});

const recompute = (target: string, method: string): ProvVerify => ({
  kind: "recompute",
  text: `Re-run the ${target}.${method} eth_call against any node`,
});

/** The account's LIVE debt — borrowBalanceStored at head. The stored figure
 *  the Comptroller itself judges the account by; interest accrued since the
 *  market's last accrual tick is not yet in it (accrual is per-timestamp and
 *  settles on every market touch). */
export function moonwellLiveDebtProv(
  sym: string,
  marketLabel?: string,
  mtoken?: string,
  lane?: MoonwellLane,
): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("mToken", "borrowBalanceStored"),
    summary: `${sym} debt the position owes NOW — the mToken's \`borrowBalanceStored\` read at the latest block: the borrower's principal scaled by the market's borrow index, interest accrued to the market's last accrual included. This is the same figure the Comptroller's own liquidity math judges the account by.`,
    contract: mtokenContract(marketLabel, mtoken),
    via: `${laneVia(lane)} · mToken.borrowBalanceStored @ head`,
  };
}

/** The Comptroller's OWN account verdict — getAccountLiquidity: USD liquidity
 *  still unborrowed, or the shortfall past the line (liquidatable NOW). */
export function comptrollerVerdictProv(what: string, lane?: MoonwellLane): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("Comptroller", "getAccountLiquidity"),
    summary: `${what} — the Comptroller's own account verdict (getAccountLiquidity), computed by the risk engine itself over its oracle prices and collateral factors at the latest block: the USD value still borrowable, or — the moment shortfall > 0 — the amount past the liquidation line. The protocol judging its own account, not a client-side reconstruction. Only markets the account has ENTERED count: minting alone does not enter a market, so an un-entered supply backs nothing.`,
    contract: comptrollerOf(lane),
    via: `${laneVia(lane)} · Comptroller.getAccountLiquidity @ head`,
  };
}

/** A capacity aggregate — Σ entered supply × oracle price × collateral factor.
 *  Every input a chain read at the same head, and the sum reproduces the
 *  Comptroller's own liquidity walk EXACTLY (its truncation order included),
 *  so chain-derived. */
export function moonwellCapacityProv(what: string, formula: string, lane?: MoonwellLane): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: recompute("Comptroller", "getAccountLiquidity"),
    summary: `${what} — Σ supply × oracle price × collateral factor over the markets the account has ENTERED (an un-entered supply backs nothing), every input read at the same block. Reproduces the Comptroller's own liquidity walk exactly — verified against its getAccountLiquidity verdict, truncation order included (scripts/verify-moonwell-chain.mjs).`,
    contract: comptrollerOf(lane),
    via: `${laneVia(lane)} · derived aggregate`,
    formula,
    inputs: [
      { label: "supplies", kind: "chain", pclass: "state", note: "balanceOf × exchangeRateStored @ head" },
      { label: "oracle prices", kind: "chain", pclass: "oracle", note: "getUnderlyingPrice @ head" },
      { label: "collateral factors", kind: "chain", pclass: "state", note: "Comptroller.markets @ head" },
    ],
  };
}
