"use client";

// The home page's way into /start (S12): "Start here" as the home CTA pill
// (PILL_CTA, ui-jobs 507), left of the profile control (H20), in the header
// bar below md and in the site column's corner from md
// (components/nav/rail-shell.tsx). Home only; every other page renders nothing.
// It goes to another page, so blue (color-grammar.md §4a); 38px tall, H20's
// hit area.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PILL_CTA } from "@/lib/shared/ui-grammar";

export function StartHereLink() {
  if (usePathname() !== "/") return null;
  return (
    <Link href="/start" className={`${PILL_CTA} h-[38px] shrink-0 focus-ring`} data-anatomy="S12" data-start-here="">
      Start here
    </Link>
  );
}
