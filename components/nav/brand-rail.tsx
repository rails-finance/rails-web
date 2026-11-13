"use client";

// BrandRail — the narrow vertical strip down the left edge of every page from
// md (rails-ops TO-DO-ui-jobs 67, 68, 498), fixed, so the nav holds its place
// as the page scrolls. The Rails mark at the top goes home; under it the
// sidebar toggle (H15.1, ui-jobs 514) opens the wallet panel, which slides out
// from beneath the rail with the search and the explorer chooser, and closes it
// from the same place. The beta pill is at the foot. A press anywhere else on
// the rail does what the toggle does, the cursor an arrow pointing the way the
// panel will move (e-resize to open, w-resize to close; Miles, 6 Nov 2026):
// a pointer convenience, the toggle stays the keyboard's control. Over the
// pill the theme switch, its three options stacked (Miles 13 Nov 2026,
// components/nav/theme-switch.tsx).
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

import Link from "next/link";
import type { MouseEvent } from "react";

import { RailsMark } from "@/components/nav/rails-mark";
import { ThemeSwitch } from "@/components/nav/theme-switch";
import { SearchLauncher } from "@/components/shared/front-door-search";
import { toggleWalletPanel, useWalletPanelOpen } from "@/components/nav/wallet-panel";

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
  const panelOpen = useWalletPanelOpen();
  // The rail's own surface toggles the panel; its links and buttons keep
  // their own presses.
  const onRail = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    toggleWalletPanel(e.currentTarget.querySelector<HTMLElement>('[data-anatomy="H15.1"]'));
  };
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
        onClick={onRail}
        className={`fixed inset-y-0 left-0 z-40 hidden w-14 flex-col items-center justify-between bg-raised pt-4 md:flex ${
          panelOpen ? "cursor-w-resize" : "cursor-e-resize"
        }`}
      >
        {/* The Rails mark goes home and holds its place while the panel opens
            beside it; the toggle under it opens and closes the panel
            (ui-jobs 514). */}
        <div className="flex flex-col items-center gap-3.5">
          <Link
            href="/"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-lg text-foreground focus-ring"
            aria-label="Rails home"
            data-rail-home=""
          >
            <RailsMark size={30} />
          </Link>
          <SearchLauncher placement="rail" />
        </div>
        {/* The theme switch over the pill, the pill flush to the left edge. */}
        <div className="flex w-full flex-col items-center gap-3">
          <ThemeSwitch placement="rail" />
          <BetaPill />
        </div>
      </aside>
    </>
  );
}
