import { OpenSummaryCard } from "./OpenSummaryCard";
import { ClosedSummaryCard } from "./ClosedSummaryCard";
import { LiquidatedSummaryCard } from "./LiquidatedSummaryCard";
import { TroveSummary } from "@/types/api/trove";
import type { Transaction } from "@/types/api/troveHistory";
import { TroveStateData } from "@/types/api/troveState";
import { OraclePricesData } from "@/types/api/oracle";

interface TroveSummaryCardProps {
  trove: TroveSummary;
  liveState?: TroveStateData;
  prices?: OraclePricesData;
  loadingStatus?: {
    message: string | null;
    snapshotDate?: number;
  };
}

export function TroveSummaryCard({ trove, liveState, prices, loadingStatus }: TroveSummaryCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedSummaryCard trove={trove} />;
  }

  if (trove.status === "open") {
    return <OpenSummaryCard trove={trove} liveState={liveState} prices={prices} loadingStatus={loadingStatus} />;
  }

  return <ClosedSummaryCard trove={trove} />;
}
