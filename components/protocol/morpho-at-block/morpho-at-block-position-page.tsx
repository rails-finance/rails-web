// One Morpho Blue position on Arc (rails-ops ui-jobs 577), at
// `/arc/morpho/<wallet>/<market id>`: the position card, read from
// rails-server's at-block route (lib/api/fetch-morpho-at-block.ts). The layout is
// Aave V4 on Arc's (components/protocol/aave-v4-arc/aave-v4-arc-position-page.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { MorphoAtBlockPositionCard } from "@/components/protocol/morpho-at-block/morpho-at-block-position-card";
import { fetchMorphoAtBlockPosition } from "@/lib/api/fetch-morpho-at-block";
import { morphoAtBlockFigures } from "@/lib/morpho-at-block/position";
import { MORPHO_ARC_ROUTE, MORPHO_ARC_SESSION, isMorphoMarketId, isMorphoWallet } from "@/lib/morpho-at-block/types";
import { POSITION_PAGE } from "@/lib/morpho-at-block/words";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

/** One read per request: the metadata and the page share it. */
export const loadMorphoAtBlockPosition = cache((id: string, wallet: string) => fetchMorphoAtBlockPosition(id, wallet));

export async function MorphoAtBlockPositionPage({ market: rawId, wallet: raw }: { market: string; wallet: string }) {
  if (!isMorphoWallet(raw) || !isMorphoMarketId(rawId)) notFound();
  const wallet = raw.toLowerCase();
  const id = rawId.toLowerCase();
  const answer = await loadMorphoAtBlockPosition(id, wallet);
  if (answer.kind === "not-found") notFound();
  const session = MORPHO_ARC_SESSION;
  const home = `${MORPHO_ARC_ROUTE}/${wallet}`;
  const head = (
    <DetailTopRow
      session={session}
      fallbackHref={home}
      showStamp={false}
      priceReason={ORACLE_USD_REASON[session]}
      owner={{ wallet, filterProtocol: null, href: home }}
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
  const f = morphoAtBlockFigures(r.market, r.position, r.head.time, r.tokens, r.usdFeeds);
  const held = r.position.supplyShares !== "0" || r.position.borrowShares !== "0" || r.position.collateral !== "0";
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          {head}
          <HistoryTitleRow id={session}>
            <h2 className="text-lg font-semibold text-foreground" data-morpho-arc-position={`${id}:${wallet}`}>
              {POSITION_PAGE.title(f)}
            </h2>
          </HistoryTitleRow>
          <p className="text-xs text-rb-500">
            {POSITION_PAGE.sub(f)} ·{" "}
            <Link href={morphoMarketHref(ARC_CHAIN_ID, r.market.loanToken, id)} className={INLINE_LINK}>
              The market
            </Link>
          </p>
        </header>
        {held ? (
          <MorphoAtBlockPositionCard r={r} />
        ) : (
          <p className="text-sm text-rb-500" data-morpho-arc-empty="">
            {POSITION_PAGE.empty}
          </p>
        )}
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
