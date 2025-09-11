import { Transaction } from "@/types/api/troveHistory";
import { TransferTroveIcon as TransferTroveSymbol } from "../symbols/TransferTroveIcon";
import { TimelineBackground } from "../TimelineBackground";


interface TransferTroveIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function TransferTroveIcon({ tx, isFirst = false, isLast = false, isExpanded = false }: TransferTroveIconProps) {
  return (
    <>
      {/* Timeline Background - extends full height of transaction row */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full z-10 pointer-events-none">
        <TimelineBackground 
          tx={tx} 
          isFirst={isFirst} 
          isLast={isLast} 
          isExpanded={isExpanded} 
        />
      </div>
      
      {/* Transaction Graphic */}
      <div className="relative z-20 w-30 h-25 flex items-center justify-center sm:w-25">
          <TransferTroveSymbol />
      </div>
    </>
  );
}
