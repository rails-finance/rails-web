"use client";

// The home page's way into /start (S12, ui-jobs 498): "Start here" as a text
// link at the top right, left of the profile control (H20), in the header bar
// below md and in the site column's corner from md
// (components/nav/rail-shell.tsx). Home only; every other page renders nothing.
// It goes to another page, so it takes the link hue (color-grammar.md §4a) and
// the site's text-link hover; its hit area is H20's 38px height.

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StartHereLink() {
  if (usePathname() !== "/") return null;
  return (
    <Link
      href="/start"
      className="inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-sm px-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 transition-colors hover:text-blue-600 focus-ring dark:hover:text-blue-400"
      data-anatomy="S12"
      data-start-here=""
    >
      Start here
    </Link>
  );
}
