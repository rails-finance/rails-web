import {
  isLiquidationTransaction,
  isRedemptionTransaction,
  isTroveTransaction,
  Transaction,
} from "@/types/api/troveHistory";
import { TransactionStateGrid } from "../../state-grid";
import { ZombieWarning } from "../../special-case-details/ZombieWarning";
import { LiquidationEvent } from "../../special-case-details/LiquidationEvent";
import { RedemptionDetails } from "../../special-case-details/RedemptionDetails";

export function ExpandedContent({ tx }: { tx: Transaction }) {
  return (
    <>
      {tx.isZombieTrove && <ZombieWarning tx={tx} />}

      <TransactionStateGrid tx={tx} />

      {isLiquidationTransaction(tx) && <LiquidationEvent />}

      {isRedemptionTransaction(tx) && <RedemptionDetails tx={tx} />}
    </>
  );
}
