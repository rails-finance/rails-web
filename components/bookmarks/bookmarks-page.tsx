"use client";

// The bookmarks page's body (rails-ops ui-jobs 480), drawn in the app shell: Back's row (H7), then one header row,
// the heading (B1) with the tabs Focus views, Listings, Wallets, Positions and
// Backup (B4, ui-jobs 521, 530 and 557; broadest first), over the chosen
// kind's list (B2), the same components the wallet panel draws
// (components/shared/bookmark-list.tsx), or the backup controls.
// The tab rides in the URL (`?tab=focus`, `?tab=listings`, `?tab=positions`,
// `?tab=backup`; the old `?tab=views` opens Listings). With no tab, Wallets. With no saved
// wallets, the wallets tab's empty state (B3) says how to make one, offers
// Start here and the sample wallet (lib/shared/sample-wallet.ts); export and
// import live on the Backup tab (Miles, 6 Nov 2026: no search here; 10 Nov:
// no word about ordering over the lists).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Plus, Signpost } from "lucide-react";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import {
  BookmarkBackup,
  BookmarkList,
  FocusViewList,
  SavedLinkList,
  useBookmarks,
} from "@/components/shared/bookmark-list";
import { focusViews, useAssetScope } from "@/lib/shared/asset-scope";
import { useSavedLinks } from "@/components/shared/saved-items";
import { SAVED_NAME } from "@/components/shared/bookmarks-name";
import { walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import { INPLACE_TEXT, PROFILE_CLEARANCE, START_CTA } from "@/lib/shared/ui-grammar";

type Tab = "focus" | "listings" | "wallets" | "positions" | "backup";
const TABS: { id: Tab; label: string }[] = [
  { id: "focus", label: "Focus views" },
  { id: "listings", label: "Listings" },
  { id: "wallets", label: "Wallets" },
  { id: "positions", label: "Positions" },
  { id: "backup", label: "Backup" },
];

const tabFromUrl = (): Tab => {
  const t = new URLSearchParams(window.location.search).get("tab");
  if (t === "views") return "listings";
  return t === "focus" || t === "listings" || t === "positions" || t === "backup" ? t : "wallets";
};

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const andList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function BookmarksPage() {
  const bookmarks = useBookmarks();
  const positions = useSavedLinks("position");
  const views = useSavedLinks("view");
  const scope = useAssetScope();
  const [tab, setTab] = useState<Tab>("wallets");
  useEffect(() => setTab(tabFromUrl()), []);
  const choose = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "wallets") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(window.history.state, "", url);
  };

  const ready = bookmarks && positions && views && scope.ready;
  const counts: Record<Tab, number> = {
    focus: scope.views.length,
    listings: views?.length ?? 0,
    wallets: bookmarks?.length ?? 0,
    positions: positions?.length ?? 0,
    backup: 0,
  };
  const nothing = counts.wallets + counts.positions + counts.listings + counts.focus === 0;
  const carries = andList(
    [
      counts.wallets ? plural(counts.wallets, "wallet") : "",
      counts.listings ? plural(counts.listings, "listing") : "",
      counts.positions ? plural(counts.positions, "position") : "",
      counts.focus ? plural(counts.focus, "focus view") : "",
    ].filter(Boolean),
  );

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
      {/* One header row: the heading (B1) and the tabs (B4), which wrap under
          it on a phone. */}
      <div className="mb-6 mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground" data-anatomy="B1">
          {/* The saved-state glyph the wallet menu draws (ui-jobs 493, 494). */}
          <Bookmark className="size-6 shrink-0" fill="currentColor" aria-hidden="true" />
          {SAVED_NAME}
        </h1>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Saved items" data-anatomy="B4">
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
          {tab === "listings" && (
            <SavedLinkList
              kind="view"
              links={views}
              empty={
                <div data-anatomy="B3">
                  <p className="font-semibold text-foreground">No saved listings yet.</p>
                  <p className="mt-1 text-sm text-rb-500">
                    To save one, set a listing&apos;s filters and sort, then choose Save this view in the ⋮ at the end
                    of its filter row.
                  </p>
                </div>
              }
            />
          )}
          {tab === "focus" && (
            <>
              <FocusViewList
                views={scope.views}
                active={scope.fromLink ? null : (scope.active?.id ?? null)}
                empty={
                  <div data-anatomy="B3">
                    <p className="font-semibold text-foreground">No focus views yet.</p>
                    <p className="mt-1 text-sm text-rb-500">
                      A focus view limits Rails to the assets and chains you choose. Make one here, or press Use this
                      view on a focus link.
                    </p>
                  </div>
                }
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={focusViews.create}
                  className="inline-flex items-center gap-1.5 rounded-md bg-teal-600/10 px-3 py-1.5 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-600/20 dark:bg-teal-400/10 dark:text-teal-400 dark:hover:bg-teal-400/20"
                  data-focus-view-new=""
                >
                  New view
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
          {tab === "backup" && (
            <div data-saved-backup="">
              <p className="font-semibold text-foreground">Saved in this browser only.</p>
              <p className="mt-1 text-sm text-rb-500">
                {nothing
                  ? "Nothing is saved here yet."
                  : `To move them to another browser, export them here and import the file there. A file carries ${carries}.`}
              </p>
              <BookmarkBackup empty={nothing} className="mt-4" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
