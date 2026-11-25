"use client";

// One Fluid vault position on Base as the wallet view lists it (W3; rails-ops
// decision 0073): Collateral and Debt in each side's unit, from the explorer's
// wallet read (positionsByUser) at its head block, each with its receipt. The
// pair and the position id are the tag, as on the position card. The read
// states no ratio, rate or dollars; the position's page reads them.

import { PositionCard, type PositionCardHead } from "@/components/shared/position-card";
import { ListingTag } from "@/components/shared/listing-tag";
import { AssetAmount } from "@/components/shared/asset-amount";
import { Prov } from "@/components/shared/provenance";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { exact, legDecimals, legUnit } from "@/lib/fluid-base/position";
import { fluidBaseRowProv } from "@/lib/fluid-base/provenance";
import type { FluidBasePositionsRead } from "@/lib/fluid-base/types";

/** `read`: the wallet read holding this position alone. */
export function FluidBaseWalletCard({ read }: { read: FluidBasePositionsRead }) {
  const p = read.positions[0];
  if (!p) return null;
  const side = (key: "collateral" | "debt"): PositionCardHead => {
    const supply = key === "collateral";
    const leg = supply ? p.supplyLeg : p.borrowLeg;
    const raw = BigInt(supply ? p.supply : p.borrow);
    const x = exact(raw, legDecimals(leg));
    return {
      id: key,
      label: supply ? CARD_VOCAB.collateral : CARD_VOCAB.debt,
      tier: "amount",
      value:
        raw > BigInt(0) ? (
          <Prov info={fluidBaseRowProv(key, p, read)}>
            <AssetAmount value={Number(x)} symbol={legUnit(leg)} exact={x} />
          </Prov>
        ) : null,
    };
  };
  const pair = `${legUnit(p.supplyLeg)} / ${legUnit(p.borrowLeg)}`;
  return (
    <div data-position-card={`fluid-base:${p.id}`} data-vault={p.vault}>
      <PositionCard
        slots={{
          surface: "listing",
          status: p.isLiquidated ? { word: "Liquidated", tone: "danger" } : null,
          heads: [side("collateral"), side("debt")],
          tag: <ListingTag market={pair} id={p.id} />,
          counters: null,
          menu: null,
        }}
      />
    </div>
  );
}
