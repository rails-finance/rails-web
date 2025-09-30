"use client";

import { TroveSummary } from "@/types/api/trove";
import { OpenListingCard } from "./OpenListingCard";
import { ClosedListingCard } from "./CloseListingCard";
import { LiquidatedListingCard } from "./LiquidatedListingCard";

interface TroveListingCardProps {
  trove: TroveSummary;
  collateralAtLiquidation?: number;
}

export function TroveListingCard({ trove, collateralAtLiquidation }: TroveListingCardProps) {
  if (trove.status === "liquidated") {
    return (
      <LiquidatedListingCard trove={trove} collateralAtLiquidation={collateralAtLiquidation} />
    );
  }

  if (trove.status === "open") {
    return <OpenListingCard trove={trove} />;
  }

  return <ClosedListingCard trove={trove} />;
}
