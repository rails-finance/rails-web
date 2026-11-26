"use client";

// The wallet heading (rails-ops decisions/0052, points 1 and 2; ui-jobs 429):
// the heading of the wallet view (W1) and of every position page (H13). The
// facehash at 40px on the page edge, the column of the cards' 40px sidebar
// bar below it (C20, P2.1, P3.1), then the name block: the wallet as the
// page's h1 and, under it, lines the caller fills. The caller's controls take
// the right end.
//
// On a position page (`PositionWalletHeading`) the h1 is the address menu's
// trigger, the address kind sits beside it, and under it the trail (H13.4):
// the menu of the wallet's positions on Rails (H13.2), the protocol, and the
// position the card names. The facehash links to the wallet dashboard.
// Tools takes the right end where the page passes it.
//
// Under the heading every page holds one row (`HeadingRow`, H7; Miles, 25
// Nov 2026, ui-jobs 856), 38px tall whether or not anything stands in it,
// so the heading sits the same distance from the content on every page
// type: Back at its left where the page keeps one, the recency and the
// price strip at its right where the page draws no detail card.
//
// The heading draws before the position loads, with Tools in place, so the
// inspector is reachable on a view that never resolves; the wallet joins it
// when the page knows it (an id-keyed page learns its owner from the read).

import { FileCode2, KeyRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Facehash } from "@/components/shared/facehash";
import { RevealTip } from "@/components/shared/reveal-tip";
import { WalletPill } from "@/components/shared/wallet-pill";
import { WalletMenu } from "@/components/shared/wallet-menu";
import { HolderLabelTag } from "@/components/shared/holder-label";
import { WalletPositionsMenu } from "@/components/shared/wallet-positions-menu";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { protocolForSession } from "@/lib/shared/protocols";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { fetchAddressKind, type AddressKind } from "@/lib/api/fetch-address-kind";
import { ProtocolGlyph, ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { managerProv } from "@/lib/shared/manager-provenance";
import {
  usePositionCardMenu,
  usePositionCardName,
  useRegisterPositionTrail,
} from "@/components/shared/position-card-strip";
import { positionCrumb } from "@/lib/shared/position-name";
import type { TrailPage } from "@/lib/wallet/summary-counts";

/** The facehash at 28px below md and 40px from md. */
function face(address: string) {
  return (
    <>
      <span className="flex md:hidden">
        <Facehash address={address} size={28} />
      </span>
      <span className="hidden md:flex">
        <Facehash address={address} size={40} />
      </span>
    </>
  );
}

/** The shell both surfaces draw. `title` is the name line (the h1 and what
 *  sits beside it), `lines` the text-xs lines under it, `end` the controls at
 *  the right. */
export function WalletHeading({
  address,
  title,
  lines,
  end,
  dashboard,
  className = "",
  ...data
}: {
  /** The wallet; unset while the page has not read it, which keeps the
   *  facehash's place. */
  address?: string | null;
  /** The wallet dashboard, which the facehash links to; absent on the
   *  dashboard. */
  dashboard?: string;
  title: ReactNode;
  lines?: ReactNode;
  end?: ReactNode;
  className?: string;
} & { [k: `data-${string}`]: string | undefined }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`} {...data}>
      {/* Below md a grid (Miles, 26 Nov 2026, ui-jobs 856): a 28px facehash
          beside the name line, and the lines under both from the column's
          left edge, so the trail takes the whole width. From md the 40px
          facehash beside the name block, the 21px gap putting the block on
          the cards' content edge: the 40px bar, the card's 1px border and
          its 20px padding. */}
      <div className="grid min-w-0 flex-auto basis-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:basis-auto md:flex md:gap-[21px]">
        {address && dashboard ? (
          <Link
            href={dashboard}
            prefetch={false}
            aria-label="Wallet dashboard"
            title="Wallet dashboard"
            className="flex shrink-0 rounded-[9px] focus-ring max-md:rounded-md"
            data-wallet-facehash-link=""
          >
            {face(address)}
          </Link>
        ) : address ? (
          <span className="flex shrink-0">{face(address)}</span>
        ) : (
          <span
            className="block size-7 shrink-0 rounded-md bg-rb-300/40 md:size-10 md:rounded-[9px] dark:bg-rb-700/40"
            aria-hidden
          />
        )}
        <div className="contents md:flex md:min-w-0 md:flex-col md:gap-0.5">
          <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-rb-500">
            {title}
          </div>
          {lines && <div className="col-span-2 flex min-w-0 flex-col gap-0.5">{lines}</div>}
        </div>
      </div>
      {end}
    </div>
  );
}

/** The row under the wallet heading (H7): `start` (Back) at the left,
 *  `end` (the recency and prices) at the right, held at 38px when empty. */
export function HeadingRow({
  start,
  end,
  endFirstOnPhone = false,
}: {
  start?: ReactNode;
  end?: ReactNode;
  /** Below 768px `end` stands at the row's left (the trail's recency). */
  endFirstOnPhone?: boolean;
}) {
  return (
    <div
      className="mt-2 flex min-h-[38px] flex-wrap items-center justify-between gap-x-2 gap-y-1"
      data-anatomy="H7"
      data-heading-row=""
    >
      <div className="flex min-w-0 items-center">{start}</div>
      {end && (
        <div
          className={`ml-auto flex shrink-0 items-center gap-1 sm:gap-2 ${endFirstOnPhone ? "max-md:order-first max-md:ml-0" : ""}`}
        >
          {end}
        </div>
      )}
    </div>
  );
}

/** The Safe kind's mark: Safe's glyph, drawn as the Lucide kind icons are. */
function SafeIcon({ className }: { className?: string }) {
  return <ProtocolGlyph id="safe" className={className} />;
}

/** The glyph and words for what the address is (ui-jobs 232), with a
 *  newcomer's one-line tip. A plain wallet (`account`) has none; a contract
 *  carries its name when it answers one. Where the chain names who runs the
 *  account (ui-jobs 440), the label is the kind's word, a middle dot and the
 *  product ("Safe · DeFi Saver"), and the tip says what the product can do. */
function addressKindWords(
  k: Exclude<AddressKind, { kind: "account" }>,
  /** The chain the contract tip names; Ethereum where the page names none. */
  chainName = "Ethereum",
): {
  Icon: LucideIcon | ComponentType<{ className?: string }>;
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
      return k.manager
        ? {
            Icon: SafeIcon,
            label: `Safe · ${k.manager.name}`,
            tip: `A shared wallet that ${k.manager.name}'s automation can act for.`,
          }
        : { Icon: SafeIcon, label: "Safe", tip: "A shared wallet: several owners sign together before it acts." };
    case "contract": {
      const m = k.manager;
      const closed = m?.closed ? " (closed)" : "";
      if (k.account === "dsa")
        return {
          Icon: FileCode2,
          label: `DSA · ${m?.name ?? "Instadapp"}`,
          tip: "An Instadapp account that its authorities act through.",
        };
      if (k.account === "dpm")
        return {
          Icon: FileCode2,
          label: `DPM · ${m?.name ?? "Summer.fi"}${closed}`,
          tip: m?.closed
            ? `A Summer.fi position account. Summer.fi deactivated its app in ${m.closed.since}; the account and its position stay on chain.`
            : "A Summer.fi position account.",
        };
      if (k.account === "dsproxy")
        return m
          ? {
              Icon: FileCode2,
              label: `DSProxy · ${m.name}`,
              tip: `A proxy account that ${m.name}'s automation can act for.`,
            }
          : { Icon: FileCode2, label: "DSProxy", tip: "A proxy account: a contract its owner acts through." };
      const named = k.name && k.symbol ? `${k.name} (${k.symbol})` : (k.name ?? k.symbol);
      return {
        Icon: FileCode2,
        label: named ?? null,
        tip: named
          ? `A smart contract named ${named}: a program on ${chainName}, not a wallet someone holds a key to.`
          : `A smart contract: a program on ${chainName}, not a wallet someone holds a key to.`,
      };
    }
  }
}

