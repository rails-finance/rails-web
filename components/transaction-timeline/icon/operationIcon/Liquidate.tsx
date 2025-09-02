import { Transaction, TroveLiquidationTransaction } from "@/types/api/troveHistory";
import { WarningLayout } from "../layouts/WarningLayout";
import { WarningIcon } from "../symbols/WarningIcon";

export function LiquidateIcon({ tx }: { tx: Transaction }) {
  const liquidationTx = tx as TroveLiquidationTransaction;
  
  // Determine if this is a beneficial liquidation (trove gains from redistribution)
  const { collIncreaseFromRedist } = liquidationTx.troveOperation || {};
  const isBeneficialLiquidation = liquidationTx.stateAfter.debt > 0 && collIncreaseFromRedist > 0;
  
  // Use green for beneficial liquidations, red for destructive ones
  const strokeColor = isBeneficialLiquidation ? "#22C55E" : "#EF4444";
  
  return (
    <WarningLayout>
      <WarningIcon strokeColor={strokeColor} />
    </WarningLayout>
  );
}
