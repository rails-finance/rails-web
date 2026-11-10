// One Aerodrome Slipstream position on Base (rails-ops ui-jobs 566), at
// `/base/aerodrome/position/<deployment>/<id>`: the position card, then the
// six-line readout under it. One read of rails-server's at-block route
// (lib/api/fetch-aerodrome.ts) serves both. The layout is Uniswap's
// (components/protocol/uniswap/uniswap-position-page.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AerodromePositionCard } from "@/components/protocol/aerodrome/aerodrome-position-card";
import { AerodromeReadout } from "@/components/protocol/aerodrome/aerodrome-readout";
import { isPositionId, poolAssets } from "@/components/protocol/uniswap/uniswap-position-page";
import { fetchAerodromePosition } from "@/lib/api/fetch-aerodrome";
import { aeroPosition } from "@/lib/aerodrome/position";
import { cardProv } from "@/lib/aerodrome/provenance";
import { isDeployment, type AeroDeployment } from "@/lib/aerodrome/types";
import { POSITION_PAGE } from "@/lib/aerodrome/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";

/** One read per request: the metadata and the page share it. */
export const loadAerodromePosition = cache((deployment: AeroDeployment, id: string) =>
  fetchAerodromePosition(deployment, id),
);

export async function AerodromePositionPage({ deployment, id }: { deployment: string; id: string }) {
  if (!isDeployment(deployment) || !isPositionId(id)) notFound();
  const answer = await loadAerodromePosition(deployment, id);
  if (answer.kind === "not-found") notFound();
  const session = "aerodrome";
  const home = explorerHref(8453, session);
  if (answer.kind === "error")
    return (
      <div className="py-8">
        <DetailTopRow session={session} fallbackHref={home} showStamp={false} />
        <p className="mt-6 text-sm text-rb-500" data-position-unanswered="">
          {POSITION_PAGE.unanswered}
        </p>
      </div>
    );
  const r = answer.data;
  const p = aeroPosition(r);
  const title = POSITION_PAGE.title(p);
  const wallet = p.holder?.toLowerCase() ?? null;
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <DetailTopRow
            session={session}
            fallbackHref={wallet ? `${home}/${wallet}` : home}
            showStamp={false}
            assets={poolAssets({
              base: p.base,
              quote: p.quote,
              valueNow: p.valueNow,
              price: p.price,
              worthInfo: cardProv("worth", { p, r }),
              priceInfo: cardProv("price", { p, r }),
            })}
            priceReason={ORACLE_USD_REASON[session]}
            owner={wallet ? { wallet, filterProtocol: null, href: `${home}/${wallet}` } : undefined}
            tools={false}
          />
          <h2 className="text-lg font-semibold text-foreground" data-aerodrome-position={`${deployment}:${id}`}>
            {title}
          </h2>
          <p className="text-xs text-rb-500">{POSITION_PAGE.sub(p)}</p>
        </header>
        <div className="flex flex-col gap-6">
          <AerodromePositionCard r={r} />
          <AerodromeReadout r={r} title={title} />
        </div>
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
