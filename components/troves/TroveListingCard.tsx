"use client";

import { TroveSummary } from "@/types/api/trove";
import { OpenListingCard } from "./OpenListingCard";
import { ClosedListingCard } from "./CloseListingCard";
import { LiquidatedListingCard } from "./LiquidatedListingCard";

interface TroveListingCardProps {
  trove: TroveSummary;
}

export function TroveListingCard({ trove }: TroveListingCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedListingCard trove={trove} />;
  }

  if (trove.status === "open") {
    return <OpenListingCard trove={trove} />;
  }

  return <ClosedListingCard trove={trove} />;
}
