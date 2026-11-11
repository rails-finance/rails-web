// One Morpho Blue position read on visit (rails-ops ui-jobs 577 and 578), at
// `/arc/morpho/<wallet>/<market id>` or `/optimism/morpho/<wallet>/<market id>`:
// the position card, read from rails-server's at-block route
// (lib/api/fetch-morpho-at-block.ts). The layout is Aave V4 on Arc's
// (components/protocol/aave-v4-arc/aave-v4-arc-position-page.tsx).
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
import {
  isMorphoMarketId,
  isMorphoWallet,
  MORPHO_ARC,
  MORPHO_OPTIMISM,
  type MorphoAtBlockDeployment,
} from "@/lib/morpho-at-block/types";
import { positionPageWords } from "@/lib/morpho-at-block/words";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

/** One read per request: the metadata and the page share it. */
export const loadMorphoAtBlockPosition = cache((api: MorphoAtBlockDeployment["api"], id: string, wallet: string) =>
  fetchMorphoAtBlockPosition(api === MORPHO_OPTIMISM.api ? MORPHO_OPTIMISM : MORPHO_ARC, id, wallet),
);

export async function MorphoAtBlockPositionPage({
  dep,
  market: rawId,
  wallet: raw,
}: {
  dep: MorphoAtBlockDeployment;
  market: string;
  wallet: string;
}) {
  if (!isMorphoWallet(raw) || !isMorphoMarketId(rawId)) notFound();
  const wallet = raw.toLowerCase();
  const id = rawId.toLowerCase();
  const answer = await loadMorphoAtBlockPosition(dep.api, id, wallet);
  if (answer.kind === "not-found") notFound();
  const words = positionPageWords(dep);
  const session = dep.session;
  const home = `${dep.route}/${wallet}`;
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
  const notIndexed = dep.notIndexedLine ? (
    <p className="mt-6 text-sm text-rb-500" data-not-indexed={dep.key}>
      {words.notIndexed}
    </p>
  ) : null;
  if (answer.kind === "error")
    return (
      <div className="py-8">
        {head}
        <p className="mt-6 text-sm text-rb-500" data-position-unanswered="">
          {words.unanswered}
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
            <h2
              className="text-lg font-semibold text-foreground"
              {...{ [`data-morpho-${dep.key}-position`]: `${id}:${wallet}` }}
            >
              {words.title(f)}
            </h2>
          </HistoryTitleRow>
          <p className="text-xs text-rb-500">
            {words.sub(f)} ·{" "}
            <Link href={morphoMarketHref(dep.chainId, r.market.loanToken, id)} className={INLINE_LINK}>
              The market
            </Link>
          </p>
        </header>
        {held ? (
          <MorphoAtBlockPositionCard r={r} dep={dep} />
        ) : (
          <p className="text-sm text-rb-500" {...{ [`data-morpho-${dep.key}-empty`]: "" }}>
            {words.empty}
          </p>
        )}
        {notIndexed}
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
