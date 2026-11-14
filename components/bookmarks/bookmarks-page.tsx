"use client";

// The bookmarks page's body (rails-ops ui-jobs 480), drawn in the app shell: Back's row (H7), then one header row,
// the heading (B1) with the tabs Overview, Focus, Listings, Wallets and
// Positions (B4, ui-jobs 521, 530 and 557; broadest first), over the chosen
// kind's list (B2), the components in components/shared/bookmark-list.tsx.
// The tab rides in the URL (`?tab=focus`, `?tab=listings`, `?tab=wallets`,
// `?tab=positions`; the old `?tab=views` opens Listings). With no tab, the
// Overview (Miles, 10 Nov 2026): a card per kind that can be saved, saying
// how to save one and opening its list, and under the cards the Backup
// section on the page's background (Miles 13 Nov 2026), with export and
// import (`?tab=backup` opens the Overview at it). The Focus card's foot link
// opens the Focus tab, whose table ends in a row that makes a new focus
// (Miles 13 Nov 2026); "New focus" puts the caret in it.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bookmark, Signpost } from "lucide-react";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import {
  BookmarkBackup,
  BookmarkList,
  FocusViewList,
  SavedLinkList,
  useBookmarks,
} from "@/components/shared/bookmark-list";
import { useAssetScope } from "@/lib/shared/asset-scope";
import { useSavedLinks } from "@/components/shared/saved-items";
import { SAVED_NAME } from "@/components/shared/bookmarks-name";
import { walletHref } from "@/components/shared/front-door-search";
import { SAMPLE_WALLET } from "@/lib/shared/sample-wallet";
import { TAB_ACTIVE, TAB_IDLE } from "@/components/shared/rail-header";
import { COUNT_BADGE, FOOT_LINK, INLINE_LINK, PROFILE_CLEARANCE, START_CTA } from "@/lib/shared/ui-grammar";

type Tab = "overview" | "focus" | "listings" | "wallets" | "positions";
type Kind = Exclude<Tab, "overview">;
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "focus", label: "Focus" },
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

/** The tab row (B4). Below sm the five tabs are wider than a phone, so the
 *  row scrolls sideways: a cut edge fades out, and the chosen tab is
 *  scrolled clear of the fades when it changes and once the counts draw, a
 *  tab taking keyboard focus likewise (ui-jobs 677). */
