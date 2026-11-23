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
import { Suspense, use, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HeadingTip, TipLabel } from "@/components/shared/tip-label";
import { WalletHeader } from "@/components/wallet/wallet-header";
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
import { ARBITRUM_CHAIN_ID, chainMeta, type ChainId } from "@/lib/shared/chains";
import { walletCountProv, walletTradeAtProv } from "@/lib/cow/trade";
import type { CowWalletEntry } from "@/lib/cow/types";
import type { WalletFamilyRead, WalletRead } from "@/lib/wallet/types";
import { WALLET_COUNTS_SCOPE } from "@/lib/wallet/summary-counts";
import {
  closestToLiquidation,
  DUST_USD,
  unreadAtHead,
  walletNet,
  walletSections,
  walletTotal,
  andList,
  type WalletSection,
  type WalletTotal,
} from "@/lib/wallet/wallet-sections";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { useAssetScope } from "@/lib/shared/asset-scope";
import { walletPositionAssetKeys } from "@/lib/wallet/aim-assets";
import { COW_TERMS } from "@/lib/cow/terms";

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
 *  figures below it, with its receipt. */
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
  // Each reason a total is absent, said once under the row.
  const gaps = [...new Set([coll?.gap, debt?.gap].filter((g): g is string => g != null))];
  const owing = sections
    .flatMap((s) => s.open)
    .filter((p) => p.usdOwnOracle && !unreadAtHead(p) && (p.debtUsd ?? 0) > 0);
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
          {filtered ? "The positions shown" : "Each protocol’s total below"}, summed in dollars at the sources each
          receipt names.
        </p>
      )}
    </section>
  );
}

/** One protocol's section (W3): its name, the listing's band (N7) where it
 *  holds two positions or more, then its cards, open by risk, then closed
 *  newest first. */
function Section({ s }: { s: WalletSection }) {
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
            {s.positions.length}
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

export function WalletView({
  address,
  ensName,
  read,
  cow,
  reads,
  back,
  kinds: initialKinds = [],
  status: initialStatus,
}: {
  address: string;
  ensName: string | null;
  read: WalletRead;
  /** The wallet's CoW trades, unawaited (`readCowWalletEntry`); W7. Null
   *  where one protocol is chosen, which is read alone. */
  cow: Promise<CowWalletEntry | null> | null;
  /** `?kind=`: the Kind pill's selection on arrival (ui-jobs 738). */
  kinds?: WalletKind[];
  /** `?status=`: the Status pill's selection on arrival. */
  status?: WalletStatus;
  /** The families the page reads, by chain (`walletFamiliesLine`). */
  reads: string;
  /** The explorer the reader came from, for the empty state's link back. */
  back: { href: string; name: string } | null;
}) {
  // AIM (ui-jobs 557): the positions naming an AIM asset (lib/wallet/aim-assets.ts),
  // the reader's own wallet included.
  const scoped = useScopedRows(read.positions, walletPositionAssetKeys, (p) => p.chain as number);
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
  // The heading counts the wallet's positions whatever the pills hold.
  const wallet = {
    open: scoped.rows.filter((p) => p.status === "open").length,
    moved: scoped.rows.filter((p) => p.status === "moved").length,
    closed: scoped.rows.filter((p) => p.status !== "open" && p.status !== "moved").length,
  };
  // The bands state a protocol's whole holding: drawn while no pill narrows it.
  // The listing reads that did not answer (read-wallet.ts, readListingRows).
  const unanswered = read.families.flatMap((r) => (r.unanswered ? [r.unanswered] : []));
  const missing = unanswered.map((u) => u.what);
  // The reads that stop the wallet total (`total: false` stops none).
  const blocking = unanswered.filter((u) => u.total !== false).map((u) => u.what);
  const sections = walletSections(all, { bands: !filtered, unanswered });
  const open = sections.flatMap((s) => s.open);
  const scope = useAssetScope();
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
  const filterBar = read.held.length > 0 && (
    <WalletFilterBar
      address={address}
      protocol={read.protocol}
      held={read.held}
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
              (p) => `${p.family}:${p.chain}` === `${r.id.replace(/-(base|arbitrum|arc)$/, "")}:${r.chain}`,
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
          lines={
            <>
              {focused ? (
                <ScopeNote scoped={scoped} noun={["position", "positions"]} />
              ) : (
                read.total > 0 && (
                  <div className="text-xs text-rb-500" data-wallet-count={read.total}>
                    <HeadingTip
                      text={`${plural(read.total, "position")} · ${wallet.open} open · ${wallet.closed} closed${wallet.moved > 0 ? ` · ${wallet.moved} moved` : ""}`}
                      tip={WALLET_COUNTS_SCOPE}
                    />
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
            {trades}
          </>
        ) : filtered && all.length === 0 && read.positions.length > 0 ? (
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
                    <p className="text-sm text-foreground/80" data-wallet-reads="">
                      Rails holds no {chosen.name} position for this wallet.
                    </p>
                  ) : (
                    <p className="text-sm text-foreground/80" data-wallet-reads="">
                      Rails holds no position for this wallet. This page reads {reads}.
                    </p>
                  )}
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
                {trades}
              </>,
            )}
          </>
        ) : (
          <>
            {filterBar}
            {body(
              <>
                {open.length > 0 && <Totals sections={sections} filtered={filtered} unanswered={blocking} />}
                {sections.map((s) => (
                  <Section key={s.slug} s={s} />
                ))}
                {/* What the filter bar leaves shown, with its noun: the bar
                    draws no count (ui-jobs 801; Miles, 22 Nov 2026). */}
                <p className="text-sm text-rb-500" data-wallet-shown={all.length} data-prov-exempt="">
                  {plural(all.length, status ? `${status} position` : "position")}
                </p>
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
