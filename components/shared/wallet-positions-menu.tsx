"use client";

// The trail under the wallet heading (H13.4; ui-jobs 856, Miles 25–27 Nov
// 2026): "5 positions › [chain][mark] Aave V3 › ● Core ⌄", an ordered list of
// crumbs between thin chevron dividers, each crumb muted until hovered or
// open. Its menus are `ToolsMenu` variant `crumb` (a dropdown, a sheet below
// sm).
//
// The first crumb (H13.2) opens the wallet's protocols: one row per protocol
// across its chains, each linking to the wallet view narrowed to that
// protocol, with a dot for each status among its positions; the page's
// protocol row is ticked; "Testnets not included" at the foot. The wallet
// view hands it its own read's positions (`positions`); a position
// page reads /api/chain/wallet/<address>/summary after mount, so its render
// does not wait on it, and its line is held from first paint (a placeholder
// bar while the read is out). Where the page's position is the wallet's only
// one there is no menu.
//
// The protocol crumb (H13.5) leads with the page's chain glyph (none on the
// narrowed view, which spans chains) and the protocol's mark. It links to the
// narrowed view (`walletTrailCrumb`) and is the page there; where the wallet
// holds two or more positions in the protocol, across its chains, it opens
// their list: each position's dot, chain, a vault share's asset icon and name
// (`summaryCrumb`), five at most, then "N more". The position crumb is the
// detail card's name (`usePositionCardName`) with its lifecycle dot, opening
// the card's ⋮ menu.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { StatusDot } from "@/components/shared/status-dot";
import type { CardMenuRender, TrailMark, TrailStatus } from "@/components/shared/position-card-strip";
import { SkeletonBar } from "@/components/shared/skeleton-card";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ToolsMenu } from "@/components/shared/tools-menu";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { CHAINS, chainMeta, type ChainId } from "@/lib/shared/chains";
import { ChainProvider } from "@/lib/shared/chain-context";
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

const chainIdOf = (slug: WalletCountsChain): ChainId =>
  Object.values(CHAINS).find((c) => c.slug === slug)?.id ?? CHAINS[1].id;

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

type Row = ReturnType<typeof walletProtocolRows<WalletCountsPosition>>[number];

