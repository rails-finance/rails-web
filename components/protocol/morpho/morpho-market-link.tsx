"use client";

// The ways into one Morpho Blue market's page (lib/morpho/market-routes.ts)
// from the surfaces that name a market without being about it.
//
//   • MorphoMarketPair — the "USDC / AAPLc" on a position card. A <button>
//     with router.push, not an anchor, for the WalletPill's reason: a listing
//     wraps the whole card in a <Link>, and an anchor inside an anchor is
//     invalid HTML. Without the loan token's address there is no page to
//     name, and the pair stays text.
//   • MorphoMarketPageLine — one line above a listing searched by market id.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "@/components/nav/navigation-progress";
import { useChainId } from "@/lib/shared/chain-context";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";

export function MorphoMarketPair({
  label,
  marketId,
  loanToken,
}: {
  label: string;
  marketId: string;
  loanToken?: string;
}) {
  const router = useRouter();
  const chainId = useChainId();
  if (!loanToken) return <>{label}</>;
  const href = morphoMarketHref(chainId, loanToken, marketId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startNavigationProgress(href);
        router.push(href);
      }}
      aria-label={`Open the ${label} market`}
      // Where the click goes, restated as data so a check can read it without
      // navigating — the WalletPill's data-vault-href convention.
      data-market-href={href}
      className="cursor-pointer hover:text-blue-500 transition-colors"
    >
      {label}
    </button>
  );
}

/** "The USDC / AAPLc market →" — drawn by a listing whose search is exactly one
 *  market id, from the first row it returned (every row is that market). */
export function MorphoMarketPageLine({
  label,
  marketId,
  loanToken,
}: {
  label: string;
  marketId: string;
  loanToken?: string;
}) {
  const chainId = useChainId();
  if (!loanToken) return null;
  return (
    <p className="mb-3 text-sm">
      <Link href={morphoMarketHref(chainId, loanToken, marketId)} className={PAGE_LINK} prefetch={false}>
        The {label} market <span aria-hidden>→</span>
      </Link>
    </p>
  );
}
