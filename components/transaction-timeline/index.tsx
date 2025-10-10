import { TransactionTimeline as TimelineData } from "@/types/api/troveHistory";
import { TransactionItem } from "./item";

interface TransactionTimelineProps {
  timeline: TimelineData;
}

export function TransactionTimeline({ timeline }: TransactionTimelineProps) {
  const txLength = timeline.transactions.length;

  if (txLength === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <p className="text-slate-400 text-center">No transactions found</p>
      </div>
    );
  }

  // Get the most recent transaction (first in the array) to check if trove is active
  const mostRecentTx = timeline.transactions[0];
  const isActive = !(
    mostRecentTx.operation === "closeTrove" ||
    (mostRecentTx.type === "liquidation" && mostRecentTx.stateAfter.debt === 0 && !mostRecentTx.isZombieTrove)
  );

  return (
    <div className="relative">
      {/* Active trove indicator row */}
      {isActive && (
        <div className="flex items-center">
          {/* Empty div to mimic hidden value columns on desktop */}
          <div className="hidden sm:flex w-24 shrink-0"></div>

          {/* Timeline position with pulsing dot */}
          <div className="w-20 h-4 shrink-0 flex justify-center items-center relative">
            <span className="flex size-2 transform translate-y-1 z-10">
              <span className="relative inline-flex size-2 animate-ping rounded-full bg-green-700"></span>
              <span className="absolute inline-flex size-2 rounded-full bg-green-500"></span>
            </span>
          </div>

          {/* Empty div to mimic right value columns on desktop */}
          <div className="hidden md:flex flex-1"></div>
        </div>
      )}

      {/* Transaction items */}
      <div className="space-y-0">
        {timeline.transactions.map((tx, index) => {
          return (
            <TransactionItem
              key={tx.id}
              tx={tx}
              isFirst={index === 0}
              isLast={index === txLength - 1}
              txIndex={txLength - index}
            />
          );
        })}
      </div>
    </div>
  );
}
