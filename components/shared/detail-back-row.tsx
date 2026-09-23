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
}: {
  session?: SessionProtocol;
  wallet?: string | null;
  fallbackHref?: string;
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
    <button type="button" onClick={onBack} className={NAV_BUTTON}>
      <ArrowLeft size={14} />
      <span>Back</span>
    </button>
  );
}

/** The rail header (identity + recency stamp + sub-nav — nothing lit, this
 *  is a position view), then the row: back button on the left, the export
 *  menu ("Copy for LLM") as `children` on the right. The header's tabs stay
 *  live links here — from a position, either rail surface is one click.
 *  `showStamp={false}` is for routes with no chain overlay (PWN) — rendering
 *  a stamp there would assert a freshness the page doesn't have. */
export function DetailTopRow({
  session,
  wallet,
  showStamp = true,
  children,
}: {
  session: SessionProtocol;
  wallet?: string | null;
  showStamp?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5">
        <RailHeader session={session} venue="position" stamp={showStamp} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <DetailBackButton session={session} wallet={wallet} />
        {children}
      </div>
    </div>
  );
}
