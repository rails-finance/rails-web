"use client";

// The home hero's first question (S11; rails-ops ui-jobs 478): "Not sure where
// to start?" over the start node's cards, and in a browser that holds
// bookmarks the wallets card (S11.1) first in the row.
//
// The wallets card is never in the server render. Its slot is: the inline
// script in app/layout.tsx sets `data-has-bookmarks` on <html> before paint
// when the bookmarks list is not empty, and globals.css shows the slot and
// widens the grid from that attribute, so the row has its final shape on the
// first paint and the card fills in after mount.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OPEN_SEARCH_EVENT, walletHref } from "@/components/shared/front-door-search";
import { START_CARD_FRAME, StartCard } from "@/components/start/start-card";
import { loadBookmarks, SESSIONS_CHANGED_EVENT, type WalletSession } from "@/lib/shared/sessions";
import { START_HREF, TREE, optionHref } from "@/lib/start/tree";

/** The name a bookmark goes by: its custom name, else its ENS name, else the short address. */
export function bookmarkName(session: WalletSession): string {
  const primary = session.addresses[0];
  return session.customName || session.ensNames[primary] || `${primary.slice(0, 6)}…${primary.slice(-4)}`;
}

export function FirstQuestion() {
  const node = TREE.nodes.start;
  return (
    <div className="w-full" data-anatomy="S11">
      <p className="mb-3 text-center text-sm text-rb-500">{node.question}</p>
      <div className="start-first-row grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="start-wallet-slot">
          <WalletsCard />
        </div>
        {node.options.map((o) => (
          <StartCard key={o.slug} href={optionHref(START_HREF, o)} title={o.label} line={o.line} />
        ))}
      </div>
    </div>
  );
}

/** "My wallets": up to three bookmarks by name, each opening its wallet view,
 *  and "All bookmarks" opening the wallet panel (H16). */
function WalletsCard() {
  const [bookmarks, setBookmarks] = useState<WalletSession[] | null>(null);

  useEffect(() => {
    const sync = () => {
      const list = loadBookmarks();
      setBookmarks(list);
      // Keep the slot's attribute in step with the list (a bookmark added or
      // removed in this tab, or the one-time merge of the old per-explorer lists).
      if (list.length > 0) document.documentElement.dataset.hasBookmarks = "1";
      else delete document.documentElement.dataset.hasBookmarks;
    };
    sync();
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <div
      className={`flex h-[9.5rem] w-full flex-col overflow-hidden p-4 ${START_CARD_FRAME}`}
      data-anatomy="S11.1"
      data-start-wallets={bookmarks?.length ?? ""}
    >
      <span className="text-base font-semibold text-foreground">My wallets</span>
      {bookmarks && (
        <>
          <ul className="mt-1 flex flex-col text-sm leading-6">
            {bookmarks.slice(0, 3).map((b) => (
              <li key={b.key} className="truncate">
                <Link
                  href={walletHref(b.addresses[0])}
                  className="text-rb-700 hover:text-[var(--marketing)] dark:text-rb-300"
                  data-start-wallet=""
                >
                  {bookmarkName(b)}
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
            className="mt-auto inline-flex items-center gap-1 self-end text-sm text-rb-500 hover:text-[var(--marketing)] cursor-pointer"
            data-start-all-bookmarks=""
          >
            All bookmarks
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