function TabRow({ tab, ready, children }: { tab: Tab; ready: boolean; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState({ start: false, end: false });
  const measure = () => {
    const el = row.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setCut((c) => (c.start === start && c.end === end ? c : { start, end }));
  };
  /** Scrolls the row alone so `t` and its focus ring sit clear of the
   *  32px fades. */
  const reveal = (t: HTMLElement | null | undefined) => {
    const el = row.current;
    if (el && t && el.scrollWidth > el.clientWidth) {
      const pad = 40;
      const left = t.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const right = left + t.offsetWidth;
      if (left - pad < el.scrollLeft) el.scrollLeft = Math.max(0, left - pad);
      else if (right + pad > el.scrollLeft + el.clientWidth) el.scrollLeft = right + pad - el.clientWidth;
    }
    measure();
  };
  useEffect(() => reveal(row.current?.querySelector<HTMLElement>(`[data-saved-tab="${tab}"]`)), [tab, ready]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const fade = [
    cut.start ? "transparent, #000 32px" : "#000",
    cut.end ? "#000 calc(100% - 32px), transparent" : "#000",
  ];
  return (
    <div
      ref={row}
      onScroll={measure}
      onFocus={(e) =>
        reveal(e.target instanceof HTMLElement ? e.target.closest<HTMLElement>("[data-saved-tab]") : null)
      }
      className="-mx-4 flex items-center gap-4 scroll-px-8 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-x-8 sm:overflow-visible sm:px-0"
      style={cut.start || cut.end ? { maskImage: `linear-gradient(to right, ${fade.join(", ")})` } : undefined}
      role="tablist"
      aria-label="Saved views"
      data-anatomy="B4"
      data-saved-tabs-cut={[cut.start ? "start" : "", cut.end ? "end" : ""].filter(Boolean).join(" ") || undefined}
    >
      {children}
    </div>
  );
}

const CARD = "flex flex-col rounded-2xl border border-rb-300/40 bg-raised p-5 dark:border-rb-700/40";

export function BookmarksPage() {
  const bookmarks = useBookmarks();
  const positions = useSavedLinks("position");
  const views = useSavedLinks("view");
  const scope = useAssetScope();
  const [tab, setTab] = useState<Tab>("overview");
  /** Raised by "New focus": the Focus table's new row takes the caret. */
  const [startNew, setStartNew] = useState(0);
  /** The tab last read from the address: a change of it, not a render that
   *  has yet to catch up, is what switches the tab. */
  const urlTab = useRef<Tab | null>(null);
  useEffect(() => {
    urlTab.current = tabFromUrl();
    setTab(urlTab.current);
    if (new URLSearchParams(window.location.search).get("tab") === "backup")
      requestAnimationFrame(() => document.getElementById("saved-backup")?.scrollIntoView({ block: "start" }));
  }, []);
  // A link to `?tab=` can change the tab while this page stays mounted
  // (ui-jobs 582): read it again when the address changes, on a render and
  // on Back or Forward, which need not render this page.
  const follow = () => {
    const t = tabFromUrl();
    if (t !== urlTab.current) {
      urlTab.current = t;
      setTab(t);
      setStartNew(0);
    }
  };
  useEffect(follow);
  useEffect(() => {
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, []);
  /** Opens a tab. The tab row's presses replace the history entry (a control
   *  that changes what this page shows); a card's foot link adds one (`push`),
   *  so Back returns to the Overview (color-grammar §4c). */
  const choose = (t: Tab, push = false) => {
    urlTab.current = t;
    setTab(t);
    setStartNew(0);
    const url = new URL(window.location.href);
    if (t === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    if (push) window.history.pushState(window.history.state, "", url);
    else window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0 });
  };

  const ready = bookmarks && positions && views && scope.ready;
  /** Over every kind's table, focus views included (ui-jobs 586, 652). */
  const starNote = (
    <p className="mb-3 text-sm text-rb-500" data-star-note="">
      Starred items appear in the profile menu.
    </p>
  );
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
      counts.focus ? "your focus settings" : "",
      counts.listings ? plural(counts.listings, "listing") : "",
      counts.wallets ? plural(counts.wallets, "wallet") : "",
      counts.positions ? plural(counts.positions, "position") : "",
    ].filter(Boolean),
  );

  /** A kind's card on the Overview: its heading alone (Miles 13 Nov 2026),
   *  what it keeps, how to save one, and the foot link that opens its list.
   *  Focus's opens its tab with none saved too, as "New focus", the new row
   *  taking the caret. */
  const kindCard = (kind: Kind, title: string, noun: string, how: ReactNode) => (
    <section className={CARD} aria-labelledby={`saved-card-${kind}`} data-saved-card={kind}>
      <h2 id={`saved-card-${kind}`} className="text-base font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-rb-500">{how}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {counts[kind] > 0 ? (
          <button
            type="button"
            onClick={() => choose(kind, true)}
            className={`${FOOT_LINK} cursor-pointer font-semibold`}
            data-saved-card-open={kind}
          >
            {kind === "focus" ? `Open ${counts.focus} saved` : `Open ${plural(counts[kind], noun)}`}
          </button>
        ) : kind === "focus" ? (
          <button
            type="button"
            onClick={() => {
              choose("focus", true);
              setStartNew((n) => n + 1);
            }}
            className={`${FOOT_LINK} cursor-pointer font-semibold`}
            data-saved-card-open="focus"
            data-saved-card-new=""
          >
            New focus
          </button>
        ) : (
          <span className="text-rb-500">None saved yet</span>
        )}
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
      {/* The heading (B1), and under it the tabs (B4) on a row of their own at
          every width (Miles, 13 Nov 2026; ui-jobs 652); on a phone the row
          scrolls sideways (TabRow). From sm, 48px under Back, 28px to the tabs and 56px
          to the panel (Miles's spacing guide, 13 Nov 2026); a phone keeps
          less, its tabs' 44px row already spacing them. */}
      <div className="mb-8 mt-8 flex flex-col gap-3 sm:mb-14 sm:mt-12 sm:gap-7">
        {/* The page's name after an outline bookmark (Miles 13 Nov 2026); the
            profile menu's row draws none. */}
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground" data-anatomy="B1">
          <Bookmark className="size-6 shrink-0" aria-hidden="true" />
          {SAVED_NAME}
        </h1>
        {/* The explorer sub-nav's type (H5, `TAB_ACTIVE`/`TAB_IDLE`) with each
            count in the profile menu's `COUNT_BADGE`, drawn only above 0 (Miles
            13 Nov 2026); 32px apart from sm, twice H5's gap, so a tab and its
            count read as one (ui-jobs 677). */}
        <TabRow tab={tab} ready={!!ready}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`saved-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="saved-panel"
              onClick={() => choose(t.id)}
              className="group focus-ring inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm sm:min-h-0"
              data-saved-tab={t.id}
            >
              <span
                className={
                  tab === t.id
                    ? TAB_ACTIVE
                    : `${TAB_IDLE} group-hover:text-blue-600 dark:group-hover:text-[var(--text-link)]`
                }
              >
                {t.label}
              </span>
              {ready && counts[t.id] > 0 && (
                <span className={COUNT_BADGE} data-saved-tab-count={counts[t.id]}>
                  {counts[t.id]}
                </span>
              )}
            </button>
          ))}
        </TabRow>
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
                  <Link href={walletHref(SAMPLE_WALLET)} className={`text-sm ${FOOT_LINK}`} data-bookmarks-sample="">
                    See a sample wallet
                  </Link>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {kindCard(
                  "focus",
                  "Focus",
                  "focus",
                  <>
                    Focus keeps Rails to the assets and chains you choose. Start one here, or open{" "}
                    <Link href="/assets" className={INLINE_LINK} data-saved-card-assets="">
                      Assets
                    </Link>{" "}
                    and choose <Term>Add to focus</Term> in an asset row&apos;s ⋮ menu.
                  </>,
                )}
                {kindCard(
                  "listings",
                  "Listings",
                  "listing",
                  <>
                    A listing with its filters and sort. Set them on any listing, then choose <Term>Save listing</Term>{" "}
                    in the ⋮ at the end of its filter row.
                  </>,
                )}
                {kindCard(
                  "wallets",
                  "Wallets",
                  "wallet",
                  <>
                    A wallet&apos;s positions across Rails. Press the bookmark beside any wallet address, or choose{" "}
                    <Term>Save wallet</Term> in the address menu on a position page.
                  </>,
                )}
                {kindCard(
                  "positions",
                  "Positions",
                  "position",
                  <>
                    One position or vault holding. Choose <Term>Save position</Term> in the ⋮ menu of its card.
                  </>,
                )}
              </div>
              {/* Backup is a section on the page's background under the cards,
                  no card of its own, on the column's edge (Miles 13 Nov 2026). */}
              <section
                id="saved-backup"
                className="mt-10 scroll-mt-6 sm:mt-12"
                aria-labelledby="saved-card-backup"
                data-saved-card="backup"
                data-saved-backup=""
              >
                <h2 id="saved-card-backup" className="text-base font-semibold text-foreground">
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
          {tab === "wallets" && bookmarks.length > 0 && starNote}
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
          {tab === "positions" && positions.length > 0 && starNote}
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
          {tab === "listings" && views.length > 0 && starNote}
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
              {scope.views.length > 0 && starNote}
              <FocusViewList
                views={scope.views}
                active={scope.active?.id ?? null}
                start={startNew}
                empty={
                  <div data-anatomy="B3">
                    <p className="font-semibold text-foreground">Nothing in focus yet.</p>
                    <p className="mt-1 text-sm text-rb-500">
                      Focus keeps Rails to the assets and chains you choose. Make one in the row below, or press{" "}
                      <span className="font-semibold text-foreground">Use this view</span> on a focus link.
                    </p>
                  </div>
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
