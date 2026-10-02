// Provenance vocabulary for the Dolomite live position reads — the risk
// surfaces' sources (/api/chain/dolomite/position). One core contract judges
// every account, and the vocabulary names three kinds of source:
//
//   • STATE — a live eth_call at the latest block against the core:
//     getAccountBalances (par + wei per market — the wei is par × the CURRENT
//     index, which accrues on read), getAccountValues /
//     getAdjustedAccountValues (the core's own USD aggregation at 1e36),
//     getMarginRatio / getLiquidationSpread / the per-market getters, and
//     ⚠️ getAccountRiskOverrideByAccount — the carve-out read.
//   • VERDICT INPUTS — the adjusted values ARE the protocol's own risk math:
//     premiums applied multiplicatively BY THE CORE (supply ÷ (1+premium),
//     borrow × (1+premium)), or skipped entirely when the account carries the
//     override. The threshold is the core's own getMarginRatioForAccount.
//   • RATIO — collateralization = adjustedSupply ÷ adjustedBorrow: one
//     division over the core's own two getters. The inputs are the protocol's
//     own; the division is ours, and the receipts say exactly that.
//
// Both of this explorer's lanes are `state`-class — unusual on this roster —
// and the verify texts say so.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import { DOLOMITE_ADDRESSES } from "./asset-catalog";

const LANE_VIA = "GET /api/chain/dolomite/position";

const MARGIN = { name: "DolomiteMargin", address: DOLOMITE_ADDRESSES.MARGIN };

const recompute = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `Re-run the DolomiteMargin.${method} eth_call against any node`,
});

/** The account's effective margin ratio — the core's own choice of
 *  override-else-global (getMarginRatioForAccount). */
export function dolomiteRequirementProv(): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("getMarginRatioForAccount"),
    summary:
      "The minimum collateralisation this account must keep — 1 + the core's own `getMarginRatioForAccount`, which answers the account's risk override when one is set and the global `getMarginRatio` otherwise. The protocol stating its own line for exactly this account; adjusted supply ÷ adjusted borrow below it is liquidatable.",
    contract: MARGIN,
    via: `${LANE_VIA} · 1 + getMarginRatioForAccount @ head`,
  };
}

/** collateralization = adjustedSupply ÷ adjustedBorrow — one division over
 *  the core's own two getters. */
export function dolomiteCollateralizationProv(): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: {
      kind: "recompute",
      text: "Re-run the DolomiteMargin.getAdjustedAccountValues eth_call and divide supply by borrow — both legs are the core's own figures; only the division is arithmetic.",
    },
    summary:
      "This account's collateralisation — the core's own adjusted supply value ÷ its own adjusted borrow value, read in one call at the same block. Both legs are the protocol's own risk math (premiums applied by the core, or skipped under the override); the division is client arithmetic over them, graded state because every input is a same-block slot read. The line it is judged against is the core's own getMarginRatioForAccount, rendered beside it.",
    contract: MARGIN,
    via: `${LANE_VIA} · adjusted supply ÷ adjusted borrow (both getAdjustedAccountValues legs)`,
    formula: "adjusted supply ÷ adjusted borrow",
    inputs: [
      { label: "adjusted supply", kind: "chain", pclass: "state", note: "getAdjustedAccountValues @ head" },
      { label: "adjusted borrow", kind: "chain", pclass: "state", note: "getAdjustedAccountValues @ head" },
    ],
  };
}
