// The Alchemist position route, written once for both explorers.
// ----------------------------------------------------------------------------
// Alchemix runs as two roster entries — one per chain — because a position's
// identity is the (chain, line) pair and a token id on one chain says nothing
// about the same number on the other (rails-ops decisions/0016). What the two
// routes do NOT need is two copies of this: the deployment record carries the
// chain, the route and the session key, and every chain-dependent thing below
// is read from it. Each chain's `page.tsx` is then the deployment it names.
//
// The line key is checked AGAINST THE CHAIN before anything is read. A key that
// is real on the other chain is a 404 here, not a position served by the wrong
// explorer: the two would be different positions wearing the same id.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { positionImage } from "@/lib/share/position-image";
import { AlchemistPositionView } from "@/components/protocol/alchemix/alchemist-position-view";
import { isLineOnChain, type AlchemixDeployment } from "@/lib/alchemix/lines";
import { loadAlchemistPositionTail, loadAlchemistLiveState } from "@/lib/alchemix/position-page-data";
import { alchemixShareCardModel } from "@/lib/alchemix/share-card";
import { ALCHEMIX_TOKEN_ID } from "@/lib/sources/api/alchemix-position-backend";

export interface AlchemixPositionParams {
  lineKey: string;
  tokenId: string;
}

export function alchemixPositionMetadata(
  deployment: AlchemixDeployment,
  { lineKey, tokenId }: AlchemixPositionParams,
): Metadata {
  return positionMetadata({
    session: deployment.session,
    subject: tokenId,
    market: lineKey,
    canonicalPath: `${deployment.basePath}/${lineKey}/${tokenId}`,
    // This route carries its own opengraph-image; the static per-explorer PNG
    // stays its fallback.
    image: "dynamic",
  });
}

export async function AlchemixPositionPage({
  deployment,
  params,
}: {
  deployment: AlchemixDeployment;
  params: AlchemixPositionParams;
}) {
  const { lineKey, tokenId } = params;
  const tail = await loadAlchemistPositionTail(deployment.chainId, lineKey, tokenId);
  // Only an ANSWERED backend with no such position reaches this. A read that
  // failed leaves `missing` false, and the page renders what it has.
  if (tail.missing || !tail.position || !tail.events) notFound();

  // The current figures, read at render. Best-effort and separate from the
  // tail: earmarked accrues every block, so this is where a CURRENT figure can
  // come from, and its absence leaves a slot that says so rather than a stored
  // figure standing in for one.
  const live = await loadAlchemistLiveState(deployment.chainId, lineKey, tokenId);

  return (
    <AlchemistPositionView
      // Keyed on the position so a client-side move to another one remounts
      // with the new server tail as its initial state.
      key={`${lineKey}:${tokenId}`}
      deployment={deployment}
      lineKey={lineKey}
      tokenId={tokenId}
      position={tail.position}
      coverage={tail.coverage}
      events={tail.events}
      totalEvents={tail.hasMore ? tail.totalEvents : null}
      lineScopedNote={tail.lineScopedNote}
      initialLiveState={live}
    />
  );
}

/** The position's share card — a second consumer of the same server read the
 *  page awaits, never a read of its own. */
export function alchemixPositionImage(deployment: AlchemixDeployment, params: AlchemixPositionParams) {
  return positionImage({
    session: deployment.session,
    load: async () => {
      const { lineKey, tokenId } = params;
      // The page's own gate, applied BEFORE anything is read: a malformed
      // parameter must cost zero outbound requests.
      if (!isLineOnChain(deployment.chainId, lineKey) || !ALCHEMIX_TOKEN_ID.test(tokenId)) return null;
      const tail = await loadAlchemistPositionTail(deployment.chainId, lineKey, tokenId);
      return alchemixShareCardModel(tail, deployment, tokenId);
    },
  });
}
