"use client";

import { LinkedValue } from "@/components/shared/linked-value";
import { useChainId } from "@/lib/shared/chain-context";
import type { ChainId } from "@/lib/shared/chains";

interface LinkedTxProps {
  txHash: string;
  className?: string;
  /** Override the surrounding route group's chain. */
  chainId?: ChainId;
}

/** A transaction hash, shortened, as a link to the explorer's event-log view
 *  (the receipts' "Confirm in the tx event logs" target): a LinkedValue
 *  (anatomy L14) whose tooltip reads "Transaction 0x5c50…2060", then "View
 *  on Etherscan ↗". Styled as LinkedAddress is. */
export function LinkedTx({ txHash, className = "", chainId }: LinkedTxProps) {
  const ctxChain = useChainId();
  const short = `${txHash.slice(0, 8)}…${txHash.slice(-4)}`;
  // The tooltip names the transaction as T1 and T2 do, "0x5c50…2060".
  const named = `Transaction ${txHash.slice(0, 6)}…${txHash.slice(-4)}`;
  return (
    <LinkedValue
      explorer={{ chainId: chainId ?? ctxChain, kind: "tx-logs", value: txHash }}
      context={named}
      label={named}
      className={`text-blue-600 dark:text-[var(--text-link)] hover:underline font-mono text-xs ${className}`}
    >
      {short}
    </LinkedValue>
  );
}
