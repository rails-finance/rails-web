"use client";

// The chrome of every /start step (rails-ops ui-jobs 478): the breadcrumb of
// the answers so far (G2), each crumb a link back to its step, and "Skip, just
// search" (G3), which opens the wallet panel (H16) with the search focused.

import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { OPEN_SEARCH_EVENT } from "@/components/shared/front-door-search";
import { START_HREF, type Crumb } from "@/lib/start/tree";

export function StartCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const trail: Crumb[] = [{ label: "Start", href: START_HREF }, ...crumbs];
  return (
    <nav aria-label="Your answers" data-anatomy="G2">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-rb-500">
        {trail.map((c, i) => {
          const current = i === trail.length - 1;
          return (
            <li key={c.href} className="inline-flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {current ? (
                <span aria-current="page" className="text-foreground">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="hover:text-[var(--marketing)] underline-offset-4 hover:underline">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SkipToSearch() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
      className="inline-flex items-center gap-1.5 text-sm text-rb-500 hover:text-[var(--marketing)] cursor-pointer"
      data-anatomy="G3"
      data-start-skip=""
    >
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      Skip, just search
    </button>
  );
}
