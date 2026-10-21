"use client";

import { useEffect, useLayoutEffect } from "react";
import { Check } from "lucide-react";
import { launchedProductionChainNames } from "@/lib/shared/protocols";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import { FrontDoorStrip } from "@/components/home/front-door-strip";
import type { StripCard } from "@/lib/home/front-door-strip-data";

// The inline blocking script in app/layout.tsx flips `data-hero-seen` on <html>
// before paint on hard loads, but it can't run on App Router soft navigations.
// Mirror that here with a layout effect (runs before paint, so no replay flash)
// and fall back to useEffect during SSR.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Home hero — the site's front door (rails-ops decision 0051): the headline
 * says the door ("Look up a wallet"), the Rails line states the promise, then
 * the search (H15) landing on the wallet view, a name to try, the ticked terms
 * (read-only / no wallet connection / the chains), and the strip of positions
 * Rails holds now (S10). The explorer directory lives further down the page
 * (ProtocolRow), and the header's "Open an explorer" menu reaches it too.
 *
 * Entrance animation runs once per browser via the `data-hero-seen` flag set
 * on <html> by the inline blocking script in app/layout.tsx (matching CSS in
 * globals.css disables the keyframes once flipped). Stored in localStorage so
 * the flag persists across tabs and sessions. Doing the gate purely in CSS
 * keeps SSR markup identical to post-hydration markup so there's no flicker.
 *
 * The blocking script only runs on hard loads, so on soft navigations back to
 * the home page we replay the gate here: if the flag is already stored, set the
 * <html> attribute synchronously before paint so the animation stays suppressed.
 * On the genuine first play the flag is absent, so we leave the attribute alone
 * and let the animation finish, then store the flag for next time.
 *
 * The roster-wide position count is NOT here — it reads as evidence rather than
 * headline, so it lives in CoveredStats, below the live example.
 */
export function HomeHero({ strip }: { strip: StripCard[] }) {
  useIsomorphicLayoutEffect(() => {
    try {
      if (localStorage.getItem("rails-hero-seen")) {
        document.documentElement.dataset.heroSeen = "1";
      } else {
        localStorage.setItem("rails-hero-seen", "1");
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    // pt-32: the header floats absolutely over the home gradient (see
    // HeaderBar's isHome branch), so the hero reserves its band here.
    <section className="flex flex-col items-center text-center pt-24 pb-4 overflow-hidden relative" data-anatomy="S1">
      <div className="absolute top-22 left-1/2 -translate-x-1/2 w-[500px] h-[220px] bg-[var(--marketing)]/[0.07] rounded-full blur-[80px] pointer-events-none" />
      <h1
        className="relative font-semibold leading-none tracking-tighter mb-4 px-4 text-5xl sm:text-6xl lg:text-7xl animate-hero-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        Look up a <span className="marketing">wallet</span>
      </h1>
      <p
        className="relative font-sans font-light text-rb-500 tracking-tight mb-8 px-4 text-xl sm:text-2xl lg:text-3xl animate-hero-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        Explore any DeFi position, verified directly from the chain.
      </p>
      <div
        className="relative w-full max-w-2xl px-4 text-left animate-hero-fade-up"
        style={{ animationDelay: "0.25s" }}
      >
        <FrontDoorSearch size="lg" bookmarks="all" hideEmptyBookmarks tryName="milodon.eth" />
      </div>
      {/* The terms, ticked — under the search; the checks carry the separation. */}
      <p
        className="relative mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 text-xs font-medium uppercase tracking-[0.14em] text-rb-500 animate-hero-fade-up"
        style={{ animationDelay: "0.3s" }}
      >
        {TERMS.map((term) => (
          <span key={term} className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-green-500" strokeWidth={3} aria-hidden="true" />
            {term}
          </span>
        ))}
      </p>
      <div className="relative mt-12 w-full">
        <FrontDoorStrip cards={strip} />
      </div>
    </section>
  );
}

// The last term is a coverage claim, so it names the chains a reader can
// actually reach from the nav rather than writing them out — see
// `launchedProductionChainNames`.
const TERMS = ["read-only", "no wallet connection", launchedProductionChainNames()];
