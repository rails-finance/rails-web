"use client";

// The holder label (anatomy C7.1; rails-ops TO-DO-ipor-scoping.md §6.2, §6.3):
// the words after a holder's address naming what the address is, from
// `useHolderLabel`, linking to the vault's factsheet on that chain. Drawn by the wallet pill on listing cards and by the
// position page's wallet heading. It reserves no space and draws nothing
// until the lookup answers a hit.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RevealTip } from "@/components/shared/reveal-tip";
import { startNavigationProgress } from "@/components/nav/navigation-progress";
import { iporFusionVaultHref } from "@/lib/vaults/routes";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { useHolderLabel, type HolderLabel } from "@/lib/shared/use-holder-label";

const IPOR_FUSION_VAULT = "IPOR Fusion vault";

function holderLabelTip(label: HolderLabel, chainId: ChainId): string {
  const made = "A vault made through IPOR Fusion's factory, which anyone can deploy from.";
  if (!label.name) return made;
  const at = `block ${label.censusBlock.toLocaleString("en-US")} (${formatDate(label.censusBlockIso)})`;
  return `${made} Its name on ${CHAINS[chainId].name} at ${at}: ${label.name}.`;
}

export function HolderLabelTag({
  wallet,
  chainId,
  className = "text-xs",
  inCard = false,
}: {
  wallet: string;
  /** The page's chain; without one the tag draws nothing. */
  chainId: ChainId | null | undefined;
  className?: string;
  /** Inside a listing card's own link: the tag is a button that navigates, as
   *  the wallet pill's label is, since a link inside a link is invalid HTML. */
  inCard?: boolean;
}) {
  const router = useRouter();
  const label = useHolderLabel(wallet, chainId);
  if (!label || chainId == null) return null;
  const tip = holderLabelTip(label, chainId);
  // The vault's factsheet on the chain the label matched on (§6.3).
  const href = iporFusionVaultHref(chainId, wallet);
  const look = `whitespace-nowrap text-rb-500 ${className} ${href ? "hover:text-blue-600 dark:hover:text-[var(--text-link)] transition-colors cursor-pointer" : ""}`;
  const hooks = { "data-anatomy": "C7.1", "data-holder-label": label.kind, "data-holder-label-href": href ?? "" };
  const tag = !href ? (
    <span className={look} {...hooks}>
      {IPOR_FUSION_VAULT}
    </span>
  ) : inCard ? (
    <button
      type="button"
      className={look}
      aria-label={`Open the ${IPOR_FUSION_VAULT} page`}
      onClick={(e) => {
        e.preventDefault();
        startNavigationProgress(href);
        router.push(href);
      }}
      {...hooks}
    >
      {IPOR_FUSION_VAULT}
    </button>
  ) : (
    <Link href={href} className={look} prefetch={false} {...hooks}>
      {IPOR_FUSION_VAULT}
    </Link>
  );
  return (
    <RevealTip tip={tip} label={`${IPOR_FUSION_VAULT}. ${tip}`} wrap className="shrink-0 rounded-sm">
      {tag}
    </RevealTip>
  );
}
