"use client";

// The trail under the wallet heading (H13.4; ui-jobs 856, Miles 25–27 Nov
// 2026): "5 positions ⌄ / Aave V3 ⌄ / ● Core ⌄", slash-separated, three menus
// on the one panel (`ToolsMenu` variant `crumb`: a dropdown, a sheet below
// sm).
//
// The first crumb (H13.2) is the wallet's protocols: one row per protocol
// and chain the wallet holds positions
// in, each linking to the wallet view narrowed to the protocol, with a dot
// for each status among its positions; the page's protocol row is ticked.
// "Testnets not included" at the foot. Read after mount from
// /api/chain/wallet/<address>/summary, so the page's render does not wait on
// it; its line is held from first paint (a placeholder bar while the read is
// out). Where the page's position is the wallet's only one there is no menu.
//
// The protocol crumb (H13.5) links to the narrowed view (`walletTrailCrumb`)
// and is the page there; where the wallet holds two or more positions in the
// protocol, across its chains, it opens their list: "All <protocol>
// positions", then each position's dot and name (`summaryCrumb`), five at
// most, then "N more". The position crumb is the detail card's name
// (`usePositionCardName`) with its lifecycle dot, opening the card's menu.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { StatusDot } from "@/components/shared/status-dot";
import type { CardMenuRender, TrailMark, TrailStatus } from "@/components/shared/position-card-strip";
import { Prov } from "@/components/shared/provenance";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ToolsMenu } from "@/components/shared/tools-menu";
import {
  ARBITRUM_CHAIN_ID,
  ARC_CHAIN_ID,
  BASE_CHAIN_ID,
  MAINNET_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  chainMeta,
  type ChainId,
} from "@/lib/shared/chains";
import { menuProtocolOf, protocolEntryOf, summaryCrumb } from "@/lib/wallet/position-protocol";
import { walletProtocol, walletProtocolHref } from "@/lib/wallet/wallet-filters";
import {
  MENU_TESTNETS,
  rowIsPage,
  walletProtocolMenu,
  walletProtocolRows,
  walletTrailCrumb,
  type TrailPage,
  type WalletCounts,
  type WalletCountsChain,
  type WalletCountsPosition,
} from "@/lib/wallet/summary-counts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const CHAIN_ID: Record<WalletCountsChain, ChainId> = {
  ethereum: MAINNET_CHAIN_ID,
  base: BASE_CHAIN_ID,
  arbitrum: ARBITRUM_CHAIN_ID,
  arc: ARC_CHAIN_ID,
  sepolia: SEPOLIA_CHAIN_ID,
};

// One read per address per page load; the route keeps its answer 60 s.
const reads = new Map<string, Promise<WalletCounts | null>>();

function readCounts(address: string): Promise<WalletCounts | null> {
  let read = reads.get(address);
  if (!read) {
    read = fetch(`/api/chain/wallet/${address}/summary`)
      .then((r) => (r.ok ? (r.json() as Promise<WalletCounts>) : null))
      .catch(() => null);
    reads.set(address, read);
    void read.then((c) => {
      if (!c || c.partial) reads.delete(address);
    });
  }
  return read;
}

type Menu = ReturnType<typeof walletProtocolMenu<WalletCountsPosition>>;
type Crumb = ReturnType<typeof walletTrailCrumb<WalletCountsPosition>>;
type Row = ReturnType<typeof walletProtocolRows<WalletCountsPosition>>[number];

const ROW = "mx-1 my-0.5 flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-left";
const ROW_LINK = `${ROW} transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] dark:hover:bg-[rgba(196,205,217,0.08)] dark:focus-visible:bg-[rgba(196,205,217,0.08)]`;
/** The positions a protocol row lists before "N more". */
const POSITIONS_SHOWN = 5;
/** A summary row's status as the trail's dot reads it. */
const SUMMARY_TONE: Record<WalletCountsPosition["status"], TrailStatus["tone"]> = {
  open: "open",
  closed: "muted",
  liquidated: "danger",
  redeemed: "muted",
  moved: "muted",
};
const STATUS_WORD: Record<WalletCountsPosition["status"], string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
  redeemed: "Redeemed",
  moved: "Moved",
};

const positionKey = (p: WalletCountsPosition) => `${p.chain}:${p.family}:${p.positionId}`;

