"use client";

import { useState } from "react";
import { Transaction, isBatchManagerOperation } from "@/types/api/troveHistory";
import { TransactionIcon } from "../icon";
import { LeftValueDisplay } from "../value-display/components/LeftValueDisplay";
import { RightValueDisplay } from "../value-display/components/RightValueDisplay";
import { TransactionItemHeader } from "../header";
import { TransactionContainer } from "./components/TransactionContainer";
import { TransactionContent } from "./components/TransactionContent";
import { TransactionFooter } from "./components/TransactionFooter";
import { ExpandedContent } from "./components/ExpandedContent";
import { HoverProvider } from "../context/HoverContext";
import { EventExplanation } from "../explanation/EventExplanation";
import { TimelineBackground } from "../icon/TimelineBackground";

interface TransactionItemProps {
  tx: Transaction;
  isFirst: boolean;
  isLast: boolean;
  txIndex: number;
}

export function TransactionItem({ tx, isFirst, isLast, txIndex }: TransactionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const isBatchManager = isBatchManagerOperation(tx);

  // Batch manager transactions don't expand - they only show rate changes
  const toggleExpanded = () => {
    if (!isBatchManager) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <HoverProvider>
      <div style={{ position: "relative" }}>
        <TransactionContainer className="flex w-full" style={{ position: "relative", zIndex: 2 }}>
          {/* Left values - outbound to protocol */}
          <LeftValueDisplay tx={tx} />

          {/* Transaction icon (no timeline - just graphic) */}
          <TransactionIcon tx={tx} isFirst={isFirst} isLast={isLast} isExpanded={isExpanded} />

          {/* Right values - inbound from protocol */}
          <RightValueDisplay tx={tx} />

          {/* Transaction details wrapper */}
          <div className="grow self-start mb-2.5">
            <TransactionContent isInBatch={tx.isInBatch} isExpanded={isExpanded} isBatchManager={isBatchManager}>
              <TransactionItemHeader tx={tx} isExpanded={isExpanded} onClick={toggleExpanded} />

              {/* Only show expanded content for non-batch-manager transactions */}
              {isExpanded && !isBatchManager && <ExpandedContent tx={tx} />}

              {/* Footer - always show, but non-interactive for batch managers */}
              <TransactionFooter
                timestamp={tx.timestamp}
                txIndex={txIndex}
                txHash={tx.transactionHash}
                isExpanded={isExpanded}
                onClick={toggleExpanded}
                isInteractive={!isBatchManager}
              />
            </TransactionContent>

            {/* Event explanation panel - only for non-batch-manager transactions */}
            {isExpanded && !isBatchManager && (
              <div className="px-2.5">
                <EventExplanation transaction={tx} onToggle={(isOpen) => setShowExplanation(isOpen)} />
              </div>
            )}
          </div>
        </TransactionContainer>
      </div>
    </HoverProvider>
  );
}
