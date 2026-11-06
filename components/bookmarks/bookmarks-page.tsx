"use client";

// The bookmarks page's body (rails-ops ui-jobs 480), drawn in the app shell: Back's row (H7), the heading (B1), then
// the list and its backup controls (B2), the same components the wallet panel
// draws (components/shared/bookmark-list.tsx); with no bookmarks, the empty
// state (B3) says how to make one, offers Start here and the sample wallet
// (lib/shared/sample-wallet.ts), and asks for a backup file to import (Miles,
// 6 Nov 2026: no search here, no word about ordering until there is an order).

import Link from "next/link";
import { Bookmark, Signpost } from "lucide-react";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { BookmarkBackup, BookmarkList, useBookmarks } from "@/components/shared/bookmark-list";
import { BOOKMARKS_NAME } from "@/components/shared/bookmarks-name";
import { walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import { PROFILE_CLEARANCE, START_CTA } from "@/lib/shared/ui-grammar";

export function BookmarksPage() {
  const bookmarks = useBookmarks();
  return (
    // In the app shell (ui-jobs 480): the column's left edge and the app
    // pages' py-8, so Back's line centres on the profile control (H20) at the
    // top right from md.
    <div className="max-w-2xl py-8">
      {/* Back's row, as a detail page draws it (H7): the column's first line,
          level with the profile control (H20) the app layout draws at the top
          right from md. With no history Back opens the home page. */}
      <div className={`flex min-h-[38px] items-center ${PROFILE_CLEARANCE}`} data-anatomy="H7" data-back-row="">
        <DetailBackButton fallbackHref="/" />
      </div>
      <div className="mb-8 mt-6" data-anatomy="B1">
        {/* The saved-state glyph the wallet menu draws (ui-jobs 493, 494). */}
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Bookmark className="size-6 shrink-0" fill="currentColor" aria-hidden="true" />
          {BOOKMARKS_NAME}
        </h1>
        <p className="mt-2 text-rb-500">
          Saved in this browser only.
          {bookmarks && bookmarks.length > 1 && (
            <> Drag a wallet, or use its arrows, to change the order; the first ten are in the profile menu.</>
          )}
        </p>
      </div>
      {/* Nothing draws until the browser's list is read, so a reader with
          bookmarks never sees the empty state flash first. */}
      {bookmarks && (
        <div data-anatomy="B2">
          <BookmarkList
            bookmarks={bookmarks}
            summary
            reorder
            empty={
              <div data-anatomy="B3">
                <p className="font-semibold text-foreground">No saved wallets yet.</p>
                <p className="mt-1 text-sm text-rb-500">
                  To save one, press the bookmark icon beside a wallet&apos;s address, or choose Save wallet in the
                  address menu on a position page.
                </p>
                <Link href="/start" className={`mt-6 inline-flex ${START_CTA}`} data-bookmarks-start="">
                  <Signpost className="size-4 shrink-0" aria-hidden="true" />
                  New to Rails? Start here
                </Link>
                <p className="mt-4 text-sm">
                  <Link
                    href={walletHref(SAMPLE_WALLET)}
                    className="rounded-sm text-blue-600 dark:text-blue-400 transition-colors hover:text-blue-600 focus-ring dark:hover:text-blue-400"
                    data-bookmarks-sample=""
                  >
                    See a sample wallet →
                  </Link>
                </p>
              </div>
            }
          />
          {/* One instance through the switch from empty to a list, so an
              import's report stays on the page. */}
          <BookmarkBackup
            empty={bookmarks.length === 0}
            className={`border-t border-rb-200 dark:border-rb-800 ${bookmarks.length === 0 ? "mt-8 pt-6" : "mt-6 pt-4"}`}
          />
        </div>
      )}
    </div>
  );
}
