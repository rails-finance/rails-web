"use client";

// The wallet row of a position page (rails-ops ui-jobs 228): the wallet the
// page belongs to (avatar, address, copy, bookmark) on its own row above the
// position card, with Tools at the row's right. The card keeps the position's
// ID; the listing card keeps both, since it has no row above it.
//
// `DetailTopRow` draws it when a page passes `owner`; a page with its own top
// row (the vault holder pages) draws it directly. The row is drawn before the
// position loads, with Tools in place, so the inspector is reachable on a
// view that never resolves; the wallet joins it when the page knows it (an
// id-keyed page learns its owner from the position read).

import { CARD_INSET_START } from "@/lib/shared/ui-grammar";
import type { ReactNode } from "react";
import { WalletPill } from "@/components/shared/wallet-pill";
import { ToolsMenu } from "@/components/shared/tools-menu";
import type { BookmarkScope, SessionProtocol } from "@/lib/shared/sessions";

export interface PositionOwner {
  /** The wallet; null or undefined while the page has not read it. */
  wallet: string | null | undefined;
  ensName?: string | null;
  /** The listing the address links to, filtered to this wallet. Defaults to
   *  the page's session; null leaves the label unlinked. */
  filterProtocol?: SessionProtocol | null;
  /** Where the bookmark goes. Defaults to the page's session; null draws no
   *  bookmark. */
  bookmarkProtocol?: BookmarkScope | null;
  bookmarkListing?: string;
  vault?: { name: string; href: string } | null;
  href?: string;
  hrefLabel?: string;
  /** Drawn before the pill ("last owner" on a closed Trove). */
  prefix?: ReactNode;
  /** Wraps the pill, for a page whose holder carries a receipt (Polaris). */
  wrap?: (pill: ReactNode) => ReactNode;
  /** Drawn after the pill (Alchemix's "V2 history →"). */
  extra?: ReactNode;
}

export function PositionWalletRow({
  owner,
  session,
  tools,
}: {
  owner: PositionOwner;
  /** The page's explorer, the default for the listing link and bookmark. */
  session?: SessionProtocol;
  /** The Tools menu with the page's export shapes; a bare menu without. */
  tools?: ReactNode;
}) {
  const filterProtocol = owner.filterProtocol === null ? undefined : (owner.filterProtocol ?? session);
  const bookmarkProtocol = owner.bookmarkProtocol === null ? undefined : (owner.bookmarkProtocol ?? session);
  const pill = owner.wallet ? (
    <WalletPill
      wallet={owner.wallet}
      ensName={owner.ensName ?? null}
      filterProtocol={filterProtocol}
      bookmarkProtocol={bookmarkProtocol}
      bookmarkListing={owner.bookmarkListing}
      vault={owner.vault}
      href={owner.href}
      hrefLabel={owner.hrefLabel}
    />
  ) : null;
  return (
    // One line at every width: the pill does not wrap, Tools keeps its size.
    // The wallet starts on the card content's line (CARD_INSET_START); Tools
    // stays at the page edge.
    <div
      className={`flex min-h-7 items-center justify-between gap-2 ${CARD_INSET_START}`}
      data-position-wallet-row=""
      data-anatomy="H13"
    >
      <span className="flex min-w-0 items-center gap-2 text-xs text-rb-500">
        {pill && owner.prefix}
        {pill && (owner.wrap ? owner.wrap(pill) : pill)}
        {owner.extra}
      </span>
      <span className="shrink-0">{tools || <ToolsMenu />}</span>
    </div>
  );
}
