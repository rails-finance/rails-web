import {
  isLiquidationTransaction,
  Transaction,
} from "@/types/api/troveHistory";
import { TransactionStateGrid } from "../../state-grid";
import { EventExplanation } from "../../explanation/EventExplanation";
import { TransactionLinks } from "./TransactionLinks";

export function ExpandedContent({ tx }: { tx: Transaction }) {
  return (
    <div className="px-4 sm:px-6 pb-2 space-y-4">

      <TransactionStateGrid tx={tx} />
      
      <EventExplanation transaction={tx} />
      
      <TransactionLinks transaction={tx} />
    </div>
  );
}
