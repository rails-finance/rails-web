"use client";

import { useEffect, useLayoutEffect, type CSSProperties } from "react";
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
 * h1 naming the place (the mark, "Rails", "Explorers"), the promise line under
 * it, the search (H15) landing on the wallet view, then the ticked terms
 * (independent / read-only / no login) (Miles, 5 Nov 2026). The way into /start
 * is in the profile control's menu (H20, ui-jobs 509). The explorer directory
 * lives further down the page under "Protocols with Rails Explorers"
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
    // 160px above and below at every width (Miles, 5 Nov 2026); below md the
    // header bar floats over the top of that band (HeaderBar's isHome branch).
    // overflow-x-clip: the glow is clipped at the sides.
    <section className="flex flex-col items-center text-center py-40 overflow-x-clip relative" data-anatomy="S1">
      <div className="absolute top-22 left-1/2 -translate-x-1/2 w-[500px] h-[220px] bg-[var(--marketing)]/[0.07] rounded-full blur-[80px] pointer-events-none" />
      {/* One line naming the place (Miles's mock, ui-jobs 498): the mark, "Rails",
          then "Explorers" in the marketing blue, never wrapped. The mark is
          sized in cap units so its right-hand leg spans the cap height, top on
          the cap line and bottom on the baseline (Miles, 4 Nov 2026); the long
          stroke reaches a little past both (MARK_STYLE). At every width the line
          is a fixed share of the search input's width: the wrapper takes the
          search wrapper's width and padding, so 100cqw is the input's width, and
          the h1's size is a share of it (TITLE_CQW below). */}
      <div className="relative mb-4 w-full max-w-2xl px-4 @container">
        <h1
          className="flex flex-nowrap items-baseline justify-center gap-x-[0.25em] whitespace-nowrap font-semibold leading-none tracking-tighter text-[length:var(--hero-title-size)] animate-hero-fade-up"
          style={{ "--hero-title-size": `${TITLE_CQW}cqw`, animationDelay: "0.05s" } as CSSProperties}
          data-hero-title=""
        >
          <span className="whitespace-nowrap text-foreground">
            <RailsMark size={60} className="inline-block" style={MARK_STYLE} uniform />
            Rails
          </span>{" "}
          <span className="marketing whitespace-nowrap">Explorers</span>
        </h1>
      </div>
      {/* The promise, under the h1 (Miles, 5 Nov 2026). */}
      <p
        className="relative mb-10 px-4 font-sans text-lg font-light tracking-tight text-rb-500 max-[419px]:text-base sm:text-xl animate-hero-fade-up"
        style={{ animationDelay: "0.1s" }}
        data-hero-subtitle=""
      >
        Look up any DeFi position, wallet and protocol, <br className="min-[640px]:hidden" />
        verified directly from the chain.
      </p>
      <div
        className="relative z-20 mb-12 w-full max-w-2xl px-4 text-left animate-hero-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        {/* No placeholder: the promise line above says what the field is for
            (Miles, 5 Nov 2026). The field keeps its accessible name. */}
        <FrontDoorSearch size="lg" suggest focusOnLoad placeholder="" />
      </div>
      {/* The terms, ticked, under the search (Miles, 5 Nov 2026); the checks
          carry the separation. */}
      <p className="relative mx-auto mb-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2 min-[400px]:gap-x-4 min-[400px]:px-4 min-[520px]:gap-x-5 text-xs font-medium uppercase tracking-[0.1em] min-[400px]:tracking-[0.14em] text-rb-500 animate-hero-fade-up">
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

// The mark against the h1's type: the right-hand leg of RailsMark (viewBox
// 0 0 200 200), from the top of its upper segment (y 47.853) to the foot of the
// lower step (y 142.388), is one cap height. The negative block margins leave a
// margin box of exactly that leg, so the line box ignores the rest of the mark
// and baseline alignment puts the leg's foot on the baseline. The negative left
// margin starts the box at the long stroke's ink (x 20.295), so the line's
// measured width runs from ink to ink.
const STROKE_LEFT = 20.295;
const STROKE_TOP = 47.853;
const STROKE_BOTTOM = 142.388;
const CAP = STROKE_BOTTOM - STROKE_TOP;
const MARK_STYLE = {
  width: `${200 / CAP}cap`,
  height: `${200 / CAP}cap`,
  marginTop: `${-STROKE_TOP / CAP}cap`,
  marginBottom: `${-(200 - STROKE_BOTTOM) / CAP}cap`,
  marginLeft: `${-STROKE_LEFT / CAP}cap`,
  marginRight: "0.16em",
  verticalAlign: "baseline",
} as const;

// The h1's size at every width, as a share of the search input's width (100cqw),
// set on the h1 as --hero-title-size so it can be tuned live. The line's width
// is linear in the size: 12.84cqw spans the input ink to ink; 9.5cqw runs it
// 74% of the input, the share Miles set on 4 Nov 2026.
const TITLE_CQW = 9.5;

// Rendered uppercase by the class on the <p>; the Check icon before each one
// is the separator.
const TERMS = ["Independent", "Read-only", "No login"];
