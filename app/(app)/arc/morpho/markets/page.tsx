// Morpho Blue on Arc, the markets roster (/arc/morpho/markets): the shared
// roster (lib/morpho/roster.tsx) on rails-server's markets read
// (lib/morpho-at-block/markets.ts), every market from the CreateMarket list read at
// the head when the page opens. The test-token and never-supplied markets stay
// off the list and its counts, named in one line under the head with the idle
// market, which stays listed.

import Link from "next/link";
import { MorphoRosterPage } from "@/lib/morpho/roster";
import { rosterData, withRosterMarks } from "@/lib/morpho/markets-shape";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { fetchMorphoAtBlockMarkets } from "@/lib/api/fetch-morpho-at-block";
import { atBlockMarketsResponse, atBlockRosterMarks } from "@/lib/morpho-at-block/markets";
import { atBlockUnlisted } from "@/lib/morpho-at-block/unlisted";
import { MARKET_LIST_WORDS } from "@/lib/morpho-at-block/words";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";
import { listingMetadata } from "@/lib/shared/page-metadata";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { STALE_MARKETS } from "@/lib/morpho-at-block/stale";

export const dynamic = "force-dynamic";

export const metadata = listingMetadata({
  title: "Morpho Blue on Arc · Markets",
  canonicalPath: "/arc/morpho/markets",
  description:
    "Every Morpho Blue market on Arc, grouped by the token it lends: its collateral, LLTV, size, rates and utilisation, read from the chain.",
});

export default async function MorphoArcMarketsPage() {
  const answer = await fetchMorphoAtBlockMarkets();
  if (answer.kind !== "ok")
    return <MorphoRosterPage data={rosterData(STALE_MARKETS, null, "none")} chainId={ARC_CHAIN_ID} />;
  const d = rosterData(atBlockMarketsResponse(answer.data), null, "none");
  const u = atBlockUnlisted(answer.data);
  const unlisted = MARKET_LIST_WORDS.unlisted(u.test, u.never);
  const note = (
    <div className="mb-6 max-w-2xl space-y-1 text-[13px] leading-relaxed text-rb-500" data-morpho-arc-list-note="">
      {unlisted && <p data-morpho-arc-unlisted={`${u.test}:${u.never}`}>{unlisted}</p>}
      {u.idle && (
        <p data-morpho-arc-idle="">
          {MARKET_LIST_WORDS.idle}{" "}
          <Link href={morphoMarketHref(ARC_CHAIN_ID, u.idle.loanToken, u.idle.id)} className={INLINE_LINK}>
            {MARKET_LIST_WORDS.idleLink}
          </Link>
          .
        </p>
      )}
    </div>
  );
  return (
    <MorphoRosterPage
      data={withRosterMarks(d, atBlockRosterMarks(answer.data))}
      chainId={ARC_CHAIN_ID}
      note={note}
      unfundedLabel={MARKET_LIST_WORDS.emptyNow}
    />
  );
}
