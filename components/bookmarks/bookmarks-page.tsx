"use client";

// The bookmarks page's body (rails-ops ui-jobs 480), drawn in the app shell: the heading (B1), then
// the list and its backup controls (B2), the same components the wallet panel
// draws (components/shared/bookmark-list.tsx); with no bookmarks, the empty
// state (B3) says how to make one, carries the search and offers the sample
// wallet (lib/shared/sample-wallet.ts).

import Link from "next/link";

import { BookmarkBackup, BookmarkList, useBookmarks } from "@/components/shared/bookmark-list";
import { FrontDoorSearch, walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";

export function BookmarksPage() {
  const bookmarks = useBookmarks();
  return (
    // In the app shell (ui-jobs 480): the column's left edge and the app
    // pages' py-8, so the heading's line centres on the profile control (H20)
    // at the top right from md.
    <div className="max-w-2xl py-8">
      <div className="mb-8" data-anatomy="B1">
        <h1 className="flex min-h-[38px] items-center text-2xl font-semibold tracking-tight text-foreground">
          Bookmarks
        </h1>
        <p className="mt-2 text-rb-500">Kept in this browser.</p>
      </div>
      {/* Nothing draws until the browser's list is read, so a reader with
          bookmarks never sees the empty state flash first. */}
      {bookmarks && (
        <div data-anatomy="B2">
          <BookmarkList
            bookmarks={bookmarks}
            empty={
              <div data-anatomy="B3">
                <p className="font-semibold text-foreground">No bookmarks yet.</p>
                <p className="mt-1 text-sm text-rb-500">
                  To add one, press the bookmark beside a wallet&apos;s address, or choose Bookmark it in the address
                  menu on a position page. Or look up a wallet here.
                </p>
                <FrontDoorSearch size="lg" suggest className="mt-6" />
                <p className="mt-4 text-sm">
                  <Link
                    href={walletHref(SAMPLE_WALLET)}
                    className="rounded-sm text-blue-500 transition-colors hover:text-blue-600 focus-ring dark:hover:text-blue-400"
                    data-bookmarks-sample=""
                  >
                    See a sample wallet →
                  </Link>
                </p>
              </div>
            }
          />
          <BookmarkBackup className="mt-6 border-t border-rb-200 pt-4 dark:border-rb-800" />
        </div>
      )}
    </div>
  );
}
