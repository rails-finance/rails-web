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
import { alchemixMarketWord } from "@/lib/alchemix/naming";
import { loadAlchemixV2Position } from "@/lib/alchemix/v2-page-data";
import type { AlchemixV2History } from "@/components/protocol/alchemix/alchemist-position-view";
import { ALCHEMIX_TOKEN_ID } from "@/lib/sources/api/alchemix-position-backend";

export interface AlchemixPositionParams {
  lineKey: string;
  tokenId: string;
}

export async function alchemixPositionMetadata(
  deployment: AlchemixDeployment,
  { lineKey, tokenId }: AlchemixPositionParams,
): Promise<Metadata> {
  // The page's own cached read, so the title costs no second request.
  const tail = await loadAlchemistPositionTail(deployment.chainId, lineKey, tokenId);
  return positionMetadata({
    session: deployment.session,
    subject: tokenId,
    // "Alchemix alUSD Position 1221": the naming ruling (lib/alchemix/naming.ts)
    // in the house title's capitalisation. The line key stands in only when
    // the read failed.
    market: alchemixMarketWord(tail.position?.syntheticSymbol ?? lineKey),
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

  // The V2 account this position's holder closed on 2026-04-02, where the
  // successor table links one. Its rows join the timeline, marked V2, so a
  // wallet that migrated reads as one story; the version filter shows or hides
  // them and nothing on the page sums across the two. They join only a WHOLE
  // V3 history: V2's rows are all older than V3's, so on a windowed page they
  // would sit past a cut the page has not drawn.
  const v2History = await loadV2History(deployment, tail.position.v2Predecessors ?? [], !tail.hasMore);

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
      lineEventWindow={tail.lineEventWindow}
      initialLiveState={live}
      v2History={v2History}
    />
  );
}

async function loadV2History(
  deployment: AlchemixDeployment,
  links: { lineKey: string; account: string }[],
  whole: boolean,
): Promise<AlchemixV2History | null> {
  if (links.length === 0) return null;
  const reads = await Promise.all(links.map((l) => loadAlchemixV2Position(deployment.chainId, l.lineKey, l.account)));
  const positions = reads.flatMap((r) => (r.position ? [r.position] : []));
  // All or nothing: a V2 history with one account's rows missing would read as
  // that account having none.
  const joined = whole && positions.length === links.length && positions.every((p) => !p.eventsTruncated);
  return {
    links: links.map((l) => ({
      ...l,
      syntheticSymbol:
        positions.find((p) => p.lineKey === l.lineKey && p.account === l.account)?.syntheticSymbol ?? null,
    })),
    events: joined ? positions.flatMap((p) => p.events) : [],
    joined,
  };
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
