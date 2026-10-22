"use client";

// The wallet view (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md,
// steps 2 and 3; the mock-up reference/mockups/wallet-view-milodon-2026-10-21.html):
// the wallet's header, four tiles over its open positions, the open positions
// as their families' listing cards sorted by buffer, and the closed ones as a
// History table. Every figure comes from /api/chain/wallet/<address>
// (lib/wallet/read-wallet.ts); the view sums, sorts and lays out, and adds
// nothing inside a card. The rulings of 21 October: a ten-dollar floor on the
// risk sort, a tile sums only dollars at the family's own oracle, an unread
// Aave V3 Base account is shown with a "not read" mark, and every wallet,
// a sink included, is drawn the same with one line naming its count.

import Link from "next/link";
import type { CSSProperties } from "react";
import { WalletHeading } from "@/components/shared/wallet-heading";
import { WalletMenu } from "@/components/shared/wallet-menu";
import { protocolForPathname } from "@/lib/shared/protocols";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { WalletLookup } from "@/components/shared/wallet-lookup";
import { WalletPositionCard, atRisk, protocolId } from "@/components/wallet/wallet-position-card";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { Icon } from "@/components/icons/icon";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { protocolBrand } from "@/lib/shared/protocols";
import { ReadStamp } from "@/components/wallet/read-stamp";
import { formatCompactUsd } from "@/lib/shared/format-compact";
import { formatDate } from "@/lib/date";
import { chainMeta } from "@/lib/shared/chains";
import type { WalletFamilyRead, WalletPosition, WalletRead } from "@/lib/wallet/types";

const TILE = "rounded-2xl border border-rb-300/40 bg-raised px-5 py-4 dark:border-rb-700/40";
/** A closed row's panel, and the closed table header's. */
const ROW_PANEL = "rounded-2xl border border-rb-300/40 bg-raised dark:border-rb-700/40";
/** A closed row's link: the panel with the open cards' blue border on hover
 *  (POSITION_CARD_FRAME_BOX) and on keyboard focus. */
const ROW_LINK = `${ROW_PANEL} transition-colors hover:border-blue-500 focus-visible:border-blue-500 dark:hover:border-blue-500 dark:focus-visible:border-blue-500`;
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

const HISTORY_GRID = "grid grid-cols-[95px_110px_170px_120px_minmax(0,1fr)_minmax(0,1fr)_110px] gap-4";

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

/** The protocol's brand hue for the zone and edge tokens; a grey zone where
 *  the roster has none. */
function hueStyle(id: string): CSSProperties {
  const hue = protocolBrand(id)?.hue ?? null;
  return { "--brand-hue": hue ?? 0, ...(hue == null ? { "--brand-strength": 0 } : {}) } as CSSProperties;
}

/** A closed row's lead: the protocol's mark and the chain's glyph on the
 *  protocol's tint, as the card's sidebar draws them (C20). Spans the row's
 *  height from its left edge. */
