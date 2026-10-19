// The Transmuter position route, written once for both explorers.
// ----------------------------------------------------------------------------
// The twin of position-route.tsx. The line key is checked against the chain
// before anything is read, and the page, its metadata and its share card share
// one cached read per request.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeEventId, eventMetadata, positionMetadata } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";
import { alchemixEventPageDescription } from "@/lib/alchemix/explorer";
import { alchemixEventSentence } from "@/lib/alchemix/event-sentence";
import { transmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";
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

export interface TransmuterEventParams extends TransmuterPositionParams {
  eventId: string;
}

/** The event page's metadata (rails-ops TO-DO-ui-jobs 236): the event named
 *  through the adapter, found in the page's cached read. */
export async function transmuterEventMetadata(
  deployment: AlchemixDeployment,
  { lineKey, nftId, eventId }: TransmuterEventParams,
): Promise<Metadata> {
  const decoded = decodeEventId(eventId);
  const { position } = await loadTransmuterPosition(deployment.chainId, lineKey, nftId);
  const event = position?.events.find((e) => e.id === decoded) ?? null;
  const sym = position?.syntheticSymbol ?? lineKey;
  return eventMetadata({
    session: deployment.session,
    subject: nftId,
    market: alchemixMarketWord(sym, "transmuter"),
    canonicalPath: `${transmuterPositionPath(deployment, lineKey, nftId)}/event/${encodeURIComponent(decoded)}`,
    event:
      event && position
        ? {
            actionLabel: alchemixEventSentence(event, position.events, {
              mytSymbol: position.claim?.claimed?.symbol ?? position.mytSymbol,
              early: transmuterEarlyClaim(position),
            }),
            timestamp: event.timestamp,
          }
        : null,
    description: event
      ? alchemixEventPageDescription(deployment, sym, nftId, event.timestamp, "transmuter")
      : undefined,
  });
}

/** The event's share card, from the page's cached read. */
export function transmuterEventImage(deployment: AlchemixDeployment, params: TransmuterEventParams) {
  return eventImage({
    session: deployment.session,
    load: async () => {
      const { lineKey, nftId, eventId } = params;
      if (!isLineOnChain(deployment.chainId, lineKey) || !ALCHEMIX_TOKEN_ID.test(nftId)) return null;
      const decoded = decodeEventId(eventId);
      const { position } = await loadTransmuterPosition(deployment.chainId, lineKey, nftId);
      const event = position?.events.find((e) => e.id === decoded);
      if (!position || !event) return null;
      return eventCardModel(event, {
        session: deployment.session,
        subject: nftId,
        market: alchemixMarketWord(position.syntheticSymbol, "transmuter"),
      });
    },
  });
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
