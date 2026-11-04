"use client";

// The profile control (rails-ops ui-jobs 480): a facehash drawn in one colour,
// the square filled with the cluster's ink and the eyes cut in the page's
// background (Miles, 4 Nov 2026), linking to the bookmarks page. The face is the newest
// bookmark's; with none it is the sample wallet's (lib/shared/sample-wallet.ts).
// Until the browser's list is read a faint square with no eyes holds the place,
// so a reader with bookmarks never sees the sample face first.
//
// Where it stands: in the header bar (H2) on every page that draws the bar
// (marketing at every width, the app below md), and from md on an app route
// at the column's top right (app/(app)/layout.tsx, `ProfileCorner`).
//
// It goes to another page, so it takes the link hue (color-grammar.md §4a,
// §4c): ink at rest, the square blue on hover and on /bookmarks (the eyes
// keep the background), where it carries
// `aria-current="page"`. The hit area is the search launcher's and the chain
// trigger's (38px round a 20px face).

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Facehash } from "@/components/shared/facehash";
import { useBookmarks } from "@/components/shared/bookmark-list";
import { useBookmarksName } from "@/components/shared/bookmarks-name";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";

const BOOKMARKS_PATH = "/bookmarks";

export function BookmarksLink() {
  const current = usePathname() === BOOKMARKS_PATH;
  const bookmarks = useBookmarks();
  const name = useBookmarksName();
  const face = bookmarks == null ? null : (bookmarks[0]?.addresses[0] ?? SAMPLE_WALLET);
  return (
    <Link
      href={BOOKMARKS_PATH}
      aria-label={name}
      title={name}
      aria-current={current ? "page" : undefined}
      data-anatomy="H20"
      data-profile-face={face ?? undefined}
      className={`block shrink-0 rounded-lg p-[9px] transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        current ? "text-blue-500" : "text-rb-700 dark:text-rb-300"
      }`}
    >
      {face ? (
        <Facehash address={face} size={20} mono />
      ) : (
        <span className="block size-5 rounded-[4.4px] bg-current opacity-30" aria-hidden="true" />
      )}
    </Link>
  );
}
