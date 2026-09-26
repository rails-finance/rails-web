// The Alchemix V2 position route. V2 ran on Ethereum only, so one explorer
// takes it; the deployment record is passed all the same, and the line key is
// checked against the chain before anything is read.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { positionMetadata, shortSubject } from "@/lib/shared/page-metadata";
import { positionImage } from "@/lib/share/position-image";
import type { PositionCardModel } from "@/lib/share/position-card";
import { formatNumber } from "@/lib/utils/format";
import { AlchemixV2PositionView } from "@/components/protocol/alchemix/v2-position-view";
import { RouteNotFound } from "@/components/shared/route-not-found";
import { isV2LineOnChain, v2ListingPath, v2PositionPath, type AlchemixDeployment } from "@/lib/alchemix/lines";
import { alchemixMarketWord } from "@/lib/alchemix/naming";
import { loadAlchemixV2Position } from "@/lib/alchemix/v2-page-data";
import { ALCHEMIX_V2_ACCOUNT } from "@/lib/sources/api/alchemix-v2-backend";

export interface AlchemixV2PositionParams {
  lineKey: string;
  account: string;
}

export async function alchemixV2PositionMetadata(
  deployment: AlchemixDeployment,
  { lineKey, account }: AlchemixV2PositionParams,
): Promise<Metadata> {
  const { position } = await loadAlchemixV2Position(deployment.chainId, lineKey, account);
  return positionMetadata({
    session: deployment.session,
    subject: account.toLowerCase(),
    // "Alchemix alUSD V2 Position 0x8eb2…7d4c": the naming ruling in the house
    // title's capitalisation. The line key stands in only when the read failed.
    market: alchemixMarketWord(position?.syntheticSymbol ?? lineKey, "v2"),
    canonicalPath: v2PositionPath(deployment, lineKey, account),
    image: "dynamic",
  });
}

export async function AlchemixV2PositionPage({
  deployment,
  params,
}: {
  deployment: AlchemixDeployment;
  params: AlchemixV2PositionParams;
}) {
  const { lineKey, account } = params;
  const read = await loadAlchemixV2Position(deployment.chainId, lineKey, account);
  if (read.missing) notFound();
  if (!read.position) {
    return (
      <RouteNotFound
        session={deployment.session}
        heading="This V2 position could not be read just now"
        backHref={v2ListingPath(deployment)}
        backLabel="Browse V2 positions"
      >
        The backend did not answer in time. The position may well exist; reloading the page reads it again.
      </RouteNotFound>
    );
  }
  return (
    <AlchemixV2PositionView
      key={`${lineKey}:${account.toLowerCase()}`}
      deployment={deployment}
      position={read.position}
    />
  );
}

/** The share card, from the same cached read the page awaits. */
export function alchemixV2PositionImage(deployment: AlchemixDeployment, params: AlchemixV2PositionParams) {
  return positionImage({
    session: deployment.session,
    load: async (): Promise<PositionCardModel | null> => {
      const { lineKey, account } = params;
      if (!isV2LineOnChain(deployment.chainId, lineKey) || !ALCHEMIX_V2_ACCOUNT.test(account)) return null;
      const { position: p } = await loadAlchemixV2Position(deployment.chainId, lineKey, account);
      if (!p) return null;
      const stats: PositionCardModel["stats"] = [];
      if (p.frozenDebt) {
        stats.push({
          label: p.frozenDebt.sign === "credit" ? "Credit at close" : "Debt at close",
          value: `${formatNumber(Math.abs(p.frozenDebt.formatted))} ${p.syntheticSymbol}`,
        });
      }
      stats.push({ label: "Closed", value: "2 Apr 2026" });
      return {
        session: deployment.session,
        subject: shortSubject(p.account),
        market: alchemixMarketWord(p.syntheticSymbol, "v2"),
        status: "Closed",
        stats,
        asOf: new Date(),
      };
    },
  });
}
