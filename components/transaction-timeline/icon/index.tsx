import { Transaction } from "@/types/api/troveHistory";
import { OperationIcon } from "./operationIcon";

interface TransactionIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function TransactionIcon({ tx, isFirst = false, isLast = false, isExpanded = false }: TransactionIconProps) {
  const { operation } = tx;

  return (
    <div className={`transaction-timeline-column ${operation ? `operation-${operation}` : ""}`}>
      <OperationIcon 
        tx={tx} 
        isFirst={isFirst} 
        isLast={isLast} 
        isExpanded={isExpanded} 
      />
    </div>
  );
}
