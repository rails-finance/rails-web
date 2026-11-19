"use client";

// The holder label (anatomy C7.1; rails-ops TO-DO-ipor-scoping.md §6.2, §6.3):
// the words after a holder's address naming what the address is, from
// `useHolderLabel`, its tip the receipt-like words and, once the vault's page is
// launched, an "Open the vault page" control. Drawn by the wallet pill on listing cards and by the
// position page's wallet heading. It reserves no space and draws nothing
// until the lookup answers a hit.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RevealTip } from "@/components/shared/reveal-tip";
import { startNavigationProgress } from "@/components/nav/navigation-progress";
import { holderLabelHref } from "@/lib/ipor-fusion/label-href";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
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
  /** Inside a listing card's link: the tip's control is a button that
   *  navigates, since a link inside a link is invalid HTML. */
  inCard?: boolean;
}) {
  const router = useRouter();
  const label = useHolderLabel(wallet, chainId);
  if (!label || chainId == null) return null;
  const tip = holderLabelTip(label, chainId);
  // The vault's factsheet, once launched (§6.3); null keeps the tip words only.
  const href = holderLabelHref(chainId, wallet);
  const open = href ? (
    inCard ? (
      <button
        type="button"
        className={`mt-1.5 block font-semibold ${INLINE_LINK}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startNavigationProgress(href);
          router.push(href);
        }}
      >
        Open the vault page
      </button>
    ) : (
      <Link href={href} prefetch={false} className={`mt-1.5 block font-semibold ${INLINE_LINK}`}>
        Open the vault page
      </Link>
    )
  ) : null;
  return (
    <RevealTip
      tip={
        <span className="block">
          {tip}
          {open}
        </span>
      }
      label={`${IPOR_FUSION_VAULT}. ${tip}`}
      focusable
      wrap
      interactive={href != null}
      className="shrink-0 rounded-sm focus-ring"
    >
      <span
        className={`whitespace-nowrap text-rb-500 ${className}`}
        data-anatomy="C7.1"
        data-holder-label={label.kind}
        data-holder-label-href={href ?? ""}
      >
        {IPOR_FUSION_VAULT}
      </span>
    </RevealTip>
  );
}
