import { TroveTransaction } from "@/types/api/troveHistory";
import { AssetAction } from "../components/AssetAction";

export function AdjustTroveHeader({ tx }: { tx: TroveTransaction }) {
  const { debtChangeFromOperation, collChangeFromOperation } = tx.troveOperation;
  const content = [];

  // Single change only
  if (collChangeFromOperation) {
    const action = collChangeFromOperation > 0 ? "Add" : "Withdraw";
    content.push(<AssetAction key="collateral" action={action} asset={tx.collateralType} />);
  }

  if (debtChangeFromOperation) {
    const action = debtChangeFromOperation > 0 ? "Borrow" : "Repay";
    content.push(<AssetAction key="debt" action={action} asset={tx.assetType} />);
  }

  return <div className="flex items-center gap-1">{content}</div>;
}
