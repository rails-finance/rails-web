"use client";

// BrandRail — the narrow vertical strip down the left edge of every app/(app)
// surface (rails-ops TO-DO-ui-jobs 67, 68). The Rails mark sits at the top with
// the search's glyph under it (H15.1, decision 0051); the theme toggle and the
// beta pill share the foot. The glyph opens the wallet panel (ui-jobs 431),
// which glides out from the rail's right edge with the bookmarks listed under
// the search; the separate bookmarks button (H11) went on 1 Nov 2026.
//
// IT IS A SURFACE, NOT A MARGIN (68): `bg-raised` is the same tone the cards
// and panels take, so the strip reads as chrome the page sits beside rather
// than as empty gutter that happens to have a glyph in it.
//
// WIDTH: 56px (w-14), icon width. The rail is a brand strip today and is
// expected to grow into a utility bar nested in some form of nav, so it starts
// at the width its contents need. Widening it later changes the rail;
// narrowing it later reflows every page.
//
// MARKETING KEEPS ITS PRESENT HEADER, its own theme toggle included, at every
// width. The rail is mounted from app/(app)/layout.tsx and reaches nothing
// under app/(site).
//
// BELOW `md` THERE IS NO RAIL: at phone widths 56px of permanent gutter is a
// sixth of the page. HeaderBar draws the mark, the search's glyph, the theme
// toggle and the chain trigger there, as it did before this rail existed.

import Link from "next/link";
import { RailsMark } from "@/components/nav/rails-mark";

import { HeaderThemeToggle } from "@/components/nav/header-theme-toggle";
import { SearchLauncher } from "@/components/shared/front-door-search";
import { ChainSwitcher } from "@/components/nav/chain-switcher";

/** The Rails glyph, linking home — the same mark and the same link the top bar
 *  carried, without the wordmark, which will not fit at icon width. The wallet
 *  panel draws it too, at the top of its phone layout. */
export function RailsGlyph({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      aria-label="Rails home"
      onClick={onClick}
      className="text-foreground transition-colors hover:text-blue-500"
    >
      <RailsMark size={30} />
    </Link>
  );
}

/** The release-stage pill at the very foot of the rail, below the theme toggle
 *  (Miles, 2026-09-25). Drawn as a label coming out of the browser's left
 *  edge: a full-width strip across the foot of the 56px rail, square on every
 *  corner, the word centred. Under the glyph it read as part of the mark and pulled
 *  the eye to the top of the page; down here it is a standing note about the
 *  product. Same caution-500 anatomy the top bar uses, a size down to sit
 *  inside 56px. */
function BetaPill() {
  return (
    <span className="w-full bg-caution-500 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wide text-white">
      Beta
    </span>
  );
}

export function BrandRail() {
  return (
    <>
      {/* Fixed, so the mark holds the top of the viewport and the foot cluster
          the bottom however far the page scrolls. `pt-4` is the same air the
          top bar used to give the glyph; no bottom padding, so the pill sits
          in the window's bottom-left corner. z-40 ties with the header; the rail is later in the
          document, so its glyph stays clickable under the header's full-width
          box. */}
      <aside
        aria-label="Rails"
        data-anatomy="H1"
        className="fixed inset-y-0 left-0 z-40 hidden w-14 flex-col items-center justify-between bg-raised pt-4 md:flex"
      >
        <div className="flex flex-col items-center gap-3">
          <RailsGlyph />
          <SearchLauncher placement="rail" />
          {/* The explorer chooser (H4, ui-jobs 497): a plain way to the roster
              from every app page, its panel opening to the rail's right. */}
          <ChainSwitcher variant="rail" />
        </div>
        {/* Toggle, then the pill flush to the left edge. `w-full` is what
            lets the pill sit at x=0 while the toggle stays centred in the
            56px. */}
        <div className="flex w-full flex-col items-center gap-1">
          <HeaderThemeToggle />
          <BetaPill />
        </div>
      </aside>
    </>
  );
}
