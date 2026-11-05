"use client";

// The home page's way into /start (S12): "Start here" as a text link, left of
// the profile control (H20), in the header bar below md and in the site
// column's corner from md (components/nav/rail-shell.tsx). Home only; every
// other page renders nothing. It goes to another page, so it rests in the
// link blue and underlines on hover (color-grammar.md §4a, ui-jobs 507); its
// hit area is H20's 38px height.

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StartHereLink() {
  if (usePathname() !== "/") return null;
  return (
    <Link
      href="/start"
      className="inline-flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-sm px-1.5 text-sm font-medium text-blue-600 underline-offset-4 hover:underline focus-ring dark:text-blue-400"
      data-anatomy="S12"
      data-start-here=""
    >
      Start here
    </Link>
  );
}
