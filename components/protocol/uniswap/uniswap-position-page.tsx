// One Uniswap position on Ethereum (rails-ops ui-jobs 556, door 1), at
// `/ethereum/uniswap-v3/position/<id>` and `/ethereum/uniswap-v4/position/<id>`:
// the position card, then the six-line readout under it. One read of
// rails-server's at-block route (lib/api/fetch-uniswap.ts) serves both.
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { UniswapPositionCard } from "@/components/protocol/uniswap/uniswap-position-card";
import { UniswapReadout } from "@/components/protocol/uniswap/uniswap-readout";
import { fetchUniswapPosition } from "@/lib/api/fetch-uniswap";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";
import { poolPosition } from "@/lib/uniswap/position";
import { cardProv } from "@/lib/uniswap/provenance";
import type { UniswapVersion } from "@/lib/uniswap/types";
import { POSITION_PAGE } from "@/lib/uniswap/words";

/** One read per request: the metadata and the page share it. */
export const loadUniswapPosition = cache((version: UniswapVersion, id: string) => fetchUniswapPosition(version, id));

export const isPositionId = (id: string): boolean => /^\d{1,78}$/.test(id);

export async function UniswapPositionPage({ version, id }: { version: UniswapVersion; id: string }) {
  if (!isPositionId(id)) notFound();
  const answer = await loadUniswapPosition(version, id);
  if (answer.kind === "not-found") notFound();
  const session = version === "v3" ? "uniswap-v3" : "uniswap-v4";
  const home = explorerHref(1, session);
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
  const p = poolPosition(r);
  const title = POSITION_PAGE.title(p);
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <DetailTopRow
            session={session}
            fallbackHref={`${home}/${r.owner.toLowerCase()}`}
            showStamp={false}
            assets={[
              // Quote per base, flipped where that reads below 0.001 (as the card's range does).
              p.price >= 0.001
                ? {
                    symbol: p.base.symbol,
                    address: p.base.address,
                    price: p.price,
                    unit: p.quote.symbol,
                    label: `One ${p.base.symbol} in ${p.quote.symbol}, at the pool's price`,
                    info: cardProv("price", { p, r }),
                  }
                : {
                    symbol: p.quote.symbol,
                    address: p.quote.address,
                    price: 1 / p.price,
                    unit: p.base.symbol,
                    label: `One ${p.quote.symbol} in ${p.base.symbol}, at the pool's price`,
                    info: cardProv("price", { p, r }),
                  },
            ]}
            priceReason={ORACLE_USD_REASON[session]}
            owner={{ wallet: r.owner, filterProtocol: null, href: `${home}/${r.owner.toLowerCase()}` }}
            tools={false}
          />
          <h2 className="text-lg font-semibold text-foreground" data-uniswap-position={`${version}:${id}`}>
            {title}
          </h2>
          <p className="text-xs text-rb-500">{POSITION_PAGE.sub(p)}</p>
        </header>
        <div className="flex flex-col gap-6">
          <UniswapPositionCard r={r} />
          <UniswapReadout r={r} title={title} />
        </div>
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