const ROW = "mx-1 my-0.5 flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-left";
const ROW_LINK = `${ROW} transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] dark:hover:bg-[rgba(196,205,217,0.08)] dark:focus-visible:bg-[rgba(196,205,217,0.08)]`;
/** The positions a protocol row lists before "N more". */
const POSITIONS_SHOWN = 5;
type SummaryTone = "open" | "muted" | "danger";
/** A summary row's status as the trail's dot reads it. */
const SUMMARY_TONE: Record<WalletCountsPosition["status"], SummaryTone> = {
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

/** The selected row's tick; `push` takes it to the row's end. */
function Tick({ push = false }: { push?: boolean }) {
  return (
    <Check
      className={`${push ? "ml-auto " : ""}size-3.5 shrink-0 text-foreground`}
      aria-hidden="true"
      data-menu-tick=""
    />
  );
}

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
const TONE_ORDER: SummaryTone[] = ["open", "muted", "danger"];
const TONE_WORD: Record<SummaryTone, string> = {
  open: "open",
  muted: "closed",
  danger: "liquidated",
};

const andWords = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export function WalletPositionsMenu({
  wallet,
  page = "position",
  search: givenSearch,
  positions: given,
  pageCrumb,
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
  /** The page's query where the page knows it better than the URL (the
   *  wallet view's chosen protocol, which it changes in place). */
  search?: string;
  /** The wallet's positions where the page has read them (the wallet view's
   *  `read.trail`): no summary read is made (ui-jobs 856). */
  positions?: WalletCountsPosition[];
  /** The wallet view's protocol where no summary row is its own (the vault
   *  shares, `?protocol=vaults`): the protocol crumb names it, with `mark`,
   *  as the current page (ui-jobs 856). */
  pageCrumb?: { key: string; name: string; mark: ReactNode };
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
  const params = useSearchParams();
  const query = params?.toString() ?? "";
  const search = givenSearch ?? (query ? `?${query}` : "");
  const address = wallet.toLowerCase();
  const valid = ADDRESS.test(address);
  const handed = given != null;
  // The summary read, by the address it answered for: null where it failed.
  const [fetched, setFetched] = useState<{ address: string; positions: WalletCountsPosition[] | null } | null>(null);
  const crumbRef = useRef(onCrumb);
  crumbRef.current = onCrumb;

  useEffect(() => {
    if (handed || !valid) return;
    let live = true;
    readCounts(address).then((c) => {
      if (live) setFetched({ address, positions: c && !c.error ? c.positions : null });
    });
    return () => {
      live = false;
    };
  }, [address, handed, valid]);

  const source = given ?? (fetched?.address === address ? fetched.positions : null);
  // The summary read has answered (or failed): the placeholder goes.
  const settled = handed || !valid || fetched?.address === address;
  const derived = useMemo(() => {
    if (!source) return null;
    const isPage = (p: WalletCountsPosition) => rowIsPage(p.href, pathname, search);
    const protocolOf = (p: WalletCountsPosition) => menuProtocolOf(p, address);
    const dashboard = `/wallet/${address}`;
    const menu = walletProtocolMenu(source, isPage, protocolOf, dashboard);
    const rows = menu?.rows ?? walletProtocolRows(source, isPage, protocolOf, dashboard);
    return {
      menu,
      rows,
      crumb: walletTrailCrumb(rows, pathname, search, page),
      // The positions whose page this is, ticked in the protocol's menu.
      pageKeys: new Set(source.filter(isPage).map(positionKey)),
    };
  }, [source, pathname, search, page, address]);
  const menu = derived?.menu ?? null;
  const crumb = derived?.crumb ?? null;
  const found = crumb != null;
  useEffect(() => {
    if (settled) crumbRef.current?.(found);
  }, [settled, found]);

  // The position crumb stands whatever the summary read answers: the card
  // leaves its name to it.
  const named = page === "position" && !crumb?.current && position ? position : null;
  // The page's own crumb on a wallet page the summary rows hold no row for.
  const pageOwn = page === "wallet" && !crumb && pageCrumb ? pageCrumb : null;
  if (!menu && !crumb && !named && !pageOwn)
    return (
      <div className="flex h-5 items-center" data-wallet-positions-pending={settled ? undefined : ""}>
        {!settled && <SkeletonBar width={72} />}
      </div>
    );
  const isPageRow = (p: WalletCountsPosition) => derived?.pageKeys.has(positionKey(p)) === true;
  const here = (key: string) => page === "wallet" && crumb?.current === true && crumb.keys.includes(key);
  const groups = derived ? protocolGroups(derived.rows, address) : [];

  // The first crumb's rows: one per protocol across its chains (Miles, 27
  // Nov 2026, ui-jobs 856), its status dots, the page's ticked. The
  // dashboard is in the address menu (C7) and the facehash.
  const walletRows = (close: () => void) =>
    menu && (
      <>
        {groups.map((g) => {
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
              {ticked ? <Tick /> : <span className="w-3.5 shrink-0" aria-hidden="true" />}
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

  const trigger = menu?.trigger;
  const dropdown = menu && (
    <span className="flex shrink-0">
      <ToolsMenu
        variant="crumb"
        label={`${trigger}: wallet menu`}
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
            {trigger}
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
  // the summary row's. The narrowed view spans chains and draws none. It
  // takes the crumb's colour, so it lights with it.
  const positionChain = mark?.chainId ?? (crumb && page !== "wallet" ? chainIdOf(crumb.row.first.chain) : undefined);
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
  const group = crumb ? (groups.find((g) => g.name === crumb.row.name)?.rows ?? [crumb.row]) : [];
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
            return (
              <>
                {shown.map((p) => {
                  const body = (
                    <>
                      <StatusDot tone={SUMMARY_TONE[p.status]} />
                      <span className="sr-only">{STATUS_WORD[p.status]}: </span>
                      <span
                        role="img"
                        aria-label={chainMeta(chainIdOf(p.chain)).name}
                        title={chainMeta(chainIdOf(p.chain)).name}
                        className="flex shrink-0 text-rb-500"
                      >
                        <ChainGlyph id={chainIdOf(p.chain)} className="size-3.5 shrink-0" />
                      </span>
                      {/* A vault share's asset, its symbol in the tip: steakUSDC and
                          gtUSDCp share USDC's mark (ui-jobs 862). The census
                          address finds a mark the symbol does not (mkUSD,
                          yPRISMA), under the row's chain. */}
                      {p.asset && (
                        <span className="inline-flex shrink-0" title={p.asset} data-wallet-position-asset={p.asset}>
                          <ChainProvider chainId={chainIdOf(p.chain)}>
                            <TokenChipIcon
                              symbol={p.asset}
                              address={p.assetAddress}
                              size={14}
                              filterable={false}
                              untitled
                            />
                          </ChainProvider>
                        </span>
                      )}
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
                      {isPageRow(p) && <Tick push />}
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
      {/* An ordered list of crumbs, each divider in the crumb it leads
          (ui-jobs 856). */}
      <ol className="flex h-5 min-w-0 max-w-full items-center">
        {(dropdown || !settled) && (
          <li className="flex shrink-0 items-center">{dropdown ?? <SkeletonBar width={72} />}</li>
        )}
        {crumb && (
          <li className="flex shrink-0 items-center">
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
          </li>
        )}
        {pageOwn && (
          <li className="flex shrink-0 items-center">
            {dropdown && SLASH}
            <span
              aria-current="page"
              className="flex shrink-0 items-center gap-1 text-rb-500"
              data-wallet-trail-protocol={pageOwn.key}
            >
              <span aria-hidden="true" className="flex shrink-0" data-wallet-trail-mark="">
                {pageOwn.mark}
              </span>
              <span className="whitespace-nowrap">{pageOwn.name}</span>
            </span>
          </li>
        )}
        {named && (
          <li className="flex min-w-0 items-center">
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
                      <span
                        className="flex size-3.5 items-center justify-center"
                        data-status-word={statusTip}
                        data-wallet-trail-status={status.tone}
                      >
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
          </li>
        )}
      </ol>
    </nav>
  );
}
