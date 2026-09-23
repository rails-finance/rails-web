"use client";

import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

interface LinkedAddressProps {
  address: string;
  label?: string;
  className?: string;
  /** Override the surrounding route group's chain — for the rare cross-chain
   *  reference (a bridge counterpart, an L1 contract named on an L2 page). */
  chainId?: ChainId;
}

/**
 * Renders an address as a link to its block-explorer address page.
 * Use in event explainers and detail components for cross-protocol linking.
 * Resolves the explorer from context: Etherscan on L1, Basescan under a
 * <ChainProvider chainId={8453}>.
 */
export function LinkedAddress({ address, label, className = "", chainId }: LinkedAddressProps) {
  const ctxChain = useChainId();
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <a
      href={explorerUrl(chainId ?? ctxChain, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`text-blue-500 hover:underline font-mono text-xs ${className}`}
    >
      {label || short}
    </a>
  );
}