/** The selected row's tick. */
function Tick() {
  return <Check className="ml-auto size-3.5 shrink-0 text-foreground" aria-hidden="true" data-menu-tick="" />;
}

const DIVIDER = <div role="separator" className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />;
// Every crumb is muted, the current one too, and lights to the foreground
// on hover or while its menu is open (Miles, 26 Nov 2026, ui-jobs 856).
// The trail's divider: a tall, thin chevron pointing right, a step quieter
// than the crumbs. The first two crumbs open their menus with no ⌄; the
// position crumb keeps its ⌄ (Miles, 26 Nov 2026, ui-jobs 856).
const SLASH = (
  <svg viewBox="0 0 5 14" className="mx-2 h-3.5 w-[5px] shrink-0 text-rb-500/45" fill="none" aria-hidden="true">
    <path
      d="M0.5 0.5 L4.5 7 L0.5 13.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** The protocol's mark, named for screen readers and on hover. */
function ProtocolMark({ p, name }: { p: WalletCountsPosition; name: string }) {
  const entry = protocolEntryOf(p);
  return (
    <span role="img" aria-label={name} title={name} className="flex shrink-0" data-wallet-protocol-name={name}>
      <ProtocolIcon id={entry?.id ?? p.family} className="size-4 shrink-0" />
    </span>
  );
}

/** The menu's rows by protocol across its chains: the chains' rows of one
 *  protocol name merge ("Aave V3" over Ethereum, Arbitrum and Base;
 *  "MetaMorpho vaults" over Ethereum and Base), in the rows' order. A group
 *  links to the wallet view narrowed to the protocol: its rows' one listing,
 *  else the narrowed view of the family. */
function protocolGroups(rows: Row[], address: string) {
  const groups = new Map<
    string,
    {
      key: string;
      name: string;
      first: WalletCountsPosition;
      rows: Row[];
      positions: WalletCountsPosition[];
      href: string;
    }
  >();
  for (const r of rows) {
    const g = groups.get(r.name);
    if (g) {
      g.rows.push(r);
      g.positions.push(...r.positions);
      if (g.href !== r.listing)
        g.href = walletProtocol(r.first.family) ? walletProtocolHref(address, r.first.family) : g.href;
    } else
      groups.set(r.name, {
        key: r.key.split(":").slice(1).join(":"),
        name: r.name,
        first: r.first,
        rows: [r],
        positions: [...r.positions],
        href: r.listing,
      });
  }
  return [...groups.values()];
}

/** The order and words of the status dots on a protocol row. */
const TONE_ORDER: TrailStatus["tone"][] = ["open", "muted", "danger", "caution"];
const TONE_WORD: Record<TrailStatus["tone"], string> = {
  open: "open",
  muted: "closed",
  danger: "liquidated",
  caution: "shut down",
};

const andWords = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export function WalletPositionsMenu({
  wallet,
  page = "position",
  search: givenSearch,
  position,
  status,
  mark,
  cardMenu,
  onDashboard = false,
  onCrumb,
}: {
  wallet: string;
  /** What the page is: the protocol crumb is the page on a wallet page. */
  page?: TrailPage;
  /** The page's query where the page knows it better than the URL read at
   *  mount (the wallet view's chosen protocol, which it changes in place). */
  search?: string;
  /** The position crumb's words, on a position page whose card has named it. */
  position?: string | null;
  /** The card's lifecycle, the dot before the position crumb. */
  status?: TrailStatus | null;
  /** The card's protocol and chain, drawn before the protocol on a phone. */
  mark?: TrailMark | null;
  /** The card's ⋮ menu, which the position crumb opens. */
  cardMenu?: CardMenuRender | null;
  /** The page is the wallet dashboard: the menu is the current crumb. */
  onDashboard?: boolean;
  /** Told once the read settles whether the trail has a protocol crumb. */
  onCrumb?: (found: boolean) => void;
}) {
  const pathname = usePathname();
  const address = wallet.toLowerCase();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [crumb, setCrumb] = useState<Crumb>(null);
  // The positions whose page this is, ticked in the protocol's menu.
  const [pageKeys, setPageKeys] = useState<Set<string>>(() => new Set());
  const crumbRef = useRef(onCrumb);
  crumbRef.current = onCrumb;
  // The summary read has answered (or failed): the placeholder goes.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let live = true;
    setMenu(null);
    setAllRows([]);
    setCrumb(null);
    setSettled(false);
    if (!ADDRESS.test(address)) {
      setSettled(true);
      crumbRef.current?.(false);
      return;
    }
    readCounts(address).then((c) => {
      if (!live) return;
      setSettled(true);
      if (!c || c.error) {
        crumbRef.current?.(false);
        return;
      }
      const search = givenSearch ?? window.location.search;
      const isPage = (p: WalletCountsPosition) => rowIsPage(p.href, pathname, search);
      setPageKeys(new Set(c.positions.filter(isPage).map(positionKey)));
      const protocolOf = (p: WalletCountsPosition) => menuProtocolOf(p, address);
      const dashboard = `/wallet/${address}`;
      const rows = walletProtocolRows(c.positions, isPage, protocolOf, dashboard);
      setMenu(walletProtocolMenu(c.positions, isPage, protocolOf, dashboard));
      setAllRows(rows);
      const found = walletTrailCrumb(rows, pathname, search, page);
      setCrumb(found);
      crumbRef.current?.(found != null);
    });
    return () => {
      live = false;
    };
  }, [address, pathname, givenSearch, page]);

  // The position crumb stands whatever the summary read answers: the card
  // leaves its name to it.
  const named = page === "position" && !crumb?.current && position ? position : null;
  if (!menu && !crumb && !named)
    return (
      <div className="flex h-5 items-center" data-wallet-positions-pending={settled ? undefined : ""}>
        {!settled && <SkeletonBar width={72} />}
      </div>
    );
  const isPageRow = (p: WalletCountsPosition) => pageKeys.has(positionKey(p));
  const here = (key: string) => page === "wallet" && crumb?.current === true && crumb.keys.includes(key);

  // The first crumb's rows: one per protocol across its chains (Miles, 27
  // Nov 2026, ui-jobs 856), its status dots, the page's ticked. The
  // dashboard is in the address menu (C7) and the facehash.
  const walletRows = (close: () => void) =>
    menu && (
      <>
        {protocolGroups(menu.rows, address).map((g) => {
          const tones = TONE_ORDER.filter((t) => g.positions.some((p) => SUMMARY_TONE[p.status] === t));
          const label = `${g.name}: ${andWords(tones.map((t) => TONE_WORD[t]))} ${g.positions.length === 1 ? "position" : "positions"}`;
          const current = g.rows.some((x) => here(x.key));
          const ticked = current || g.rows.some((x) => x.page);
          const hook = {
            "data-wallet-protocol-row": g.key,
            "data-family": g.first.family,
            "data-wallet-protocol-chains": g.rows.map((x) => x.first.chain).join(" "),
            "data-wallet-protocol-statuses": tones.join(" "),
          };
          const body = (
            <>
              <ProtocolMark p={g.first} name={g.name} />
              <span className="min-w-0 truncate" aria-hidden="true">
                {g.name}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1 pl-3" aria-hidden="true">
                {tones.map((t) => (
                  <StatusDot key={t} tone={t} />
                ))}
              </span>
              {ticked ? (
                <Check className="size-3.5 shrink-0 text-foreground" aria-hidden="true" data-menu-tick="" />
              ) : (
                <span className="w-3.5 shrink-0" aria-hidden="true" />
              )}
            </>
          );
          return current ? (
            <div
              key={g.key}
              role="menuitem"
              aria-disabled="true"
              aria-current="page"
              aria-label={label}
              tabIndex={-1}
              className={`${ROW} text-sm text-foreground`}
              {...hook}
            >
              {body}
            </div>
          ) : (
            <Link
              key={g.key}
              href={g.href}
              prefetch={false}
              role="menuitem"
              aria-label={label}
              className={`${ROW_LINK} text-sm text-foreground`}
              onClick={close}
              {...hook}
            >
              {body}
            </Link>
          );
        })}
        <div className="px-4 pb-1.5 pt-1 text-xs text-rb-500" data-wallet-positions-testnets="">
          {MENU_TESTNETS}
        </div>
      </>
    );

  const dropdown = menu && (
    <span className="flex shrink-0">
      <ToolsMenu
        variant="crumb"
        label={`${menu.trigger}: wallet menu`}
        heading="Positions"
        current={onDashboard}
        hooks={{
          "data-anatomy": "H13.2",
          "data-wallet-positions-menu": "",
          "data-wallet-elsewhere": menu.pageCounted ? "others" : "all",
        }}
        leading={walletRows}
        trigger={(open) => (
          <span
            className={`flex items-center gap-0.5 transition-colors ${open ? "text-foreground" : "text-rb-500 group-hover/crumb:text-foreground"}`}
            data-wallet-positions-trigger=""
          >
            {menu.trigger}
          </span>
        )}
      />
    </span>
  );

  // The protocol's mark, after the page's chain glyph, at every width. The
  // card's mark where a card hands one, else the summary row's.
  const markId = mark?.protocolId ?? (crumb ? (protocolEntryOf(crumb.row.first)?.id ?? crumb.row.first.family) : null);
  const markName = mark?.protocolName ?? crumb?.row.name;
  const markNode = markId && (
    <span role="img" aria-label={markName} title={markName} className="flex shrink-0" data-wallet-trail-mark="">
      <ProtocolIcon id={markId} className="size-3.5 shrink-0" />
    </span>
  );
  // The page's chain leads the protocol crumb, before the protocol's mark
  // ("⟠ [aave] Aave V3"; Miles, 26 Nov 2026, ui-jobs 856): the card's, else
  // the summary row's. It takes the crumb's colour, so it lights with it.
  const positionChain = mark?.chainId ?? (crumb ? CHAIN_ID[crumb.row.first.chain] : undefined);
  const positionChainName = positionChain != null ? chainMeta(positionChain).name : undefined;
  const chainNode = positionChain != null && (
    <span
      role="img"
      aria-label={positionChainName}
      title={positionChainName}
      className="flex shrink-0"
      data-wallet-trail-chain=""
    >
      <ChainGlyph id={positionChain} className="size-3.5 shrink-0" />
    </span>
  );
  const protocolBody = crumb && (
    <>
      {chainNode}
      {markNode}
      {/* Icons alone at md and up on a position page, where the card's
          rail names the protocol (Miles, 26 Nov 2026, ui-jobs 856); the
          rail is hidden below md, so phones keep the name. */}
      <span className={`whitespace-nowrap ${mark ? "md:sr-only" : ""}`}>{crumb.row.name}</span>
    </>
  );

  // The protocol's positions across its chains: its rows of every chain.
  const group = crumb
    ? (protocolGroups(allRows, address).find((g) => g.name === crumb.row.name)?.rows ?? [crumb.row])
    : [];
  const protocolPositions = group.flatMap((r) => r.positions);
  const protocolMenu =
    crumb && protocolPositions.length >= 2 ? (
      <span className="flex shrink-0">
        <ToolsMenu
          variant="crumb"
          label={`${crumb.row.name} positions`}
          heading={`${crumb.row.name} positions`}
          current={crumb.current}
          hooks={{
            "data-anatomy": "H13.5",
            "data-wallet-trail-protocol": crumb.row.key,
            "data-wallet-protocol-menu": "",
          }}
          leading={(close) => {
            const shown = [...protocolPositions.filter(isPageRow), ...protocolPositions.filter((p) => !isPageRow(p))]
              .slice(0, POSITIONS_SHOWN)
              .sort((a, b) => protocolPositions.indexOf(a) - protocolPositions.indexOf(b));
            const more = protocolPositions.length - shown.length;
            // No "All <protocol> positions" row: the first crumb's menu
            // links the protocol (Miles, 26 Nov 2026, ui-jobs 856).
            return (
              <>
                {shown.map((p) => {
                  const body = (
                    <>
                      <StatusDot tone={SUMMARY_TONE[p.status]} />
                      <span className="sr-only">{STATUS_WORD[p.status]}: </span>
                      <span
                        role="img"
                        aria-label={chainMeta(CHAIN_ID[p.chain]).name}
                        title={chainMeta(CHAIN_ID[p.chain]).name}
                        className="flex shrink-0 text-rb-500"
                      >
                        <ChainGlyph id={CHAIN_ID[p.chain]} className="size-3.5 shrink-0" />
                      </span>
                      <span className="min-w-0 truncate">{summaryCrumb(p, address)}</span>
                    </>
                  );
                  const hook = { "data-wallet-position-row": p.positionId, "data-wallet-position-status": p.status };
                  return isPageRow(p) || !p.href ? (
                    <div
                      key={positionKey(p)}
                      role="menuitem"
                      aria-disabled="true"
                      aria-current={isPageRow(p) ? "page" : undefined}
                      tabIndex={-1}
                      title={STATUS_WORD[p.status]}
                      className={`${ROW} text-sm text-foreground`}
                      {...hook}
                    >
                      {body}
                      {isPageRow(p) && <Tick />}
                    </div>
                  ) : (
                    <Link
                      key={positionKey(p)}
                      href={p.href}
                      prefetch={false}
                      role="menuitem"
                      title={STATUS_WORD[p.status]}
                      className={`${ROW_LINK} text-sm text-foreground`}
                      onClick={close}
                      {...hook}
                    >
                      {body}
                    </Link>
                  );
                })}
                {more > 0 && (
                  <Link
                    href={crumb.row.listing}
                    prefetch={false}
                    role="menuitem"
                    className={`${ROW_LINK} text-sm text-[var(--text-link)]`}
                    onClick={close}
                    data-wallet-positions-more={more}
                  >
                    {more.toLocaleString("en-US")} more
                  </Link>
                )}
              </>
            );
          }}
          trigger={(open) => (
            <span
              className={`flex items-center gap-1 whitespace-nowrap transition-colors ${open ? "text-foreground" : "text-rb-500 group-hover/crumb:text-foreground"}`}
            >
              {protocolBody}
            </span>
          )}
        />
      </span>
    ) : null;

  // The dot's words: the pill's, with its read-more where it has one.
  const statusTip = status && (status.tip ? `${status.word}. ${status.tip}` : status.word);
  return (
    <nav
      aria-label="Breadcrumb"
      className="reveal-in flex h-5 min-w-0 max-w-full items-center text-xs"
      data-anatomy="H13.4"
      data-prov-chrome=""
      data-wallet-trail=""
    >
      {dropdown ?? (!settled && <SkeletonBar width={72} />)}
      {crumb && (
        <>
          {dropdown && SLASH}
          {protocolMenu ??
            (crumb.current ? (
              <span
                aria-current="page"
                className="flex shrink-0 items-center gap-1 text-rb-500"
                data-wallet-trail-protocol={crumb.row.key}
              >
                {protocolBody}
              </span>
            ) : (
              <Link
                href={crumb.href}
                prefetch={false}
                className="relative -mx-1 flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-rb-500 transition-colors hover:text-foreground focus-ring after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']"
                data-wallet-trail-protocol={crumb.row.key}
              >
                {protocolBody}
              </Link>
            ))}
        </>
      )}
      {named && (
        <>
          {(dropdown || crumb || !settled) && SLASH}
          {!crumb && markNode && (
            <span className="mr-1 flex items-center gap-1">
              {chainNode}
              {markNode}
            </span>
          )}
          <span
            aria-current="page"
            className="flex min-w-0 items-center gap-1 text-rb-500"
            data-wallet-trail-position=""
          >
            {cardMenu ? (
              // The card's ⋮ menu, opened from the crumb; the dot's tooltip
              // names the status (ui-jobs 856).
              cardMenu({
                trigger: (open) => (
                  <span
                    className={`flex min-w-0 items-center gap-1 transition-colors ${open ? "text-foreground" : "text-rb-500 group-hover/crumb:text-foreground"}`}
                  >
                    {status && (
                      <span
                        className="flex size-3.5 shrink-0 items-center justify-center"
                        title={statusTip ?? status.word}
                        data-wallet-trail-status={status.tone}
                      >
                        <StatusDot tone={status.tone} />
                      </span>
                    )}
                    <span className="min-w-0 truncate">{named}</span>
                    <ChevronDown
                      className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </span>
                ),
                label: status ? `${named}, ${status.word}: position menu` : `${named}: position menu`,
              })
            ) : (
              <>
                {status && statusTip && (
                  <RevealTip
                    tip={<span className="block max-w-72 whitespace-normal">{statusTip}</span>}
                    label={statusTip}
                    focusable
                    className="flex shrink-0 rounded-sm focus-ring"
                  >
                    <span className="flex size-3.5 items-center justify-center" data-wallet-trail-status={status.tone}>
                      <StatusDot tone={status.tone} />
                    </span>
                  </RevealTip>
                )}
                <span title={named} className="min-w-0 truncate">
                  {named}
                </span>
              </>
            )}
          </span>
        </>
      )}
    </nav>
  );
}
