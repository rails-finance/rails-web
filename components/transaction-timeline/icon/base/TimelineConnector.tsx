import { Transaction, TroveLiquidationTransaction } from "@/types/api/troveHistory";

interface TimelineConnectorProps {
  type: "top" | "bottom";
  show: boolean;
  operation?: string;
  isMultiStep?: boolean;
  tx?: Transaction;
}

export function TimelineConnector({ type, show, operation = "", isMultiStep = false, tx }: TimelineConnectorProps) {
  if (!show) return null;

  // Determine connector style based on operation
  const isDelegatedInterestRateAdjust =
    operation === "adjustTroveInterestRate" && tx && "isInBatch" in tx && tx.isInBatch;
  const isBatchManagerOperation =
    operation === "setBatchManagerAnnualInterestRate" ||
    operation === "lowerBatchManagerAnnualFee";
  const isDashed =
    operation === "liquidate" ||
    operation === "redeemCollateral" ||
    operation === "applyPendingDebt" ||
    isDelegatedInterestRateAdjust ||
    isBatchManagerOperation;

  let connectorColor = "#45556C"; // default

  if (isDashed) {
    if (operation === "redeemCollateral") {
      connectorColor = "#FB923C";
    } else if (operation === "liquidate") {
      // Check if it's a beneficial liquidation
      if (tx) {
        const liquidationTx = tx as TroveLiquidationTransaction;
        const { collIncreaseFromRedist } = liquidationTx.troveOperation || {};
        const isBeneficialLiquidation = liquidationTx.stateAfter.debt > 0 && collIncreaseFromRedist > 0;
        connectorColor = isBeneficialLiquidation ? "#22C55E" : "#EF4444"; // green vs red
      } else {
        connectorColor = "#EF4444"; // default red for liquidation
      }
    } else if (operation === "applyPendingDebt") {
      connectorColor = "#3B82F6"; // blue for batch manager operations
    } else if (isDelegatedInterestRateAdjust) {
      connectorColor = "#8B5CF6"; // purple for delegated operations
    } else if (isBatchManagerOperation) {
      connectorColor = "#64748B"; // slate for batch manager rate changes
    }
  }

  const strokeDasharray = isDashed ? "1,8" : "none";
  const strokeWidth = 3;
  const strokeLinecap = isDashed ? "round" : "butt";

  if (type === "top") {
    return (
      <svg className="timeline-connector" width="4" height="16" viewBox="0 0 4 16" style={{ top: 0 }}>
        <line
          x1="2"
          y1="0"
          x2="2"
          y2="16"
          stroke={connectorColor}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          strokeDasharray={strokeDasharray}
        />
      </svg>
    );
  }

  // Bottom connector
  return (
    <svg
      className="timeline-connector"
      width="4"
      height="100%"
      style={{
        transform: "translateX(-50%)",
        top: isDashed ? "56px" : isMultiStep ? "94px" : "56px", // Adjusted for new top connector height
        bottom: 0,
      }}
    >
      <line
        x1="2"
        y1="0"
        x2="2"
        y2="100%"
        stroke={connectorColor}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeDasharray={strokeDasharray}
      />
    </svg>
  );
}
