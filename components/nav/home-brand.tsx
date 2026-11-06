"use client";

// The Rails mark and name, centred in the phone header bar (H2) and in the
// wallet panel's top row over it, a link home (ui-jobs 514).

import Link from "next/link";

import { RailsMark } from "@/components/nav/rails-mark";

export function HomeBrand({ onClick, panel }: { onClick?: () => void; panel?: boolean }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className="flex h-[38px] items-center gap-2 rounded-lg px-1 text-foreground focus-ring"
      aria-label="Rails home"
      data-home-brand=""
      data-wallet-panel-home={panel ? "" : undefined}
    >
      <RailsMark size={26} />
      <span className="text-xl font-medium tracking-tight">Rails</span>
    </Link>
  );
}
