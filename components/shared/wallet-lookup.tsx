"use client";

// One field that opens a wallet: the shared search (H15,
// components/shared/front-door-search.tsx) pointed at a page the caller names.
// N5 opens that family's position page; the wallet view opens `/wallet/<address>`.

import { FrontDoorSearch, SEARCH_PLACEHOLDER } from "@/components/shared/front-door-search";
import type { BookmarkScope } from "@/lib/shared/sessions";

export function WalletLookup({
  positionHref,
  placeholder = SEARCH_PLACEHOLDER,
  bookmarks,
}: {
  /** The page an address opens. */
  positionHref: (wallet: string) => string;
  placeholder?: string;
  /** The bookmarks under the field. */
  bookmarks?: BookmarkScope | "all";
}) {
  return <FrontDoorSearch href={positionHref} placeholder={placeholder} bookmarks={bookmarks} />;
}
