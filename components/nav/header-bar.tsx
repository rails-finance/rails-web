"use client";

import { usePathname } from "next/navigation";

import { ProfileMenu } from "@/components/nav/profile-menu";
import { SearchLauncher, useSlashToSearch } from "@/components/shared/front-door-search";

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
      // The chrome at every width (ui-jobs 509: no rail): the launcher at the
      // left, H20 at the right, the bar as wide as the viewport.
      className={isHome ? "absolute inset-x-0 top-0 z-40" : "relative z-40 mb-2"}
    >
      <div className="flex items-center px-4 py-4 md:px-6">
        {/* Left: the Rails mark with a chevron, which opens the wallet panel
            (H15.1, ui-jobs 509); the panel's top row draws it pointing left in
            the same place, closing it, and links Home. Right: H20 alone, the
            theme switch and the way into /start being in its menu. Below md
            the beta pill is in the footer (components/nav/phone-beta.tsx). */}
        <SearchLauncher placement="header" />
        <div className="ml-auto flex items-center">
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
