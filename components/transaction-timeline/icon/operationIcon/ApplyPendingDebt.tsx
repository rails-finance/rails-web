import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { IconWrapper } from "../base/IconWrapper";
import { RedistributionIcon } from "../symbols/RedistributionIcon";
import { ApplyDebtIcon } from "../symbols/ApplyDebtIcon";
import { TimelineBackground } from "../TimelineBackground";


interface ApplyPendingDebtIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function ApplyPendingDebtIcon({ tx, isFirst = false, isLast = false, isExpanded = false }: ApplyPendingDebtIconProps) {
  // Only trove, liquidation, and redemption transactions have troveOperation
  if (!isTroveTransaction(tx) && tx.type !== "liquidation" && tx.type !== "redemption") {
    return null;
  }

  const { debtIncreaseFromRedist, collIncreaseFromRedist, debtChangeFromOperation } = tx.troveOperation;

  const hasRedistribution = debtIncreaseFromRedist > 0 || collIncreaseFromRedist > 0;
  const hasInterest = debtChangeFromOperation > 0;

  // For simplicity, just show the most relevant icon in a single step
  // Priority: redistribution > interest > fallback
  let iconContent = <RedistributionIcon />;
  
  if (hasRedistribution) {
    iconContent = <RedistributionIcon />;
  } else if (hasInterest) {
    iconContent = <ApplyDebtIcon />;
  }

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
          {iconContent}
      </div>
    </>
  );
}
