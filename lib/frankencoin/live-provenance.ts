// Provenance vocabulary for the Frankencoin live position reads — the chain
// overlay's sources (/api/chain/frankencoin/position). A position is its own
// contract, so every lane here is an eth_call against THE POSITION ITSELF at
// the latest block — `state`-class throughout:
//
//   • STATE — minted(), the collateral token's balanceOf(position), price()
//     (the owner-declared liquidation price), annualInterestPPM() /
//     riskPremiumPPM() / reserveContribution(), start() / expiration() /
//     cooldown(), challengedAmount() / challengePeriod(), isClosed(),
//     original(), owner().
//   • DERIVED — arithmetic over those slots (the reserve held back, the
//     minting ceiling the declared price implies, countdowns against the
//     clock), graded chain-derived with the formula stated.
//
// There is NO oracle lane and NO USD lane — Frankencoin is oracle-free, risk
// is challenge status + the owner-declared price + expiry + cooldown, and no
// health factor is synthesized.

import type { Provenance, ProvVerify } from "@/components/shared/provenance";

const LANE_VIA = "GET /api/chain/frankencoin/position";

const positionContract = (position?: string) => ({ name: "Frankencoin Position", address: position });

const recompute = (method: string): ProvVerify => ({
  kind: "recompute",
  text: `Re-run the position's ${method} eth_call against any node`,
});

/** ZCHF minted — the live minted() slot. */
export function liveMintedProv(position?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("minted()"),
    summary:
      "ZCHF this position has minted NOW — the position's own minted() slot at the latest block. This is the debt owed to the system, in native ZCHF (Frankencoin runs no oracle; nothing here is a dollar). Repaying it (less the reserve contribution already held back) is what closes the position.",
    contract: positionContract(position),
    via: `${LANE_VIA} · minted() @ head`,
  };
}

/** Collateral balance — the token's balanceOf(position) at head. */
export function liveCollateralProv(sym: string, position?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("collateral token balanceOf(position)"),
    summary: `${sym} this position holds NOW — the collateral token's balanceOf(position) at the latest block. The position contract itself custodies the collateral; MintingUpdate's emitted collateral figure equals exactly this read at its block.`,
    contract: positionContract(position),
    via: `${LANE_VIA} · collateral().balanceOf(position) @ head`,
  };
}

/** The owner-declared liquidation price — price() scaled per-token. */
export function liveLiqPriceProv(sym: string, decimals: number, position?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("price()"),
    summary: `The liquidation price, ZCHF per ${sym} — the position's own price() slot at the latest block, divided by its on-chain scale of 1e(36 − ${decimals} collateral decimals). ⚠️ OWNER-DECLARED, not an oracle: Frankencoin has no price feed, and this figure is enforced socially — anyone who thinks it too high can start a challenge auction against it. Raising it triggers a 3-day minting cooldown.`,
    contract: positionContract(position),
    via: `${LANE_VIA} · price() @ head ÷ 1e${36 - decimals}`,
  };
}

/** annualInterestPPM — the position's fixed annual interest rate. */
export function liveInterestProv(hub: "v1" | "v2", position?: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    verify: recompute("annualInterestPPM()"),
    summary: `This position's annual interest rate — its own annualInterestPPM() at the latest block (parts-per-million ÷ 10,000 = percent). Frankencoin charges interest UP FRONT at minting time, not as an ongoing accrual: each mint deducts the fee for the remaining term, so no interest lane ever grows on this page. ${
      hub === "v2"
        ? "On V2 the rate is the system Leadrate plus this position's fixed riskPremiumPPM — the premium is set at open; the Leadrate part moves by governance."
        : "On V1 the rate was fixed at the position's opening."
    }`,
    contract: positionContract(position),
    via: `${LANE_VIA} · annualInterestPPM() @ head`,
  };
}
