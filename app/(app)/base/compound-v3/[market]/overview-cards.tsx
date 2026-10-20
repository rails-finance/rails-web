"use client";

// The holder view's cards: one Compound card per Comet at its listing surface,
// each the link to its market page, as a listing row wraps its card
// (components/shared/chain-truth-listing.tsx) without the listing's toolbar or
// paging. The model is Arbitrum's overview
// (app/(app)/arbitrum/compound-v3/[market]/overview-cards.tsx).

import Link from "next/link";
import { CompoundPositionCard, type CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { COMPOUND_BASE_CHAIN_ID } from "@/lib/compound-base/asset-catalog";
import { COMPOUND_BASE_PAGE } from "@/lib/compound-base/page-deployment";
import type { CaptureSource } from "@/lib/shared/capture-source";
import { markNavStart } from "@/lib/perf/settle-marks";

export interface OverviewCard {
  key: string;
  /** The Comet's market page. */
  href: string;
  view: CompoundPositionView;
  /** The Comet read for this Comet; null where it holds nothing now. */
  live: CompoundMarketChainResponse | null;
  /** The history's last row for this Comet was read at the chain. */
  baseAtChain: boolean;
}

const D = COMPOUND_BASE_PAGE;

export function CompoundBaseOverviewCards({
  cards,
  captureSource,
}: {
  cards: OverviewCard[];
  captureSource: CaptureSource;
}) {
  return (
    <div className="flex flex-col gap-3" data-compound-base-overview={cards.length}>
      {cards.map(({ key, href, view, live, baseAtChain }) => (
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
              vocab={D.vocab(baseAtChain)}
              session={D.session}
              lane={{ chainId: COMPOUND_BASE_CHAIN_ID, source: captureSource }}
              peaks={false}
              pagePath={href}
            />
          </Link>
        </div>
      ))}
    </div>
  );
}
