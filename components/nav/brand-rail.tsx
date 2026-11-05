"use client";

// BrandRail — the narrow vertical strip down the left edge of every page from
// md (rails-ops TO-DO-ui-jobs 67, 68, 498), fixed, so the nav holds its place
// as the page scrolls. The Rails mark at the top opens the wallet panel
// (H15.1, ui-jobs 509), which glides out from the rail's right edge with the
// search and the explorer chooser; the beta pill is at the foot.
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
// BELOW `md` THERE IS NO RAIL: at phone widths 56px of permanent gutter is a
// sixth of the page. HeaderBar draws the mark and its chevron there.

import { SearchLauncher } from "@/components/shared/front-door-search";

/** The release-stage pill at the very foot of the rail
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
        {/* The Rails mark opens the wallet panel (H15.1, ui-jobs 509): the
            search and the explorer chooser; a chevron shows beside it on
            hover. Home is in the panel's top row. */}
        <SearchLauncher placement="rail" />
        {/* The pill flush to the left edge. The theme switch is in the
            profile control's menu (H20, ui-jobs 504). */}
        <div className="flex w-full flex-col items-center">
          <BetaPill />
        </div>
      </aside>
    </>
  );
}
