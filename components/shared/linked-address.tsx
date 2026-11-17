"use client";

import Link from "next/link";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";

/** The families the wallet page (/wallet/<address>) reads a holder's position
 *  for. A holder of any other family opens that family's wallet-filtered
 *  listing (ui-jobs 704). */
const WALLET_PAGE_SESSIONS: ReadonlySet<SessionProtocol> = new Set(["liquity-v2", "makerdao"]);

/** Where a position holder's address opens inside Rails: the wallet page, or
 *  the family's listing filtered to the wallet. Null leaves the explorer link. */
export function holderHref(session: SessionProtocol, address: string): string | null {
  if (WALLET_PAGE_SESSIONS.has(session)) return `/wallet/${address.toLowerCase()}`;
  return listingHrefForWallet(session, address);
}

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
}

/**
 * Renders an address as a link to its block-explorer address page.
 * Use in event explainers and detail components for cross-protocol linking.
 * Resolves the explorer from context: Etherscan on L1, Basescan under a
 * <ChainProvider chainId={8453}>.
 */
export function LinkedAddress({ address, label, className = "", chainId, holderOf }: LinkedAddressProps) {
  const ctxChain = useChainId();
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const inside = holderOf ? holderHref(holderOf, address) : null;
  if (inside)
    return (
      <Link
        href={inside}
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
