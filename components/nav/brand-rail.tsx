"use client";

// BrandRail — the narrow vertical strip down the left edge of every app/(app)
// surface (rails-ops TO-DO-ui-jobs 67). The Rails mark sits at the top and the
// bookmarks control at the foot; the top bar keeps the theme toggle and the
// chain switcher for both route groups, so no control is drawn twice.
//
// WIDTH: 56px (w-14), icon width. The rail is a brand strip today and is
// expected to grow into a utility bar nested in some form of nav, so it starts
// at the width its contents need. Widening it later changes the rail;
// narrowing it later reflows every page.
//
// MARKETING KEEPS ITS PRESENT HEADER. The rail is mounted from
// app/(app)/layout.tsx and reaches nothing under app/(site).
//
// BELOW `md` THERE IS NO RAIL: at phone widths 56px of permanent gutter is a
// sixth of the page. HeaderBar draws the mark, the bookmark and the theme
// icons there, as it did before this rail existed.

import { useState } from "react";
import Link from "next/link";

import { BookmarksModal } from "@/components/nav/bookmarks-modal";

/** The Rails glyph, linking home — the same mark and the same link the top bar
 *  carried, without the wordmark, which will not fit at icon width. */
function RailsGlyph() {
  return (
    <Link href="/" aria-label="Rails home" className="text-foreground transition-colors hover:text-blue-500">
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
    </Link>
  );
}

/** The release-stage pill, under the glyph rather than beside it: it belongs to
 *  the mark, and at icon width the only room left is below. Same caution-500
 *  anatomy the top bar uses, a size down to sit inside 56px. */
function BetaPill() {
  return (
    <span className="mt-1.5 rounded bg-caution-500 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white">
      Beta
    </span>
  );
}

/** Bookmark icon that opens the central bookmarks modal — the one surface that
 *  collects the per-protocol bookmark lists in one place. It acts on no part of
 *  the page under it, which is why it reads as rail furniture rather than page
 *  chrome. */
function BookmarksButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-lg p-2.5 text-rb-700 transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-rb-300"
      aria-label="Bookmarks"
      title="Bookmarks"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}

export function BrandRail() {
  const [showBookmarks, setShowBookmarks] = useState(false);
  return (
    <>
      {/* Fixed, so the mark holds the top of the viewport and the bookmark the
          bottom however far the page scrolls. `py-4` matches the top bar's
          band, which lands the glyph on the same centre line as the controls
          still in the bar. z-40 ties with the header; the rail is later in the
          document, so its glyph stays clickable under the header's full-width
          box. */}
      <aside
        aria-label="Rails"
        className="fixed inset-y-0 left-0 z-40 hidden w-14 flex-col items-center justify-between py-4 md:flex"
      >
        <div className="flex flex-col items-center">
          <RailsGlyph />
          <BetaPill />
        </div>
        <BookmarksButton onClick={() => setShowBookmarks(true)} />
      </aside>
      {showBookmarks && <BookmarksModal onClose={() => setShowBookmarks(false)} />}
    </>
  );
}
