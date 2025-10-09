import { OpenSummaryCard } from "./OpenSummaryCard";
import { ClosedSummaryCard } from "./ClosedSummaryCard";
import { LiquidatedSummaryCard } from "./LiquidatedSummaryCard";
import { TroveSummary } from "@/types/api/trove";
import type { Transaction } from "@/types/api/troveHistory";

interface TroveSummaryCardProps {
  trove: TroveSummary;
  timeline?: Transaction[];
}

export function TroveSummaryCard({ trove, timeline }: TroveSummaryCardProps) {
  if (trove.status === "liquidated") {
    return <LiquidatedSummaryCard trove={trove} />;
  }

  if (trove.status === "open") {
    return <OpenSummaryCard trove={trove} timeline={timeline} />;
  }

  return <ClosedSummaryCard trove={trove} />;
}
