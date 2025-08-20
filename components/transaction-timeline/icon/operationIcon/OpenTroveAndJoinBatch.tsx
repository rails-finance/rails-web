import { Transaction } from "@/types/api/troveHistory";
import { OpenTroveIcon } from "./OpenTrove";

// Same as regular OpenTrove (DepositAndBorrow in explorer)
export function OpenTroveAndJoinBatchIcon({ tx }: { tx: Transaction }) {
  return <OpenTroveIcon tx={tx} />;
}
