"use client";

import { useEffect, useLayoutEffect } from "react";
import { Check } from "lucide-react";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import { RailsMark } from "@/components/nav/rails-mark";

// The inline blocking script in app/layout.tsx flips `data-hero-seen` on <html>
// before paint on hard loads, but it can't run on App Router soft navigations.
// Mirror that here with a layout effect (runs before paint, so no replay flash)
// and fall back to useEffect during SSR.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Home hero — the site's front door (rails-ops decision 0051, ui-jobs 498): the
 * h1 names the place (the mark, "Rails", "DeFi Explorers"), the ticked terms
 * (independent / read-only / no login) under it, then the search (H15) landing
 * on the wallet view, and the promise line under that. The way into /start
 * (S12) is the "Start here" button at the top right
 * (components/nav/start-here-button.tsx); "Destination DeFi" closes the page as
 * its foot wordmark (S10). The explorer directory lives further down the page
 * (ProtocolRow), and the rail's chooser (H4) reaches it too.
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
    // pt-24: below md the header floats absolutely over the home gradient
    // (see HeaderBar's isHome branch), so the hero reserves its band here;
    // from md there is no bar, so the band closes to 64px.
    // overflow-x-clip: the glow is clipped at the sides.
    <section
      className="flex flex-col items-center text-center pt-24 pb-10 sm:pb-15 md:pt-16 overflow-x-clip relative"
      data-anatomy="S1"
    >
      <div className="absolute top-22 left-1/2 -translate-x-1/2 w-[500px] h-[220px] bg-[var(--marketing)]/[0.07] rounded-full blur-[80px] pointer-events-none" />
      {/* One line naming the place (Miles's mock, ui-jobs 498): the mark, "Rails",
          then "DeFi Explorers" in the marketing blue. The mark is sized in em so
          it scales with the type; where the line does not fit, "DeFi Explorers"
          wraps whole to a second line. */}
      <h1
        className="relative mb-6 flex flex-wrap items-center justify-center gap-x-[0.25em] gap-y-1 px-4 font-semibold leading-none tracking-tighter text-[clamp(2.5rem,12vw,3.75rem)] sm:text-7xl lg:text-8xl animate-hero-fade-up"
        data-hero-title=""
      >
        <span className="inline-flex items-center gap-[0.12em] text-foreground">
          <RailsMark size={60} className="size-[0.9em] shrink-0" />
          Rails
        </span>{" "}
        <span className="marketing whitespace-nowrap">DeFi Explorers</span>
      </h1>
      {/* The terms, ticked, under the h1; the checks carry the separation. */}
      <p
        className="relative mx-auto mb-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2 min-[400px]:gap-x-4 min-[400px]:px-4 min-[520px]:gap-x-5 text-xs font-medium uppercase tracking-[0.1em] min-[400px]:tracking-[0.14em] text-rb-500 animate-hero-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        {TERMS.map((term) => (
          <span key={term} className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-green-500" strokeWidth={3} aria-hidden="true" />
            {term}
          </span>
        ))}
      </p>
      <div
        className="relative z-20 w-full max-w-2xl px-4 text-left animate-hero-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        <FrontDoorSearch size="lg" suggest focusOnLoad />
      </div>
      <p
        className="relative font-sans font-light text-rb-500 tracking-tight mt-5 mb-12 px-4 text-lg sm:mb-16 sm:text-xl animate-hero-fade-up"
        style={{ animationDelay: "0.3s" }}
      >
        Look up any position, wallet and protocol, <br className="min-[640px]:hidden" />
        verified directly from the chain.
      </p>
    </section>
  );
}

// Rendered uppercase by the class on the <p>; the Check icon before each one
// is the separator.
const TERMS = ["Independent", "Read-only", "No login"];
