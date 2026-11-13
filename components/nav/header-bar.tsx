"use client";

import { useIsHome } from "@/hooks/useIsHome";

import { HomeBrand } from "@/components/nav/home-brand";
import { ProfileMenu } from "@/components/nav/profile-menu";
import { SearchLauncher, useSlashToSearch } from "@/components/shared/front-door-search";

export function HeaderBar() {
  // `/` reaches the search from every page; the bar is mounted on all of them.
  useSlashToSearch();

  // Home alone paints its own top-section gradient from the very top of the
  // viewport, so there the header floats over it (absolute, no reserved band)
  // instead of stacking above it — otherwise the body background shows through
  // the header strip and breaks the gradient. HomeHero's top padding reserves
  // the room. The chrome is the same on every page (ui-jobs 498).
  const isHome = useIsHome();

  return (
    <header
      data-anatomy="H2"
      // From `md` up every page has the rail (components/nav/rail-shell.tsx)
      // and nothing is left for this bar to carry: the mark, the search's
      // glyph, the theme toggle and the chooser are in BrandRail and H20 is at
      // the column's top right (ui-jobs 68, 497, 498). Below `md` there is no
      // rail and the bar is the only chrome.
      className={`${isHome ? "absolute inset-x-0 top-0 z-40" : "relative z-40 mb-2"} md:hidden`}
    >
      <div className="max-w-7xl mx-auto grid grid-cols-[1fr_auto_1fr] items-center py-4 px-4 md:px-6">
        {/* Left: the sidebar toggle, which opens the wallet panel (H15.1,
            ui-jobs 514); the panel's top row draws its open glyph in the same
            place, closing it. Centre: the Rails mark and name, a link home, on
            every page but home, whose hero carries them.
            Right: H20, with the inspector indicator (H7.4) left of it
            while the inspector is armed on a page with a traced value
            (ui-jobs 651); the theme switch and the way into /start being
            in its menu. Below md the beta pill is in the footer
            (components/nav/phone-beta.tsx). */}
        <div className="justify-self-start">
          <SearchLauncher placement="header" />
        </div>
        {isHome ? <span /> : <HomeBrand />}
        <div className="flex items-center gap-2 justify-self-end" data-header-cluster="">
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
