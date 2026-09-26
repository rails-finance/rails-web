// The Transmuter position route, written once for both explorers.
// ----------------------------------------------------------------------------
// The twin of position-route.tsx. The line key is checked against the chain
// before anything is read, and the page, its metadata and its share card share
// one cached read per request.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { positionImage } from "@/lib/share/position-image";
import type { PositionCardModel } from "@/lib/share/position-card";
import { formatNumber } from "@/lib/utils/format";
import { TransmuterPositionView } from "@/components/protocol/alchemix/transmuter-position-view";
import { transmuterState } from "@/components/protocol/alchemix/transmuter-position-card";
import { RouteNotFound } from "@/components/shared/route-not-found";
import { isLineOnChain, transmuterPositionPath, type AlchemixDeployment } from "@/lib/alchemix/lines";
import { alchemixMarketWord } from "@/lib/alchemix/naming";
import { loadTransmuterPosition } from "@/lib/alchemix/transmuter-page-data";
import { ALCHEMIX_TOKEN_ID } from "@/lib/sources/api/alchemix-position-backend";

export interface TransmuterPositionParams {
  lineKey: string;
  nftId: string;
}

export async function transmuterPositionMetadata(
  deployment: AlchemixDeployment,
  { lineKey, nftId }: TransmuterPositionParams,
): Promise<Metadata> {
  const { position } = await loadTransmuterPosition(deployment.chainId, lineKey, nftId);
  return positionMetadata({
    session: deployment.session,
    subject: nftId,
    // "Alchemix alUSD Transmuter Position 12": the naming ruling, in the house
    // title's capitalisation. The line key stands in only when the read failed.
    market: alchemixMarketWord(position?.syntheticSymbol ?? lineKey, "transmuter"),
    canonicalPath: transmuterPositionPath(deployment, lineKey, nftId),
    image: "dynamic",
  });
}

export async function TransmuterPositionPage({
  deployment,
  params,
}: {
  deployment: AlchemixDeployment;
  params: TransmuterPositionParams;
}) {
  const { lineKey, nftId } = params;
  const read = await loadTransmuterPosition(deployment.chainId, lineKey, nftId);
  if (read.missing) notFound();
  if (!read.position) {
    // A read that did not land is not an absence, and the page says so.
    return (
      <RouteNotFound
        session={deployment.session}
        heading="This Transmuter position could not be read just now"
        backHref={`${deployment.basePath}/transmuter`}
        backLabel="Browse Transmuter positions"
      >
        The backend did not answer in time. The position may well exist; reloading the page reads it again.
      </RouteNotFound>
    );
  }
  return <TransmuterPositionView key={`${lineKey}:${nftId}`} deployment={deployment} position={read.position} />;
}

/** The share card, from the same cached read the page awaits. */
export function transmuterPositionImage(deployment: AlchemixDeployment, params: TransmuterPositionParams) {
  return positionImage({
    session: deployment.session,
    load: async (): Promise<PositionCardModel | null> => {
      const { lineKey, nftId } = params;
      if (!isLineOnChain(deployment.chainId, lineKey) || !ALCHEMIX_TOKEN_ID.test(nftId)) return null;
      const { position: p } = await loadTransmuterPosition(deployment.chainId, lineKey, nftId);
      if (!p) return null;
      const stats: PositionCardModel["stats"] = [
        { label: "Staked", value: `${formatNumber(Number(p.staked.raw) / 1e18)} ${p.staked.symbol}` },
        { label: "Matures at block", value: p.maturity.maturationBlock.toLocaleString("en-US") },
      ];
      if (p.claim?.claimed) {
        stats.push({
          label: "Claimed",
          value:
            `${formatNumber(Number(p.claim.claimed.raw) / 1e18)} ${p.claim.claimed.symbol ?? p.mytSymbol ?? ""}`.trim(),
        });
      }
      const state = transmuterState(p);
      return {
        session: deployment.session,
        subject: nftId,
        market: alchemixMarketWord(p.syntheticSymbol, "transmuter"),
        status: state === "maturing" ? "Maturing" : state === "matured" ? "Matured" : "Claimed",
        stats,
        asOf: new Date(),
      };
    },
  });
}
