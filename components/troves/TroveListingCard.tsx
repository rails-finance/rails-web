"use client";

import { TroveSummary } from "@/types/api/trove";
import { OpenListingCard } from "./OpenListingCard";
import { ClosedListingCard } from "./CloseListingCard";
import { LiquidatedListingCard } from "./LiquidatedListingCard";

interface TroveListingCardProps {
  trove: TroveSummary;
  showViewButton?: boolean;
  collateralAtLiquidation?: number;
  hideLabels?: boolean;
}

export function TroveListingCard({ trove, showViewButton = false, collateralAtLiquidation, hideLabels = false }: TroveListingCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedListingCard
      trove={trove}
      showViewButton={showViewButton}
      collateralAtLiquidation={collateralAtLiquidation}
      hideLabels={hideLabels}
    />;
  }

  if (trove.status === "open") {
    return <OpenListingCard trove={trove} showViewButton={showViewButton} hideLabels={hideLabels} />;
  }

  return <ClosedListingCard trove={trove} showViewButton={showViewButton} hideLabels={hideLabels} />;
}