"use client";

import Link from "next/link";
import { RailsMark } from "@/components/nav/rails-mark";
import { usePathname } from "next/navigation";

import { BookmarksLink } from "@/components/nav/bookmarks-link";
import { ChainSwitcher } from "@/components/nav/chain-switcher";
import { StartHereLink } from "@/components/nav/start-here-link";
import { HeaderThemeToggle } from "@/components/nav/header-theme-toggle";
import { SearchLauncher, useSlashToSearch } from "@/components/shared/front-door-search";

/** The Rails mark on the left of the bar below `md`, where BrandRail does not
 *  render, as the rail draws it (Miles 18 Oct 2026). Rails is the platform; the
 *  active rail's identity lives on the page itself (`ProtocolIdentity`), not in
 *  the chrome. */
function RailsLogo() {
  return (
    <Link
      href="/"
      aria-label="Rails home"
      className="flex shrink-0 items-center text-foreground transition-colors hover:text-blue-600 dark:hover:text-blue-400"
    >
      <RailsMark size={30} />
    </Link>
  );
}

/** Release-stage pill right of the mark, below `md`. The site is in beta, and the
 *  chrome says so once, site-wide, instead of a per-rail label. It travels
 *  with the mark, so from `md` up BrandRail draws it.
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
  // the room. The chrome is the same on every page (ui-jobs 498).
  const isHome = pathname === "/";

  return (
    <header
      data-anatomy="H2"
      // From `md` up every page has the rail (components/nav/rail-shell.tsx)
      // and nothing is left for this bar to carry: the mark, the search's
      // glyph, the theme toggle and the chooser are in BrandRail and H20 is at
      // the column's top right (ui-jobs 68, 497, 498). Below `md` there is no
      // rail and the bar is the only chrome, so it keeps every control.
      className={`${isHome ? "absolute inset-x-0 top-0 z-40" : "relative z-40 mb-2"} md:hidden`}
    >
      <div className="max-w-7xl mx-auto py-4 px-4 md:px-6 flex items-center">
        {/* The mark and the beta pill, which the rail holds from `md`. */}
        <div className="flex items-center">
          <RailsLogo />
          <BetaPill />
        </div>
        {/* Right-hand control cluster. `ml-auto` pushes it hard right — it used
            to yield (`md:ml-0`) to the inline site-links nav that sat here, but
            that nav is retired, so the cluster owns the push outright. The
            search's glyph and the toggle lead; the chooser and H20 close it
            (the order below). The hamburger is retired — the site's own pages and socials
            live in the footers (SiteFooter on site routes, AppFooter's
            quiet Coverage link on app routes). */}
        <div className="ml-auto flex items-center gap-1">
          {/* The search's glyph (H15.1): everywhere but home, whose hero is
              the search. It opens the wallet panel, whose suggestions list
              the bookmarks; the separate bookmarks button (H11) went on 1 Nov 2026.
              A sheet from the top on a phone. */}
          {!isHome && <SearchLauncher placement="header" />}
          <HeaderThemeToggle />
          {/* The explorer chooser's grid glyph (H4, ui-jobs 497), then the
              profile control (H20), on every page (ui-jobs 498). */}
          <ChainSwitcher variant="header" />
          {/* Home's "Start here" (S12), left of H20; elsewhere it renders nothing. */}
          <StartHereLink />
          <BookmarksLink />
        </div>
      </div>
    </header>
  );
}
