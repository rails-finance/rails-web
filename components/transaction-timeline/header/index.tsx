import { Transaction } from "@/types/api/troveHistory";
import { HeaderContent } from "./operations";

export function TransactionItemHeader({ tx }: { tx: Transaction }) {
  return (
    <div className="flex items-start justify-between">
      <div className="grow mt-1 mb-2 mr-3">
        <div className="flex items-center flex-wrap gap-2">
          <HeaderContent tx={tx} />
        </div>
      </div>
    </div>
  );
}
