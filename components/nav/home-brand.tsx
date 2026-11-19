"use client";

// The Rails mark, centred in the phone header bar (H2) on every page but home,
// a link home (ui-jobs 514). The beta pill (H25) stands to its right where the
// name "Rails" was (ui-jobs 769); HeaderBar draws the two together.

import Link from "next/link";

import { RailsMark } from "@/components/nav/rails-mark";

export function HomeBrand() {
  return (
    <Link
      href="/"
      className="flex h-[38px] w-[38px] items-center justify-center rounded-lg text-foreground focus-ring"
      aria-label="Rails home"
      data-home-brand=""
    >
      <RailsMark size={30} />
    </Link>
  );
}
