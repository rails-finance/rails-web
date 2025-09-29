import { OpenSummaryCard } from "./OpenSummaryCard";
import { ClosedSummaryCard } from "./ClosedSummaryCard";
import { LiquidatedSummaryCard } from "./LiquidatedSummaryCard";
import { TroveSummary } from "@/types/api/trove";

interface TroveSummaryCardProps {
  trove: TroveSummary;
  showViewButton?: boolean;
}

export function TroveSummaryCard({ trove, showViewButton = false }: TroveSummaryCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedSummaryCard
      trove={trove}
      showViewButton={showViewButton}
    />;
  }

  if (trove.status === "open") {
    return <OpenSummaryCard trove={trove} showViewButton={showViewButton} />;
  }

  return <ClosedSummaryCard trove={trove} showViewButton={showViewButton} />;
}