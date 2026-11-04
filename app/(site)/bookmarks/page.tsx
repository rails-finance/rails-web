// /bookmarks (rails-ops ui-jobs 480): the reader's bookmarked wallets, the
// list the wallet panel (H16) shows, reached from the profile control beside
// the explorer chooser (H20). The list is in this browser's storage, so the
// page draws in the browser and is kept out of the index.

import type { Metadata } from "next";
import { BookmarksPage } from "@/components/bookmarks/bookmarks-page";

export const metadata: Metadata = {
  title: "Bookmarks",
  description: "The wallets you have bookmarked on Rails, kept in this browser.",
  alternates: { canonical: "/bookmarks" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <BookmarksPage />;
}
