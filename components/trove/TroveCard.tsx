import { OpenTroveCard } from "./OpenTroveCard";
import { ClosedTroveCard } from "./ClosedTroveCard";
import { LiquidatedTroveCard } from "./LiquidatedTroveCard";
import { TroveData } from "@/types/api/trove";

interface TroveCardProps {
  trove: TroveData;
  showViewButton?: boolean;
  collateralAtLiquidation?: number;
}

export function TroveCard({ trove, showViewButton = false, collateralAtLiquidation }: TroveCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedTroveCard 
      trove={trove} 
      showViewButton={showViewButton} 
      collateralAtLiquidation={collateralAtLiquidation}
    />;
  }

  if (trove.status === "open") {
    return <OpenTroveCard trove={trove} showViewButton={showViewButton} />;
  }

  return <ClosedTroveCard trove={trove} showViewButton={showViewButton} />;
}
