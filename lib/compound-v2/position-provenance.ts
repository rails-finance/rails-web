// Provenance vocabulary for the Compound V2 live position reads — the risk
// surfaces' sources (/api/chain/compound-v2/position). Compound V2 cross-
// collateralises its twenty listed markets through one Comptroller, so the
// vocabulary names three kinds of source:
//
//   • STATE — a live eth_call at the latest block: per-market against the
//     cToken (balanceOf / borrowBalanceStored / exchangeRateStored / the
//     per-block rates), or against the Comptroller (getAssetsIn, markets'
//     collateral factors, closeFactor, liquidationIncentive).
//   • VERDICT — the Comptroller's OWN account judgement (getAccountLiquidity),
//     which returns the tuple (error, liquidity, shortfall) — NOT a boolean:
//     liquidity still unborrowed, or shortfall past the line (liquidatable
//     the moment shortfall > 0). Chain-direct, stronger than any client
//     arithmetic.
//   • REPLICA — the HF-style ratio (CF-weighted capacity ÷ debt) and its
//     aggregates: client arithmetic over the same chain reads, MIRRORING the
//     Comptroller's hypothetical-liquidity walk but not proven against its
//     truncation order (unlike Moonwell's, no verification script backs it
//     yet). The verdict above is the authoritative judgement; the replica is
//     labeled a replica everywhere it renders.
//
// Prices are the Comptroller's own oracle (getUnderlyingPrice — the same read
// its liquidity math prices with), USD; three markets carry a stored constant
// with NO feed behind it, and the per-market vocabulary says which. Two V2
// particulars the vocabulary must carry: supplying alone does NOT enter a
// market (an un-entered supply backs nothing), and a ZERO collateral factor
// means the market is DISABLED as collateral, not parameterised at 0%.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { COMPOUND_V2_ADDRESSES } from "./asset-catalog";

const LANE_VIA = "GET /api/chain/compound-v2/position";

const COMPTROLLER = { name: "Comptroller", address: COMPOUND_V2_ADDRESSES.COMPTROLLER };
const ORACLE = { name: "Compound Open Price Feed (Comptroller oracle)", address: "" };

const ctokenContract = (marketLabel?: string, ctoken?: string) => ({
  name: marketLabel ? `cToken (${marketLabel})` : "cToken",
  address: ctoken ?? "",
});

const recompute = (target: string, method: string): ProvVerify => ({
  kind: "recompute",
  text: `Re-run the ${target}.${method} eth_call against any node`,
});

/** The account's LIVE debt — borrowBalanceStored at head. The stored figure
 *  the Comptroller itself judges the account by; interest accrued since the
 *  market's last accrual block is not yet in it (accrual is per-block and
 *  settles on every market touch). */
export function compoundV2LiveDebtProv(sym: string, marketLabel?: string, ctoken?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("cToken", "borrowBalanceStored"),
    summary: `${sym} debt the position owes NOW — the cToken's \`borrowBalanceStored\` read at the latest block: the borrower's principal scaled by the market's borrow index, interest accrued to the market's last accrual included. This is the same figure the Comptroller's own liquidity math judges the account by.`,
    contract: ctokenContract(marketLabel, ctoken),
    via: `${LANE_VIA} · cToken.borrowBalanceStored @ head`,
  };
}

/** The Comptroller's OWN account verdict — getAccountLiquidity: the
 *  (error, liquidity, shortfall) tuple. The chain fact the risk surfaces
 *  lead with. */
export function comptrollerVerdictProv(what: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("Comptroller", "getAccountLiquidity"),
    summary: `${what} — the Comptroller's own account verdict (getAccountLiquidity), computed by the risk engine itself over its oracle prices and collateral factors at the latest block. The contract exposes a tuple, not a boolean: the USD value still borrowable (liquidity), or — the moment shortfall > 0 — the amount past the liquidation line. The protocol judging its own account, not a client-side reconstruction. Only markets the account has ENTERED count: supplying alone does not enter a market, so an un-entered supply backs nothing.`,
    contract: COMPTROLLER,
    via: `${LANE_VIA} · Comptroller.getAccountLiquidity @ head`,
  };
}

/** A capacity aggregate — Σ entered supply × oracle price × collateral factor.
 *  Every input a chain read at the same head; the sum MIRRORS the
 *  Comptroller's hypothetical-liquidity walk but is client arithmetic — a
 *  replica, with the verdict read beside it. */
export function compoundV2CapacityProv(what: string, formula: string): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: recompute("Comptroller", "getAccountLiquidity"),
    summary: `${what} — Σ supply × oracle price × collateral factor over the markets the account has ENTERED (an un-entered supply backs nothing; a zero collateral factor means the market is disabled as collateral and contributes nothing), every input read at the same block. This mirrors the Comptroller's own liquidity walk as client arithmetic — a REPLICA: the authoritative judgement is the getAccountLiquidity verdict read beside it.`,
    contract: COMPTROLLER,
    via: `${LANE_VIA} · derived aggregate (replica)`,
    formula,
    inputs: [
      { label: "supplies", kind: "chain", pclass: "state", note: "balanceOf × exchangeRateStored @ head" },
      { label: "oracle prices", kind: "chain", pclass: "oracle", note: "getUnderlyingPrice @ head" },
      { label: "collateral factors", kind: "chain", pclass: "state", note: "Comptroller.markets @ head" },
    ],
  };
}
