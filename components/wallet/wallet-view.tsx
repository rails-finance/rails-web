"use client";

// The wallet view (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md,
// steps 2 and 3; ui-jobs 738): the wallet's header, the filter bar (W8), the
// totals row over the protocols (W2), then one section per protocol the
// wallet holds (W3): the listing's holder band (N7) over that protocol's
// cards, open by risk, then closed newest first; then the wallet's CoW trades
// as one row (W7, from rails-server's CoW tokens route). Every position figure
// comes from /api/chain/wallet/<address> (lib/wallet/read-wallet.ts); the
// sections and totals are lib/wallet/wallet-sections.ts. The rulings of 21
// October stand: a ten-dollar floor on the risk sort, a total sums only
// dollars at the protocol's own oracle, an unread Aave V3 Base account is
// shown with a "not read" mark, and every wallet, a sink included, is drawn
// the same with one line naming its count.

import { IndexNotice } from "@/components/shared/index-notice";
import Link from "next/link";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { Suspense, use, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TipLabel } from "@/components/shared/tip-label";
import { WalletHeader } from "@/components/wallet/wallet-header";
import { WalletPositionsMenu } from "@/components/shared/wallet-positions-menu";
import {
  VAULT_SHARES_FAMILY,
  sectionSlug,
  vaultProtocolOf,
  vaultRootName,
  vaultRootOf,
  type WalletCountsPosition,
} from "@/lib/wallet/summary-counts";
import { noneDrawnLine, undrawnWhereVaultsRead, vaultUndrawn } from "@/lib/wallet/trail-counts";
import { WalletFilterBar } from "@/components/wallet/wallet-filter-bar";
import {
  walletProtocol,
  WALLET_KINDS,
  WALLET_STATUSES,
  type WalletKind,
  type WalletStatus,
} from "@/lib/wallet/wallet-filters";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { WalletLookup } from "@/components/shared/wallet-lookup";
import { StartHereLine } from "@/components/start/start-here-line";
import { HolderStrip } from "@/components/shared/holder-strip";
import { WalletPositionCard, atRisk } from "@/components/wallet/wallet-position-card";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableLeadCell,
  DataTableLeadMark,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { ReadStamp } from "@/components/wallet/read-stamp";
import { formatCompactUsd } from "@/lib/shared/format-compact";
import { formatUsdValue } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { ARBITRUM_CHAIN_ID, CHAINS, chainMeta, type ChainId } from "@/lib/shared/chains";
import { walletCountProv, walletTradeAtProv } from "@/lib/cow/trade";
import type { CowWalletEntry } from "@/lib/cow/types";
import type { WalletFamilyRead, WalletRead } from "@/lib/wallet/types";
import { Vault } from "lucide-react";
import {
  closestToLiquidation,
  countsDollars,
  DUST_USD,
  unreadAtHead,
  walletNet,
  walletSections,
  walletTotal,
  andList,
  onTestnet,
  undrawnCount,
  undrawnLine,
  type WalletSection,
  type WalletTotal,
} from "@/lib/wallet/wallet-sections";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { useAssetScope } from "@/lib/shared/asset-scope";
import { walletPositionAssetKeys } from "@/lib/wallet/aim-assets";
import { COW_TERMS } from "@/lib/cow/terms";
import {
  LiquidityBoundary,
  LiquidityReading,
  LiquiditySection,
  WhenLiquidityEmpty,
} from "@/components/wallet/wallet-liquidity";
import type { WalletLiquidity } from "@/lib/wallet/types";
import type { UnreadExplorer } from "@/lib/wallet/read-wallet";

const TILE = "rounded-2xl border border-rb-300/40 bg-raised px-5 py-4 dark:border-rb-700/40";
const H2 = "text-sm font-semibold uppercase tracking-wide text-foreground/80";

/** The Debt tile's rate: each family hands its stored simple yearly rate
 *  (WalletPosition.debtRate), so the average is in one form. */
const RATE_TIP =
  "The borrow rates of the positions with debt, each as a simple yearly rate (the protocol's per-second or yearly rate, uncompounded), averaged by debt. Each protocol's page states its rate in its documented form.";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Tile({ label, value, sub, anatomy }: { label: string; value: ReactNode; sub?: ReactNode; anatomy: string }) {
  return (
    <div className={TILE} data-wallet-tile={anatomy}>
      <div className="text-xs font-semibold uppercase tracking-wide text-rb-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-rb-500">{sub}</div>}
    </div>
  );
}

