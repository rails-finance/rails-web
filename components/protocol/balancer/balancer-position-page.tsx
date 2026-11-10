// A wallet's share of one Balancer V3 pool on Ethereum (rails-ops ui-jobs 569),
// at `/ethereum/balancer-v3/position/<pool>/<wallet>`: the card, then the
// readout under it. One read of rails-server's at-block route
// (lib/api/fetch-balancer.ts) serves both. The layout is Uniswap's
// (components/protocol/uniswap/uniswap-position-page.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ReadTierTitleRow } from "@/components/shared/read-tier-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AimGate } from "@/components/shared/aim-gate";
import { assetKey } from "@/lib/shared/asset-family";
import { isWallet } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { BalancerPositionCard } from "@/components/protocol/balancer/balancer-position-card";
import { BalancerReadout } from "@/components/protocol/balancer/balancer-readout";
import { fetchBalancerPosition } from "@/lib/api/fetch-balancer";
import { balPosition } from "@/lib/balancer/position";
import { POSITION_PAGE } from "@/lib/balancer/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";

/** One read per request: the metadata and the page share it. */
export const loadBalancerPosition = cache((pool: string, wallet: string) => fetchBalancerPosition(1, pool, wallet));

export async function BalancerPositionPage({ pool, wallet: raw }: { pool: string; wallet: string }) {
  if (!isWallet(pool) || !isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const answer = await loadBalancerPosition(pool.toLowerCase(), wallet);
  if (answer.kind === "not-found") notFound();
  const session = "balancer-v3";
  const home = explorerHref(1, session);
  if (answer.kind === "error")
    return (
      <div className="py-8">
        <DetailTopRow session={session} fallbackHref={`${home}/${wallet}`} showStamp={false} />
        <p className="mt-6 text-sm text-rb-500" data-position-unanswered="">
          {POSITION_PAGE.unanswered}
        </p>
      </div>
    );
  const r = answer.data;
  const p = balPosition(r);
  const title = POSITION_PAGE.title(p);
  // Focus (ui-jobs 557): the pool share is in focus when one of the pool's tokens is.
  return (
    <AimGate keys={r.tokens.map((t) => assetKey(1, t.address))} chain={1} what="This pool share">
      <div className="min-h-screen">
        <div className="py-8">
          <header className="mb-5" data-skel-section="page-header">
            <DetailTopRow
              session={session}
              fallbackHref={`${home}/${wallet}`}
              showStamp={false}
              priceReason={ORACLE_USD_REASON[session]}
              owner={{ wallet, filterProtocol: null, href: `${home}/${wallet}` }}
              tools={false}
            />
            <ReadTierTitleRow id={session}>
              <h2 className="text-lg font-semibold text-foreground" data-balancer-position={`${r.pool}:${r.wallet}`}>
                {title}
              </h2>
            </ReadTierTitleRow>
            <p className="text-xs text-rb-500">{POSITION_PAGE.sub(p)}</p>
          </header>
          <div className="flex flex-col gap-6">
            <BalancerPositionCard r={r} />
            <BalancerReadout r={r} title={title} />
          </div>
        </div>
        <ProvInspectorLayer />
      </div>
    </AimGate>
  );
}
