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
import { useEffect, useState, type ReactNode } from "react";
import { WalletPill } from "@/components/shared/wallet-pill";
import { ToolsMenu } from "@/components/shared/tools-menu";
import type { BookmarkScope, SessionProtocol } from "@/lib/shared/sessions";
import { protocolForSession } from "@/lib/shared/protocols";
import { fetchAddressKind, type AddressKind } from "@/lib/api/fetch-address-kind";
import type { ChainId } from "@/lib/shared/chains";

/** The row's words for what the address is (ui-jobs 232), and the read
 *  behind them for the tip. */
function addressKindWords(k: AddressKind): { label: string; tip: string } {
  const at = `eth_getCode at block ${k.block.toLocaleString("en-US")}`;
  switch (k.kind) {
    case "account":
      return { label: "Wallet", tip: `No code at this address (${at}): an account a key controls.` };
    case "delegated":
      return {
        label: "Smart account (EIP-7702)",
        tip: `The code is an EIP-7702 delegation to ${k.delegate} (${at}): a key controls the account and it runs the delegate's code.`,
      };
    case "safe":
      return { label: "Smart account (Safe)", tip: `A Safe ${k.version} (${at}): its owners sign together.` };
    case "contract": {
      const named = k.name && k.symbol ? `${k.name} (${k.symbol})` : (k.name ?? k.symbol);
      return {
        label: named ? `Contract: ${named}` : "Contract",
        tip: named
          ? `A contract (${at}); its name() and symbol() answer ${named}.`
          : `A contract (${at}); it answers no name().`,
      };
    }
  }
}

function AddressKindLabel({ wallet, chainId }: { wallet: string; chainId: ChainId }) {
  const [kind, setKind] = useState<AddressKind | null>(null);
  useEffect(() => {
    let live = true;
    setKind(null);
    fetchAddressKind(wallet, chainId).then((k) => {
      if (live) setKind(k);
    });
    return () => {
      live = false;
    };
  }, [wallet, chainId]);
  if (!kind) return null;
  const w = addressKindWords(kind);
  return (
    <span className="min-w-0 truncate" data-address-kind={kind.kind} title={w.tip}>
      {w.label}
    </span>
  );
}

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
  /** The Tools menu with the page's export shapes; a bare menu without;
   *  false for none, on a page whose card carries the menu (ui-jobs 270). */
  tools?: ReactNode | false;
}) {
  const filterProtocol = owner.filterProtocol === null ? undefined : (owner.filterProtocol ?? session);
  const bookmarkProtocol = owner.bookmarkProtocol === null ? undefined : (owner.bookmarkProtocol ?? session);
  const chainId = session ? protocolForSession(session)?.chainId : undefined;
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
        {owner.wallet && chainId != null && <AddressKindLabel wallet={owner.wallet} chainId={chainId} />}
        {owner.extra}
      </span>
      {tools !== false && <span className="shrink-0">{tools || <ToolsMenu />}</span>}
    </div>
  );
}
