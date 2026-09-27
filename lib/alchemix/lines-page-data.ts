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
import { fetchAlchemixTransmuterPositions } from "@/lib/api/fetch-alchemix-transmuter-positions";
import { fetchAlchemixV2Positions } from "@/lib/api/fetch-alchemix-v2-positions";
import { v2LinesForChain, type AlchemixDeployment } from "@/lib/alchemix/lines";
import { boxHop } from "@/lib/shared/listing-ssr";
import type {
  AlchemixLineCoverage,
  AlchemixTransmuterLineCoverage,
  AlchemixV2LineCoverage,
} from "@/types/api/alchemix";

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

// The Transmuter's and V2's own coverage rows, read the same way from their own
// listings. Each position type states its own: a Transmuter position has no
// grade and V2 has no redemptions, so the Alchemist row above says nothing true
// about either. A failed read is null, which the page states as "did not
// answer", never as an empty record.

export async function alchemixTransmuterCoveragePageData(
  deployment: AlchemixDeployment,
): Promise<AlchemixTransmuterLineCoverage[] | null> {
  const hop = await boxHop();
  if (!hop) return null;
  try {
    const res = await fetchAlchemixTransmuterPositions({
      chainId: deployment.chainId,
      limit: 1,
      baseUrl: hop.baseUrl,
      headers: hop.headers,
    });
    return res.coverage.lines.filter((l) => l.chainId === deployment.chainId);
  } catch (err) {
    console.error(`Alchemix Transmuter coverage read failed (chain ${deployment.chainId}):`, err);
    return null;
  }
}

/** V2 ran on Ethereum only, so on any other chain there is nothing to read. */
export async function alchemixV2CoveragePageData(
  deployment: AlchemixDeployment,
): Promise<AlchemixV2LineCoverage[] | null> {
  const keys = v2LinesForChain(deployment.chainId).map((l) => l.key);
  if (keys.length === 0) return [];
  const hop = await boxHop();
  if (!hop) return null;
  try {
    const res = await fetchAlchemixV2Positions({ lines: keys, limit: 1, baseUrl: hop.baseUrl, headers: hop.headers });
    return res.coverage.lines.filter((l) => keys.includes(l.lineKey));
  } catch (err) {
    console.error("Alchemix V2 coverage read failed:", err);
    return null;
  }
}