/** A total's figure, compact, with its receipt; a dash where there is none. */
function Figure({ f }: { f: { usd: number; prov: Provenance } | null }) {
  if (!f) return <span data-prov-exempt="">—</span>;
  return (
    <Prov info={f.prov} value={formatUsdValue(f.usd)}>
      <span>{formatCompactUsd(f.usd)}</span>
    </Prov>
  );
}

/** "across 3 protocols"; nothing where there is no wallet total. */
const across = (t: WalletTotal | null) => (t?.figure ? `across ${plural(t.of, "protocol")}` : undefined);

/** The wallet's totals (W2): each figure the sum of the protocol sections'
 *  figures below it, with its receipt; the sections it leaves out named
 *  under the row (`walletTotal`). */
function Totals({
  sections,
  filtered,
  unanswered,
}: {
  sections: WalletSection[];
  filtered: boolean;
  /** What the listing reads that did not answer read. */
  unanswered: string[];
}) {
  const coll = walletTotal(sections, "collateral", unanswered);
  const debt = walletTotal(sections, "debt", unanswered);
  const net = walletNet(coll, debt);
  // Each reason a total is absent, or what it leaves out, said once under the row.
  const gaps = [...new Set([coll?.gap, debt?.gap].filter((g): g is string => g != null))];
  const leaves = [...new Set([coll?.leaves, debt?.leaves].filter((g): g is string => g != null))];
  // The rate reads over the sections the totals sum.
  const owing = sections
    .filter((s) => !s.testnet && s.collateral != null && s.debt != null)
    .flatMap((s) => s.open)
    .filter((p) => countsDollars(p) && !unreadAtHead(p) && (p.debtUsd ?? 0) > 0);
  const rated = owing.filter((p) => p.debtRate != null);
  const ratedUsd = rated.reduce((s, p) => s + p.debtUsd!, 0);
  const rate = ratedUsd > 0 ? rated.reduce((s, p) => s + p.debtUsd! * p.debtRate!, 0) / ratedUsd : null;
  const closest = closestToLiquidation(sections);
  return (
    <section aria-label="Totals" data-wallet-tiles="" data-anatomy="W2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile anatomy="collateral" label="Collateral" value={<Figure f={coll?.figure ?? null} />} sub={across(coll)} />
        <Tile
          anatomy="debt"
          label="Debt"
          value={<Figure f={debt?.figure ?? null} />}
          sub={
            debt?.figure?.usd === 0 ? (
              "no debt"
            ) : rate == null || !debt?.figure ? undefined : (
              <>
                <TipLabel text="simple yearly rate" tip={RATE_TIP} /> {pct(rate)}
                {rated.length < owing.length && ` on ${rated.length} of ${owing.length} with debt`}
              </>
            )
          }
        />
        <Tile anatomy="net" label="Net" value={<Figure f={net} />} sub="collateral − debt" />
        <Tile
          anatomy="risk"
          label="Closest to liquidation"
          value={<span data-prov-exempt="">{closest?.riskFigure?.value ?? "—"}</span>}
          sub={
            closest
              ? [closest.familyName, closest.market, chainMeta(closest.chain).name].filter(Boolean).join(" · ")
              : undefined
          }
        />
      </div>
      {gaps.length > 0 ? (
        gaps.map((g) => (
          <p key={g} className="mt-2 text-xs text-rb-500" data-wallet-total-gap="">
            {g}
          </p>
        ))
      ) : (
        <p className="mt-2 text-xs text-rb-500">
          {filtered
            ? "The positions shown"
            : leaves.length > 0
              ? "Each protocol’s total below that states both figures"
              : "Each protocol’s total below"}
          , summed in dollars at the sources each receipt names.
          {leaves.map((l) => (
            <span key={l} data-wallet-total-leaves="">
              {" "}
              {l}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/** A family's positions the read did not draw (a module's draw limit; the
 *  vault shares, ui-jobs 783), with its chain. */
type Undrawn = NonNullable<WalletFamilyRead["undrawn"]> & { chain: ChainId };

/** One protocol's section (W3): its name, the listing's band (N7) where it
 *  holds two positions or more, then its cards, open by risk, then closed
 *  newest first; under them, how many more the read did not draw. */
function Section({
  s,
  undrawn,
  notes,
  status,
}: {
  s: WalletSection;
  undrawn: Undrawn[];
  notes: string[];
  status?: WalletStatus;
}) {
  const atRiskCount = s.open.filter(atRisk).length;
  const id = `wallet-section-${s.slug}`;
  return (
    <section
      aria-labelledby={id}
      data-wallet-section={s.slug}
      data-wallet-open={s.open.length}
      data-wallet-closed={s.closed.length}
      data-anatomy="W3"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id} className={H2}>
          {s.name}{" "}
          <span className="font-medium text-rb-500" data-prov-exempt="">
            {(s.positions.length + undrawn.reduce((n, u) => n + undrawnCount(u, status), 0)).toLocaleString("en-US")}
          </span>
        </h2>
        {s.open.length > 1 && (
          <span className="text-xs text-rb-500">
            Riskiest first{atRiskCount > 0 ? ` · ${atRiskCount} at risk` : ""}
            {s.dust > 0 ? ` · ${plural(s.dust, "position")} under $${DUST_USD} last` : ""}
          </span>
        )}
      </div>
      <HolderStrip scoped {...s.band} />
      <div className="flex flex-col gap-3">
        {s.positions.map((p) => (
          <WalletPositionCard key={`${p.chain}:${p.family}:${p.positionId}`} position={p} />
        ))}
      </div>
      {undrawn.map((u) => {
        // As the heading's count, the Status pill's positions alone.
        const n = undrawnCount(u, status);
        return (
          n > 0 && (
            <p key={`${u.family}:${u.chain}`} className="mt-3 text-xs text-rb-500" data-wallet-undrawn={n}>
              {undrawnLine(u, chainMeta(u.chain).name, status)}
            </p>
          )
        );
      })}
      {notes.map((line) => (
        <p key={line} className="mt-3 text-xs text-rb-500" data-wallet-section-note="">
          {line}
        </p>
      ))}
    </section>
  );
}

/** A vault protocol's section where the read draws none of its shares
 *  (W3; ui-jobs 863): its name and count, the line saying none is drawn, and
 *  the undrawn lines by chain. */
function UndrawnSection({
  slug,
  name,
  undrawn,
  status,
}: {
  slug: string;
  name: string;
  undrawn: Undrawn[];
  status?: WalletStatus;
}) {
  const id = `wallet-section-${slug}`;
  const total = undrawn.reduce((n, u) => n + undrawnCount(u, status), 0);
  return (
    <section
      aria-labelledby={id}
      data-wallet-section={slug}
      data-wallet-open={0}
      data-wallet-closed={0}
      data-anatomy="W3"
    >
      <h2 id={id} className={`mb-3 ${H2}`}>
        {name}{" "}
        <span className="font-medium text-rb-500" data-prov-exempt="">
          {total.toLocaleString("en-US")}
        </span>
      </h2>
      <p className="text-sm text-foreground/80" data-wallet-reads="">
        {noneDrawnLine(total, name, status)}
      </p>
      {undrawn.map((u) => {
        const n = undrawnCount(u, status);
        return (
          n > 0 && (
            <p key={`${u.family}:${u.chain}`} className="mt-3 text-xs text-rb-500" data-wallet-undrawn={n}>
              {undrawnLine(u, chainMeta(u.chain).name, status)}
            </p>
          )
        );
      })}
    </section>
  );
}

/** The CoW row's chain and page. */
const COW_CHAIN: ChainId = 1;
const cowHref = (address: string) => `/ethereum/cow/${address}`;

/** The wallet's trades through CoW (W7): one row on the house table's chrome,
 *  linking to the wallet's CoW page. Streamed: the page passes the read
 *  unawaited, and a wallet with no trade, or a read that failed or ran past
 *  its budget, draws nothing. */
function Trades({ address, cow }: { address: string; cow: Promise<CowWalletEntry | null> }) {
  const entry = use(cow);
  if (!entry) return null;
  const { summary: s, asOf } = entry;
  const count = (
    <Prov info={walletCountProv(asOf, "Trades", s.trades)} value={String(s.trades)}>
      {plural(s.trades, "trade")}
    </Prov>
  );
  const at = (which: "First" | "Last", ts: number | null, block: number | null) =>
    ts != null && block != null ? (
      <Prov info={walletTradeAtProv(which, block)} value={String(block)}>
        {formatDate(ts)}
      </Prov>
    ) : null;
  const first = at("First", s.firstTimestamp, s.firstBlock);
  const last = s.lastBlock !== s.firstBlock ? at("Last", s.lastTimestamp, s.lastBlock) : null;
  const dates = first && (
    <>
      {first}
      {last && <> – {last}</>}
    </>
  );
  const label = `${COW_TERMS.name} on ${chainMeta(COW_CHAIN).name}, ${plural(s.trades, "trade")}`;
  return (
    <section aria-labelledby="wallet-trades" data-wallet-trades="cow" data-anatomy="W7">
      <h2 id="wallet-trades" className={`${H2} mb-3`}>
        Trades
      </h2>
      {/* One row on the house table's chrome (D1, D4, D5, D6). */}
      <DataTable label="Trades" stacked rowHeight="one" tableClassName="text-sm">
        <DataTableBody>
          <DataTableRow href={cowHref(address)} data-wallet-trades-row="cow">
            <DataTableLeadCell protocol="cow" protocolName={COW_TERMS.name} chain={COW_CHAIN} />
            <DataTableCell rowHeader className="whitespace-nowrap">
              <span className="flex items-center gap-2">
                <DataTableLeadMark protocol="cow" chain={COW_CHAIN} />
                <DataTableRowLink href={cowHref(address)} aria-label={label} className="font-medium">
                  {COW_TERMS.name}
                </DataTableRowLink>
              </span>
            </DataTableCell>
            <DataTableCell className="w-full whitespace-nowrap">{count}</DataTableCell>
            <DataTableCell align="right" className="text-foreground/80 max-sm:text-rb-500 sm:whitespace-nowrap">
              {dates}
            </DataTableCell>
          </DataTableRow>
        </DataTableBody>
      </DataTable>
    </section>
  );
}

const familyChain = (r: WalletFamilyRead) => `${r.name} on ${chainMeta(r.chain).name}`;

/** An ENS name that resolves to no address: the page's heading names it and
 *  the empty state's body says so, with the lookup to try another. */
export function WalletUnresolved({ name, back }: { name: string; back: { href: string; name: string } | null }) {
  return (
    <div className="flex flex-col gap-7 py-8" data-wallet-unresolved={name}>
      <WalletHeader address={null} ensName={name} />
      <section className="flex max-w-xl flex-col gap-3" data-wallet-empty="">
        <p className="text-sm text-foreground/80" data-wallet-reads="">
          {name} resolves to no address, so there is no wallet to read.
        </p>
        {back && (
          <p className="text-sm">
            <Link
              href={back.href}
              className="text-foreground underline underline-offset-2 hover:text-rb-700 dark:hover:text-rb-300"
              data-wallet-back=""
            >
              Back to {back.name}
            </Link>
          </p>
        )}
        <WalletLookup positionHref={(w) => `/wallet/${w}`} placeholder="Wallet address or ENS name" />
        <StartHereLine />
      </section>
    </div>
  );
}

/** The plain vault shares view's protocol crumb, under a neutral vault
 *  glyph: it spans MetaMorpho, Aave's vaults and Yearn V3 (ui-jobs 856). */
const VAULTS_CRUMB = { key: "vaults", name: "Vaults", mark: <Vault className="size-3.5 shrink-0" /> };

/** A read with no trail (the summary did not answer): the trail draws none. */
const NO_TRAIL: WalletCountsPosition[] = [];

export function WalletView({
  address,
  ensName,
  read,
  cow,
  liquidity,
  notRead,
  back,
  kinds: initialKinds = [],
  status: initialStatus,
  vault,
}: {
  address: string;
  ensName: string | null;
  read: WalletRead;
  /** The wallet's CoW trades, unawaited (`readCowWalletEntry`); W7. Null
   *  where one protocol is chosen, which is read alone. */
  cow: Promise<CowWalletEntry | null> | null;
  /** The wallet's liquidity positions, read at visit after the page's main read and
   *  unawaited (`readWalletLiquidity`); W9. Null where one protocol is chosen. */
  liquidity: Promise<WalletLiquidity> | null;
  /** `?kind=`: the Kind pill's selection on arrival (ui-jobs 738). */
  kinds?: WalletKind[];
  /** `?status=`: the Status pill's selection on arrival. */
  status?: WalletStatus;
  /** `?vault=` with the vault shares chosen: one vault protocol's shares
   *  (`vaultRootOf`), the trail's MetaMorpho, Aave vaults or Yearn V3 row
   *  (ui-jobs 856). */
  vault?: string;
  /** The explorer the reader came from, for the empty state's link back. */
  back: { href: string; name: string } | null;
  /** The launched explorers no wallet read takes (`walletUnreadExplorers`); empty where one
   *  protocol is chosen. */
  notRead: UnreadExplorer[];
}) {
  // AIM (ui-jobs 557): the positions naming an AIM asset (lib/wallet/aim-assets.ts),
  // the reader's own wallet included.
  const positions = useMemo(
    () => (vault ? read.positions.filter((p) => vaultRootOf(p) === vault) : read.positions),
    [read.positions, vault],
  );
  const scoped = useScopedRows(positions, walletPositionAssetKeys, (p) => p.chain as number);
  const scope = useAssetScope();
  const [kinds, setKinds] = useState<WalletKind[]>(initialKinds);
  const [status, setStatus] = useState<WalletStatus | undefined>(initialStatus);
  // A protocol change reads the page again: the page stays and dims meanwhile.
  const router = useRouter();
  const [reading, startReading] = useTransition();
  const navigate = (href: string) => startReading(() => router.push(href, { scroll: false }));
  const byKind = kinds.length > 0;
  const focused = scoped.on && !scoped.peek;
  const filtered = focused || byKind || status != null;
  const narrow = (k: WalletKind[], s: WalletStatus | undefined) =>
    scoped.rows.filter(
      (p) =>
        (k.length === 0 || (p.kind != null && k.includes(p.kind))) &&
        (s == null || (s === "open") === (p.status === "open")),
    );
  const all = narrow(kinds, status);
  const chosen = walletProtocol(read.protocol);
  // The positions the read counted and did not draw.
  // Under Focus, only those on a chain in focus, as the drawn rows.
  // The vault shares' undrawn counts are the family's, naming no vault
  // protocol: the shares the trail counts and the read did not draw stand in
  // their place, by section and chain (ui-jobs 856, 863); on a `?vault=`
  // view, that protocol's alone; none on another protocol's view, whose
  // read leaves the vault shares out.
  const trail = read.trail ?? NO_TRAIL;
  const readsVaults = !chosen || chosen.slug === VAULT_SHARES_FAMILY;
  const vaultShares = readsVaults
    ? trail.filter((p) => p.family === VAULT_SHARES_FAMILY && (!vault || vaultRootOf(p) === vault))
    : [];
  const undrawn: Undrawn[] = [
    ...read.families.flatMap((r) =>
      r.undrawn && r.undrawn.family !== VAULT_SHARES_FAMILY && (!focused || scope.chainOk(r.chain))
        ? [{ ...r.undrawn, chain: r.chain }]
        : [],
    ),
    ...undrawnWhereVaultsRead(
      vaultUndrawn(
        vaultShares,
        new Set(positions.map((p) => `${CHAINS[p.chain]?.slug}:${p.positionId}`)),
        (slug) => Object.values(CHAINS).find((c) => c.slug === slug)?.id,
        sectionSlug,
      ),
      read.families,
    ).filter((u) => !focused || scope.chainOk(u.chain)),
  ];
  const undrawnTotal = undrawn.reduce((n, u) => n + undrawnCount(u, status), 0);
  // On a `?vault=` view the Protocol pill counts that vault protocol's shares.
  const held = vault
    ? read.held.map((h) => (h.slug === "vaults" ? { ...h, positions: vaultShares.length } : h))
    : read.held;
  // The lines a module states under its section, on a chain in focus.
  const notes = read.families.flatMap((r) => (r.note && (!focused || scope.chainOk(r.chain)) ? [r.note] : []));
  // The bands state a protocol's whole holding: drawn while no pill narrows it.
  // The listing reads that did not answer (read-wallet.ts, readListingRows).
  const unanswered = read.families.flatMap((r) => (r.unanswered ? [r.unanswered] : []));
  const missing = unanswered.map((u) => u.what);
  // The reads that stop the wallet total (`total: false` stops none).
  const blocking = unanswered.filter((u) => u.total !== false).map((u) => u.what);
  const sections = walletSections(all, { bands: !filtered, unanswered });
  // A vault protocol whose shares the trail counts and the read draws none
  // of (each past its chain's draw limit): its section is its name, its
  // count and its undrawn lines (ui-jobs 863). A vault share is a deposit.
  const vaultNames = new Map(vaultShares.map((p) => [sectionSlug(p), vaultProtocolOf(p) ?? "Vault shares"]));
  const undrawnOnly =
    byKind && !kinds.includes("deposits")
      ? []
      : [...vaultNames].filter(
          ([slug]) =>
            !sections.some((s) => s.slug === slug) &&
            undrawn.some((u) => u.family === slug && undrawnCount(u, status) > 0),
        );
  const open = sections.flatMap((s) => s.open);
  // Under Focus, only the families on a chain in focus.
  const unread = read.families.filter(
    (r) => r.headRead === "failed" && !r.unanswered && (!focused || scope.chainOk(r.chain)),
  );
  const stamps = open.map((p) => p.readAt).filter((t): t is number => t != null);
  const oldest = stamps.length ? Math.min(...stamps) : undefined;
  const registry = useReceiptRegistry();
  // The trades are no position: drawn with neither Kind nor Status chosen.
  const trades = cow && !byKind && status == null && (
    <Suspense fallback={null}>
      <Trades address={address} cow={cow} />
    </Suspense>
  );
  // The liquidity positions (W9), below the protocol sections: drawn, like the trades, with
  // neither Kind nor Status chosen.
  const liquiditySection = liquidity && !byKind && status == null && (
    <LiquidityBoundary
      fallback={
        <p className="text-xs text-rb-500" data-wallet-liquidity-unanswered="">
          Liquidity positions could not be read.
        </p>
      }
    >
      <Suspense fallback={<LiquidityReading />}>
        <LiquiditySection read={liquidity} />
      </Suspense>
    </LiquidityBoundary>
  );
  // The empty wallet's sentence (W3) and, under it, the launched explorers the page does not
  // read: drawn together, so the line never stands without the sentence.
  const noPositions = (
    <>
      <p className="text-sm text-foreground/80" data-wallet-reads="">
        Rails found no positions for this wallet on the{" "}
        <Link href="/coverage" className={`underline-offset-2 ${INLINE_LINK}`} data-wallet-coverage="">
          protocols and chains it covers
        </Link>
        .
      </p>
      {notRead.length > 0 && <NotReadLine explorers={notRead} />}
    </>
  );
  const filterBar = held.length > 0 && (
    <WalletFilterBar
      address={address}
      protocol={read.protocol}
      vault={vault}
      held={held}
      statuses={WALLET_STATUSES.map((s) => s.value).filter((s) =>
        scoped.rows.some((p) => (s === "open") === (p.status === "open")),
      )}
      offered={WALLET_KINDS.map((k) => k.value).filter((k) => scoped.rows.some((p) => p.kind === k))}
      kinds={kinds}
      setKinds={setKinds}
      status={status}
      setStatus={setStatus}
      shown={all.length}
      countFor={(k, s) => narrow(k, s).length}
      navigate={navigate}
    />
  );
  const body = (children: ReactNode) => (
    <div
      className={`flex flex-col gap-7 transition-opacity ${reading ? "pointer-events-none opacity-50" : ""}`}
      aria-busy={reading || undefined}
      data-wallet-reading={reading ? "" : undefined}
      // What the filter bar narrows: its open panel sets this back.
      data-filters-results=""
    >
      {children}
    </div>
  );

  return (
    <ProvReceiptsScope registry={registry}>
      <div
        className="flex flex-col gap-7 py-8"
        {...scoped.listProps}
        data-wallet-view={address}
        data-wallet-ms={read.ms}
        data-wallet-server-ms={read.serverMs}
        data-wallet-families={JSON.stringify(
          // What each family answered and which fields it filled: the gap list
          // decision 0050's step 3 is built from.
          read.families.map((r) => {
            const mine = open.filter(
              (p) => `${p.family}:${p.chain}` === `${r.id.replace(/-(base|arbitrum|arc|optimism)$/, "")}:${r.chain}`,
            );
            return {
              id: r.id,
              head: r.headRead,
              ms: r.ms,
              reads: r.reads,
              n: r.positions,
              open: r.open,
              usd: mine.filter((p) => p.collateralUsd != null || p.debtUsd != null).length,
              buffer: mine.filter((p) => p.buffer != null).length,
              stamp: mine.filter((p) => p.readAtBlock != null || p.readAt != null).length,
              error: r.error,
            };
          }),
        )}
      >
        <WalletHeader
          address={address}
          ensName={ensName}
          narrowed={chosen != null}
          lines={
            <>
              {chosen ? (
                // Narrowed to one protocol, the line is the trail (H13.4): the
                // positions menu, then the protocol as the page; under
                // Focus, the scope's line under it (ui-jobs 856).
                <>
                  <WalletPositionsMenu
                    wallet={address}
                    page="wallet"
                    search={`?protocol=${chosen.slug}${vault ? `&vault=${vault}` : ""}`}
                    positions={trail}
                    // The vault shares alone are no summary row's protocol:
                    // their crumb is the page (ui-jobs 856).
                    pageCrumb={chosen.slug === "vaults" && !vault ? VAULTS_CRUMB : undefined}
                  />
                  {focused && <ScopeNote scoped={scoped} noun={["position", "positions"]} />}
                </>
              ) : focused ? (
                <ScopeNote scoped={scoped} noun={["position", "positions"]} />
              ) : (
                // The dashboard's line is the positions menu, the trail's
                // first crumb, as the current page, built from this read's
                // trail: the stored positions and the ones read at visit,
                // so it counts the cards drawn (H13.2; ui-jobs 856).
                trail.length > 0 && (
                  <div className="flex" data-wallet-count={trail.length}>
                    <WalletPositionsMenu wallet={address} page="wallet" search="" onDashboard positions={trail} />
                  </div>
                )
              )}
              {scoped.on && scoped.peek && <ScopeNote scoped={scoped} noun={["position", "positions"]} />}
            </>
          }
          end={
            oldest != null && (
              <span className="ml-auto flex shrink-0 items-center">
                <ReadStamp at={oldest} label="Updated" />
              </span>
            )
          }
        />

        {read.error ? (
          <>
            <section className="flex max-w-xl flex-col gap-3" data-wallet-error="">
              <IndexNotice className="text-sm text-foreground/80" />
            </section>
            {liquiditySection}
            {trades}
          </>
        ) : filtered && all.length === 0 && positions.length > 0 ? (
          <>
            {filterBar}
            {body(
              <>
                <p className="text-sm text-rb-500">
                  {byKind
                    ? "No position of this kind."
                    : status === "open"
                      ? "No open position."
                      : "No closed position."}
                </p>
                {trades}
              </>,
            )}
          </>
        ) : all.length === 0 ? (
          <>
            {filterBar}
            {body(
              <>
                <section className="flex max-w-xl flex-col gap-3" data-wallet-empty="">
                  {missing.length > 0 ? (
                    <p className="text-sm text-foreground/80" data-wallet-unanswered="">
                      {andList(missing)} could not be read.
                    </p>
                  ) : chosen ? (
                    undrawnTotal > 0 ? (
                      // Every share the view counts is past the read's draw
                      // limit: say so, with the lines a section draws.
                      <>
                        <p className="text-sm text-foreground/80" data-wallet-reads="">
                          {noneDrawnLine(
                            undrawnTotal,
                            vault ? (vaultRootName(vault) ?? chosen.name) : chosen.name,
                            status,
                          )}
                        </p>
                        {undrawn.map((u) => {
                          const n = undrawnCount(u, status);
                          return (
                            n > 0 && (
                              <p key={`${u.family}:${u.chain}`} className="text-xs text-rb-500" data-wallet-undrawn={n}>
                                {undrawnLine(u, chainMeta(u.chain).name, status)}
                              </p>
                            )
                          );
                        })}
                      </>
                    ) : (
                      <p className="text-sm text-foreground/80" data-wallet-reads="">
                        {chosen.slug === "vaults"
                          ? `Rails holds no ${vault ? (vaultRootName(vault) ?? "vault") : "vault"} shares for this wallet.`
                          : `Rails holds no ${chosen.name} position for this wallet.`}
                      </p>
                    )
                  ) : liquidity && liquiditySection ? (
                    // Drawn once the liquidity read settles with none (W9 lists any it finds).
                    <LiquidityBoundary fallback={null}>
                      <Suspense fallback={null}>
                        <WhenLiquidityEmpty read={liquidity}>{noPositions}</WhenLiquidityEmpty>
                      </Suspense>
                    </LiquidityBoundary>
                  ) : (
                    noPositions
                  )}{" "}
                  {back && (
                    <p className="text-sm">
                      <Link
                        href={back.href}
                        className="text-foreground underline underline-offset-2 hover:text-rb-700 dark:hover:text-rb-300"
                        data-wallet-back=""
                      >
                        Back to {back.name}
                      </Link>
                    </p>
                  )}
                  <WalletLookup positionHref={(w) => `/wallet/${w}`} placeholder="Wallet address or ENS name" />
                  <StartHereLine />
                </section>
                {liquiditySection}
                {trades}
              </>,
            )}
          </>
        ) : (
          <>
            {filterBar}
            {body(
              <>
                {open.some((p) => !onTestnet(p)) && (
                  <Totals sections={sections} filtered={filtered} unanswered={blocking} />
                )}
                {sections.map((s) => (
                  <Section
                    key={s.slug}
                    s={s}
                    undrawn={undrawn.filter((u) => u.family === s.slug)}
                    notes={notes.filter((n) => n.family === s.slug).map((n) => n.line)}
                    status={status}
                  />
                ))}
                {undrawnOnly.map(([slug, name]) => (
                  <UndrawnSection
                    key={slug}
                    slug={slug}
                    name={name}
                    undrawn={undrawn.filter((u) => u.family === slug)}
                    status={status}
                  />
                ))}
                {/* What the filter bar leaves shown, with its noun: the bar
                    draws no count (ui-jobs 801; Miles, 22 Nov 2026). */}
                <p className="text-sm text-rb-500" data-wallet-shown={all.length} data-prov-exempt="">
                  {plural(all.length, status ? `${status} position` : "position")}
                </p>
                {liquiditySection}
                {trades}
              </>,
            )}
          </>
        )}

        {/* How Arbitrum positions come to show: kept under a focus that takes in
            Arbitrum, the only guidance there is for it. */}
        {!read.error && (!chosen || chosen.arbitrum) && (!focused || scope.chains.includes(ARBITRUM_CHAIN_ID)) && (
          <ArbitrumNote address={address} />
        )}

        {missing.length > 0 && all.length > 0 && (
          <p className="text-xs text-rb-500" data-wallet-unanswered="">
            {andList(missing)} could not be read.
          </p>
        )}
        {unread.length > 0 && (
          <p className="text-xs text-rb-500" data-wallet-unread={unread.map((r) => r.id).join(",")}>
            Not read at head: {unread.map(familyChain).join(", ")}. Their cards show the stored figures.
          </p>
        )}
      </div>
      {/* The page's one inspector layer: the switch arms this route
          (lib/shared/prov-preference-routes.ts). */}
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}

/** The empty state's line naming the launched explorers the page does not read (decision 0073
 *  point 4), each linked to its page for the wallet. */
function NotReadLine({ explorers }: { explorers: UnreadExplorer[] }) {
  return (
    <p className="text-sm text-foreground/80" data-wallet-not-read={explorers.map((e) => e.id).join(",")}>
      This page does not yet read{" "}
      {explorers.map((e, i) => (
        <span key={e.id}>
          {i > 0 && (i === explorers.length - 1 ? " or " : ", ")}
          <Link href={e.href} prefetch={false} className={`underline-offset-2 ${INLINE_LINK}`}>
            {e.name}
          </Link>
        </span>
      ))}
      .
    </p>
  );
}

/** At the page's foot (Miles, 6 Nov 2026): Arbitrum positions are stored when
 *  the wallet is opened on an Arbitrum explorer, so this says how to bring
 *  them here. To remove once Arbitrum history is indexed like Ethereum's and
 *  Base's (ui-jobs 522). */
function ArbitrumNote({ address }: { address: string }) {
  const link = "text-blue-600 hover:underline dark:text-[var(--text-link)]";
  return (
    <p className="flex items-start gap-2 text-xs text-rb-500" data-wallet-arbitrum-note="">
      <ChainGlyph id={ARBITRUM_CHAIN_ID} className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        Arbitrum positions show here once the wallet has been opened on{" "}
        <Link href={`/arbitrum/aave-v3/${address}`} prefetch={false} className={link}>
          Aave V3
        </Link>
        ,{" "}
        <Link href="/arbitrum/compound-v3" prefetch={false} className={link}>
          Compound V3
        </Link>{" "}
        or{" "}
        <Link href={`/arbitrum/morpho/${address}`} prefetch={false} className={link}>
          Morpho Blue
        </Link>{" "}
        on Arbitrum.
      </span>
    </p>
  );
}
