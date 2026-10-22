"use client";

import { useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { launchedProductionChainNames } from "@/lib/shared/protocols";
import { FrontDoorSearch, walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLETS } from "@/lib/home/sample-wallets";

// The inline blocking script in app/layout.tsx flips `data-hero-seen` on <html>
// before paint on hard loads, but it can't run on App Router soft navigations.
// Mirror that here with a layout effect (runs before paint, so no replay flash)
// and fall back to useEffect during SSR.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Home hero — the site's front door (rails-ops decision 0051): the headline
 * names the place ("Destination DeFi"), the Rails line states the promise, then
 * the search (H15) landing on the wallet view, a sample wallet to try
 * (`SAMPLE_WALLETS`), and the ticked terms (read-only / no wallet connection /
 * the chains). The explorer directory lives further down the page
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
export function HomeHero() {
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
    // overflow-x-clip: the glow is clipped at the sides, and the search's
    // bookmarks dropdown is free to run below the section over the live
    // example (Miles, 22 Oct 2026: it was cut at the section's foot).
    <section
      className="flex flex-col items-center text-center pt-24 pb-10 sm:pb-15 overflow-x-clip relative"
      data-anatomy="S1"
    >
      <div className="absolute top-22 left-1/2 -translate-x-1/2 w-[500px] h-[220px] bg-[var(--marketing)]/[0.07] rounded-full blur-[80px] pointer-events-none" />
      <h1
        className="relative font-semibold leading-none tracking-tighter mb-4 px-4 text-6xl sm:text-7xl lg:text-8xl animate-hero-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        Destination <span className="marketing">DeFi</span>
      </h1>
      <p
        className="relative font-sans font-light text-rb-500 tracking-tight mb-12 px-4 text-lg sm:mb-20 sm:text-xl animate-hero-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        Explore any DeFi position, verified directly from the chain.
      </p>
      <div
        className="relative w-full max-w-2xl px-4 text-left animate-hero-fade-up"
        style={{ animationDelay: "0.25s" }}
      >
        <FrontDoorSearch
          size="lg"
          bookmarks="all"
          hideEmptyBookmarks
          after={
            <Link
              href={walletHref(SAMPLE_WALLETS[0].address)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1 text-sm font-medium text-blue-500 hover:text-blue-600 focus-ring"
              data-sample-wallet={SAMPLE_WALLETS[0].address}
              aria-label="Try a sample wallet"
            >
              Sample <span aria-hidden="true">→</span>
            </Link>
          }
        />
      </div>
      {/* The terms, ticked — under the search; the checks carry the separation. */}
      <p
        className="relative mt-16 flex flex-wrap sm:mt-[120px] items-center justify-center gap-x-5 gap-y-1 px-4 text-xs font-medium uppercase tracking-[0.14em] text-rb-500 animate-hero-fade-up"
        style={{ animationDelay: "0.3s" }}
      >
        {TERMS.map((term) => (
          <span key={term} className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-green-500" strokeWidth={3} aria-hidden="true" />
            {term}
          </span>
        ))}
      </p>
    </section>
  );
}

// The last term is a coverage claim, so it names the chains a reader can
// actually reach from the nav rather than writing them out — see
// `launchedProductionChainNames`.
const TERMS = ["read-only", "no wallet connection", launchedProductionChainNames()];
