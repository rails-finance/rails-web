"use client";

import { usePathname } from "next/navigation";
import { LinkedValue } from "@/components/shared/linked-value";
import { useChainId } from "@/lib/shared/chain-context";
import type { ChainId } from "@/lib/shared/chains";
import { holderHref } from "@/lib/shared/holder-href";
import { LIQUITY_V2_REDEEMER_PATH } from "@/lib/liquity-v2/redeemer-routes";
import { listingHrefForWallet, protocolForSession } from "@/lib/shared/protocols";
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

/** The tooltip's words for a page inside Rails: "Wallet 0x12…34 →",
 *  "Redeemer 0x12…34 →", or a family's listing searched for the address,
 *  "Aave V3 positions of 0x12…34 →". */
function railsPageTip(href: string, short: string, holderOf: SessionProtocol | undefined): string {
  if (href.startsWith("/wallet/")) return `Wallet ${short} →`;
  if (href.startsWith(`${LIQUITY_V2_REDEEMER_PATH}/`)) return `Redeemer ${short} →`;
  const family = holderOf ? protocolForSession(holderOf)?.label : undefined;
  return family ? `${family} positions of ${short} →` : `${short} on Rails →`;
}

/**
 * Renders an address as a LinkedValue (anatomy L14): a link to its page inside
 * Rails where it has one, the tooltip naming that page, else to its
 * block-explorer address page, the tooltip reading "Address 0x12…34", then
 * "View on Etherscan ↗". Use in event explainers and detail components for
 * cross-protocol linking. Resolves the explorer from context: Etherscan on L1,
 * Basescan under a <ChainProvider chainId={8453}>.
 */
export function LinkedAddress({ address, label, className = "", chainId, holderOf, href }: LinkedAddressProps) {
  const ctxChain = useChainId();
  const pathname = usePathname();
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const inside = href ?? (holderOf ? holderHref(holderOf, address, listingHrefForWallet, pathname) : null);
  const cls = `text-blue-600 dark:text-[var(--text-link)] hover:underline font-mono text-xs ${className}`;
  const text = label || short;
  if (inside)
    return (
      // LinkedValue does not prefetch: the wallet page is dynamic and reads
      // the API and the chain, a cost a link only seen should not pay.
      <LinkedValue href={inside} tip={railsPageTip(inside, short, holderOf)} label={text} className={cls}>
        {text}
      </LinkedValue>
    );
  return (
    <LinkedValue
      explorer={{ chainId: chainId ?? ctxChain, kind: "address", value: address }}
      context={`Address ${short}`}
      label={text}
      className={cls}
    >
      {text}
    </LinkedValue>
  );
}
