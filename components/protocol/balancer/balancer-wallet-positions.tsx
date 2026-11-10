// A wallet's Balancer V3 pool shares on Ethereum (rails-ops ui-jobs 569), at
// `/ethereum/balancer-v3/<wallet>`: the pools the wallet holds a share of,
// found from the liquidity it added (BalancerWalletList). The layout is
// Uniswap's (components/protocol/uniswap/uniswap-wallet-positions.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ReadTierTitleRow } from "@/components/shared/read-tier-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { isWallet } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { BalancerWalletList } from "@/components/protocol/balancer/balancer-wallet-list";
import { fetchBalancerPositions } from "@/lib/api/fetch-balancer";
import { FRONT_DOOR } from "@/lib/balancer/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";

export async function BalancerWalletPositions({ wallet: raw }: { wallet: string }) {
  if (!isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = "balancer-v3";
  const home = explorerHref(1, session);
  const answer = await fetchBalancerPositions(1, wallet);
  return (
    <div className="min-h-screen">
      <div className="py-8" data-balancer-wallet-page={wallet}>
        <header className="mb-5">
          <DetailTopRow
            session={session}
            fallbackHref={home}
            showStamp={false}
            priceReason={ORACLE_USD_REASON[session]}
            owner={{ wallet, filterProtocol: null }}
            tools={false}
          />
          <ReadTierTitleRow id={session}>
            <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading}</h2>
          </ReadTierTitleRow>
        </header>
        {answer.kind !== "ok" ? (
          <p className="text-sm text-rb-500">{FRONT_DOOR.unanswered}</p>
        ) : (
          <BalancerWalletList r={answer.data} home={home} />
        )}
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
