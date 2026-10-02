"use client";

// The one detail-page top row. Every detail route used to hand-inline this
// skeleton (back affordance + recency stamp on the left, export menu on the
// right), and the copies drifted: five different back labels and two visual
// treatments across 19 routes. This file is now the single source — routes
// compose `DetailTopRow` (or `DetailBackButton` alone in loading / notice
// branches) instead of re-rolling the row.

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "@/components/nav/navigation-progress";
import { ArrowLeft } from "lucide-react";
import { NAV_BUTTON } from "@/lib/shared/ui-grammar";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { listingHrefForWallet, protocolForSession } from "@/lib/shared/protocols";
import { RailHeader } from "@/components/shared/rail-header";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { LatestPrices, type LatestPriceAsset, type PricesAt } from "@/components/shared/latest-prices";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { PositionWalletRow, type PositionOwner } from "@/components/shared/position-wallet-row";

/** The one back affordance on every detail page. NAV_BUTTON pill + ArrowLeft(14)
 *  + "Back". Smart-back: returns to the listing the viewer actually came from
 *  (filter intact) when there is browser history; on a fresh tab / direct link
 *  it pushes the wallet-filtered listing — or the bare listing when the route
 *  is id-keyed and carries no wallet — so it never dead-ends or leaves the
 *  site. (A bulletproof internal-vs-external check would need a nav-tracking
 *  provider; this hybrid covers the common cases in two lines.)
 *
 *  A SURFACE THAT IS NOT AN EXPLORER PASSES ITS OWN FALLBACK INSTEAD. The
 *  Vaults section has no roster entry to derive a listing from (rails-ops
 *  decision 0017), so it hands `fallbackHref` — its chain's section listing —
 *  and no session at all. `fallbackHref` wins wherever it is set, so a route
 *  that carries both is stating deliberately where a fresh tab should land.
 *  The LABEL never changes: smart-back still returns the viewer to wherever
 *  they came from, and only the fresh-tab case is what this names. */
export function DetailBackButton({
  session,
  wallet,
  fallbackHref: given,
  compact = false,
}: {
  session?: SessionProtocol;
  wallet?: string | null;
  fallbackHref?: string;
  /** Drop the word "Back" below sm, leaving the arrow. For the detail pages'
   *  latest row, which carries four controls across 390px and would otherwise
   *  wrap; the accessible name is unchanged. */
  compact?: boolean;
}) {
  const router = useRouter();
  const entryHref = (session ? protocolForSession(session)?.href : undefined) ?? "/";
  const derived = session && wallet ? (listingHrefForWallet(session, wallet) ?? entryHref) : entryHref;
  const fallbackHref = given ?? derived;
  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      startNavigationProgress(fallbackHref);
      router.push(fallbackHref);
    }
  };
  return (
    <button type="button" onClick={onBack} aria-label="Back" className={NAV_BUTTON} data-anatomy="H7.1">
      <ArrowLeft size={14} />
      <span className={compact ? "hidden sm:inline" : undefined}>Back</span>
    </button>
  );
}

/** A closed position's prices at its closing row's block. */
export interface ClosingPrices extends PricesAt {
  assets: LatestPriceAsset[];
}

/** The closing row, the newest of `events` that `isClosing` accepts (every row
 *  by default; a family passes a test where rows can follow the close, such
 *  as an NFT transfer), and the prices `price` reads off it. Undefined when
 *  the row carries no price, which leaves the dropdown out. */
export function closingPricesAt<E extends { blockNumber: number; timestamp: number }>(
  events: readonly E[],
  price: (row: E) => LatestPriceAsset[] | undefined,
  isClosing: (row: E) => boolean = () => true,
): ClosingPrices | undefined {
  let row: E | undefined;
  for (const e of events) if (isClosing(e) && (!row || e.blockNumber >= row.blockNumber)) row = e;
  if (!row) return undefined;
  const assets = price(row);
  return assets && assets.length > 0 ? { block: row.blockNumber, timestamp: row.timestamp, assets } : undefined;
}

