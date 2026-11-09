"use client";

// The wallet view (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md,
// steps 2 and 3; the mock-up reference/mockups/wallet-view-milodon-2026-10-21.html):
// the wallet's header, four tiles over its open positions, the open positions
// as their families' listing cards sorted by buffer, the wallet's CoW trades
// as one row (W7, from rails-server's CoW tokens route), and the closed
// positions as a History table. Every position figure comes from
// /api/chain/wallet/<address> (lib/wallet/read-wallet.ts); the view sums, sorts and lays out, and adds
// nothing inside a card. The rulings of 21 October: a ten-dollar floor on the
// risk sort, a tile sums only dollars at the family's own oracle, an unread
// Aave V3 Base account is shown with a "not read" mark, and every wallet,
// a sink included, is drawn the same with one line naming its count.

import { IndexNotice } from "@/components/shared/index-notice";
import Link from "next/link";
import { Suspense, use } from "react";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { WalletHeading } from "@/components/shared/wallet-heading";
import { PROFILE_CLEARANCE } from "@/lib/shared/ui-grammar";
import { WalletMenu } from "@/components/shared/wallet-menu";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { WalletLookup } from "@/components/shared/wallet-lookup";
import { StartHereLine } from "@/components/start/start-here-line";
import { WalletPositionCard, atRisk, protocolId } from "@/components/wallet/wallet-position-card";
import { Icon } from "@/components/icons/icon";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableLeadCell,
  DataTableLeadHeader,
  DataTableLeadMark,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { ReadStamp } from "@/components/wallet/read-stamp";
import { formatCompactUsd } from "@/lib/shared/format-compact";
import { formatDate } from "@/lib/date";
import { ARBITRUM_CHAIN_ID, chainMeta, type ChainId } from "@/lib/shared/chains";
import { walletCountProv, walletTradeAtProv } from "@/lib/cow/trade";
import type { CowWalletEntry } from "@/lib/cow/types";
import type { WalletFamilyRead, WalletPosition, WalletRead } from "@/lib/wallet/types";

const TILE = "rounded-2xl border border-rb-300/40 bg-raised px-5 py-4 dark:border-rb-700/40";
const H2 = "text-sm font-semibold uppercase tracking-wide text-foreground/80";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The dust floor on the risk sort (open point 5): collateral under this many
 *  dollars lists below the sorted set. */
const DUST_USD = 10;

/** The dollars the floor reads: the card's, or a rank-only figure. */
const dustFigure = (p: WalletPosition) => p.collateralUsd ?? p.dustUsd;
export const isDust = (p: WalletPosition) => {
  const d = dustFigure(p);
  return d != null && d < DUST_USD;
};

/** Buffer ascending where stated, then collateral dollars descending. */
function byRisk(a: WalletPosition, b: WalletPosition): number {
  if (a.buffer != null && b.buffer != null) return a.buffer - b.buffer;
  if (a.buffer != null) return -1;
  if (b.buffer != null) return 1;
  return (b.collateralUsd ?? -1) - (a.collateralUsd ?? -1);
}

function Tile({ label, value, sub, anatomy }: { label: string; value: string; sub?: string; anatomy: string }) {
  return (
    <div className={TILE} data-wallet-tile={anatomy}>
      <div className="text-xs font-semibold uppercase tracking-wide text-rb-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-rb-500">{sub}</div>}
    </div>
  );
}

