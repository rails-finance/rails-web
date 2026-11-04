"use client";

// The profile control (rails-ops ui-jobs 480): a person glyph beside the
// explorer chooser (H4) wherever the chooser is drawn, linking to the
// bookmarks page. It goes to another page, so it takes the link hue
// (color-grammar.md §4a, §4c): the cluster's ink at rest, blue on hover and
// on /bookmarks, where it carries `aria-current="page"`. The hit area is the
// search launcher's and the chain trigger's (p-2.5 round an 18px glyph).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound } from "lucide-react";

const BOOKMARKS_PATH = "/bookmarks";

export function BookmarksLink() {
  const current = usePathname() === BOOKMARKS_PATH;
  return (
    <Link
      href={BOOKMARKS_PATH}
      aria-label="Bookmarks"
      title="Bookmarks"
      aria-current={current ? "page" : undefined}
      data-anatomy="H20"
      className={`rounded-lg p-2.5 transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        current ? "text-blue-500" : "text-rb-700 dark:text-rb-300"
      }`}
    >
      <CircleUserRound size={18} aria-hidden="true" />
    </Link>
  );
}
