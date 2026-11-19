"use client";

// The Rails mark and, to its right where the name "Rails" was, the beta pill
// (H25), one link home, centred in the phone header bar (H2) on every page but
// home (ui-jobs 514, 769).

import Link from "next/link";

import { BetaPill } from "@/components/nav/beta-pill";
import { RailsMark } from "@/components/nav/rails-mark";

export function HomeBrand() {
  return (
    <Link
      href="/"
      className="flex h-[38px] items-center gap-1.5 rounded-lg pr-1 text-foreground focus-ring"
      aria-label="Rails home, beta"
      data-home-brand=""
    >
      <span className="flex h-[38px] w-[38px] items-center justify-center">
        <RailsMark size={30} />
      </span>
      <BetaPill placement="header" />
    </Link>
  );
}