/** The protocol's title, then one thin row of everything a position view says
 *  about "latest": back, the chain head and its age, and the position's assets
 *  at their current prices behind a dropdown — with the Tools menu (`children`)
 *  at the right end.
 *
 *  The row is what replaced the fixed bottom price dock on these views
 *  (rails-ops TO-DO-ui-jobs 48): the prices had nowhere to go on a phone but
 *  sideways, and the page's instruments were split between a floating dock and
 *  a menu up here. The title keeps its link to the protocol's listing; the
 *  rail's sub-nav does not follow a reader into a position, which is why
 *  RailHeader draws no tabs at the `position` venue.
 *
 *  `showStamp={false}` is for routes with no chain overlay (PWN) — rendering a
 *  stamp there would assert a freshness the page doesn't have. A closed
 *  position hides it too: the chain head's age says nothing about it.
 *
 *  `assets` is what the dock used to be handed, and every position view passes
 *  what it holds (ui-jobs 56) — priced, or named with no figure where the
 *  protocol states none. `priceReason` is that protocol's own recorded
 *  sentence, which the dropdown shows in place of the generic "not yet";
 *  `ORACLE_USD_REASON` in lib/shared/oracle-usd-reasons.ts holds them, and the
 *  coverage matrix's `oracleUsd: { why }` cell reads the same string. A view
 *  that has simply not been wired passes neither and keeps the generic line.
 *
 *  `owner` draws the wallet row under it (ui-jobs 228): the wallet the page
 *  belongs to, with Tools moved to that row's right. The row sits nearer the
 *  card than the back row; the card then leaves the wallet out of its header. */
export function DetailTopRow({
  session,
  wallet,
  showStamp = true,
  assets = [],
  priceReason,
  closed = false,
  closing,
  owner,
  children,
}: {
  session: SessionProtocol;
  wallet?: string | null;
  showStamp?: boolean;
  assets?: LatestPriceAsset[];
  priceReason?: string;
  /** The position is closed. Today's prices say nothing about it, so the
   *  dropdown shows `closing` in their place, or is left out when the family
   *  has no price at the closing block. */
  closed?: boolean;
  /** The prices at the closing row's block (`closingPricesAt`). */
  closing?: ClosingPrices;
  /** The wallet row (PositionWalletRow); omitted, Tools stays on this row. */
  owner?: PositionOwner;
  children?: ReactNode;
}) {
  const closingPriced = closing != null && closing.assets.some((a) => typeof a.price === "number" && a.price > 0);
  // Its own scope (the towers' and panels' convention): the row sits ahead of
  // — a sibling of — the position card, so a route whose card is the only
  // opened scope leaves this trigger's price tracing nothing (rails-ops
  // provenance-receipts-grammar.md §7, the unscoped-sibling gap).
  const registry = useReceiptRegistry();
  return (
    // With the wallet row, the gap to the card (16px, in place of the page's
    // space-y-6 margin) is smaller than the gap above the row (24px), so the
    // row reads with the card.
    <div className={owner ? "mb-4" : undefined}>
      <div className="mb-2.5">
        <RailHeader session={session} venue="position" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-1 gap-y-2 sm:gap-x-2" data-anatomy="H7">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <DetailBackButton session={session} wallet={wallet} compact />
          {showStamp && !closed && <RecencyStamp compact />}
          <ProvReceiptsScope registry={registry}>
            {!closed ? (
              <LatestPrices assets={assets} reason={priceReason} />
            ) : (
              closingPriced && (
                <LatestPrices
                  assets={closing.assets}
                  reason={priceReason}
                  at={{ block: closing.block, timestamp: closing.timestamp }}
                />
              )
            )}
          </ProvReceiptsScope>
        </div>
        {/* Tools is part of the row, not of the export menu that usually fills
            it: a caller renders its shapes only once the view has loaded
            (`{view && <ExportMenu …/>}`), and the provenance inspector has to
            be reachable before then and on a view that never resolves — which
            is what the dock used to guarantee. A bare menu carries the
            inspector alone until the shapes arrive. */}
        {!owner && (children || <ToolsMenu />)}
      </div>
      {owner && (
        <div className="mt-6">
          {/* In the row's scope: a holder can carry a receipt (Polaris). */}
          <ProvReceiptsScope registry={registry}>
            <PositionWalletRow owner={owner} session={session} tools={children} />
          </ProvReceiptsScope>
        </div>
      )}
    </div>
  );
}
