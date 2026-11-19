"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { holderHref } from "@/lib/shared/holder-href";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";

interface LinkedAddressProps {
  address: string;
  label?: string;
  className?: string;
  /** Override the surrounding route group's chain — for the rare cross-chain
   *  reference (a bridge counterpart, an L1 contract named on an L2 page). */
  chainId?: ChainId;
  /** The address holds (or held) a position of this family: it links inside
   *  Rails (`holderHref`). Left out for a contract, or for an address the call
   *  site cannot tell from one: those keep the block explorer. */
  holderOf?: SessionProtocol;
  /** A page inside Rails the address opens, in place of `holderOf`'s
   *  (a Liquity V2 redeemer opens its redeemer page). */
  href?: string | null;
}

/**
 * Renders an address as a link to its block-explorer address page.
 * Use in event explainers and detail components for cross-protocol linking.
 * Resolves the explorer from context: Etherscan on L1, Basescan under a
 * <ChainProvider chainId={8453}>.
 */
export function LinkedAddress({ address, label, className = "", chainId, holderOf, href }: LinkedAddressProps) {
  const ctxChain = useChainId();
  const pathname = usePathname();
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const inside = href ?? (holderOf ? holderHref(holderOf, address, listingHrefForWallet, pathname) : null);
  if (inside)
    return (
      // No prefetch: the wallet page is dynamic and reads the API and the
      // chain, a cost a link merely seen should not pay.
      <Link
        href={inside}
        prefetch={false}
        onClick={(e) => e.stopPropagation()}
        className={`text-blue-600 dark:text-[var(--text-link)] hover:underline font-mono text-xs ${className}`}
      >
        {label || short}
      </Link>
    );
  return (
    <a
      href={explorerUrl(chainId ?? ctxChain, "address", address)}
      target="_blank"
      rel="noopener"
      onClick={(e) => e.stopPropagation()}
      className={`text-blue-600 dark:text-[var(--text-link)] hover:underline font-mono text-xs ${className}`}
    >
      {label || short}
    </a>
  );
}
