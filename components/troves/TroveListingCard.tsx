"use client";

import { TroveSummary } from "@/types/api/trove";
import { OpenListingCard } from "./OpenListingCard";
import { ClosedListingCard } from "./CloseListingCard";
import { LiquidatedListingCard } from "./LiquidatedListingCard";
import { OraclePricesData } from "@/types/api/oracle";

interface TroveListingCardProps {
  trove: TroveSummary;
  prices?: OraclePricesData | null;
}

export function TroveListingCard({ trove, prices }: TroveListingCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedListingCard trove={trove} />;
  }

  if (trove.status === "open") {
    return <OpenListingCard trove={trove} prices={prices} />;
  }

  return <ClosedListingCard trove={trove} />;
}
