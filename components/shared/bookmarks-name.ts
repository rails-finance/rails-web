"use client";

// The bookmarks page's name, wherever it is named: the tab title, B1's h1,
// the profile control's accessible name (H20) and the wallet panel's foot
// link (H16). One constant, BOOKMARKS_NAME. On a dev server `?name=saved` or
// `?name=bookmarks` on any page switches it for this tab, so the two can be
// compared (rails-ops ui-jobs 492); a production build reads the constant
// alone. The URL stays /bookmarks.

import { useEffect, useState } from "react";

const NAMES = { bookmarks: "Bookmarks", saved: "Saved wallets" } as const;
type BookmarksName = (typeof NAMES)[keyof typeof NAMES];

/** The page's name. */
export const BOOKMARKS_NAME: BookmarksName = NAMES.bookmarks;

const DEV_KEY = "rails-dev-bookmarks-name";
const DEV = process.env.NODE_ENV === "development";

/** BOOKMARKS_NAME, or on a dev server the name `?name=` chose for this tab. */
export function useBookmarksName(): BookmarksName {
  const [name, setName] = useState<BookmarksName>(BOOKMARKS_NAME);
  useEffect(() => {
    if (!DEV) return;
    try {
      const asked = new URLSearchParams(window.location.search).get("name");
      if (asked && asked in NAMES) sessionStorage.setItem(DEV_KEY, asked);
      const held = sessionStorage.getItem(DEV_KEY);
      if (held && held in NAMES) setName(NAMES[held as keyof typeof NAMES]);
    } catch {
      /* storage blocked: the constant stands */
    }
  }, []);
  return name;
}
