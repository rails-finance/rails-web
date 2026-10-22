"use client";

// The owner's address on a position page, as the trigger of a menu (ui-jobs
// 271): Copy the address, Bookmark it (the row reads as set or not), View the
// wallet (its wallet view, rails-ops decision 0051). The wallet view's heading
// draws the same menu without View the wallet (ui-jobs 430). A dropdown on desktop, a sheet below sm. The copy and bookmark
// icons that sat beside the address on the wallet row are these rows now; a
// bookmarked address shows a small BookmarkCheck between its label and the
// chevron.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Check, ChevronDown, Copy, Wallet } from "lucide-react";
import { startNavigationProgress } from "@/components/nav/navigation-progress";
import { Facehash } from "@/components/shared/facehash";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { walletHref } from "@/components/shared/front-door-search";
import { isBookmarked, toggleBookmark, SESSIONS_CHANGED_EVENT } from "@/lib/shared/sessions";
import { OVERLAY_HEADING, WALLET_HEADING_NAME, WALLET_HEADING_SHORT } from "@/lib/shared/ui-grammar";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function WalletMenu({
  wallet,
  ensName,
  bookmark = true,
  heading = false,
  view = true,
}: {
  wallet: string;
  ensName: string | null;
  /** The Bookmark row; false for none. */
  bookmark?: boolean;
  /** The trigger as the page's h1 (the wallet heading, H13): the name or
   *  address at heading type with no facehash, and a name's short address
   *  beside the h1. */
  heading?: boolean;
  /** The View the wallet row; false on the wallet view. */
  view?: boolean;
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
  // The page the reader is on rides along, so the wallet view can link back
  // to its explorer.
  const pathname = usePathname();
  const href = pathname ? `${walletHref(wallet)}?from=${encodeURIComponent(pathname)}` : walletHref(wallet);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!bookmark) return;
    const sync = () => setFav(isBookmarked(wallet));
    sync();
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [wallet, bookmark]);

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
      {bookmark && (
        <ToolsMenuItem
          icon={fav ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          title={fav ? "Bookmarked" : "Bookmark it"}
          subtitle={fav ? "Press to remove the bookmark" : "Keep it in your bookmarks"}
          onClick={() => setFav(toggleBookmark(wallet, name))}
        />
      )}
      {view && (
        <ToolsMenuItem
          icon={<Wallet size={16} />}
          title="View the wallet"
          subtitle="Its positions on every chain Rails reads"
          onClick={() => {
            close();
            startNavigationProgress(href);
            router.push(href);
          }}
        />
      )}
    </>
  );

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={`${name ? `${name} · ` : ""}${wallet}${fav ? ", bookmarked" : ""}: open the address menu`}
      title={name ? `${name} · ${wallet}` : wallet}
      // A 28px row with a 44px press area (after:).
      className={`relative flex h-7 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md transition-colors focus-ring after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] ${
        heading ? "text-foreground hover:text-blue-500" : "text-xs text-rb-500 hover:text-foreground"
      }`}
    >
      {!heading && <Facehash address={wallet} size={16} />}
      <span
        data-wallet-label={name ? "name" : "address"}
        className={
          name ? `min-w-0 truncate ${heading ? "max-w-[24ch]" : "max-w-[15ch]"}` : "min-w-0 truncate font-mono"
        }
      >
        {label}
      </span>
      {fav && (
        <BookmarkCheck
          data-wallet-bookmarked=""
          className={`${heading ? "h-4 w-4 text-rb-500" : "h-3.5 w-3.5"} shrink-0`}
          aria-hidden="true"
        />
      )}
      <ChevronDown
        className={`${heading ? "h-4 w-4 text-rb-500" : "h-3.5 w-3.5"} shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );

  return (
    // The address keeps its width (a name is capped at 15ch) while the address
    // kind beside it gives way (shrink-[100]); past that the name truncates, so
    // the bookmark glyph and chevron stay on the line. The row does not hide
    // overflow, so the dropdown below the address shows.
    <div
      ref={ref}
      className={heading ? "relative flex min-w-0 items-center gap-x-2.5" : "relative min-w-0"}
      data-wallet-menu=""
      data-anatomy="C7"
    >
      {heading ? (
        <>
          <h1 className={`${WALLET_HEADING_NAME} min-w-0`}>{trigger}</h1>
          {name && <span className={WALLET_HEADING_SHORT}>{short(wallet)}</span>}
        </>
      ) : (
        trigger
      )}
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
            className="overlay-panel absolute left-0 top-full z-[var(--z-dropdown)] mt-2 min-w-[240px] overflow-hidden py-1"
            role="menu"
          >
            {rows}
          </div>
        ))}
    </div>
  );
}