function ClosedZone({ p }: { p: WalletPosition }) {
  const id = protocolId(p);
  return (
    <span
      className="flex w-[95px] shrink-0 items-center justify-evenly self-stretch rounded-l-[15px] bg-brand-zone"
      style={hueStyle(id)}
      data-closed-zone={id}
    >
      <ProtocolIcon id={id} className="h-[18px] w-[18px] shrink-0 text-brand-mark [&:is(img)]:grayscale" />
      <span className="flex items-center text-brand-zone">
        <ChainGlyph id={p.chain} className="h-[18px] w-[18px] shrink-0" />
        <span className="sr-only">{chainMeta(p.chain).name}</span>
      </span>
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
      <p className="mb-3 text-xs text-rb-500">
        On Ethereum and Base, every closed position Rails has indexed for the wallet; on Arbitrum, the positions a visit
        has stored.
      </p>
      {/* Below sm each closed position is a short block; the table from sm up. */}
      <ul className="flex flex-col gap-3 sm:hidden" aria-label="Closed positions">
        {rows.map((p) => {
          const h = p.history ?? {};
          const life = lifetime(h.openedAt, h.closedAt);
          return (
            <li key={`${p.chain}:${p.family}:${p.positionId}`}>
              {/* The open cards' phone form (C20.1): the hue's 6px edge, the
                  mark and name at the left of the first line, the chain's
                  glyph at its right. */}
              <Link href={p.href} prefetch={false} className={`${ROW_LINK} flex overflow-hidden text-sm`}>
                <span className="w-[6px] shrink-0 self-stretch bg-brand-edge" style={hueStyle(protocolId(p))} />
                <span className="flex min-w-0 flex-1 flex-col gap-1 py-3 pl-5 pr-4">
                  <span className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-zone">
                      <ProtocolIcon id={protocolId(p)} className="h-4 w-4 shrink-0 text-rb-500" />
                      {p.familyName}
                    </span>
                    <span
                      className={`ml-auto rounded-xs px-2 py-0.5 text-xs font-bold tracking-wider ${OUTCOME_TONE[p.status] ?? OUTCOME_TONE.closed}`}
                    >
                      {p.status.toUpperCase()}
                    </span>
                    <span className="flex items-center text-brand-zone">
                      <ChainGlyph id={p.chain} className="h-4 w-4 shrink-0" />
                      <span className="sr-only">{chainMeta(p.chain).name}</span>
                    </span>
                  </span>
                  <span className="text-xs text-rb-500">
                    {[p.market, h.closedAt != null ? `closed ${formatDate(h.closedAt)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {(h.size || h.result) && (
                    <span className="text-xs text-foreground/80">
                      {[h.size ? `${h.size}${h.sizeNote ? ` (${h.sizeNote})` : ""}` : null, h.result]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {(life || h.txCount != null) && (
                    <span className="text-xs text-rb-500">
                      {life}
                      {life && h.txCount != null && " · "}
                      {h.txCount != null && <TxCount n={h.txCount} />}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="hidden sm:block">
        <div className="overflow-x-auto">
          <div className="flex min-w-[860px] flex-col gap-3" role="table" aria-label="Closed positions">
            <div
              role="row"
              className={`${HISTORY_GRID} ${ROW_PANEL} py-3 pr-5 text-xs font-semibold uppercase tracking-wide text-rb-500`}
            >
              <div role="columnheader" aria-hidden="true" />
              <div role="columnheader">Closed</div>
              <div role="columnheader">Protocol</div>
              <div role="columnheader">Outcome</div>
              <div role="columnheader">Size at close</div>
              <div role="columnheader">Result</div>
              <div role="columnheader" className="text-right">
                Lifetime
              </div>
            </div>
            {rows.map((p) => {
              const h = p.history ?? {};
              const life = lifetime(h.openedAt, h.closedAt);
              return (
                <Link
                  key={`${p.chain}:${p.family}:${p.positionId}`}
                  href={p.href}
                  prefetch={false}
                  role="row"
                  className={`${HISTORY_GRID} items-center ${ROW_LINK} py-3 pr-5 text-sm`}
                  data-history-row={p.positionId}
                  data-family={p.family}
                >
                  <div role="cell" className="-my-3 flex self-stretch">
                    <ClosedZone p={p} />
                  </div>
                  <div role="cell" className="text-foreground/80">
                    {h.closedAt != null ? formatDate(h.closedAt) : "—"}
                  </div>
                  <div role="cell" className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">{p.familyName}</span>
                    {p.market && (
                      <span className="truncate text-xs uppercase tracking-wide text-rb-500">{p.market}</span>
                    )}
                  </div>
                  <div role="cell">
                    <span
                      className={`rounded-xs px-2 py-0.5 text-xs font-bold tracking-wider ${OUTCOME_TONE[p.status] ?? OUTCOME_TONE.closed}`}
                    >
                      {p.status.toUpperCase()}
                    </span>
                  </div>
                  <div role="cell" className="flex min-w-0 flex-col">
                    <span className="truncate">{h.size ?? ""}</span>
                    {h.sizeNote && <span className="text-xs text-rb-500">{h.sizeNote}</span>}
                  </div>
                  <div role="cell" className="flex min-w-0 flex-col">
                    <span className="truncate">{h.result ?? ""}</span>
                    {h.resultNote && <span className="text-xs text-rb-500">{h.resultNote}</span>}
                  </div>
                  <div role="cell" className="flex flex-col text-right">
                    <span>{life ?? ""}</span>
                    {h.txCount != null && (
                      <span className="text-xs text-rb-500">
                        <TxCount n={h.txCount} />
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

const familyChain = (r: WalletFamilyRead) => `${r.name} on ${chainMeta(r.chain).name}`;

export function WalletView({
  address,
  ensName,
  read,
  reads,
  back,
}: {
  address: string;
  ensName: string | null;
  read: WalletRead;
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
  const bookmarkScope = open[0] ? protocolForPathname(open[0].href)?.session : undefined;

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
          <WalletHeading
            address={address}
            // The address menu a position page draws (ui-jobs 430): Copy the
            // address and, under the explorer of the first open position,
            // Bookmark it; no View the wallet on the wallet view.
            title={
              <WalletMenu wallet={address} ensName={ensName} bookmarkProtocol={bookmarkScope} heading view={false} />
            }
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
          <section className="flex max-w-xl flex-col gap-3" data-wallet-error="">
            <p className="text-sm text-foreground/80">
              The wallet&rsquo;s positions could not be read. Try again in a minute.
            </p>
          </section>
        ) : all.length === 0 ? (
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
          </section>
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
            {closed.length > 0 && <History closed={closed} />}
          </>
        )}

        {unread.length > 0 && (
          <p className="text-xs text-rb-500" data-wallet-unread={unread.map((r) => r.id).join(",")}>
            Not read at head: {unread.map(familyChain).join(", ")}. Their cards show the stored figures.
          </p>
        )}
      </div>
    </ProvReceiptsScope>
  );
}
