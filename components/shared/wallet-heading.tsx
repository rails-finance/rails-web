"use client";

// The wallet heading (rails-ops decisions/0052, points 1 and 2; ui-jobs 429):
// the heading of the wallet view (W1) and of every position page (H13). The
// facehash at 40px, matching the card's brand bar, then the name block: the
// wallet as the page's h1 and, under it, lines the caller fills. The caller's
// controls take the right end.
//
// On a position page (`PositionWalletHeading`) the h1 is the address menu's
// trigger, the address kind sits beside it, and the line under it is what
// else Rails holds for the wallet (H13.2). The protocol is named by the
// card's sidebar (decision 0052 point 2). Tools takes the right end where the
// page passes it; on a page that draws no detail card the price strip and
// the recency stamp stand before it (ui-jobs 430), and below sm the strip
// wraps under the name block, flush right. DOM order is address, strip, Tools.
//
// The heading draws before the position loads, with Tools in place, so the
// inspector is reachable on a view that never resolves; the wallet joins it
// when the page knows it (an id-keyed page learns its owner from the read).

import { FileCode2, KeyRound, UsersRound, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Facehash } from "@/components/shared/facehash";
import { RevealTip } from "@/components/shared/reveal-tip";
import { WalletPill } from "@/components/shared/wallet-pill";
import { WalletMenu } from "@/components/shared/wallet-menu";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { WalletElsewhereLine } from "@/components/shared/wallet-elsewhere-line";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { protocolForSession } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";
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
  /** The bookmark on the address; false draws none. */
  bookmark?: boolean;
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
  /** The page's explorer: the chain of the address kind, and the default for
   *  the listing link. */
  session: SessionProtocol;
  /** The Tools menu with the page's export shapes; a bare menu without;
   *  false for none, on a page whose card carries the menu (ui-jobs 270). */
  tools?: ReactNode | false;
  /** The price and recency strip, before Tools (ui-jobs 272), on a page that
   *  draws no detail card (ui-jobs 430). */
  strip?: ReactNode;
}) {
  const filterProtocol = owner.filterProtocol === null ? undefined : (owner.filterProtocol ?? session);
  const bookmark = owner.bookmark !== false;
  const chainId = protocolForSession(session)?.chainId;
  // A wallet is its address menu (ui-jobs 271); a vault or a page that links
  // the address elsewhere (PWN's other side) keeps the pill.
  const plain = !owner.vault && !owner.href;
  const pill = owner.wallet ? (
    plain ? (
      <WalletMenu wallet={owner.wallet} ensName={owner.ensName ?? null} bookmark={bookmark} heading />
    ) : (
      <WalletPill
        wallet={owner.wallet}
        ensName={owner.ensName ?? null}
        filterProtocol={filterProtocol}
        bookmark={bookmark}
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
      lines={owner.wallet && <WalletElsewhereLine wallet={owner.wallet} />}
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
