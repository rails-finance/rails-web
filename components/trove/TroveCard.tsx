import { OpenTroveCard } from "./OpenTroveCard";
import { ClosedTroveCard } from "./ClosedTroveCard";
import { LiquidatedTroveCard } from "./LiquidatedTroveCard";
import { TroveSummary } from "@/types/api/trove";

interface TroveCardProps {
  trove: TroveSummary;
  showViewButton?: boolean;
}

export function TroveCard({ trove, showViewButton = false }: TroveCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedTroveCard 
      trove={trove} 
      showViewButton={showViewButton}
    />;
  }

  if (trove.status === "open") {
    return <OpenTroveCard trove={trove} showViewButton={showViewButton} />;
  }

  return <ClosedTroveCard trove={trove} showViewButton={showViewButton} />;
}
