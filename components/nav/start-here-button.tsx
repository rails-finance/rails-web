"use client";

// The home page's way into /start (S12, ui-jobs 498): a blue button at the top
// right, left of the profile control (H20), in the header bar below md and in
// the site column's corner from md (components/nav/rail-shell.tsx). Home only;
// every other page renders nothing. It goes to another page, so it takes the
// link hue (color-grammar.md §4a), filled; its height is H20's 38px hit area.

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StartHereButton() {
  if (usePathname() !== "/") return null;
  return (
    <Link
      href="/start"
      className="inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-lg bg-blue-500 px-3.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-background"
      data-anatomy="S12"
      data-start-here=""
    >
      Start here
    </Link>
  );
}
