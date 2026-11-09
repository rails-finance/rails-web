"use client";

// The bookmarks page's body (rails-ops ui-jobs 480), drawn in the app shell: Back's row (H7), the heading (B1), then
// the tabs Wallets, Positions and Views (B4, ui-jobs 521 and 530, in the profile
// menu's order) over the chosen kind's list and the backup controls (B2), the
// same components the wallet panel draws (components/shared/bookmark-list.tsx).
// The tab rides in the URL (`?tab=positions`, `?tab=views`). With no saved
// wallets, the wallets tab's empty state (B3) says how to make one, offers
// Start here and the sample wallet (lib/shared/sample-wallet.ts), and asks for
// a backup file to import (Miles, 6 Nov 2026: no search here, no word about
// ordering until there is an order).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Signpost } from "lucide-react";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { BookmarkBackup, BookmarkList, SavedLinkList, useBookmarks } from "@/components/shared/bookmark-list";
import { useSavedLinks } from "@/components/shared/saved-items";
import { SAVED_NAME } from "@/components/shared/bookmarks-name";
import { walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import { PROFILE_CLEARANCE, START_CTA } from "@/lib/shared/ui-grammar";

type Tab = "wallets" | "positions" | "views";
const TABS: { id: Tab; label: string; noun: string; menu: string }[] = [
  { id: "wallets", label: "Wallets", noun: "wallet", menu: "ten" },
  { id: "positions", label: "Positions", noun: "position", menu: "five" },
  { id: "views", label: "Views", noun: "view", menu: "five" },
];

const tabFromUrl = (): Tab => {
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "positions" || t === "views" ? t : "wallets";
};

export function BookmarksPage() {
  const bookmarks = useBookmarks();
  const positions = useSavedLinks("position");
  const views = useSavedLinks("view");
  const [tab, setTab] = useState<Tab>("wallets");
  useEffect(() => setTab(tabFromUrl()), []);
  const choose = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "wallets") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(window.history.state, "", url);
  };

  const ready = bookmarks && positions && views;
  const counts: Record<Tab, number> = {
    wallets: bookmarks?.length ?? 0,
    positions: positions?.length ?? 0,
    views: views?.length ?? 0,
  };
  const current = TABS.find((t) => t.id === tab)!;
  const nothing = counts.wallets + counts.positions + counts.views === 0;

  return (
    // In the app shell (ui-jobs 480): the column's left edge and the app
    // pages' py-8, so Back's line centres on the profile control (H20) at the
    // top right from md.
    <div className="max-w-2xl py-8">
      {/* Back's row, as a detail page draws it (H7): the column's first line,
          level with the profile control (H20) the app layout draws at the top
          right from md. With no history Back opens the home page. */}
      <div className={`flex min-h-[38px] items-center ${PROFILE_CLEARANCE}`} data-anatomy="H7" data-back-row="">
        <DetailBackButton fallbackHref="/" />
      </div>
      <div className="mb-6 mt-6" data-anatomy="B1">
        {/* The saved-state glyph the wallet menu draws (ui-jobs 493, 494). */}
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Bookmark className="size-6 shrink-0" fill="currentColor" aria-hidden="true" />
          {SAVED_NAME}
        </h1>
        <p className="mt-2 text-rb-500">
          Saved in this browser only.
          {counts[tab] > 1 && (
            <>
              {" "}
              Drag a {current.noun}, or use its arrows, to change the order; the first {current.menu} are in the profile
              menu.
            </>
          )}
        </p>
      </div>
      <div className="mb-6 flex flex-wrap gap-1.5" role="tablist" aria-label="Saved items" data-anatomy="B4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`saved-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="saved-panel"
            onClick={() => choose(t.id)}
            className={`${tab === t.id ? "pill-active" : "pill-idle"} cursor-pointer`}
            data-saved-tab={t.id}
          >
            {t.label}
            {ready && counts[t.id] > 0 && <span className="ml-1.5 tabular-nums opacity-70">{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      {/* Nothing draws until the browser's list is read, so a reader with
          saved items never sees the empty state flash first. */}
      {ready && (
        <div id="saved-panel" role="tabpanel" aria-labelledby={`saved-tab-${tab}`} data-anatomy="B2">
          {tab === "wallets" && (
            <BookmarkList
              bookmarks={bookmarks}
              summary
              reorder
              empty={
                <div data-anatomy="B3">
                  <p className="font-semibold text-foreground">No saved wallets yet.</p>
                  <p className="mt-1 text-sm text-rb-500">
                    To save one, press the bookmark icon beside a wallet&apos;s address, or choose Save wallet in the
                    address menu on a position page.
                  </p>
                  {nothing && (
                    <>
                      <Link href="/start" className={`mt-6 inline-flex ${START_CTA}`} data-bookmarks-start="">
                        New to Rails? Start here
                        <Signpost className="size-4 shrink-0" aria-hidden="true" />
                      </Link>
                      <p className="mt-4 text-sm">
                        <Link
                          href={walletHref(SAMPLE_WALLET)}
                          className="rounded-sm text-blue-600 dark:text-[var(--text-link)] transition-colors hover:text-blue-600 focus-ring dark:hover:text-[var(--text-link)]"
                          data-bookmarks-sample=""
                        >
                          See a sample wallet →
                        </Link>
                      </p>
                    </>
                  )}
                </div>
              }
            />
          )}
          {tab === "positions" && (
            <SavedLinkList
              kind="position"
              links={positions}
              empty={
                <div data-anatomy="B3">
                  <p className="font-semibold text-foreground">No saved positions yet.</p>
                  <p className="mt-1 text-sm text-rb-500">
                    To save one, open a position and choose Save position in its card&apos;s ⋮ menu.
                  </p>
                </div>
              }
            />
          )}
          {tab === "views" && (
            <SavedLinkList
              kind="view"
              links={views}
              empty={
                <div data-anatomy="B3">
                  <p className="font-semibold text-foreground">No saved views yet.</p>
                  <p className="mt-1 text-sm text-rb-500">
                    To save one, set a listing&apos;s filters and sort, then choose Save this view in the ⋮ at the end
                    of its filter row.
                  </p>
                </div>
              }
            />
          )}
          {/* One instance through the switch from empty to a list, so an
              import's report stays on the page. */}
          <BookmarkBackup
            empty={nothing}
            className={`border-t border-rb-200 dark:border-rb-800 ${counts[tab] === 0 ? "mt-8 pt-6" : "mt-6 pt-4"}`}
          />
        </div>
      )}
    </div>
  );
}
