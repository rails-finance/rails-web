"use client";

// The Rails mark and name, centred in the phone header bar (H2) on every page
// but home, a link home (ui-jobs 514). Drawn as the hero's h1 is: the mark in
// cap units on the name's baseline, all bars and the name at 85%, so the two
// line up at any zoom.

import Link from "next/link";

import { MARK_CAP_STYLE, RailsMark } from "@/components/nav/rails-mark";

export function HomeBrand() {
  return (
    <Link
      href="/"
      className="flex h-[38px] items-center rounded-lg px-1 text-foreground focus-ring"
      aria-label="Rails home"
      data-home-brand=""
    >
      <span className="whitespace-nowrap text-[22px] font-semibold leading-none tracking-tighter">
        <RailsMark size={22} className="inline-block" style={MARK_CAP_STYLE} uniform />
        <span className="opacity-[0.85]">Rails</span>
      </span>
    </Link>
  );
}
