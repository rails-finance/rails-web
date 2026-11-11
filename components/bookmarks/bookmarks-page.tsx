"use client";

// The bookmarks page's body (rails-ops ui-jobs 480), drawn in the app shell: Back's row (H7), then one header row,
// the heading (B1) with the tabs Overview, Focus views, Listings, Wallets and
// Positions (B4, ui-jobs 521, 530 and 557; broadest first), over the chosen
// kind's list (B2), the components in components/shared/bookmark-list.tsx.
// The tab rides in the URL (`?tab=focus`, `?tab=listings`, `?tab=wallets`,
// `?tab=positions`; the old `?tab=views` opens Listings). With no tab, the
// Overview (Miles, 10 Nov 2026): a card per kind that can be saved, saying
// how to save one and opening its list, and the backup card with export and
// import (`?tab=backup` opens the Overview at it).

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bookmark, Focus, HardDriveDownload, Layers, ListFilter, Plus, Signpost, Wallet } from "lucide-react";
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
import { INLINE_LINK, INPLACE_TEXT, PROFILE_CLEARANCE, START_CTA } from "@/lib/shared/ui-grammar";

type Tab = "overview" | "focus" | "listings" | "wallets" | "positions";
type Kind = Exclude<Tab, "overview">;
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "focus", label: "Focus views" },
  { id: "listings", label: "Listings" },
  { id: "wallets", label: "Wallets" },
  { id: "positions", label: "Positions" },
];

const tabFromUrl = (): Tab => {
  const t = new URLSearchParams(window.location.search).get("tab");
  if (t === "views") return "listings";
  return t === "focus" || t === "listings" || t === "wallets" || t === "positions" ? t : "overview";
};

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const andList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** A menu or control's name, as the reader sees it on the page. */
const Term = ({ children }: { children: ReactNode }) => (
  <span className="font-semibold text-foreground">{children}</span>
);

const CARD = "flex flex-col rounded-2xl border border-rb-300/40 bg-raised p-5 dark:border-rb-700/40";

const NEW_VIEW =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md bg-teal-600/10 px-3 py-1.5 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-600/20 sm:min-h-0 dark:bg-teal-400/10 dark:text-teal-400 dark:hover:bg-teal-400/20";

