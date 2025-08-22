import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { EmptySpace } from "./components/EmptySpace";
import { ChangeValue } from "./components/ChangeValue";
import { orderChanges } from "./utils/changeOrdering";

export function TransactionValueDisplay({ tx }: { tx: Transaction }) {
  // Only show values for TroveTransactions
  if (!isTroveTransaction(tx)) {
    return <EmptySpace />;
  }

  const { debtChangeFromOperation, collChangeFromOperation } = tx.troveOperation;

  // If no changes, show empty
  if (debtChangeFromOperation === 0 && collChangeFromOperation === 0) {
    return <EmptySpace />;
  }

  // Order the changes for better visual flow
  const orderedChanges = orderChanges(tx);

  return (
    <div className="hidden md:flex w-32 shrink-0 flex-col justify-start items-end py-4 px-2">
      {orderedChanges.map((change, index) => (
        <ChangeValue key={`change-${index}`} amount={change.amount} />
      ))}
    </div>
  );
}
