import { OpenSummaryCard } from "./OpenSummaryCard";
import { ClosedSummaryCard } from "./ClosedSummaryCard";
import { LiquidatedSummaryCard } from "./LiquidatedSummaryCard";
import { TroveSummary } from "@/types/api/trove";

export function TroveSummaryCard({ trove }: { trove: TroveSummary }) {
  if (trove.status === "liquidated") {
    return <LiquidatedSummaryCard trove={trove} />;
  }

  if (trove.status === "open") {
    return <OpenSummaryCard trove={trove} />;
  }

  return <ClosedSummaryCard trove={trove} />;
}
