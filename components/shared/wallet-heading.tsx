"use client";

// The wallet heading (rails-ops decisions/0052, points 1 and 2; ui-jobs 429):
// the heading of the wallet view (W1) and of every position page (H13). The
// facehash at 40px, matching the card's brand bar, then the name block: the
// wallet as the page's h1 and, under it, lines the caller fills. The caller's
// controls take the right end.
//
// On a position page (`PositionWalletHeading`) the h1 is the address menu's
// trigger, the address kind sits beside it, and the lines are the protocol
// line (H13.3: the protocol's mark and name linking to its listing, then the
// chain) and what else Rails holds for the wallet (H13.2). The price strip,
// the recency stamp and Tools take the right end; below sm the strip wraps
// under the name block, flush right. DOM order is address, strip, Tools.
//
// The heading draws before the position loads, with Tools in place, so the
// inspector is reachable on a view that never resolves; the wallet joins it
// when the page knows it (an id-keyed page learns its owner from the read).

import Link from "next/link";
import { FileCode2, KeyRound, UsersRound, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Facehash } from "@/components/shared/facehash";
import { RevealTip } from "@/components/shared/reveal-tip";
import { WalletPill } from "@/components/shared/wallet-pill";
import { WalletMenu } from "@/components/shared/wallet-menu";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { WalletElsewhereLine } from "@/components/shared/wallet-elsewhere-line";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import type { BookmarkScope, SessionProtocol } from "@/lib/shared/sessions";
import { protocolForSession } from "@/lib/shared/protocols";
import { chainMeta, type ChainId } from "@/lib/shared/chains";
import { fetchAddressKind, type AddressKind } from "@/lib/api/fetch-address-kind";

/** The shell both surfaces draw. `title` is the name line (the h1 and what
 *  sits beside it), `lines` the text-xs lines under it, `end` the controls at
 *  the right. */
