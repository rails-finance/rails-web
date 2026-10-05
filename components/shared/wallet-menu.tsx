"use client";

// The owner's address on a position page, as the trigger of a menu (ui-jobs
// 271): Copy the address, Bookmark it (the row reads as set or not), View its
// positions. A dropdown on desktop, a sheet below sm. The copy and bookmark
// icons that sat beside the address on the wallet row are these rows now, and
// no bookmark glyph rides the row or the facehash.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Check, ChevronDown, Copy, List } from "lucide-react";
import { startNavigationProgress } from "@/components/nav/navigation-progress";
import { Facehash } from "@/components/shared/facehash";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import {
  isBookmarked,
  toggleBookmark,
  SESSIONS_CHANGED_EVENT,
  type BookmarkScope,
  type SessionProtocol,
} from "@/lib/shared/sessions";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function WalletMenu({
  wallet,
  ensName,
  filterProtocol,
  bookmarkProtocol,
  bookmarkListing,
}: {
  wallet: string;
  ensName: string | null;
  /** The listing "View its positions" opens, filtered to this wallet. */
  filterProtocol?: SessionProtocol;
  /** Where the bookmark goes; unset, the menu has no Bookmark row. */
  bookmarkProtocol?: BookmarkScope;
  bookmarkListing?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fav, setFav] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const resolved = useEnsName(ensName ? null : wallet);
  const name = ensName ?? resolved;
  const label = name ?? short(wallet);
  const href = filterProtocol ? listingHrefForWallet(filterProtocol, wallet) : null;
  const close = () => setOpen(false);

  useEffect(() => {
    if (!bookmarkProtocol) return;
    const sync = () => setFav(isBookmarked(wallet, bookmarkProtocol));
    sync();
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [wallet, bookmarkProtocol]);

  // Outside press and Escape close the dropdown; the sheet closes from its
  // scrim and Escape, and its rows are portalled outside `ref`.
  useEffect(() => {
    if (!open || isPhone) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isPhone]);

  const rows = (
    <>
      <ToolsMenuItem
        icon={copied ? <Check size={16} /> : <Copy size={16} />}
        title={copied ? "Copied" : "Copy the address"}
        subtitle={short(wallet)}
        onClick={() => {
          void navigator.clipboard.writeText(wallet).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      />
      {bookmarkProtocol && (
        <ToolsMenuItem
          icon={fav ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          title={fav ? "Bookmarked" : "Bookmark it"}
          subtitle={fav ? "Press to remove the bookmark" : "Keep it in your bookmarks"}
          onClick={() => setFav(toggleBookmark(wallet, name, bookmarkProtocol, bookmarkListing))}
        />
      )}
      {href && (
        <ToolsMenuItem
          icon={<List size={16} />}
          title="View its positions"
          subtitle="Every position this address holds here"
          onClick={() => {
            close();
            startNavigationProgress(href);
            router.push(href);
          }}
        />
      )}
    </>
  );

  return (
    <div ref={ref} className="relative min-w-0" data-wallet-menu="" data-anatomy="C7">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${name ? `${name} · ` : ""}${wallet}: open the address menu`}
        title={name ? `${name} · ${wallet}` : wallet}
        // A 28px row with a 44px press area (after:).
        className="relative flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-xs text-rb-500 transition-colors hover:text-foreground focus-ring after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']"
      >
        <Facehash address={wallet} size={16} />
        <span
          data-wallet-label={name ? "name" : "address"}
          className={name ? "min-w-0 max-w-[15ch] truncate" : "min-w-0 truncate font-mono"}
        >
          {label}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open &&
        (isPhone ? (
          <MobileSheet
            label="Address menu"
            onClose={close}
            header={<div className={`${OVERLAY_HEADING} px-1 pb-2`}>Address</div>}
          >
            <div role="menu" className="-mx-4 [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:w-[calc(100%-0.5rem)]">
              {rows}
            </div>
          </MobileSheet>
        ) : (
          <div
            className="overlay-panel absolute left-0 top-full z-50 mt-2 min-w-[240px] overflow-hidden py-1"
            role="menu"
          >
            {rows}
          </div>
        ))}
    </div>
  );
}
