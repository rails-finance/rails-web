"use client";

// The trail under the wallet heading (H13.4; ui-jobs 856, Miles 25–27 Nov
// 2026): "5 positions ⌄ / Aave V3 ⌄ / ● Core ⌄", slash-separated, three menus
// on the one panel (`ToolsMenu` variant `crumb`: a dropdown, a sheet below
// sm).
//
// The first crumb (H13.2) is the wallet and its protocols: "Wallet
// dashboard", then one row per protocol and chain the wallet holds positions
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
import { menuProtocolOf, protocolEntryOf, protocolLabelOf, summaryCrumb } from "@/lib/wallet/position-protocol";
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
const SLASH = (
  <span className="shrink-0 px-1.5 text-rb-500" aria-hidden="true">
    /
  </span>
);

/** The protocol's and the chain's icons, each named for screen readers and on hover. */
function ProtocolIcons({ p }: { p: WalletCountsPosition }) {
  const entry = protocolEntryOf(p);
  const protocol = protocolLabelOf(p);
  const chain = chainMeta(CHAIN_ID[p.chain]).name;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span role="img" aria-label={protocol} title={protocol} className="flex" data-wallet-protocol-name={protocol}>
        <ProtocolIcon id={entry?.id ?? p.family} className="size-4 shrink-0" />
      </span>
      <span role="img" aria-label={chain} title={chain} className="flex text-rb-500" data-wallet-protocol-chain={chain}>
        <ChainGlyph id={CHAIN_ID[p.chain]} className="size-3.5 shrink-0" />
      </span>
    </span>
  );
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
  const dashboard = `/wallet/${address}`;
  const isPageRow = (p: WalletCountsPosition) => pageKeys.has(positionKey(p));
  const here = (key: string) => page === "wallet" && crumb?.current === true && crumb.keys.includes(key);

  // The first crumb's rows: the dashboard, then each protocol and chain with
  // its status dots, the page's ticked.
  const walletRows = (close: () => void) =>
    menu && (
      <>
        {onDashboard ? (
          <div
            role="menuitem"
            aria-disabled="true"
            aria-current="page"
            tabIndex={-1}
            className={`${ROW} text-sm text-foreground`}
            data-wallet-positions-dashboard=""
          >
            Wallet dashboard
            <Tick />
          </div>
        ) : (
          <Link
            href={dashboard}
            prefetch={false}
            role="menuitem"
            className={`${ROW_LINK} text-sm text-[var(--text-link)]`}
            onClick={close}
            data-wallet-positions-dashboard=""
          >
            Wallet dashboard
          </Link>
        )}
        {DIVIDER}
        {menu.rows.map((r) => {
          const tones = TONE_ORDER.filter((t) => r.positions.some((p) => SUMMARY_TONE[p.status] === t));
          const chain = chainMeta(CHAIN_ID[r.first.chain]).name;
          const label = `${r.name} on ${chain}: ${andWords(tones.map((t) => TONE_WORD[t]))} ${r.positions.length === 1 ? "position" : "positions"}`;
          const ticked = r.page || here(r.key);
          const hook = {
            "data-wallet-protocol-row": r.key,
            "data-family": r.first.family,
            "data-wallet-protocol-statuses": tones.join(" "),
          };
          const body = (
            <>
              <ProtocolIcons p={r.first} />
              <span className="min-w-0 truncate" aria-hidden="true">
                {r.name}
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
          return here(r.key) ? (
            <div
              key={r.key}
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
              key={r.key}
              href={r.listing}
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
            className={`flex items-center gap-0.5 ${open || onDashboard ? "text-foreground" : "text-rb-500 hover:text-foreground"}`}
            data-wallet-positions-trigger=""
          >
            {menu.trigger}
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        )}
      />
    </span>
  );

  // On a phone, where the card's sidebar is a bare strip, the card's
  // protocol mark and chain glyph lead the protocol (ui-jobs 856).
  const markNode = mark && (
    <span className="flex shrink-0 items-center gap-1 md:hidden" data-wallet-trail-mark="">
      <span role="img" aria-label={mark.protocolName} title={mark.protocolName} className="flex">
        <ProtocolIcon id={mark.protocolId} className="size-3.5 shrink-0" />
      </span>
      <span role="img" aria-label={mark.chainName} title={mark.chainName} className="flex">
        <ChainGlyph id={mark.chainId} className="size-3.5 shrink-0" />
      </span>
    </span>
  );
  const protocolBody = crumb && (
    <>
      {markNode}
      <span className="whitespace-nowrap">{crumb.row.name}</span>
    </>
  );

  // The protocol's positions across its chains: the rows the narrowed view
  // lists (the same page), or the crumb's row alone where it has none.
  const group = crumb
    ? crumb.row.listed
      ? allRows.filter((r) => r.listed && r.listing === crumb.row.listing)
      : [crumb.row]
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
            const all = `All ${crumb.row.name} positions`;
            return (
              <>
                {crumb.current ? (
                  <div
                    role="menuitem"
                    aria-disabled="true"
                    aria-current="page"
                    tabIndex={-1}
                    className={`${ROW} text-sm text-foreground`}
                    data-wallet-protocol-all=""
                  >
                    {all}
                    <Tick />
                  </div>
                ) : (
                  <Link
                    href={crumb.row.listing}
                    prefetch={false}
                    role="menuitem"
                    className={`${ROW_LINK} text-sm text-[var(--text-link)]`}
                    onClick={close}
                    data-wallet-protocol-all=""
                  >
                    {all}
                  </Link>
                )}
                {DIVIDER}
                {shown.map((p) => {
                  const body = (
                    <>
                      <StatusDot tone={SUMMARY_TONE[p.status]} />
                      <span className="sr-only">{STATUS_WORD[p.status]}: </span>
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
              className={`flex items-center gap-1 whitespace-nowrap ${crumb.current || open ? "text-foreground" : "text-rb-500 hover:text-foreground"}`}
            >
              {protocolBody}
              <ChevronDown
                className={`size-3.5 shrink-0 text-rb-500 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
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
                className="flex shrink-0 items-center gap-1 text-foreground"
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
          {!crumb && markNode && <span className="mr-1 flex">{markNode}</span>}
          <span
            aria-current="page"
            className="flex min-w-0 items-center gap-1 text-foreground"
            data-wallet-trail-position=""
          >
            {cardMenu ? (
              // The card's ⋮ menu, opened from the crumb: the status row
              // first (ui-jobs 856).
              cardMenu({
                trigger: (open) => (
                  <>
                    {status && (
                      <span
                        className="flex size-3.5 shrink-0 items-center justify-center"
                        title={status.word}
                        data-wallet-trail-status={status.tone}
                      >
                        <StatusDot tone={status.tone} />
                      </span>
                    )}
                    <span className="min-w-0 truncate">{named}</span>
                    <ChevronDown
                      className={`size-3.5 shrink-0 text-rb-500 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </>
                ),
                label: status ? `${named}, ${status.word}: position menu` : `${named}: position menu`,
                top: status && (
                  <>
                    <div
                      role="none"
                      className="mx-1 my-0.5 flex items-start gap-2 px-3 py-1.5"
                      data-trail-status-row=""
                    >
                      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                        <StatusDot tone={status.tone} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm text-foreground">
                          {status.prov ? <Prov info={status.prov}>{status.word}</Prov> : status.word}
                        </div>
                        {status.tip && <p className="mt-0.5 text-xs leading-relaxed text-rb-500">{status.tip}</p>}
                      </div>
                    </div>
                    {DIVIDER}
                  </>
                ),
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
