import { Transaction } from "@/types/api/troveHistory";
import { TimelineConnector } from "./base/TimelineConnector";
import { OperationIcon } from "./operationIcon";

interface TransactionIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
}

export function TransactionIcon({ tx, isFirst = false, isLast = false }: TransactionIconProps) {
  const { operation, troveOperation } = tx;
  const { debtChangeFromOperation, collChangeFromOperation } = troveOperation;
  // Check if this is a multi-step operation
  const isMultiStep = debtChangeFromOperation !== 0 && collChangeFromOperation !== 0;

  return (
    <div className={`transaction-timeline-column ${operation ? `operation-${operation}` : ""}`}>
      <TimelineConnector type="top" show={!isFirst} operation={operation} isMultiStep={isMultiStep} />

      <OperationIcon tx={tx} />

      <TimelineConnector type="bottom" show={!isLast} operation={operation} isMultiStep={isMultiStep} />
    </div>
  );
}
