import { Transaction } from "@/types/api/troveHistory";
import { TimelineConnector } from "./base/TimelineConnector";
import { OperationIcon } from "./operationIcon";

interface TransactionIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
}

export function TransactionIcon({ tx, isFirst = false, isLast = false }: TransactionIconProps) {
  if (tx.type === "transfer") {
    return (
      <div className={`transaction-timeline-column ${tx.operation ? `operation-${tx.operation}` : ""}`}>
        <TimelineConnector type="top" show={!isFirst} operation={tx.operation} isMultiStep={false} tx={tx} />

        <OperationIcon tx={tx} />

        <TimelineConnector type="bottom" show={!isLast} operation={tx.operation} isMultiStep={false} tx={tx} />
      </div>
    );
  }

  const { operation, troveOperation } = tx;
  const { debtChangeFromOperation, collChangeFromOperation } = troveOperation;
  // Check if this is a multi-step operation
  const isMultiStep = debtChangeFromOperation !== 0 && collChangeFromOperation !== 0;

  return (
    <div className={`transaction-timeline-column ${operation ? `operation-${operation}` : ""}`}>
      <TimelineConnector type="top" show={!isFirst} operation={operation} isMultiStep={isMultiStep} tx={tx} />

      <OperationIcon tx={tx} />

      <TimelineConnector type="bottom" show={!isLast} operation={operation} isMultiStep={isMultiStep} tx={tx} />
    </div>
  );
}
