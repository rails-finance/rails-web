// A wallet's Aave V3 account on Optimism (rails-ops ui-jobs 578), at
// `/optimism/aave-v3/<wallet>`: one Pool, so the wallet's page is its account
// card, read from rails-server's at-block route (lib/api/fetch-aave-v3-optimism.ts).
// The layout is Aave V4 on Arc's account page.
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AaveV3OptimismPositionCard } from "@/components/protocol/aave-v3-optimism/aave-v3-optimism-position-card";
import { fetchAaveV3OptimismPosition } from "@/lib/api/fetch-aave-v3-optimism";
import { isOpWallet, OP_ROUTE, OP_SESSION } from "@/lib/aave-v3-optimism/types";
import { POSITION_PAGE } from "@/lib/aave-v3-optimism/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";

/** One read per request: the metadata and the page share it. */
export const loadAaveV3OptimismPosition = cache((wallet: string) => fetchAaveV3OptimismPosition(wallet));

export async function AaveV3OptimismPositionPage({ wallet: raw }: { wallet: string }) {
  if (!isOpWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const answer = await loadAaveV3OptimismPosition(wallet);
  if (answer.kind === "not-found") notFound();
  const session = OP_SESSION;
  const head = (
    <DetailTopRow
      session={session}
      fallbackHref={OP_ROUTE}
      showStamp={false}
      priceReason={ORACLE_USD_REASON[session]}
      owner={{ wallet, filterProtocol: null }}
      tools={false}
    />
  );
  if (answer.kind === "error")
    return (
      <div className="py-8">
        {head}
        <p className="mt-6 text-sm text-rb-500" data-position-unanswered="">
          {POSITION_PAGE.unanswered}
        </p>
      </div>
    );
  const r = answer.data;
  const held = r.reserves.some((x) => x.scaledSupply !== "0" || x.scaledDebt !== "0");
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          {head}
          <HistoryTitleRow id={session}>
            <h2 className="text-lg font-semibold text-foreground" data-aave-v3-optimism-position={wallet}>
              {POSITION_PAGE.title}
            </h2>
          </HistoryTitleRow>
          <p className="text-xs text-rb-500">{POSITION_PAGE.sub}</p>
        </header>
        {!held ? (
          <p className="text-sm text-rb-500" data-aave-v3-optimism-empty="">
            {POSITION_PAGE.empty}
          </p>
        ) : (
          <AaveV3OptimismPositionCard r={r} />
        )}
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
