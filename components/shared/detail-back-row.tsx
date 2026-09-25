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
import { LatestPrices } from "@/components/shared/latest-prices";
import type { PriceStripAsset } from "@/components/shared/price-strip";
import { ToolsMenu } from "@/components/shared/tools-menu";

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
    <button type="button" onClick={onBack} aria-label="Back" className={NAV_BUTTON}>
      <ArrowLeft size={14} />
      <span className={compact ? "hidden sm:inline" : undefined}>Back</span>
    </button>
  );
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
 *  stamp there would assert a freshness the page doesn't have.
 *
 *  `assets` is what the dock used to be handed. A view that does not price its
 *  assets yet passes none and the dropdown says so, which is a fact about that
 *  explorer rather than a missing control. */
export function DetailTopRow({
  session,
  wallet,
  showStamp = true,
  assets = [],
  children,
}: {
  session: SessionProtocol;
  wallet?: string | null;
  showStamp?: boolean;
  assets?: PriceStripAsset[];
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5">
        <RailHeader session={session} venue="position" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <DetailBackButton session={session} wallet={wallet} compact />
          {showStamp && <RecencyStamp />}
          <LatestPrices assets={assets} />
        </div>
        {/* Tools is part of the row, not of the export menu that usually fills
            it: a caller renders its shapes only once the view has loaded
            (`{view && <ExportMenu …/>}`), and the provenance inspector has to
            be reachable before then and on a view that never resolves — which
            is what the dock used to guarantee. A bare menu carries the
            inspector alone until the shapes arrive. */}
        {children || <ToolsMenu />}
      </div>
    </div>
  );
}