function Tiles({ open, ranked }: { open: WalletPosition[]; ranked: WalletPosition[] }) {
  // Only dollars the family states at its own oracle (open point 7).
  const summed = open.filter((p) => p.usdOwnOracle && !p.notRead);
  const withColl = summed.filter((p) => p.collateralUsd != null);
  const withDebt = summed.filter((p) => p.debtUsd != null);
  const coll = withColl.reduce((s, p) => s + p.collateralUsd!, 0);
  const debt = withDebt.reduce((s, p) => s + p.debtUsd!, 0);
  const owing = summed.filter((p) => (p.debtUsd ?? 0) > 0);
  const rated = owing.filter((p) => p.debtRate != null);
  const ratedUsd = rated.reduce((s, p) => s + p.debtUsd!, 0);
  const rate = ratedUsd > 0 ? rated.reduce((s, p) => s + p.debtUsd! * p.debtRate!, 0) / ratedUsd : null;
  const closest = ranked.filter((p) => p.buffer != null && p.riskFigure).sort(byRisk)[0];
  const n = open.length;
  return (
    <section aria-label="Totals" data-wallet-tiles="" data-anatomy="W2" data-prov-exempt="">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          anatomy="collateral"
          label="Collateral"
          value={withColl.length ? formatCompactUsd(coll) : "—"}
          sub={
            withColl.length === n
              ? `across ${plural(n, "open position")}`
              : `across ${withColl.length} of ${plural(n, "open position")}`
          }
        />
        <Tile
          anatomy="debt"
          label="Debt"
          value={withDebt.length ? formatCompactUsd(debt) : "—"}
          sub={
            owing.length === 0
              ? "no debt"
              : rate == null
                ? undefined
                : rated.length === owing.length
                  ? `weighted rate ${pct(rate)}`
                  : `weighted rate ${pct(rate)} on ${rated.length} of ${owing.length} with debt`
          }
        />
        <Tile
          anatomy="net"
          label="Net"
          value={withColl.length || withDebt.length ? formatCompactUsd(coll - debt) : "—"}
          sub="collateral − debt"
        />
        <Tile
          anatomy="risk"
          label="Closest to liquidation"
          value={closest?.riskFigure?.value ?? "—"}
          sub={
            closest
              ? [closest.familyName, closest.market, chainMeta(closest.chain).name].filter(Boolean).join(" · ")
              : undefined
          }
        />
      </div>
      <p className="mt-2 text-xs text-rb-500">Dollars summed at each protocol&rsquo;s oracle.</p>
    </section>
  );
}

const OUTCOME_TONE: Record<string, string> = {
  liquidated: "bg-red-500/20 text-red-500",
  redeemed: "bg-caution-500/20 text-tone-caution",
  closed: "bg-rb-300 text-foreground/70 dark:bg-rb-700",
};

