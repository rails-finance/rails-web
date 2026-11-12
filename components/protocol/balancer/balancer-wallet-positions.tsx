// A wallet's Balancer V3 pool shares on one chain (rails-ops ui-jobs 569), at
// `/<chain>/balancer-v3/<wallet>`: the pools the wallet holds a share of,
// found in Rails's index of the Vault's transfers (BalancerWalletList). The layout is
// Uniswap's (components/protocol/uniswap/uniswap-wallet-positions.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { isWallet } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { BalancerWalletList } from "@/components/protocol/balancer/balancer-wallet-list";
import { fetchBalancerPositions } from "@/lib/api/fetch-balancer";
import { FRONT_DOOR, REFUSED } from "@/lib/balancer/words";
import { BAL_CHAINS, type BalChainId } from "@/lib/balancer/chains";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";

export async function BalancerWalletPositions({ chainId, wallet: raw }: { chainId: BalChainId; wallet: string }) {
  if (!isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = BAL_CHAINS[chainId].session;
  const home = BAL_CHAINS[chainId].home;
  const answer = await fetchBalancerPositions(chainId, wallet);
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
          <HistoryTitleRow id={session}>
            <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading}</h2>
          </HistoryTitleRow>
        </header>
        {answer.kind !== "ok" ? (
          <p className="text-sm text-rb-500" data-balancer-unanswered={answer.kind === "refused" ? answer.code : ""}>
            {answer.kind === "refused" ? REFUSED[answer.code] : FRONT_DOOR.unanswered}
          </p>
        ) : (
          <BalancerWalletList r={answer.data} home={home} />
        )}
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