export function BookmarksPage() {
  const bookmarks = useBookmarks();
  const positions = useSavedLinks("position");
  const views = useSavedLinks("view");
  const scope = useAssetScope();
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    setTab(tabFromUrl());
    if (new URLSearchParams(window.location.search).get("tab") === "backup")
      requestAnimationFrame(() => document.getElementById("saved-backup")?.scrollIntoView({ block: "start" }));
  }, []);
  // A heading in the profile menu (H20) can change the tab while this page
  // stays mounted (ui-jobs 582): read it again when the address changes.
  useEffect(() => {
    const t = tabFromUrl();
    if (t !== tab) setTab(t);
  });
  const choose = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0 });
  };

  const ready = bookmarks && positions && views && scope.ready;
  const counts: Record<Tab, number> = {
    overview: 0,
    focus: scope.views.length,
    listings: views?.length ?? 0,
    wallets: bookmarks?.length ?? 0,
    positions: positions?.length ?? 0,
  };
  const nothing = counts.wallets + counts.positions + counts.listings + counts.focus === 0;
  const carries = andList(
    [
      counts.focus ? plural(counts.focus, "focus view") : "",
      counts.listings ? plural(counts.listings, "listing") : "",
      counts.wallets ? plural(counts.wallets, "wallet") : "",
      counts.positions ? plural(counts.positions, "position") : "",
    ].filter(Boolean),
  );

  const newView = (
    <button
      type="button"
      onClick={() => {
        choose("focus");
        focusViews.create();
      }}
      className={NEW_VIEW}
      data-focus-view-new=""
    >
      New view
      <Plus className="size-4" aria-hidden="true" />
    </button>
  );

  /** A kind's card on the Overview: what it keeps, how to save one, and the
   *  press that opens its list. */
  const kindCard = (kind: Kind, icon: ReactNode, title: string, noun: string, how: ReactNode, extra?: ReactNode) => (
    <section className={CARD} aria-labelledby={`saved-card-${kind}`} data-saved-card={kind}>
      <h2 id={`saved-card-${kind}`} className="flex items-center gap-2 text-base font-semibold text-foreground">
        <span className="text-rb-500">{icon}</span>
        {title}
      </h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-rb-500">{how}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {counts[kind] > 0 ? (
          <button
            type="button"
            onClick={() => choose(kind)}
            className={`inline-flex min-h-11 items-center font-semibold sm:min-h-0 ${INPLACE_TEXT}`}
            data-saved-card-open={kind}
          >
            {`Open ${plural(counts[kind], noun)}`}
          </button>
        ) : (
          <span className="text-rb-500">None saved yet</span>
        )}
        {extra}
      </div>
    </section>
  );

  return (
    // In the app shell (ui-jobs 480): the column's left edge and the app
    // pages' py-8, so Back's line centres on the profile control (H20) at the
    // top right from md.
    <div className="py-8">
      {/* Back's row, as a detail page draws it (H7): the column's first line,
          level with the profile control (H20) the app layout draws at the top
          right from md. With no history Back opens the home page. */}
      <div className={`flex min-h-[38px] items-center ${PROFILE_CLEARANCE}`} data-anatomy="H7" data-back-row="">
        <DetailBackButton fallbackHref="/" />
      </div>
      {/* One header row: the heading (B1) and the tabs (B4); on a phone the
          tabs are one row under it that scrolls sideways (Miles, 10 Nov 2026). */}
      <div className="mb-6 mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground" data-anatomy="B1">
          {/* The saved-state glyph the wallet menu draws (ui-jobs 493, 494). */}
          <Bookmark className="size-6 shrink-0" fill="currentColor" aria-hidden="true" />
          {SAVED_NAME}
        </h1>
        <div
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          role="tablist"
          aria-label="Saved items"
          data-anatomy="B4"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`saved-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="saved-panel"
              onClick={() => choose(t.id)}
              className={`${tab === t.id ? "pill-active" : "pill-idle"} min-h-11 shrink-0 cursor-pointer whitespace-nowrap sm:min-h-0`}
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
          {tab === "overview" && (
            <div data-saved-overview="">
              {nothing && (
                <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3" data-anatomy="B3">
                  <Link href="/start" className={`inline-flex ${START_CTA}`} data-bookmarks-start="">
                    New to Rails? Start here
                    <Signpost className="size-4 shrink-0" aria-hidden="true" />
                  </Link>
                  <Link href={walletHref(SAMPLE_WALLET)} className={`text-sm ${INLINE_LINK}`} data-bookmarks-sample="">
                    See a sample wallet →
                  </Link>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {kindCard(
                  "focus",
                  <Focus className="size-4" aria-hidden="true" />,
                  "Focus views",
                  "focus view",
                  <>
                    A focus view keeps Rails to the assets and chains you choose. Start one here, or open Assets and
                    choose <Term>Add to focus</Term> in an asset row&apos;s ⋮ menu.
                  </>,
                  <>
                    {newView}
                    <Link href="/assets" className={INLINE_LINK} data-saved-card-assets="">
                      Assets →
                    </Link>
                  </>,
                )}
                {kindCard(
                  "listings",
                  <ListFilter className="size-4" aria-hidden="true" />,
                  "Listings",
                  "listing",
                  <>
                    A listing with its filters and sort. Set them on any listing, then choose <Term>Save listing</Term>{" "}
                    in the ⋮ at the end of its filter row.
                  </>,
                )}
                {kindCard(
                  "wallets",
                  <Wallet className="size-4" aria-hidden="true" />,
                  "Wallets",
                  "wallet",
                  <>
                    A wallet&apos;s positions across Rails. Press the bookmark beside any wallet address, or choose{" "}
                    <Term>Save wallet</Term> in the address menu on a position page.
                  </>,
                )}
                {kindCard(
                  "positions",
                  <Layers className="size-4" aria-hidden="true" />,
                  "Positions",
                  "position",
                  <>
                    One position or vault holding. Choose <Term>Save position</Term> in the ⋮ menu of its card.
                  </>,
                )}
              </div>
              <section
                id="saved-backup"
                className={`${CARD} mt-4 scroll-mt-6`}
                aria-labelledby="saved-card-backup"
                data-saved-card="backup"
                data-saved-backup=""
              >
                <h2 id="saved-card-backup" className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <span className="text-rb-500">
                    <HardDriveDownload className="size-4" aria-hidden="true" />
                  </span>
                  Backup
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-rb-500">
                  {nothing
                    ? "Everything you save is kept in this browser."
                    : `Everything you save is kept in this browser. To move it to another, export a file here and import it there. The file carries ${carries}.`}
                </p>
                <BookmarkBackup empty={nothing} className="mt-4" />
              </section>
            </div>
          )}
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
                    To save one, choose Save position in the ⋮ menu of a position or vault card.
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
                    To save one, set a listing&apos;s filters and sort, then choose Save listing in the ⋮ at the end of
                    its filter row.
                  </p>
                </div>
              }
            />
          )}
          {tab === "focus" && (
            <>
              {scope.views.length > 0 && (
                <p className="mb-3 text-sm text-rb-500" data-focus-menu-note="">
                  The profile menu offers one focus view. Choose it here with Show in menu.
                </p>
              )}
              <FocusViewList
                views={scope.views}
                active={scope.active?.id ?? null}
                menu={scope.menuView?.id ?? null}
                empty={
                  <div data-anatomy="B3">
                    <p className="font-semibold text-foreground">No focus views yet.</p>
                    <p className="mt-1 text-sm text-rb-500">
                      A focus view keeps Rails to the assets and chains you choose. Make one here, or press{" "}
                      <span className="font-semibold text-foreground">Use this view</span> on a focus link.
                    </p>
                  </div>
                }
              />
              <div className="mt-4 flex justify-end">{newView}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
