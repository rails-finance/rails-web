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

import { useContext, useEffect, useState } from "react";
import { ListingRowContext } from "@/components/shared/position-card-edge";
import { isBookmarked, toggleBookmark, SESSIONS_CHANGED_EVENT } from "@/lib/shared/sessions";

/** Whether the wallet is saved, kept in step with every change anywhere
 *  (another card on the page, the panel's remove action, or another tab via
 *  the native `storage` event). */
function useBookmarked(wallet: string): [boolean, (v: boolean) => void] {
  const [fav, setFav] = useState(false);
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
  return [fav, setFav];
}

function BookmarkGlyph({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** A listing row's bookmark (ui-jobs 807): a filled mark where the wallet is
 *  saved, nothing otherwise. Not a control: the row stays one press target. */
export function BookmarkMark({ wallet, size = 12 }: { wallet: string; size?: number }) {
  const [fav] = useBookmarked(wallet);
  if (!fav) return null;
  return (
    <span className="inline-flex shrink-0 items-center text-foreground" data-bookmark-mark="">
      <BookmarkGlyph size={size} filled />
      <span className="sr-only">Saved wallet</span>
    </span>
  );
}

/** The save toggle; inside a listing row's header, the inert mark (ui-jobs
 *  807), so no family can nest a control in the row's link. */
export function BookmarkToggle(props: { wallet: string; ensName: string | null; size?: number }) {
  const listingRow = useContext(ListingRowContext);
  return listingRow ? <BookmarkMark wallet={props.wallet} /> : <BookmarkToggleButton {...props} />;
}

function BookmarkToggleButton({
  wallet,
  ensName,
  size = 13,
}: {
  wallet: string;
  ensName: string | null;
  size?: number;
}) {
  const [fav, setFav] = useBookmarked(wallet);

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
      aria-label={fav ? "Saved" : "Save wallet"}
      title={fav ? "Saved. Press to remove it from your saved wallets" : "Save wallet"}
      className={`shrink-0 inline-flex items-center cursor-pointer transition-colors ${
        fav ? "text-foreground hover:text-rb-500" : "text-rb-500 hover:text-foreground"
      }`}
    >
      <BookmarkGlyph size={size} filled={fav} />
    </button>
  );
}
