"use client";

import { useState } from "react";
import { Transaction } from "@/types/api/troveHistory";
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

interface TransactionItemProps {
  tx: Transaction;
  isFirst: boolean;
  isLast: boolean;
  txIndex: number;
}

export function TransactionItem({ tx, isFirst, isLast, txIndex }: TransactionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const toggleExpanded = () => setIsExpanded(!isExpanded);

  return (
    <HoverProvider>
      <div>
        <TransactionContainer className="flex w-full">
          {/* Left values - outbound to protocol */}
          <LeftValueDisplay tx={tx} />

          {/* Transaction icon/timeline */}
          <TransactionIcon tx={tx} isFirst={isFirst} isLast={isLast} />

          {/* Right values - inbound from protocol */}
          <RightValueDisplay tx={tx} />

          {/* Transaction details wrapper */}
          <div className="grow self-start mb-2.5">
            <TransactionContent isInBatch={tx.isInBatch} isExpanded={isExpanded}>
              <TransactionItemHeader tx={tx} isExpanded={isExpanded} onClick={toggleExpanded} />

              {isExpanded && <ExpandedContent tx={tx} />}

              <TransactionFooter
                timestamp={tx.timestamp}
                txIndex={txIndex}
                txHash={tx.transactionHash}
                isExpanded={isExpanded}
                onClick={toggleExpanded}
              />
            </TransactionContent>
            
            {/* Event explanation panel - positioned beneath TransactionContent, 20px narrower */}
            {isExpanded && (
              <div className="px-2.5">
                <EventExplanation 
                  transaction={tx} 
                  onToggle={(isOpen) => setShowExplanation(isOpen)} 
                />
              </div>
            )}
          </div>
        </TransactionContainer>
      </div>
    </HoverProvider>
  );
}
