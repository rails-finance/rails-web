// The coverage rows one chain's Alchemix lines answer with.
//
// There is no separate coverage endpoint: the positions listing states its
// coverage alongside its rows, which is the rule rails-server's routes keep
// ("state coverage, never imply it"). So the read here is that listing asked
// for one row, and the rows are discarded. That costs one query and keeps a
// single source for the grade — a second endpoint would be a second place for
// it to drift.
//
// The result is narrowed to this chain's lines. The endpoint answers for every
// line it serves, and an explorer that printed another chain's line would be
// stating a fact about a deployment it does not cover.

import { fetchAlchemixPositions } from "@/lib/api/fetch-alchemix-positions";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import { boxHop } from "@/lib/shared/listing-ssr";
import type { AlchemixLineCoverage } from "@/types/api/alchemix";

export async function alchemixLinesPageData(deployment: AlchemixDeployment): Promise<AlchemixLineCoverage[]> {
  const hop = await boxHop();
  if (!hop) return [];
  try {
    const res = await fetchAlchemixPositions({
      chainId: deployment.chainId,
      limit: 1,
      baseUrl: hop.baseUrl,
      headers: hop.headers,
    });
    return res.coverage.lines.filter((l) => l.chainId === deployment.chainId);
  } catch (err) {
    // An empty list renders as "no line answered", which is what happened. It
    // is not rendered as a line with no redemptions, which would be a claim.
    console.error(`Alchemix lines read failed (chain ${deployment.chainId}):`, err);
    return [];
  }
}
