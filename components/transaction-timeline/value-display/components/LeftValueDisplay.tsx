import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { ChangeValue } from "./ChangeValue";

export function LeftValueDisplay({ tx }: { tx: Transaction }) {
  // Only show values for TroveTransactions
  if (!isTroveTransaction(tx)) {
    return <div className="hidden sm:block w-24 shrink-0" />;
  }

  const { debtChangeFromOperation, collChangeFromOperation } = tx.troveOperation;
  
  // LEFT SIDE: Values USER RECEIVES (arrow points left/in)
  const isMultiStep = debtChangeFromOperation !== 0 && collChangeFromOperation !== 0;
  
  if (isMultiStep) {
    const debtIncrease = debtChangeFromOperation > 0;
    const collIncrease = collChangeFromOperation > 0;

    if (debtIncrease && collIncrease) {
      // Borrow + Deposit: User receives debt (first arrow points left)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-end py-4 pl-2 pr-0.5">
          <ChangeValue amount={Math.abs(debtChangeFromOperation)} type="debt" />
          <div className="opacity-0 pointer-events-none">
            <ChangeValue amount={Math.abs(collChangeFromOperation)} type="collateral" />
          </div>
        </div>
      );
    } else if (!debtIncrease && !collIncrease) {
      // Repay + Withdraw: User receives collateral (first arrow points left)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-end py-4 pl-2 pr-0.5">
          <ChangeValue amount={Math.abs(collChangeFromOperation)} type="collateral" />
          <div className="opacity-0 pointer-events-none">
            <ChangeValue amount={Math.abs(debtChangeFromOperation)} type="debt" />
          </div>
        </div>
      );
    } else if (debtIncrease && !collIncrease) {
      // Withdraw + Borrow: Both arrows point left (user receives both)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-end py-4 pl-2 pr-0.5">
          <ChangeValue amount={Math.abs(collChangeFromOperation)} type="collateral" />
          <ChangeValue amount={Math.abs(debtChangeFromOperation)} type="debt" />
        </div>
      );
    } else {
      // Repay + Deposit: Both arrows point right (user sends both), no left values
      return <div className="hidden sm:block w-24 shrink-0" />;
    }
  } else {
    // Single operation - user receives
    if (debtChangeFromOperation > 0) {
      // Borrow - user receives (arrow points left)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-end py-4 pl-2 pr-0.5">
          <ChangeValue amount={Math.abs(debtChangeFromOperation)} type="debt" />
        </div>
      );
    } else if (collChangeFromOperation < 0) {
      // Withdraw - user receives (arrow points left)
      return (
        <div className="hidden sm:flex w-24 shrink-0 flex-col justify-start items-end py-4 pl-2 pr-0.5">
          <ChangeValue amount={Math.abs(collChangeFromOperation)} type="collateral" />
        </div>
      );
    }
    // Repay or Deposit - user sends (arrow points right), no left values
    return <div className="hidden sm:block w-24 shrink-0" />;
  }
}