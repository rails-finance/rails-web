// Morpho Blue on Base, one loan token's markets (/base/morpho/markets/<loan
// token>), on the shared product shell (rails-ops ui-jobs 549 step 5): the
// token's head, the markets that carry its book in the house table, then the
// markets that repeat one pair, the smaller ones and the never funded
// (lib/morpho/roster.tsx, shaped by lib/morpho/markets-shape).
//
// The whole roster is read for it, as the roster page reads it: one token's
// markets cannot be read alone any cheaper, and React's cache() dedupes
// generateMetadata's read against the page's.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MorphoLoanTokenPage } from "@/lib/morpho/roster";
import { loadMorphoMarketsFromChain } from "@/lib/sources/chain/morpho-markets";
import { loanTokenViewData } from "@/lib/morpho/markets-shape";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";

export const dynamic = "force-dynamic";

/** Robots follow the roster's launch flag. */
const ROBOTS = unlaunchedRobotsForPath("/base/morpho/markets");

const ADDRESS = /^0x[0-9a-f]{40}$/;
const load = cache(() => loadMorphoMarketsFromChain(MORPHO_BASE_DEPLOYMENT));

type Params = { params: Promise<{ loanToken: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken } = await params;
  const token = loanToken.toLowerCase();
  if (!ADDRESS.test(token)) return { title: "Morpho Blue markets on Base", ...ROBOTS };
  const data = await load();
  const g = data.groups.find((x) => x.loanToken.toLowerCase() === token);
  const name = g?.loanNamed ? g.loanSymbol : `${token.slice(0, 6)}…${token.slice(-4)}`;
  return {
    title: `${name} markets · Morpho Blue on Base`,
    description: `Every Morpho Blue market on Base that lends ${name}: its collateral, LLTV, size, rates and utilization.`,
    alternates: { canonical: `/base/morpho/markets/${token}` },
    ...ROBOTS,
  };
}

export default async function MorphoLoanTokenRoute({ params }: Params) {
  const { loanToken } = await params;
  const token = loanToken.toLowerCase();
  if (!ADDRESS.test(token)) notFound();
  const data = await load();
  const g = data.groups.find((x) => x.loanToken.toLowerCase() === token);
  if (!g) {
    if (!data.chainStale) notFound();
    return (
      <p className="py-12 text-center text-sm text-rb-500">
        The market roster could not be read from the chain. Reload to try again.
      </p>
    );
  }
  return (
    <MorphoLoanTokenPage
      g={loanTokenViewData(data, g)}
      block={data.blockNumber}
      fromLogs={data.totalsSource === "sieve"}
      chainId={MORPHO_BASE_CHAIN_ID}
    />
  );
}
