import { TransactionTimeline as TimelineData } from "@/types/api/troveHistory";
import { TransactionItem } from "./item";

interface TransactionTimelineProps {
  timeline: TimelineData;
}

export function TransactionTimeline({ timeline }: TransactionTimelineProps) {
  console.log("TransactionTimeline received:", timeline);
  const txLength = timeline.transactions.length;
  console.log("Transaction count:", txLength);

  if (txLength === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <p className="text-slate-400 text-center">No transactions found</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Transaction items */}
      <div className="space-y-0">
        {timeline.transactions.map((tx, index) => {
          console.log(`Rendering transaction ${index}:`, tx);
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
