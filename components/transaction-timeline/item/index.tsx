"use client";

import { useState } from "react";
import { Transaction } from "@/types/api/troveHistory";
import { TransactionIcon } from "../icon";
import { TransactionValueDisplay } from "../value-display";
import { TransactionItemHeader } from "../header";
import { TransactionContainer } from "./components/TransactionContainer";
import { TransactionContent } from "./components/TransactionContent";
import { TransactionFooter } from "./components/TransactionFooter";
import { ExpandedContent } from "./components/ExpandedContent";

interface TransactionItemProps {
  tx: Transaction;
  isFirst: boolean;
  isLast: boolean;
  txIndex: number;
}

export function TransactionItem({ tx, isFirst, isLast, txIndex }: TransactionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpanded = () => setIsExpanded(!isExpanded);

  return (
    <TransactionContainer className="flex w-full">
      {/* Transaction value display */}
      <TransactionValueDisplay tx={tx} />

      {/* Transaction icon/timeline */}
      <TransactionIcon tx={tx} isFirst={isFirst} isLast={isLast} />

      {/* Transaction details */}
      <TransactionContent isInBatch={tx.isInBatch} isExpanded={isExpanded} onClick={toggleExpanded}>
        <TransactionItemHeader tx={tx} />

        {isExpanded && <ExpandedContent tx={tx} />}

        <TransactionFooter
          timestamp={tx.timestamp}
          txIndex={txIndex}
          txHash={tx.transactionHash}
          isExpanded={isExpanded}
        />
      </TransactionContent>
    </TransactionContainer>
  );
}
