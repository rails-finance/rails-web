"use client";

// Bookmark toggle for a wallet, designed to live beside the address it
// bookmarks — a card's identity row, usually via WalletPill's `bookmark`, on
// listing and detail cards alike. A bookmark is the wallet's address, so every
// card for the same owner on every explorer reflects the same state, and the
// bookmarks are listed in the wallet panel.
//
// Colour: deliberately neutral (filled foreground when bookmarked, muted
// outline when not). A bookmark is an affordance state, not a risk/value
// signal — so it stays out of the valence palette (no green/red, no amber).

import { useEffect, useState } from "react";
import { isBookmarked, toggleBookmark, SESSIONS_CHANGED_EVENT } from "@/lib/shared/sessions";

export function BookmarkToggle({
  wallet,
  ensName,
  size = 13,
}: {
  wallet: string;
  ensName: string | null;
  size?: number;
}) {
  const [fav, setFav] = useState(false);

  // Subscribe so every bookmark toggle for the same wallet stays in sync after a change
  // anywhere (another card on the page, the panel's remove action, or a
  // change in another tab via the native `storage` event).
  useEffect(() => {
    const sync = () => setFav(isBookmarked(wallet));
    sync();
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [wallet]);

  return (
    <button
      type="button"
      onClick={(e) => {
        // The card is wrapped in a Next <Link>; stop the click bubbling so
        // bookmarking never navigates.
        e.preventDefault();
        e.stopPropagation();
        setFav(toggleBookmark(wallet, ensName));
      }}
      aria-pressed={fav}
      aria-label={fav ? "Remove wallet bookmark" : "Bookmark this wallet"}
      title={fav ? "Bookmarked — click to remove" : "Bookmark this wallet"}
      className={`shrink-0 inline-flex items-center cursor-pointer transition-colors ${
        fav ? "text-foreground hover:text-rb-500" : "text-rb-500 hover:text-foreground"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
