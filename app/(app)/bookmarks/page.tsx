// /bookmarks (rails-ops ui-jobs 480): the reader's bookmarked wallets,
// reached from the profile control (H20). The list is in this browser's storage, so the
// page draws in the browser and is kept out of the index. It stands in the
// app shell (the brand rail, the app footer), as the wallet view does.

import type { Metadata } from "next";
import { BookmarksPage } from "@/components/bookmarks/bookmarks-page";
import { BOOKMARKS_NAME } from "@/components/shared/bookmarks-name";

export const metadata: Metadata = {
  title: BOOKMARKS_NAME,
  description: "The wallets you have saved on Rails, kept in this browser.",
  alternates: { canonical: "/bookmarks" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <BookmarksPage />;
}