function lifetime(from?: number, to?: number): string | null {
  if (from == null || to == null || to < from) return null;
  const days = Math.floor((to - from) / 86400);
  if (days < 1) return "under a day";
  if (days < 60) return plural(days, "day");
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} yr`;
}

/** A closed row's transaction count behind the card foot's ⇄ glyph. */
function TxCount({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name="arrow-left-right" size={12} />
      {n.toLocaleString("en-US")}
      <span className="sr-only">{n === 1 ? " transaction" : " transactions"}</span>
    </span>
  );
}

function History({ closed }: { closed: WalletPosition[] }) {
  const rows = [...closed].sort((a, b) => (b.history?.closedAt ?? 0) - (a.history?.closedAt ?? 0));
  const counts = (["liquidated", "redeemed", "closed"] as const)
    .map((s) => ({ s, n: rows.filter((p) => p.status === s).length }))
    .filter((c) => c.n > 0)
    .map((c) =>
      c.s === "liquidated"
        ? plural(c.n, "liquidation")
        : c.s === "redeemed"
          ? plural(c.n, "redemption")
          : `${c.n} closed`,
    );
  return (
    <section aria-labelledby="wallet-history" data-wallet-history={rows.length} data-anatomy="W4" data-prov-exempt="">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="wallet-history" className={H2}>
          History{" "}
          <span className="font-medium text-rb-500" data-prov-exempt="">
            {rows.length}
          </span>
        </h2>
        {counts.length > 0 && <span className="text-xs text-rb-500">{counts.join(" · ")}</span>}
      </div>
      {/* The house table (rails-ops ui-jobs 539): D1, D4 (each row opens its
          position), D5 (the protocol's zone) and D6 cards below sm. */}
      <DataTable label="Closed positions" stacked rowHeight="two" tableClassName="text-sm sm:min-w-[860px]">
        <DataTableHead>
          <DataTableLeadHeader />
          <DataTableHeader label="Closed" />
          <DataTableHeader label="Protocol" />
          <DataTableHeader label="Outcome" />
          <DataTableHeader label="Size at close" />
          <DataTableHeader label="Result" />
          <DataTableHeader label="Lifetime" align="right" />
        </DataTableHead>
        <DataTableBody>
          {rows.map((p) => {
            const h = p.history ?? {};
            const life = lifetime(h.openedAt, h.closedAt);
            return (
              <DataTableRow
                key={`${p.chain}:${p.family}:${p.positionId}`}
                href={p.href}
                data-history-row={p.positionId}
                data-family={p.family}
              >
                <DataTableLeadCell protocol={protocolId(p)} protocolName={p.familyName} chain={p.chain} />
                <DataTableCell label="Closed" className="whitespace-nowrap text-foreground/80">
                  {h.closedAt != null ? formatDate(h.closedAt) : "—"}
                </DataTableCell>
                {/* First on a card, where the row header spans the card. */}
                <DataTableCell rowHeader className="max-sm:-order-1 sm:max-w-[13rem]">
                  <span className="flex min-w-0 items-center gap-2">
                    <DataTableLeadMark protocol={protocolId(p)} chain={p.chain} />
                    <span className="flex min-w-0 flex-col">
                      <DataTableRowLink href={p.href} className="truncate font-medium">
                        {p.familyName}
                      </DataTableRowLink>
                      {p.market && (
                        <span className="truncate text-xs uppercase tracking-wide text-rb-500">{p.market}</span>
                      )}
                    </span>
                  </span>
                </DataTableCell>
                <DataTableCell label="Outcome" className="whitespace-nowrap">
                  <span
                    className={`rounded-xs px-2 py-0.5 text-xs font-bold tracking-wider ${OUTCOME_TONE[p.status] ?? OUTCOME_TONE.closed}`}
                  >
                    {p.status.toUpperCase()}
                  </span>
                </DataTableCell>
                {/* A cell with nothing to say stays empty, so a card leaves it out. */}
                <DataTableCell label={h.size ? "Size at close" : undefined} className="sm:max-w-[14rem]">
                  {h.size && (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{h.size}</span>
                      {h.sizeNote && <span className="truncate text-xs text-rb-500">{h.sizeNote}</span>}
                    </span>
                  )}
                </DataTableCell>
                <DataTableCell label={h.result ? "Result" : undefined} className="sm:max-w-[14rem]">
                  {h.result && (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{h.result}</span>
                      {h.resultNote && <span className="truncate text-xs text-rb-500">{h.resultNote}</span>}
                    </span>
                  )}
                </DataTableCell>
                <DataTableCell label="Lifetime" align="right" className="whitespace-nowrap">
                  <span className="flex flex-col items-end max-sm:items-start">
                    <span>{life ?? ""}</span>
                    {h.txCount != null && (
                      <span className="text-xs text-rb-500">
                        <TxCount n={h.txCount} />
                      </span>
                    )}
                  </span>
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>
    </section>
  );
}

/** The CoW row's chain and page. */
const COW_CHAIN: ChainId = 1;
const cowHref = (address: string) => `/ethereum/cow/${address}`;

/** The wallet's trades through CoW (W7): one row, drawn as a History row
 *  (W4), linking to the wallet's CoW page. Streamed: the page passes the read
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
  const label = `CoW on ${chainMeta(COW_CHAIN).name}, ${plural(s.trades, "trade")}`;
  return (
    <section aria-labelledby="wallet-trades" data-wallet-trades="cow" data-anatomy="W7">
      <h2 id="wallet-trades" className={`${H2} mb-3`}>
        Trades
      </h2>
      {/* One row on the History table's chrome (W4: D1, D4, D5, D6). */}
      <DataTable label="Trades" stacked rowHeight="one" tableClassName="text-sm">
        <DataTableBody>
          <DataTableRow href={cowHref(address)} data-wallet-trades-row="cow">
            <DataTableLeadCell protocol="cow" protocolName="CoW" chain={COW_CHAIN} />
            <DataTableCell rowHeader className="whitespace-nowrap">
              <span className="flex items-center gap-2">
                <DataTableLeadMark protocol="cow" chain={COW_CHAIN} />
                <DataTableRowLink href={cowHref(address)} aria-label={label} className="font-medium">
                  CoW
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

export function WalletView({
  address,
  ensName,
  read,
  cow,
  reads,
  back,
}: {
  address: string;
  ensName: string | null;
  read: WalletRead;
  /** The wallet's CoW trades, unawaited (`readCowWalletEntry`); W7. */
  cow: Promise<CowWalletEntry | null>;
  /** The families the page reads, by chain (`walletFamiliesLine`). */
  reads: string;
  /** The explorer the reader came from, for the empty state's link back. */
  back: { href: string; name: string } | null;
}) {
  const all = read.positions;
  const openAll = all.filter((p) => p.status === "open");
  // The sorted set, then the dust under the floor, then the accounts not read.
  const ranked = openAll.filter((p) => !p.notRead && !isDust(p)).sort(byRisk);
  const dust = openAll.filter((p) => !p.notRead && isDust(p)).sort(byRisk);
  const notRead = openAll.filter((p) => p.notRead);
  const open = [...ranked, ...dust, ...notRead];
  const closed = all.filter((p) => p.status !== "open");
  const unread = read.families.filter((r) => r.headRead === "failed");
  const stamps = open.map((p) => p.readAt).filter((t): t is number => t != null);
  const oldest = stamps.length ? Math.min(...stamps) : undefined;
  const atRiskCount = open.filter(atRisk).length;
  const registry = useReceiptRegistry();
  const trades = (
    <Suspense fallback={null}>
      <Trades address={address} cow={cow} />
    </Suspense>
  );

  return (
    <ProvReceiptsScope registry={registry}>
      <div
        className="flex flex-col gap-7 py-8"
        data-wallet-view={address}
        data-wallet-ms={read.ms}
        data-wallet-server-ms={read.serverMs}
        data-wallet-families={JSON.stringify(
          // What each family answered and which fields it filled: the gap list
          // decision 0050's step 3 is built from.
          read.families.map((r) => {
            const mine = openAll.filter(
              (p) => `${p.family}:${p.chain}` === `${r.id.replace(/-(base|arbitrum)$/, "")}:${r.chain}`,
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
        <header data-anatomy="W1">
          {/* Back's row, as a detail page draws it (H7): the column's first
              line, level with the profile control (H20) at the top right from
              md. With no history Back opens the home page. */}
          <div className={`flex min-h-[38px] items-center ${PROFILE_CLEARANCE}`} data-anatomy="H7" data-back-row="">
            <DetailBackButton fallbackHref="/" />
          </div>
          <WalletHeading
            address={address}
            className="mt-6"
            // The address menu a position page draws (ui-jobs 430): Copy the
            // address and Bookmark it; no View wallet on the wallet view.
            title={<WalletMenu wallet={address} ensName={ensName} heading view={false} />}
            lines={
              <>
                {read.total > 0 && (
                  <div className="text-xs text-rb-500" data-wallet-count={read.total}>
                    {plural(read.total, "position")} · {openAll.length} open · {closed.length} closed
                  </div>
                )}
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
        </header>

        {read.error ? (
          <>
            <section className="flex max-w-xl flex-col gap-3" data-wallet-error="">
              <IndexNotice className="text-sm text-foreground/80" />
            </section>
            {trades}
          </>
        ) : all.length === 0 ? (
          <>
            <section className="flex max-w-xl flex-col gap-3" data-wallet-empty="">
              <p className="text-sm text-foreground/80" data-wallet-reads="">
                Rails holds no position for this wallet. This page reads {reads}.
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
            {trades}
          </>
        ) : (
          <>
            {open.length > 0 && <Tiles open={open} ranked={ranked} />}
            <section aria-labelledby="wallet-open" data-wallet-open={open.length} data-anatomy="W3">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="wallet-open" className={H2}>
                  Open positions{" "}
                  <span className="font-medium text-rb-500" data-prov-exempt="">
                    {open.length}
                  </span>
                </h2>
                {open.length > 1 && (
                  <span className="text-xs text-rb-500">
                    Sorted by risk{atRiskCount > 0 ? ` · ${atRiskCount} at risk` : ""}
                    {dust.length > 0 ? ` · ${plural(dust.length, "position")} under $${DUST_USD} last` : ""}
                  </span>
                )}
              </div>
              {open.length === 0 ? (
                <p className="text-sm text-rb-500">No open position.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {open.map((p) => (
                    <WalletPositionCard key={`${p.chain}:${p.family}:${p.positionId}`} position={p} />
                  ))}
                </div>
              )}
            </section>
            {trades}
            {closed.length > 0 && <History closed={closed} />}
          </>
        )}

        {!read.error && <ArbitrumNote address={address} />}

        {unread.length > 0 && (
          <p className="text-xs text-rb-500" data-wallet-unread={unread.map((r) => r.id).join(",")}>
            Not read at head: {unread.map(familyChain).join(", ")}. Their cards show the stored figures.
          </p>
        )}
      </div>
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
