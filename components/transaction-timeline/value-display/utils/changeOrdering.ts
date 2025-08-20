import { TroveTransaction } from "@/types/api/troveHistory";

interface Change {
  direction: "in" | "out";
  amount: number;
}

export function orderChanges(tx: TroveTransaction) {
  const troveOp = tx.troveOperation;
  let debtChange: Change | undefined;
  let collChange: Change | undefined;

  // Debt change
  if (troveOp.debtChangeFromOperation !== 0) {
    debtChange = {
      direction: troveOp.debtChangeFromOperation > 0 ? "out" : "in",
      amount: Math.abs(troveOp.debtChangeFromOperation),
    };
  }

  // Collateral change
  if (troveOp.collChangeFromOperation !== 0) {
    collChange = {
      direction: troveOp.collChangeFromOperation > 0 ? "in" : "out",
      amount: Math.abs(troveOp.collChangeFromOperation),
    };
  }

  if (!collChange || !debtChange) {
    return collChange ? [collChange] : debtChange ? [debtChange] : [];
  }

  // Mixed directions - asset going TO protocol at bottom
  if (debtChange.direction !== collChange.direction) {
    return collChange.direction === "in" ? [debtChange, collChange] : [collChange, debtChange];
  }

  // Both to user - debt at bottom
  if (debtChange.direction === "out") {
    return [collChange, debtChange];
  }

  // Both to protocol - collateral at bottom
  return [debtChange, collChange];
}
