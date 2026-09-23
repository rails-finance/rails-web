// Provenance vocabulary for the Compound V3 live position reads — the risk
// surfaces' sources (/api/chain/compound/position). Comet has no aggregate
// account getter, so the vocabulary names three kinds of source:
//
//   • STATE — a live eth_call against the market's Comet proxy at the latest
//     block (balanceOf / borrowBalanceOf / collateralBalanceOf / getAssetInfo /
//     getUtilization / the rate curve).
//   • VERDICT — the contract's OWN account judgement (isBorrowCollateralized /
//     isLiquidatable), computed BY Comet's liquidation engine — chain-direct,
//     stronger than any client arithmetic.
//   • DERIVED AGGREGATE — Σ collateral × price × factor (borrow / liquidation
//     capacity) and the health factor, arithmetic over those same chain reads
//     that mirrors Comet's own account math (verified against the verdicts by
//     scripts/verify-compound-v3-chain.mjs) — chain-derived.
//
// Prices are the market's own oracle (getPrice on each asset's configured
// feed) and quote in the market's base unit — USD for cUSDCv3/cUSDTv3, ETH for
// cWETHv3 — never assumed USD.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";
import type { CompoundCoords } from "@/lib/compound/event-provenance";

const LANE_VIA = "GET /api/chain/compound/position";

const cometContract = (coords?: CompoundCoords) => ({
  name: coords?.marketLabel ? `Comet (${coords.marketLabel})` : "Comet",
  address: coords?.comet ?? "0x0000000000000000000000000000000000000000",
});

const stateVerify = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `Re-run the Comet.${method} eth_call against any node`,
});

/** The contract's OWN account verdict — isBorrowCollateralized / isLiquidatable,
 *  computed by Comet's liquidation engine over its configured feeds and factors.
 *  Chain-direct: the protocol judging its own account, not our arithmetic. */
export function contractVerdictProv(what: string, method: string, coords?: CompoundCoords): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: stateVerify(method),
    summary: `${what} — the Comet contract's own verdict (${method}), computed by its liquidation engine over its configured price feeds and collateral factors at the latest block. The protocol judging its own account, not a client-side reconstruction.`,
    contract: cometContract(coords),
    via: `${LANE_VIA} · Comet.${method} @ head`,
  };
}

/** A capacity aggregate — Σ collateral × oracle price × factor across the held
 *  assets. Every input is a Comet read at the same head, and the sum mirrors the
 *  contract's own account math (verified against its verdicts), so chain-derived. */
export function capacityProv(what: string, formula: string, coords?: CompoundCoords): Provenance {
  return {
    kind: "chain-derived",
    pclass: "state",
    verify: stateVerify("collateralBalanceOf / getPrice / getAssetInfo"),
    summary: `${what} — Σ collateral × oracle price × factor over the account's held assets, every input read from the market's Comet contract at the same block. Mirrors the contract's own account math (checked against its isBorrowCollateralized / isLiquidatable verdicts).`,
    contract: cometContract(coords),
    via: `${LANE_VIA} · derived aggregate`,
    formula,
    inputs: [
      { label: "collateral balances", kind: "chain", pclass: "state", note: "collateralBalanceOf @ head" },
      { label: "oracle prices", kind: "chain", pclass: "oracle", note: "getPrice @ head" },
      { label: "collateral factors", kind: "chain", pclass: "state", note: "getAssetInfo @ head" },
    ],
  };
}
