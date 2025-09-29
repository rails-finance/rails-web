"use client";

import { TroveSummary } from "@/types/api/trove";
import { OpenListingCard } from "./OpenListingCard";
import { ClosedListingCard } from "./CloseListingCard";
import { LiquidatedListingCard } from "./LiquidatedListingCard";

interface TroveListingCardProps {
  trove: TroveSummary;
  collateralAtLiquidation?: number;
  hideLabels?: boolean;
}

export function TroveListingCard({ trove, collateralAtLiquidation, hideLabels = false }: TroveListingCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedListingCard
      trove={trove}
      collateralAtLiquidation={collateralAtLiquidation}
      hideLabels={hideLabels}
    />;
  }

  if (trove.status === "open") {
    return <OpenListingCard trove={trove} hideLabels={hideLabels} />;
  }

  return <ClosedListingCard trove={trove} hideLabels={hideLabels} />;
}