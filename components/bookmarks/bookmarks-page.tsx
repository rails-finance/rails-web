"use client";

// The bookmarks page's body (rails-ops ui-jobs 480): the heading (B1), then
// the list and its backup controls (B2), the same components the wallet panel
// draws (components/shared/bookmark-list.tsx); with no bookmarks, the empty
// state (B3) says how to make one and carries the search.

import { BookmarkBackup, BookmarkList, useBookmarks } from "@/components/shared/bookmark-list";
import { FrontDoorSearch } from "@/components/shared/front-door-search";

export function BookmarksPage() {
  const bookmarks = useBookmarks();
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-16 sm:pt-10 md:px-6">
      <div className="mb-8" data-anatomy="B1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Bookmarks</h1>
        <p className="mt-2 text-rb-500">Kept in this browser.</p>
      </div>
      {/* Nothing draws until the browser's list is read, so a reader with
          bookmarks never sees the empty state flash first. */}
      {bookmarks && (
        <div data-anatomy="B2">
          <BookmarkList
            bookmarks={bookmarks}
            size="md"
            empty={
              <div data-anatomy="B3">
                <p className="font-semibold text-foreground">No bookmarks yet.</p>
                <p className="mt-1 text-sm text-rb-500">
                  To add one, press the bookmark beside a wallet&apos;s address, or choose Bookmark it in the address
                  menu on a position page. Or look up a wallet here.
                </p>
                <FrontDoorSearch size="lg" suggest className="mt-6" />
              </div>
            }
          />
          <BookmarkBackup className="mt-6 border-t border-rb-200 pt-4 dark:border-rb-800" />
        </div>
      )}
    </div>
  );
}
