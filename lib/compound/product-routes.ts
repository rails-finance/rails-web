// The Compound V3 product routes' server side, shared by the three chains
// (rails-ops ui-jobs 549/550): the Comet read, each page's metadata, and the
// Comet pages' static params. The pages draw through lib/compound/product.tsx.
//
//   /<chain>/compound-v3/markets          the Comets (A1), one head each
//   /<chain>/compound-v3/markets/<comet>  one Comet (A2); the slug is its roster key
//
// The static `markets` segment sits beside the `[market]` position routes;
// Next resolves static before dynamic, so a wallet never shadows it.

import type { Metadata } from "next";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { cometDeploymentOf, type CompoundDeploymentKey } from "@/lib/compound/deployments";
import { loadCompoundV3Markets, type CompoundV3MarketsResponse } from "@/lib/sources/chain/compound-markets";

const NAME: Record<CompoundDeploymentKey, string> = { ethereum: "Ethereum", base: "Base", arbitrum: "Arbitrum" };

/** A chain's Comets read at one block. */
export const loadComets = (chain: CompoundDeploymentKey) => loadCompoundV3Markets(cometDeploymentOf(chain));

/** One Comet's read: the Comet alone, so the page carries no other's collateral. */
export const cometData = (data: CompoundV3MarketsResponse, key: string): CompoundV3MarketsResponse => ({
  ...data,
  markets: data.markets.filter((m) => m.key === key),
});

export const isComet = (chain: CompoundDeploymentKey, key: string) =>
  cometDeploymentOf(chain).markets.some((m) => m.key === key);

export function compoundMarketsMetadata(chain: CompoundDeploymentKey): Metadata {
  const n = cometDeploymentOf(chain).markets.length;
  return listingMetadata({
    title: `Compound V3 on ${NAME[chain]} · Markets`,
    canonicalPath: `/${chain}/compound-v3/markets`,
    description: `The ${n} Compound V3 markets Rails reads on ${NAME[chain]}, read live: each one's size, rates, utilization, reserves and collateral.`,
  });
}

export function cometMetadata(chain: CompoundDeploymentKey, key: string): Metadata {
  const m = cometDeploymentOf(chain).markets.find((x) => x.key === key);
  if (!m) return {};
  return listingMetadata({
    title: `Compound V3 ${m.label} on ${NAME[chain]}`,
    canonicalPath: `/${chain}/compound-v3/markets/${key}`,
    description: `Compound V3's ${m.baseSymbol} market on ${NAME[chain]}, read live: its supply and borrow rates, utilization against the kink, reserves against their target, minimum borrow and every collateral asset's terms.`,
  });
}
