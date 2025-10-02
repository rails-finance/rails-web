import { Transaction } from "@/types/api/troveHistory";

interface TimelineBackgroundProps {
  tx: Transaction;
  isFirst: boolean;
  isLast: boolean;
  isExpanded?: boolean;
}

export function TimelineBackground({ tx, isFirst, isLast, isExpanded = false }: TimelineBackgroundProps) {
  // Determine timeline connection logic
  const showTopConnection = !isFirst;
  const showBottomConnection = !isLast;

  // Determine connector color based on operation type
  let connectorColor = "currentColor"; // default
  const isDashed =
    tx.operation === "liquidate" ||
    tx.operation === "redeemCollateral" ||
    tx.operation === "applyPendingDebt" ||
    (tx.operation === "adjustTroveInterestRate" && "isInBatch" in tx && tx.isInBatch);

  if (isDashed) {
    if (tx.operation === "redeemCollateral") {
      connectorColor = "#FB923C"; // orange
    } else if (tx.operation === "liquidate") {
      // Check if it's a beneficial liquidation
      if ("collIncreaseFromRedist" in tx.troveOperation) {
        const { collIncreaseFromRedist } = tx.troveOperation;
        const isBeneficial = tx.stateAfter.debt > 0 && collIncreaseFromRedist > 0;
        connectorColor = isBeneficial ? "#22C55E" : "#EF4444"; // green vs red
      } else {
        connectorColor = "#EF4444"; // default red for liquidation
      }
    } else if (tx.operation === "applyPendingDebt") {
      connectorColor = "#3B82F6"; // blue for batch manager operations
    } else if (tx.operation === "adjustTroveInterestRate" && "isInBatch" in tx && tx.isInBatch) {
      connectorColor = "#8B5CF6"; // purple for delegated operations
    }
  }

  // Handle case where there's only one transaction
  if (!showTopConnection && !showBottomConnection) {
    // Show a fixed-height timeline segment for single transactions
    return (
      <div className="relative h-full">
        <svg width="4" height="32" className="timeline-line">
          <line x1="2" y1="0" x2="2" y2="32" stroke={connectorColor} strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (isDashed) {
    // For dashed lines, render individual dots that fill the space
    const dotSpacing = 8; // Space between dot centers in pixels
    const dotRadius = 1.5; // Radius in pixels

    return (
      <svg width="4" height="100%" className="timeline-line" style={{ overflow: "visible" }}>
        <defs>
          <pattern
            id={`dots-${tx.operation}-${connectorColor.replace("#", "")}`}
            x="0"
            y="0"
            width="4"
            height={dotSpacing}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy={dotSpacing / 2} r={dotRadius} fill={connectorColor} />
          </pattern>
        </defs>
        <line
          x1="2"
          y1={showTopConnection ? "0%" : "0"}
          x2="2"
          y2={showBottomConnection ? "100%" : "16"}
          stroke={`url(#dots-${tx.operation}-${connectorColor.replace("#", "")})`}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const isClosedTrove =
    tx.operation === "closeTrove" || (tx.type === "liquidation" && tx.stateAfter.debt === 0 && !tx.isZombieTrove);

  return (
    <div className="relative h-full">
      <svg width="4" height="100%" viewBox="0 0 4 100" preserveAspectRatio="none" className="timeline-line">
        <line
          x1="2"
          y1={showTopConnection ? "0%" : "0"}
          x2="2"
          y2={showBottomConnection ? "100%" : "16"}
          stroke={connectorColor}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>

      {/* Cover top line for closed troves */}
      {isClosedTrove && (
        <div
          className="absolute top-0 left-0 w-4 h-5 bg-white dark:bg-slate-800"
          style={{ transform: "translateX(-6px)" }}
        />
      )}

      {/* Cover bottom line only for openTrove operations when expanded */}
      {(tx.operation === "openTrove" || tx.operation === "openTroveAndJoinBatch") && isExpanded && (
        <div
          className="absolute bottom-0 left-0 w-4 bg-white dark:bg-slate-800"
          style={{
            transform: "translateX(-6px)",
            height: "calc(100% - 80px)", // Leave space for the transaction graphic
          }}
        />
      )}
    </div>
  );
}
