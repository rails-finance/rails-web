"use client";

import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

interface LinkedTxProps {
  txHash: string;
  className?: string;
  /** Override the surrounding route group's chain. */
  chainId?: ChainId;
}

/** A transaction hash, shortened, as a link to the explorer's event-log view
 *  (the receipts' "Confirm in the tx event logs" target). Styled as
 *  LinkedAddress is. */
export function LinkedTx({ txHash, className = "", chainId }: LinkedTxProps) {
  const ctxChain = useChainId();
  return (
    <a
      href={explorerUrl(chainId ?? ctxChain, "tx-logs", txHash)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`text-blue-500 hover:underline font-mono text-xs ${className}`}
    >
      {`${txHash.slice(0, 8)}…${txHash.slice(-4)}`}
    </a>
  );
}
