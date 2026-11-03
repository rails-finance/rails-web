"use client";

// "Skip, just search" (G3; rails-ops ui-jobs 478), at the top right of every
// /start step: opens the wallet panel (H16) with the search focused.

import { Search } from "lucide-react";
import { OPEN_SEARCH_EVENT } from "@/components/shared/front-door-search";

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
