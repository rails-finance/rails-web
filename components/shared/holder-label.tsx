"use client";

// The holder label (anatomy C7.1; rails-ops TO-DO-ipor-scoping.md §6.2): plain
// text after a holder's address naming what the address is, from
// `useHolderLabel`. Drawn by the wallet pill on listing cards and by the
// position page's wallet heading. It reserves no space and draws nothing
// until the lookup answers a hit.

import { RevealTip } from "@/components/shared/reveal-tip";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { useHolderLabel, type HolderLabel } from "@/lib/shared/use-holder-label";

const IPOR_FUSION_VAULT = "IPOR Fusion vault";

function holderLabelTip(label: HolderLabel, chainId: ChainId): string {
  const made = "A vault made through IPOR Fusion's factory, which anyone can use.";
  if (!label.name) return made;
  const at = `block ${label.censusBlock.toLocaleString("en-US")} (${formatDate(label.censusBlockIso)})`;
  return `${made} Its name on ${CHAINS[chainId].name} at ${at}: ${label.name}.`;
}

export function HolderLabelTag({
  wallet,
  chainId,
  className = "text-xs",
}: {
  wallet: string;
  /** The page's chain; without one the tag draws nothing. */
  chainId: ChainId | null | undefined;
  className?: string;
}) {
  const label = useHolderLabel(wallet, chainId);
  if (!label || chainId == null) return null;
  const tip = holderLabelTip(label, chainId);
  return (
    <RevealTip
      tip={tip}
      label={`${IPOR_FUSION_VAULT}. ${tip}`}
      focusable
      wrap
      className="shrink-0 rounded-sm focus-ring"
    >
      <span className={`whitespace-nowrap text-rb-500 ${className}`} data-anatomy="C7.1" data-holder-label={label.kind}>
        {IPOR_FUSION_VAULT}
      </span>
    </RevealTip>
  );
}
