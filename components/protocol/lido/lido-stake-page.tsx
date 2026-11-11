// A wallet's Lido stake (rails-ops ui-jobs 570), at `/ethereum/lido/<wallet>`:
// the stake card, the 30-day readout under it, then the wallet's withdrawal
// requests. A wallet holds one Lido stake, so the wallet page is the position
// page. One read of rails-server's at-block route (lib/api/fetch-lido.ts)
// serves all three. The layout is Balancer's pool-share page.
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
import { LidoStakeCard } from "@/components/protocol/lido/lido-stake-card";
import { LidoReadout } from "@/components/protocol/lido/lido-readout";
import { LidoRequests } from "@/components/protocol/lido/lido-requests";
import { fetchLidoStake } from "@/lib/api/fetch-lido";
import { STETH, WSTETH } from "@/lib/lido/types";
import { STAKE_PAGE } from "@/lib/lido/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";

/** One read per request: the metadata and the page share it. */
export const loadLidoStake = cache((wallet: string) => fetchLidoStake(wallet));

export async function LidoStakePage({ wallet: raw }: { wallet: string }) {
  if (!isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = "lido";
  const home = explorerHref(1, session);
  const answer = await loadLidoStake(wallet);
  if (answer.kind !== "ok")
    return (
      <div className="py-8">
        <DetailTopRow session={session} fallbackHref={home} showStamp={false} />
        <p className="mt-6 text-sm text-rb-500" data-position-unanswered="">
          {STAKE_PAGE.unanswered}
        </p>
      </div>
    );
  const r = answer.data;
  // Focus (ui-jobs 557): the stake is in focus when stETH or wstETH is.
  return (
    <AimGate keys={[assetKey(1, STETH), assetKey(1, WSTETH)]} chain={1} what="This Lido stake">
      <div className="min-h-screen">
        <div className="py-8" data-lido-stake-page={wallet}>
          <header className="mb-5" data-skel-section="page-header">
            <DetailTopRow
              session={session}
              fallbackHref={home}
              showStamp={false}
              priceReason={ORACLE_USD_REASON[session]}
              owner={{ wallet, filterProtocol: null }}
              tools={false}
            />
            <ReadTierTitleRow id={session}>
              <h2 className="text-lg font-semibold text-foreground" data-lido-stake={r.wallet.toLowerCase()}>
                {STAKE_PAGE.heading}
              </h2>
            </ReadTierTitleRow>
            <p className="text-xs text-rb-500">{STAKE_PAGE.sub}</p>
          </header>
          <div className="flex flex-col gap-6">
            <LidoStakeCard r={r} />
            <LidoReadout r={r} />
            <LidoRequests r={r} />
          </div>
        </div>
        <ProvInspectorLayer />
      </div>
    </AimGate>
  );
}
