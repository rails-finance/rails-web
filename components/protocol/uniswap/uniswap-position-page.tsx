// One Uniswap-family position (rails-ops ui-jobs 556, door 1; 568, 573, 575),
// at `<route>/position/<id>` under each explorer (`/ethereum/uniswap-v3`,
// `/base/uniswap-v3`, `/arbitrum/pancakeswap-v3`…): the position card, then
// the readout under it. One read of rails-server's at-block route
// (lib/api/fetch-uniswap.ts) serves both. A staked PancakeSwap position
// belongs to its staker, whose wallet the head links.
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AimGate } from "@/components/shared/aim-gate";
import { poolTokenKeys } from "@/components/protocol/uniswap/pool-focus-keys";
import { UniswapPositionCard } from "@/components/protocol/uniswap/uniswap-position-card";
import { UniswapReadout } from "@/components/protocol/uniswap/uniswap-readout";
import { fetchUniswapPosition } from "@/lib/api/fetch-uniswap";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { uniExplorer, type UniChainId, type UniProtocol } from "@/lib/uniswap/deployments";
import { poolPosition } from "@/lib/uniswap/position";
import { cardProv } from "@/lib/uniswap/provenance";
import type { Provenance } from "@/components/shared/provenance";
import type { UniToken, UniswapVersion } from "@/lib/uniswap/types";
import { POSITION_PAGE, num } from "@/lib/uniswap/words";

/** One read per request: the metadata and the page share it. */
export const loadUniswapPosition = cache(
  (version: UniswapVersion, id: string, protocol: UniProtocol = "uniswap", chainId: UniChainId = 1) =>
    fetchUniswapPosition(version, id, protocol, chainId),
);

export const isPositionId = (id: string): boolean => /^\d{1,78}$/.test(id);

/** The top row's price strip for a pool position: its worth first, then the pool's price, quote per
 *  base, flipped where that reads below 0.001. Aerodrome's page draws it too. */
export function poolAssets({
  base,
  quote,
  valueNow,
  price,
  worthInfo,
  priceInfo,
}: {
  base: UniToken;
  quote: UniToken;
  valueNow: number;
  price: number;
  worthInfo: Provenance;
  priceInfo: Provenance;
}) {
  return [
    {
      symbol: quote.symbol,
      address: quote.address,
      price: valueNow,
      unit: quote.symbol,
      figure: `${num(valueNow)} ${quote.symbol}`,
      triggerLabel: "Worth",
      label: `The position's worth in ${quote.symbol}, at the pool's price`,
      info: worthInfo,
    },
    price >= 0.001
      ? {
          symbol: base.symbol,
          address: base.address,
          price,
          unit: quote.symbol,
          figure: `${num(price)} ${quote.symbol}`,
          label: `One ${base.symbol} in ${quote.symbol}, at the pool's price`,
          info: priceInfo,
        }
      : {
          symbol: quote.symbol,
          address: quote.address,
          price: 1 / price,
          unit: base.symbol,
          figure: `${num(1 / price)} ${base.symbol}`,
          label: `One ${quote.symbol} in ${base.symbol}, at the pool's price`,
          info: priceInfo,
        },
  ];
}

export async function UniswapPositionPage({
  version,
  id,
  protocol = "uniswap",
  chainId = 1,
}: {
  version: UniswapVersion;
  id: string;
  protocol?: UniProtocol;
  chainId?: UniChainId;
}) {
  if (!isPositionId(id)) notFound();
  const answer = await loadUniswapPosition(version, id, protocol, chainId);
  if (answer.kind === "not-found") notFound();
  const x = uniExplorer(protocol, chainId, version);
  const session = x.id as SessionProtocol;
  const home = x.route;
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
  const p = poolPosition(r, protocol);
  const title = POSITION_PAGE.title(p);
  const holderHref = `${home}/${p.holder.toLowerCase()}`;
  const page = (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <DetailTopRow
            session={session}
            fallbackHref={holderHref}
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
            owner={{
              wallet: p.holder,
              filterProtocol: null,
              href: holderHref,
              ...(chainId === 1 ? {} : { chain: chainId }),
            }}
            tools={false}
          />
          <HistoryTitleRow id={session}>
            <h2 className="text-lg font-semibold text-foreground" data-uniswap-position={`${version}:${id}`}>
              {title}
            </h2>
          </HistoryTitleRow>
          <p className="text-xs text-rb-500">{POSITION_PAGE.sub(p)}</p>
        </header>
        <div className="flex flex-col gap-6">
          <UniswapPositionCard r={r} protocol={protocol} />
          <UniswapReadout r={r} title={title} protocol={protocol} />
        </div>
      </div>
      <ProvInspectorLayer />
    </div>
  );
  // Focus (ui-jobs 557): the position is in focus when either side of its pair is.
  // The Base and Arbitrum routes gate the page themselves (uniswap-focus.tsx).
  if (chainId !== 1) return page;
  return (
    <AimGate keys={poolTokenKeys(1, [r.token0, r.token1])} chain={1} what="This position">
      {page}
    </AimGate>
  );
}
