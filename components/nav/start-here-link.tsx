"use client";

// "Start here" in the chrome (H19; rails-ops ui-jobs 478): the way to /start
// from every page. A link to another page, so it rests neutral and turns blue
// on hover (color-grammar.md §4a). In the brand rail (H1) the signpost alone;
// in the header bar (H2) the signpost and the words, the words dropped below
// 640px where the bar carries "Open an explorer" (`compact`).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Signpost } from "lucide-react";

export function StartHereLink({ placement, compact = false }: { placement: "rail" | "header"; compact?: boolean }) {
  const pathname = usePathname();
  const here = pathname === "/start" || !!pathname?.startsWith("/start/");
  const tone = here ? "text-blue-500" : "text-rb-700 dark:text-rb-300";
  if (placement === "rail") {
    return (
      <Link
        href="/start"
        aria-label="Start here"
        aria-current={here ? "page" : undefined}
        title="Start here"
        data-anatomy="H19"
        data-start-link="rail"
        className={`rounded-lg p-2.5 transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${tone}`}
      >
        <Signpost size={18} aria-hidden="true" />
      </Link>
    );
  }
  return (
    <Link
      href="/start"
      aria-current={here ? "page" : undefined}
      title="Start here"
      data-anatomy="H19"
      data-start-link="header"
      className={`inline-flex items-center gap-1.5 rounded-lg p-2.5 text-sm transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${tone}`}
    >
      <Signpost size={18} aria-hidden="true" />
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>Start here</span>
    </Link>
  );
}