export function WalletHeading({
  address,
  title,
  lines,
  end,
  ...data
}: {
  /** The wallet; unset while the page has not read it, which keeps the
   *  facehash's place. */
  address?: string | null;
  title: ReactNode;
  lines?: ReactNode;
  end?: ReactNode;
} & { [k: `data-${string}`]: string | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" {...data}>
      <div className="flex min-w-0 flex-auto basis-0 items-center gap-3 sm:basis-auto">
        {address ? (
          <Facehash address={address} size={40} />
        ) : (
          <span className="block size-10 shrink-0 rounded-[9px] bg-rb-300/40 dark:bg-rb-700/40" aria-hidden />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-rb-500">
            {title}
          </div>
          {lines}
        </div>
      </div>
      {end}
    </div>
  );
}

/** A chain's glyph, muted, its name as the accessible name and the tip. */
export function ChainMark({ chainId }: { chainId: ChainId }) {
  const name = chainMeta(chainId).name;
  return (
    <RevealTip tip={name} label={name} focusable className="inline-flex rounded-sm focus-ring">
      <ChainGlyph id={chainId} className="size-3.5 text-rb-500" />
    </RevealTip>
  );
}

/** H13.3: the protocol's mark and name, linking to its listing, then the
 *  chain. The explorer's way in from a position page (decision 0052 point 2). */
function ProtocolLine({ session }: { session: SessionProtocol }) {
  const entry = protocolForSession(session);
  if (!entry) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-rb-500" data-anatomy="H13.3">
      <Link
        href={entry.listingHref}
        data-rail-identity={entry.id}
        className="group inline-flex min-w-0 items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-ring"
      >
        <ProtocolIcon id={entry.id} className="size-3.5 shrink-0 text-foreground/70 group-hover:text-foreground" />
        <span className="truncate font-medium">{entry.label}</span>
      </Link>
      <ChainMark chainId={entry.chainId} />
    </div>
  );
}

/** The glyph and words for what the address is (ui-jobs 232), with a
 *  newcomer's one-line tip. A plain wallet (`account`) has none; a contract
 *  carries its name when it answers one. */
function addressKindWords(k: Exclude<AddressKind, { kind: "account" }>): {
  Icon: LucideIcon;
  label: string | null;
  tip: string;
} {
  switch (k.kind) {
    case "delegated":
      return {
        Icon: KeyRound,
        label: "Smart account",
        tip: "A wallet someone holds a key to, set up to run extra code when it acts.",
      };
    case "safe":
      return { Icon: UsersRound, label: "Safe", tip: "A shared wallet: several owners sign together before it acts." };
    case "contract": {
      const named = k.name && k.symbol ? `${k.name} (${k.symbol})` : (k.name ?? k.symbol);
      return {
        Icon: FileCode2,
        label: named ?? null,
        tip: named
          ? `A smart contract named ${named}: a program on Ethereum, not a wallet someone holds a key to.`
          : "A smart contract: a program on Ethereum, not a wallet someone holds a key to.",
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
  if (!kind || kind.kind === "account") return null;
  const w = addressKindWords(kind);
  return (
    // Gives way before the address does (shrink-[100]).
    <RevealTip
      tip={<span className="block w-72 whitespace-normal">{w.tip}</span>}
      label={w.label ? `${w.label}. ${w.tip}` : w.tip}
      focusable
      className="min-w-0 shrink-[100] focus-ring rounded-sm"
    >
      <span className="flex min-w-0 items-center gap-1" data-address-kind={kind.kind}>
        <w.Icon className="size-3.5 shrink-0" aria-hidden />
        {w.label && <span className="max-w-[40vw] truncate sm:max-w-xs">{w.label}</span>}
      </span>
    </RevealTip>
  );
}

export interface PositionOwner {
  /** The wallet; null or undefined while the page has not read it. */
  wallet: string | null | undefined;
  ensName?: string | null;
  /** Where a pill (a vault, or a page passing `href`) filters its listing to
   *  this wallet. Defaults to the page's session; null leaves the label
   *  unlinked. The address menu opens the wallet view and ignores it. */
  filterProtocol?: SessionProtocol | null;
  /** Where the bookmark goes. Defaults to the page's session; null draws no
   *  bookmark. */
  bookmarkProtocol?: BookmarkScope | null;
  bookmarkListing?: string;
  vault?: { name: string; href: string } | null;
  href?: string;
  hrefLabel?: string;
  /** Drawn before the address ("last owner" on a closed Trove). */
  prefix?: ReactNode;
  /** Wraps the address, for a page whose holder carries a receipt (Polaris). */
  wrap?: (pill: ReactNode) => ReactNode;
  /** Drawn after the address (Alchemix's "V2 history →"). */
  extra?: ReactNode;
}

export function PositionWalletHeading({
  owner,
  session,
  tools,
  strip,
}: {
  owner: PositionOwner;
  /** The page's explorer: the protocol line, and the default for the listing
   *  link and bookmark. */
  session: SessionProtocol;
  /** The Tools menu with the page's export shapes; a bare menu without;
   *  false for none, on a page whose card carries the menu (ui-jobs 270). */
  tools?: ReactNode | false;
  /** The price and recency strip, before Tools (ui-jobs 272). */
  strip?: ReactNode;
}) {
  const filterProtocol = owner.filterProtocol === null ? undefined : (owner.filterProtocol ?? session);
  const bookmarkProtocol = owner.bookmarkProtocol === null ? undefined : (owner.bookmarkProtocol ?? session);
  const chainId = protocolForSession(session)?.chainId;
  // A wallet is its address menu (ui-jobs 271); a vault or a page that links
  // the address elsewhere (PWN's other side) keeps the pill.
  const plain = !owner.vault && !owner.href;
  const pill = owner.wallet ? (
    plain ? (
      <WalletMenu
        wallet={owner.wallet}
        ensName={owner.ensName ?? null}
        bookmarkProtocol={bookmarkProtocol}
        bookmarkListing={owner.bookmarkListing}
        heading
      />
    ) : (
      <WalletPill
        wallet={owner.wallet}
        ensName={owner.ensName ?? null}
        filterProtocol={filterProtocol}
        bookmarkProtocol={bookmarkProtocol}
        bookmarkListing={owner.bookmarkListing}
        vault={owner.vault}
        href={owner.href}
        hrefLabel={owner.hrefLabel}
        heading
      />
    )
  ) : null;
  return (
    <WalletHeading
      address={owner.wallet}
      data-anatomy="H13"
      data-position-wallet-row=""
      title={
        <>
          {pill && owner.prefix}
          {pill && (owner.wrap ? owner.wrap(pill) : pill)}
          {owner.wallet && chainId != null && <AddressKindLabel wallet={owner.wallet} chainId={chainId} />}
          {owner.extra}
        </>
      }
      lines={
        <>
          <ProtocolLine session={session} />
          {owner.wallet && <WalletElsewhereLine wallet={owner.wallet} />}
        </>
      }
      end={
        <>
          {strip && (
            <span
              className="order-last flex min-h-7 basis-full shrink-0 items-center justify-end gap-1 sm:order-none sm:ml-auto sm:basis-auto sm:gap-2"
              data-position-strip=""
            >
              {strip}
            </span>
          )}
          {tools !== false && (
            <span className="ml-auto flex min-h-7 shrink-0 items-center">{tools || <ToolsMenu />}</span>
          )}
        </>
      }
    />
  );
}
