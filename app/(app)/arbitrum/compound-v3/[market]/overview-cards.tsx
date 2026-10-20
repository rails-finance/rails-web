"use client";

// The wallet overview's cards: one Compound card per Comet at its listing
// surface, each the link to its market page, as a listing row wraps its card
// (components/shared/chain-truth-listing.tsx) without the listing's toolbar or
// paging. The receipts name the Arbitrum lane the market page names
// (components/protocol/compound/compound-wallet-page.tsx, MarketSection).

import Link from "next/link";
import { CompoundPositionCard, type CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { COMPOUND_ARBITRUM_PAGE } from "@/lib/compound-arbitrum/page-deployment";
import type { CaptureSource } from "@/lib/shared/capture-source";
import { markNavStart } from "@/lib/perf/settle-marks";

export interface OverviewCard {
  key: string;
  /** The Comet's market page. */
  href: string;
  view: CompoundPositionView;
  /** The Comet read for this Comet; null where it holds nothing now. */
  live: CompoundMarketChainResponse | null;
}

const D = COMPOUND_ARBITRUM_PAGE;

export function CompoundArbitrumOverviewCards({
  cards,
  captureSource,
}: {
  cards: OverviewCard[];
  captureSource: CaptureSource;
}) {
  return (
    <div className="flex flex-col gap-3" data-compound-arbitrum-overview={cards.length}>
      {cards.map(({ key, href, view, live }) => (
        <div key={key} data-overview-market={key}>
          <Link
            href={href}
            prefetch={true}
            className="group/listing-row block"
            data-anatomy="N2"
            onClick={() => markNavStart(href)}
          >
            <CompoundPositionCard
              v={view}
              surface="listing"
              live={live ?? undefined}
              vocab={D.vocab(false)}
              session={D.session}
              lane={D.lane ? { ...D.lane, source: captureSource } : undefined}
              pagePath={href}
            />
          </Link>
        </div>
      ))}
    </div>
  );
}