function AddressKindLabel({
  wallet,
  chainId,
  chainName,
}: {
  wallet: string;
  chainId: ChainId;
  /** The chain the contract tip names; Ethereum where omitted. */
  chainName?: string;
}) {
  const [kind, setKind] = useState<AddressKind | null>(null);
  const registry = useReceiptRegistry();
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
  const w = addressKindWords(kind, chainName);
  const manager = kind.kind === "safe" || kind.kind === "contract" ? kind.manager : undefined;
  const info = manager && (kind.kind === "safe" || kind.kind === "contract") ? managerProv(kind, chainId) : null;
  const tip = (
    <RevealTip
      tip={<span className="block w-72 whitespace-normal">{w.tip}</span>}
      label={w.label ? `${w.label}. ${w.tip}` : w.tip}
      focusable
      className="min-w-0 focus-ring rounded-sm"
    >
      <span
        className="flex min-w-0 items-center gap-1"
        data-address-kind={kind.kind}
        data-account-manager={manager?.product}
      >
        <w.Icon className="size-3.5 shrink-0" aria-hidden />
        {w.label && <span className="max-w-[40vw] truncate sm:max-w-xs">{w.label}</span>}
      </span>
    </RevealTip>
  );
  if (!manager) return <span className="flex min-w-0 shrink-[100]">{tip}</span>;
  return (
    // Gives way before the address does (shrink-[100]). The product's mark
    // after the words carries the manager's receipt (anatomy H13), picked
    // while the inspector is armed, as the timeline bar's mark carries the
    // bar's.
    <span className="flex min-w-0 shrink-[100] items-center gap-1">
      {tip}
      {info ? (
        <ProvReceiptsScope registry={registry} bounds={false}>
          <span className="flex shrink-0 rounded-sm" data-account-manager-receipt={manager.product}>
            <Prov info={info} value={manager.name} className="flex shrink-0 items-center">
              <ProtocolIcon
                id={manager.icon}
                className="size-3.5 shrink-0 [&:is(img)]:opacity-80 [&:is(img)]:grayscale"
              />
              <span className="sr-only">{manager.name}</span>
            </Prov>
          </span>
        </ProvReceiptsScope>
      ) : (
        <ProtocolIcon id={manager.icon} className="size-3.5 shrink-0 [&:is(img)]:opacity-80 [&:is(img)]:grayscale" />
      )}
    </span>
  );
}

