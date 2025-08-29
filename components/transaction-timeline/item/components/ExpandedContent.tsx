import {
  isLiquidationTransaction,
  Transaction,
} from "@/types/api/troveHistory";
import { TransactionStateGrid } from "../../state-grid";
import { TransactionLinks } from "./TransactionLinks";

export function ExpandedContent({ tx }: { tx: Transaction }) {
  return (
    <div className="px-4 sm:px-6 pb-2 space-y-4">

      <TransactionStateGrid tx={tx} />
      
      <TransactionLinks transaction={tx} />
    </div>
  );
}
