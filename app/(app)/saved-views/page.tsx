// /saved-views (rails-ops ui-jobs 480, 521, 530; /bookmarks until 652): the
// reader's saved wallets, positions and views, reached from the profile
// control (H20). The list is in this browser's storage, so the page draws in
// the browser and is kept out of the index. It stands in the app shell (the
// brand rail, the app footer), as the wallet view does.

import type { Metadata } from "next";
import { BookmarksPage } from "@/components/bookmarks/bookmarks-page";
import { SAVED_NAME, SAVED_PATH } from "@/components/shared/bookmarks-name";

export const metadata: Metadata = {
  title: SAVED_NAME,
  description: "The wallets, positions and views you have saved on Rails, in this browser only.",
  alternates: { canonical: SAVED_PATH },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <BookmarksPage />;
}
