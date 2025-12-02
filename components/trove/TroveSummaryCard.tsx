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
  summaryExplanationOpen?: boolean;
  onToggleSummaryExplanation?: (isOpen: boolean) => void;
}

export function TroveSummaryCard({
  trove,
  liveState,
  prices,
  loadingStatus,
  summaryExplanationOpen,
  onToggleSummaryExplanation,
}: TroveSummaryCardProps) {
  if (trove.status === "liquidated") {
    return (
      <LiquidatedSummaryCard
        trove={trove}
        summaryExplanationOpen={summaryExplanationOpen}
        onToggleSummaryExplanation={onToggleSummaryExplanation}
      />
    );
  }

  if (trove.status === "open") {
    return (
      <OpenSummaryCard
        trove={trove}
        liveState={liveState}
        prices={prices}
        loadingStatus={loadingStatus}
        summaryExplanationOpen={summaryExplanationOpen}
        onToggleSummaryExplanation={onToggleSummaryExplanation}
      />
    );
  }

  return (
    <ClosedSummaryCard
      trove={trove}
      summaryExplanationOpen={summaryExplanationOpen}
      onToggleSummaryExplanation={onToggleSummaryExplanation}
    />
  );
}
