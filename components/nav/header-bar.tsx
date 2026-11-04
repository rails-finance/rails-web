"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChainSwitcher } from "@/components/nav/chain-switcher";
import { HeaderThemeToggle } from "@/components/nav/header-theme-toggle";
import { SearchLauncher, useSlashToSearch } from "@/components/shared/front-door-search";

/** Marketing routes — everything under app/(site). Group names don't appear in
 *  the URL and the header sits above both group layouts, so the split has to be
 *  restated here by prefix. Keep in sync with app/(site)/. (The old top-level
 *  chain directories are gone — the per-chain coverage pages are the
 *  directory now, and /coverage's prefix already covers them.) */
const SITE_PREFIXES = ["/about", "/blog", "/coverage", "/privacy", "/pulse", "/start", "/terms"];

function isSiteRoute(pathname: string | null) {
  if (!pathname) return false;
  return SITE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** The Rails wordmark on the left of the bar on every marketing width; on the
 *  app surfaces, below `md` where BrandRail does not render, the mark alone
 *  (Miles 18 Oct 2026), as the rail draws it.
 *  Rails is the platform; the active
 *  rail's identity lives on the page itself (`ProtocolIdentity` above the
 *  detail back row, the mark in the listing h1), not in the chrome. No
 *  "Explorer" sublabel — there isn't a single explorer, there are mono-rails. */
function RailsLogo({ markOnly }: { markOnly?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={markOnly ? "Rails home" : undefined}
      className="group flex items-center gap-1.5 text-foreground hover:text-blue-500 transition-colors shrink-0"
    >
      <svg width={30} height={30} viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <path
          fill="currentColor"
          style={{ opacity: 0.85 }}
          d="M 79.763 159.671 L 111.637 159.671 L 52.168 41.625 L 20.295 41.625 L 79.763 159.671 Z"
        />
        <path
          fill="currentColor"
          style={{ opacity: 0.85 }}
          d="M 98.578 97.056 L 130.451 97.056 L 105.044 47.853 L 73.171 47.853 L 98.578 97.056 Z"
        />
        <path
          fill="currentColor"
          d="M 148.892 142.388 L 180.766 142.388 L 155.359 93.185 L 123.486 93.185 L 148.892 142.388 Z"
        />
      </svg>
      {!markOnly && <span className="text-base tracking-wide font-semibold">Rails</span>}
    </Link>
  );
}

/** Release-stage pill right of the wordmark, on app routes below `md` only
 *  (marketing carries the beta strip alone). The site is in beta, and the
 *  chrome says so once, site-wide, instead of a per-rail label. It travels
 *  with the mark, so on the app surfaces from `md` up BrandRail draws it.
 *  Caution-500 is the house "not settled yet" signal (the anatomy the old
 *  per-rail BETA pill used). */
function BetaPill() {
  return (
    <span className="ml-2 rounded bg-caution-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
      Beta
    </span>
  );
}

export function HeaderBar() {
  const pathname = usePathname();
  // `/` reaches the search from every page; the bar is mounted on all of them.
  useSlashToSearch();

  // Home alone paints its own top-section gradient from the very top of the
  // viewport, so there the header floats over it (absolute, no reserved band)
  // instead of stacking above it — otherwise the body background shows through
  // the header strip and breaks the gradient. HomeHero's top padding reserves
  // the room. So `isHome` owns POSITIONING.
  //
  // Chrome — the wordmark beside the mark, no beta pill, and the "Open an
  // explorer" CTA in place of the chain trigger — is marketing chrome, and it
  // belongs to every app/(site) page, not home alone. So `isMarketing` owns
  // CHROME.
  const isHome = pathname === "/";
  const isMarketing = isHome || isSiteRoute(pathname);

  return (
    <header
      data-anatomy="H2"
      className={`${isHome ? "absolute inset-x-0 top-0 z-40" : "relative z-40 mb-2"}${
        // From `md` up an app route has nothing left for this bar to carry:
        // the mark, the search's glyph and the theme toggle are in BrandRail
        // and the chain chooser is on the protocol title row (rails-ops TO-DO-ui-jobs
        // 68). So the bar goes rather than standing as an empty band, and
        // app/(app)/layout.tsx takes over the top spacing. Below `md` there is
        // no rail and the bar is the only chrome, so it keeps every control.
        isMarketing ? "" : " md:hidden"
      }`}
    >
      <div className="max-w-7xl mx-auto py-4 px-4 md:px-6 flex items-center">
        {/* The mark, and the beta pill on app routes only (this bar shows
            there below `md`, where there is no rail to hold them). Marketing
            carries the beta strip alone. */}
        <div className="flex items-center">
          <RailsLogo markOnly={!isMarketing} />
          {!isMarketing && <BetaPill />}
        </div>
        {/* Right-hand control cluster. `ml-auto` pushes it hard right — it used
            to yield (`md:ml-0`) to the inline site-links nav that sat here, but
            that nav is retired, so the cluster owns the push outright. The
            switcher trails it, rightmost: on app routes below `md` a chain
            trigger ("Ethereum ▾" — the chain, never the protocol; identity
            lives on the page), on marketing routes the "Open an explorer"
            pill. Both open the same roster panel. The search's glyph and the
            toggle lead — the switcher opens a panel, so it anchors the
            cluster's outer edge rather than sitting in the middle of it. The
            hamburger is retired with it — the site's own pages and socials
            live in the footers (SiteFooter on marketing routes, AppFooter's
            quiet Coverage link on app routes). */}
        <div className="ml-auto flex items-center gap-1">
          {/* The search's glyph (H15.1): everywhere but home, whose hero is
              the search. It opens the wallet panel, where the bookmarks are
              listed; the separate bookmarks button (H11) went on 1 Nov 2026.
              A sheet from the top on a phone. */}
          {!isHome && <SearchLauncher placement="header" />}
          <HeaderThemeToggle />
          <ChainSwitcher variant={isMarketing ? "cta" : "chain"} />
        </div>
      </div>
    </header>
  );
}
