import { Transaction } from "@/types/api/troveHistory";
import { IconWrapper } from "../base/IconWrapper";
import { PercentIncreaseIcon } from "../symbols/PercentIncreaseIcon";
import { PercentDecreaseIcon } from "../symbols/PercentDecreaseIcon";
import { TimelineBackground } from "../TimelineBackground";

interface InterestRateAdjustIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
  isDelegate?: boolean;
}

export function InterestRateAdjustIcon({
  tx,
  isFirst = false,
  isLast = false,
  isExpanded = false,
  isDelegate = false,
}: InterestRateAdjustIconProps) {
  const rateAfter = tx.stateAfter.annualInterestRate;
  const rateBefore = tx.stateBefore?.annualInterestRate;
  const isIncrease = (rateBefore && rateAfter > rateBefore) || false;
  const isDelegated = "isInBatch" in tx && tx.isInBatch;

  // For now, delegate icons are duplicates of individual icons
  // TODO: Create separate delegate-specific icons
  const iconContent = isDelegate ? (
    isIncrease ? (
      <PercentIncreaseIcon />
    ) : (
      <PercentDecreaseIcon />
    ) // Delegate icons (duplicates for now)
  ) : isIncrease ? (
    <PercentIncreaseIcon />
  ) : (
    <PercentDecreaseIcon />
  ); // Individual icons

  return (
    <>
      {/* Timeline Background - extends full height of transaction row */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full z-10 pointer-events-none">
        <TimelineBackground tx={tx} isFirst={isFirst} isLast={isLast} isExpanded={isExpanded} />
      </div>

      {/* Transaction Graphic */}
      <div className="relative z-20 w-30 h-25 flex items-center justify-center sm:w-25">
        {isDelegated ? (
          // Delegated operations don't have outer circle
          <div className="transaction-single" style={{ position: "relative", zIndex: 1 }}>
            <div className="transaction-step step-single">
              <IconWrapper>{iconContent}</IconWrapper>
            </div>
          </div>
        ) : (
          // Regular operations have outer circle
          <IconWrapper>{iconContent}</IconWrapper>
        )}
      </div>
    </>
  );
}
