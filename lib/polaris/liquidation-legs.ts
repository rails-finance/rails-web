// The liquidate row's header legs — the pool's seizure and the surplus that
// comes back to the owner — as a pure function of the row, so the header
// (components/protocol/polaris/polaris-event-header.tsx) and the verifier's
// model probe (scripts/verify/verify-polaris-chrome.mjs) read one rule.
//
// Three legs at most, in this order:
//   • Seized   — `_collLiquidated`, pETH, caution tone: the whole collateral
//                the manager took.
//   • Cleared  — `_debtLiquidated`, the market's stable, caution tone: the
//                debt the pool's deposits repaid.
//   • Claimable — `_collSurplus`, pETH, NEUTRAL tone: collateral beyond what
//                the debt needed, set aside for the owner to claim. Positive
//                (it is the owner's), no caution (the seizure carries that),
//                and no spine counterpart (the spine draws the seizure). Drawn
//                only when the surplus is above zero — a liquidation that left
//                nothing over draws two legs, not a "0 Claimable".
// Each leg carries the Liquidation log's own field as its receipt.

import type { ChainTruthDelta } from "@/components/shared/chain-truth-event";
import type { PolarisContext } from "@/lib/shared/types/event-shape";
import { liquidationFieldProv, type PolarisCoords } from "@/lib/polaris/event-provenance";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function polarisLiquidationDeltas(ctx: PolarisContext, coords: PolarisCoords): ChainTruthDelta[] {
  const stable = ctx.stableSymbol;
  const stableAddr = POLARIS_MARKET_CONFIG[ctx.market].stable.address;
  const seized = num(ctx.collLiquidated);
  const cleared = num(ctx.debtLiquidated);
  const surplus = num(ctx.collSurplus);
  const deltas: ChainTruthDelta[] = [];
  if (seized > 0)
    deltas.push({
      value: seized,
      symbol: PETH.symbol,
      address: PETH.address,
      label: "Seized",
      tone: "caution",
      prov: liquidationFieldProv("collLiquidated", coords, ctx.raw?.collLiquidated),
    });
  if (cleared > 0)
    deltas.push({
      value: cleared,
      symbol: stable,
      address: stableAddr,
      label: "Cleared",
      tone: "caution",
      prov: liquidationFieldProv("debtLiquidated", coords, ctx.raw?.debtLiquidated),
    });
  if (surplus > 0)
    deltas.push({
      value: surplus,
      symbol: PETH.symbol,
      address: PETH.address,
      label: "Claimable",
      prov: liquidationFieldProv("collSurplus", coords, ctx.raw?.collSurplus),
      noSpineCounterpart: true,
    });
  return deltas;
}