export interface PositionOwner {
  /** The wallet; null or undefined while the page has not read it. */
  wallet: string | null | undefined;
  /** True while a page that reads its owner on the client waits for that
   *  read: the positions line shows a bar until it settles. */
  pending?: boolean;
  /** The page's chain, which a contract's tip names ("a program on Base"); the tip says Ethereum
   *  where omitted. */
  chain?: ChainId;
  ensName?: string | null;
  /** Where a pill (a vault, or a page passing `href`) filters its listing to
   *  this wallet. Defaults to the page's session; null leaves the label
   *  unlinked. The address menu opens the wallet view and ignores it. */
  filterProtocol?: SessionProtocol | null;
  /** The bookmark on the address; false draws none. */
  bookmark?: boolean;
  vault?: { name: string; href: string; kind?: string } | null;
  href?: string;
  hrefLabel?: string;
  /** Drawn before the address ("last holder" on a closed Trove that changed hands). */
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
  page = "position",
  className,
  onCrumb,
}: {
  owner: PositionOwner;
  /** Told whether the trail found the page's protocol (H13.4). */
  onCrumb?: (found: boolean) => void;
  /** What the page is, for the trail (H13.4). */
  page?: TrailPage;
  className?: string;
  /** The page's explorer: the chain of the address kind, and the default for
   *  the listing link. Absent on a page no explorer owns (ui-jobs 765): the
   *  chain is `owner.chain` and the label links nowhere by default. */
  session?: SessionProtocol;
  /** The Tools menu with the page's export shapes; absent or false for none
   *  (a page whose card carries the menu, ui-jobs 270). */
  tools?: ReactNode;
}) {
  const filterProtocol = owner.filterProtocol === null ? undefined : (owner.filterProtocol ?? session);
  const bookmark = owner.bookmark !== false;
  const chainId = (session ? protocolForSession(session)?.chainId : undefined) ?? owner.chain;
  // A wallet is its address menu (ui-jobs 271); a vault or a page that links
  // the address elsewhere (PWN's other side) keeps the pill.
  const plain = !owner.vault && !owner.href;
  // The detail card's name, as the trail's last crumb.
  const card = usePositionCardName();
  const cardMenu = usePositionCardMenu();
  const position = card && owner.wallet ? positionCrumb(card.name, owner.wallet) : null;
  // The trail names the position on a position page: the card leaves it out.
  useRegisterPositionTrail(page === "position" && !!owner.wallet);
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
      dashboard={owner.wallet ? `/wallet/${owner.wallet.toLowerCase()}` : undefined}
      className={className}
      data-anatomy="H13"
      data-position-wallet-row=""
      title={
        <>
          {pill && owner.prefix}
          {pill && (owner.wrap ? owner.wrap(pill) : pill)}
          {owner.wallet && chainId != null && (
            <AddressKindLabel
              wallet={owner.wallet}
              chainId={chainId}
              chainName={owner.chain != null ? CHAINS[owner.chain].name : undefined}
            />
          )}
          {owner.wallet && <HolderLabelTag wallet={owner.wallet} chainId={chainId} className="" />}
          {owner.extra}
        </>
      }
      // The positions line is held whether or not the wallet is read yet, so
      // the heading keeps one height (the loading grammar, skeleton-card.tsx).
      // It shows a bar only while the owner read is pending; settled with no
      // wallet, it stays empty.
      lines={
        owner.wallet ? (
          <WalletPositionsMenu
            wallet={owner.wallet}
            page={page}
            position={position}
            status={card?.status}
            mark={card?.mark}
            cardMenu={cardMenu}
            onCrumb={onCrumb}
          />
        ) : (
          <div className="flex h-5 items-center" data-wallet-positions-held="">
            {owner.pending && <SkeletonBar width={72} />}
          </div>
        )
      }
      end={<>{tools && <span className="ml-auto flex min-h-7 shrink-0 items-center">{tools}</span>}</>}
    />
  );
}
