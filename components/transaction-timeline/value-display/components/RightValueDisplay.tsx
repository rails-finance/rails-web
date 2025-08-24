import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { ChangeValue } from "./ChangeValue";

export function RightValueDisplay({ tx }: { tx: Transaction }) {
  // Only show values for TroveTransactions
  if (!isTroveTransaction(tx)) {
    return <div className="hidden sm:block w-24 shrink-0" />;
  }

  const { debtChangeFromOperation, collChangeFromOperation } = tx.troveOperation;
  
  // RIGHT SIDE: Values USER SENDS to protocol (arrow points right/out)
  const isMultiStep = debtChangeFromOperation !== 0 && collChangeFromOperation !== 0;
  
  if (isMultiStep) {
    const debtIncrease = debtChangeFromOperation > 0;
    const collIncrease = collChangeFromOperation > 0;

    if (debtIncrease && collIncrease) {
      // Borrow + Deposit: User sends collateral (second arrow points right)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-start py-4 pr-2 pl-0.5">
          <div className="opacity-0 pointer-events-none">
            <ChangeValue amount={Math.abs(debtChangeFromOperation)} />
          </div>
          <ChangeValue amount={Math.abs(collChangeFromOperation)} />
        </div>
      );
    } else if (!debtIncrease && !collIncrease) {
      // Repay + Withdraw: User sends debt (second arrow points right)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-start py-4 pr-2 pl-0.5">
          <div className="opacity-0 pointer-events-none">
            <ChangeValue amount={Math.abs(collChangeFromOperation)} />
          </div>
          <ChangeValue amount={Math.abs(debtChangeFromOperation)} />
        </div>
      );
    } else if (!debtIncrease && collIncrease) {
      // Repay + Deposit: Both arrows point right (user sends both)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-start py-4 pr-2 pl-0.5">
          <ChangeValue amount={Math.abs(debtChangeFromOperation)} />
          <ChangeValue amount={Math.abs(collChangeFromOperation)} />
        </div>
      );
    } else {
      // Withdraw + Borrow: Both arrows point left (user receives both), no right values
      return <div className="hidden sm:block w-24 shrink-0" />;
    }
  } else {
    // Single operation - user sends
    if (debtChangeFromOperation < 0) {
      // Repay - user sends (arrow points right)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-start py-4 pr-2 pl-0.5">
          <ChangeValue amount={Math.abs(debtChangeFromOperation)} />
        </div>
      );
    } else if (collChangeFromOperation > 0) {
      // Deposit - user sends (arrow points right)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-start py-4 pr-2 pl-0.5">
          <ChangeValue amount={Math.abs(collChangeFromOperation)} />
        </div>
      );
    }
    // Borrow or Withdraw - user receives (arrow points left), no right values
    return <div className="hidden sm:block w-24 shrink-0" />;
  }
}