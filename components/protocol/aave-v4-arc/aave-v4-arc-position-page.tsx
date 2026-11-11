// One Aave V4 spoke account on Arc (rails-ops ui-jobs 577), at
// `/arc/aave-v4/spoke/<spoke>/<wallet>`: the account card, read from
// rails-server's at-block route (lib/api/fetch-aave-v4-arc.ts). The layout is
// Fluid on Base's (components/protocol/fluid-base/fluid-base-position-page.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AaveV4ArcPositionCard } from "@/components/protocol/aave-v4-arc/aave-v4-arc-position-card";
import { fetchAaveV4ArcPosition } from "@/lib/api/fetch-aave-v4-arc";
import { ARC_SESSION, arcSpokeBySlug, isArcWallet } from "@/lib/aave-v4-arc/types";
import { POSITION_PAGE } from "@/lib/aave-v4-arc/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";

const HOME = "/arc/aave-v4";

/** One read per request: the metadata and the page share it. */
export const loadAaveV4ArcPosition = cache((spoke: string, wallet: string) => fetchAaveV4ArcPosition(spoke, wallet));

export async function AaveV4ArcPositionPage({ spoke: slug, wallet: raw }: { spoke: string; wallet: string }) {
  const spoke = arcSpokeBySlug(slug);
  if (!spoke || !isArcWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const answer = await loadAaveV4ArcPosition(spoke.key, wallet);
  if (answer.kind === "not-found") notFound();
  const session = ARC_SESSION;
  const head = (
    <DetailTopRow
      session={session}
      fallbackHref={`${HOME}/${wallet}`}
      showStamp={false}
      priceReason={ORACLE_USD_REASON[session]}
      owner={{ wallet, filterProtocol: null, href: `${HOME}/${wallet}` }}
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
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          {head}
          <HistoryTitleRow id={session}>
            <h2 className="text-lg font-semibold text-foreground" data-aave-v4-arc-position={`${spoke.key}:${wallet}`}>
              {POSITION_PAGE.title(spoke.name)}
            </h2>
          </HistoryTitleRow>
          <p className="text-xs text-rb-500">{POSITION_PAGE.sub}</p>
        </header>
        {r.reserves.length === 0 ? (
          <p className="text-sm text-rb-500" data-aave-v4-arc-empty="">
            {POSITION_PAGE.empty(spoke.name)}
          </p>
        ) : (
          <AaveV4ArcPositionCard r={r} />
        )}
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
