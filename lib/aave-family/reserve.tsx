"use client";

// The Aave family's reserve page (anatomy M3, ui-jobs 541 and 549): one asset
// in one market at `<market page>/<asset>` (lib/shared/aave-market-configs.ts
// reserveHref), mapped into the shared A3 shell
// (components/shared/product/reserve-page.tsx). It reads the same market
// overview as the market page and draws one reserve from it:
//   head (M3.1, M3.2): the symbol, state tags and "A reserve of <market>"; the
//        band Supplied · Borrowed · Available · Supply rate · Borrow rate ·
//        Utilisation. Available is the Pool's virtual balance on a v3.3+ Pool
//        (else supplied − borrowed). Under it, a deficit of at least
//        DEFICIT_SHOWN_SHARE of the supplied amount, and the remaining borrow
//        capacity (cap less borrowed) where the supply side is closed
//        (borrowRoomShows);
//   M3.3 the rate curve, fed the strategy's constants by value;
//   M3.4 the history, M3.5 the parameters, M3.9 the deficit (on a reserve
//        with a write-off held), M3.6 the change log, M3.7 and M3.8 the
//        largest suppliers and borrowers.
// M3.4 and M3.6 to M3.9 read rails-server's indexed routes
// (lib/api/fetch-aave-reserve-reads.ts), started with the page and apart from
// the head read; a read that fails leaves its section one muted line.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Prov } from "@/components/shared/provenance";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { marketModal, useAaveMarket } from "@/components/shared/aave-market-page";
import { pct, ReserveParameters, reserveFigures, StateTags } from "@/components/shared/aave-reserve-parts";
import { RateCurve } from "@/components/shared/product/rate-curve";
import { ReserveHistoryChart, type HistoryRange } from "@/components/shared/aave-reserve-history";
import { ReserveChangeLog } from "@/components/shared/aave-reserve-tables";
import { HoldersTable } from "@/components/shared/product/position-entry";
import { ReserveDeficitBody, writeOffsCsv } from "@/components/shared/aave-reserve-deficit";
import { deficitFigureProv } from "@/lib/aave-family/deficit-sources";
import { deficitLearnMore } from "@/lib/aave-family/deficit-learn-more";
import { ReservePage, type ReservePageData } from "@/components/shared/product/reserve-page";
import { SuppliedByVaults } from "@/components/shared/product/supplied-by-vaults";
import type { SuppliedByRead } from "@/lib/vaults/supplied-by";
import { suppliedByContent } from "@/lib/vaults/card-words";
import { ethereumVaultRosterHref } from "@/lib/vaults/routes";
import { historyFrom, useReserveReads, type Read, type ReserveHistory } from "@/lib/api/fetch-aave-reserve-reads";
import { heldLine, reserveChanges } from "@/lib/shared/aave-reserve-config-words";
import { holderAmountProv } from "@/lib/shared/aave-reserve-reads-provenance";
import { formatDate } from "@/lib/date";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { aaveMarketConfig, type AaveMarketConfig, type AaveMarketKey } from "@/lib/shared/aave-market-configs";
import { protocolForHref } from "@/lib/shared/protocols";
import { fmtUsd } from "@/lib/aave-v4/format";
import { formatCompact, formatCompactTitled } from "@/lib/shared/format-compact";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { borrowRoomShows, deficitShows, type MarketReserveRow } from "@/lib/shared/aave-market-view";
import type { AaveMarketVocab } from "@/lib/shared/aave-market-provenance";
import type { Loadable, ProductHead, ProductSection, RateCurveModel, Missing } from "@/lib/shared/product/model";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import { contractLinks, sentenceName, RATE_TIP, readAtOf, vocabOf } from "@/lib/aave-family/product";

const NOTE = "text-[13px] text-rb-500";
const RAY = 1e27;

/** Available, with the lines that qualify it under it. */
function AvailableVital({
  r,
  vocab,
  available,
}: {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  available: ReactNode;
}) {
  const usd = (tokens: number) =>
    r.priceUsd != null ? fmtUsd(tokens * r.priceUsd).display : `${formatCompact(tokens)} ${r.symbol}`;
  const c = r.borrowCapState;
  return (
    <>
      {available}
      {deficitShows(r) && (
        <span className="block text-[11px] font-normal text-rb-500" data-reserve-deficit="">
          deficit <Prov info={vocab.reserveDeficitProv(r.symbol, r.priceUsd != null)}>{usd(r.deficit ?? 0)}</Prov>
        </span>
      )}
      {borrowRoomShows(r) && c.state === "used" && (
        <span className="block text-[11px] font-normal text-rb-500" data-reserve-capacity="">
          borrow capacity{" "}
          <Prov info={vocab.reserveBorrowRoomProv(r.symbol, c.cap)}>{usd(Math.max(0, c.cap - r.borrowed))}</Prov>
        </span>
      )}
    </>
  );
}

/** Where the reserve factor history starts: "the 1 Nov 2026 restart". */
function restartWords(h: ReserveHistory): string {
  const at = h.points.find((p) => p.closeBlock >= h.reserveFactor.heldFrom);
  return at ? `the ${formatDate(at.date)} restart` : "the restart";
}

/** One line per reason the loaded days have no utilisation (the route's `why`). */
function gapLines(h: ReserveHistory, label: string, symbol: string): string[] {
  const pts = h.points;
  const out: string[] = [];
  const count = (why: string) => pts.filter((p) => p.why === why).length;
  const days = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "day has" : "days have"}`;
  const before = pts.map((p, i) => [p, i] as const).filter(([p]) => p.why === "rf-before-held");
  if (before.length) {
    const next = pts[before[before.length - 1][1] + 1];
    const restart = next && next.closeBlock >= h.reserveFactor.heldFrom;
    out.push(
      next
        ? `Utilisation before ${formatDate(next.date)} isn't held for ${label} yet: ${restart ? `the reserve factor history starts at ${restartWords(h)}` : "the reserve factor isn't held for those days"}.`
        : `Utilisation isn't held for ${label} yet: the reserve factor history starts at ${restartWords(h)}, and no ${symbol} change has come since.`,
    );
  }
  if (count("gho")) out.push("GHO has no supply side, so its utilisation isn't drawn.");
  const stable = pts.find((p) => p.why === "stable-debt");
  if (stable)
    out.push(
      `Utilisation from ${formatDate(stable.date)} isn't drawn: stable debt may be outstanding, and the rate identity holds only without it.`,
    );
  const zero = count("borrow-rate-zero");
  if (zero) out.push(`${days(zero)} no utilisation: the borrow rate was 0.`);
  const moved = count("rf-changed-between-snapshots");
  if (moved) out.push(`${days(moved)} no utilisation: the reserve factor changed between the stored snapshots.`);
  const full = count("reserve-factor-full");
  if (full) out.push(`${days(full)} no utilisation: the reserve factor was 100%.`);
  return out;
}

const csvRows = (head: string[], rows: (string | number | null)[][]) =>
  [head, ...rows].map((r) => r.map((v) => (v == null ? "" : String(v))).join(",")).join("\n");

/** The curve's constants from the reserve's strategy, or why there are none. */
function curveOf(r: MarketReserveRow, vocab: AaveMarketVocab): RateCurveModel | Missing {
  const rc = r.rateCurve;
  if (!rc || !r.rateStrategy) return { missing: "Curve not read for this strategy." };
  return {
    optimal: Number(rc.optimal) / RAY,
    base: Number(rc.base) / RAY,
    slope1: Number(rc.slope1) / RAY,
    slope2: Number(rc.slope2) / RAY,
    reserveFactor: r.reserveFactor,
    now: {
      utilisation: r.utilization != null && r.supplied > 0 ? r.utilization : null,
      borrow: r.borrowApr,
      supply: r.supplyApr,
    },
    symbol: r.symbol,
    receipt: vocab.reserveCurveProv(r.symbol, { ...rc, strategy: r.rateStrategy }),
  };
}

/** The reserve head's (i). */
function ReserveExplainer({ r, label, vocab }: { r: MarketReserveRow; label: string; vocab: AaveMarketVocab }) {
  const usd = (tokens: number) =>
    r.priceUsd != null ? fmtUsd(tokens * r.priceUsd).display : `${formatCompact(tokens)} ${r.symbol}`;
  const avail = r.virtualBalance ?? Math.max(0, r.supplied - r.borrowed);
  const u = r.utilization != null && r.supplied > 0 ? r.utilization : null;
  const ltv = r.bps?.ltv ?? Math.round((r.ltv ?? 0) * 1e4);
  const lt = r.bps?.lt ?? Math.round((r.lt ?? 0) * 1e4);
  const c = r.borrowCapState;
  return (
    <>
      <ExplainGroup title="This reserve">
        <ExplainBullet>
          {label} holds <Fig bold>{usd(r.supplied)}</Fig> of {r.symbol}
          {r.borrowed > 0 ? (
            <>
              , and borrowers owe <Fig bold>{usd(r.borrowed)}</Fig> of it.
            </>
          ) : (
            ", none of it borrowed."
          )}
        </ExplainBullet>
        <ExplainBullet>
          <Fig bold>{usd(avail)}</Fig> is available to withdraw or borrow now.
          {(deficitShows(r) || (borrowRoomShows(r) && c.state === "used")) && (
            <ul className="mt-1 space-y-1" data-explain-sub="available">
              {deficitShows(r) && (
                <>
                  <ExplainBullet data-explain-deficit="">
                    Deficit{" "}
                    <Prov info={deficitFigureProv(vocab.reserveDeficitProv(r.symbol, r.priceUsd != null))}>
                      <Fig bold>{usd(r.deficit ?? 0)}</Fig>
                    </Prov>{" "}
                    is debt that liquidations wrote off when they left a borrower no collateral.
                  </ExplainBullet>
                  <ExplainBullet>
                    The deficit earns no interest, and stays as written off until it is covered.
                  </ExplainBullet>
                  <ExplainBullet>Only Aave&apos;s Umbrella contract can cover the deficit.</ExplainBullet>
                  <ExplainBullet>
                    The DAO pays a cover up to its set offset; beyond that, Umbrella stakers are slashed.
                  </ExplainBullet>
                </>
              )}
              {borrowRoomShows(r) && c.state === "used" && (
                <ExplainBullet>
                  Borrow capacity <Fig bold>{usd(Math.max(0, c.cap - r.borrowed))}</Fig> is the borrow cap less what is
                  borrowed; new supply is closed.
                </ExplainBullet>
              )}
            </ul>
          )}
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Rates">
        {r.supplied > 0 && (
          <ExplainBullet>
            Suppliers earn <Fig bold>{ratePercentText(r.supplyApr)}</Fig> a year, as an APR.
          </ExplainBullet>
        )}
        {r.borrowed > 0 && (
          <ExplainBullet>
            Borrowers pay <Fig bold>{ratePercentText(r.borrowApr)}</Fig> a year, as an APR.
          </ExplainBullet>
        )}
        {u != null && (
          <ExplainBullet>
            Utilisation <Fig bold>{pct(u)}</Fig> is the share of the supply on loan.
          </ExplainBullet>
        )}
        <ExplainBullet>
          The supply rate is the borrow rate times utilisation, less the {pct(r.reserveFactor)} reserve factor.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Collateral">
        {ltv > 0 ? (
          <ExplainBullet>
            A wallet can borrow up to {(ltv / 100).toFixed(2).replace(/\.?0+$/, "")}% of its {r.symbol} value, and is
            liquidated past {(lt / 100).toFixed(2).replace(/\.?0+$/, "")}%.
          </ExplainBullet>
        ) : (
          <ExplainBullet>Holding {r.symbol} adds nothing to what a wallet can borrow here.</ExplainBullet>
        )}
        {r.frozen && <ExplainBullet>The reserve is frozen: no new supply or borrowing.</ExplainBullet>}
        {r.paused && <ExplainBullet>The reserve is paused: every action is suspended.</ExplainBullet>}
      </ExplainGroup>
    </>
  );
}

function reserveMarkdown(m: AaveMarketConfig, r: MarketReserveRow, block: number): string {
  const usd = (t: number) => (r.priceUsd != null ? fmtUsd(t * r.priceUsd).display : `${formatCompact(t)} ${r.symbol}`);
  return [
    `# ${r.symbol}, a reserve of ${m.marketLabel}`,
    "",
    `- Supplied: ${usd(r.supplied)}`,
    `- Borrowed: ${usd(r.borrowed)}`,
    `- Available: ${usd(r.virtualBalance ?? Math.max(0, r.supplied - r.borrowed))}`,
    `- Supply rate: ${ratePercentText(r.supplyApr)} APR`,
    `- Borrow rate: ${ratePercentText(r.borrowApr)} APR`,
    ...(r.utilization != null && r.supplied > 0 ? [`- Utilisation: ${pct(r.utilization)}`] : []),
    "",
    `Read from the ${chainMeta(m.chainId).name} chain at block ${block.toLocaleString("en-US")}.`,
  ].join("\n");
}

function reserveHead(
  m: AaveMarketConfig,
  r: MarketReserveRow,
  vocab: AaveMarketVocab,
  read: ReturnType<typeof useAaveMarket>,
): ProductHead {
  const z = reserveFigures({ r, vocab });
  const u = r.utilization != null && r.supplied > 0 ? r.utilization : null;
  const explorer = chainMeta(m.chainId).explorerName;
  const links: SectionMenuLink[] = [
    {
      item: "market",
      title: `${m.marketLabel} reserves`,
      subtitle: "The market this reserve sits in",
      href: m.reservesHref,
      internal: true,
    },
    ...(m.assetHref
      ? [
          {
            item: "suppliers",
            title: `${r.symbol} suppliers`,
            subtitle: "Positions supplying this reserve",
            href: m.assetHref(r.symbol, "supply"),
            internal: true,
          },
        ]
      : []),
    {
      item: "asset",
      title: r.symbol,
      subtitle: `${r.symbol} on ${chainMeta(m.chainId).name}, across Rails`,
      href: `/assets/${chainMeta(m.chainId).slug}/${r.address}`,
      internal: true,
    },
    ...contractLinks(m, read),
    {
      item: "token",
      title: `${r.symbol} on ${explorer}`,
      subtitle: "The underlying token",
      href: explorerUrl(m.chainId, "address", r.address),
    },
  ];
  return {
    scope: "reserve-head",
    title: `${r.symbol} reserve`,
    subtitle: (
      <p className="mt-1 text-[13px] text-rb-500">
        A reserve of{" "}
        <Link
          href={m.reservesHref}
          className="text-blue-600 hover:underline dark:text-[var(--text-link)]"
          data-reserve-market-link=""
        >
          {m.marketLabel}
        </Link>
      </p>
    ),
    figures: [
      { slot: "sizeIn", label: "Supplied", value: <span data-vital="supplied">{z.supplied}</span> },
      {
        slot: "sizeOut",
        label: "Borrowed",
        value: <span data-vital="borrowed">{z.borrowed ?? <span className="text-rb-500">none</span>}</span>,
      },
      {
        slot: "sizeFree",
        label: "Available",
        value: (
          <span data-vital="available">
            <AvailableVital r={r} vocab={vocab} available={z.available} />
          </span>
        ),
      },
      {
        slot: "rateIn",
        label: "Supply rate",
        tip: RATE_TIP.supply,
        value: <span data-vital="supply-rate">{z.supplyRate}</span>,
      },
      {
        slot: "rateOut",
        label: "Borrow rate",
        tip: RATE_TIP.borrow,
        value: <span data-vital="borrow-rate">{z.borrowRate}</span>,
      },
      {
        slot: "usage",
        label: "Utilisation",
        tip: "Borrowed ÷ supplied, both traced on this page.",
        value: (
          <span data-prov-exempt="" data-vital="utilisation">
            {u != null ? `${Math.round(u * 100)}%` : "—"}
          </span>
        ),
      },
    ],
    readAt: readAtOf(m, read, `Every ${r.symbol} figure in ${m.marketLabel}`),
    tools: {
      links,
      exports: {
        markdown: {
          build: () => reserveMarkdown(m, r, read.data?.blockNumber ?? 0),
          copySubtitle: "This reserve as Markdown, for an LLM",
        },
      },
    },
    explainer: {
      body: <ReserveExplainer r={r} label={sentenceName(m.marketLabel)} vocab={vocab} />,
      label: "reserve explanation",
    },
    learnMore: null,
    anatomy: "M3.1",
    bandHooks: { "data-anatomy": "M3.2", "data-reserve-vitals": "" },
  };
}

/** What the page's indexed reads hand the sections. */
interface IndexedReads {
  reads: ReturnType<typeof useReserveReads>;
  /** The last history that arrived, kept while a longer span loads. */
  history: ReserveHistory | null;
  range: HistoryRange;
  onRange: (r: HistoryRange) => void;
}

/** M3.9: on a reserve with a write-off held; a skeleton or a failure line
 *  while the read is out only where the head shows a deficit. */
function deficitSection(
  m: AaveMarketConfig,
  r: MarketReserveRow,
  x: IndexedReads,
  vocab: AaveMarketVocab,
  block: number | null,
): ProductSection | null {
  const dr = x.reads.deficit;
  const shell = { scope: "reserve-deficit", anatomy: "M3.9", title: "Deficit", learnMore: deficitLearnMore() };
  if (dr.state === "loading" || dr.state === "error") {
    if (!x.reads.hasDeficit || !((r.deficit ?? 0) > 0)) return null;
    return {
      ...shell,
      tools: {},
      body:
        dr.state === "loading" ? (
          <SkeletonBlock height={240} />
        ) : (
          <p className={NOTE} data-reserve-read-failed="">
            Couldn&apos;t read the write-offs. Reload to retry.
          </p>
        ),
    };
  }
  if (dr.state !== "ok" || dr.data.totals.count === 0) return null;
  const d = dr.data;
  const explorer = chainMeta(m.chainId).explorerName;
  return {
    ...shell,
    tools: {
      exports: {
        csv: {
          filename: `${m.key}-${r.symbol}-write-offs.csv`,
          build: () => writeOffsCsv(d),
          subtitle: "Every write-off held, with its liquidation",
        },
      },
    },
    body: (
      <ReserveDeficitBody
        d={d}
        head={{
          symbol: r.symbol,
          address: r.address,
          priceUsd: r.priceUsd,
          outstanding: r.deficit ?? 0,
          outstandingRaw: r.deficitRaw ?? null,
          block,
          outstandingProv: vocab.reserveDeficitProv(r.symbol, false),
        }}
        ex={{ tx: (h) => explorerUrl(m.chainId, "tx", h), name: explorer }}
        positionHref={(w) => `${m.listingHref}/${w}${m.marketQuery}`}
        heldFrom={m.key === "aave-v3-base" ? BASE_WRITE_OFFS_FROM : null}
      />
    ),
  };
}

/** Base's DeficitCreated rows are held from the 25 Oct 2026 Sieve restart (block 53,080,566). */
const BASE_WRITE_OFFS_FROM = "25 Oct 2026";

function indexedSections(
  m: AaveMarketConfig,
  r: MarketReserveRow,
  x: IndexedReads,
  changes: ReturnType<typeof reserveChanges> | null,
  parameters: ProductSection,
  deficit: ProductSection | null,
): ProductSection[] {
  const chainId: ChainId = m.chainId;
  const { history: hr, changes: cr, holders: hd } = x.reads;
  const chain = chainMeta(chainId).name;
  const h = x.history;
  const dateOf = (block: number) => {
    const p = h?.points.find((q) => q.closeBlock >= block);
    return p && p.date !== h?.points[0]?.date ? formatDate(p.date) : null;
  };
  const unindexed = (q: Read<unknown>) => q.state === "not-held" && q.status === "not-indexed";
  if (unindexed(hr) && unindexed(cr) && unindexed(hd))
    return [
      parameters,
      ...(deficit ? [deficit] : []),
      {
        scope: "reserve-indexed",
        anatomy: "M3.4 M3.6 M3.7 M3.8",
        title: "History, changes and holders",
        tools: {},
        body: (
          <p className={NOTE} data-reserve-not-indexed="">
            Not indexed yet on {chain}.
          </p>
        ),
      },
    ];
  const missing = (q: Read<unknown>, what: string, height: number) =>
    q.state === "loading" ? (
      <SkeletonBlock height={height} />
    ) : q.state === "not-held" ? (
      <p className={NOTE} data-reserve-not-held={q.status}>
        {q.status === "not-ranked" ? "Not ranked yet" : "Not indexed yet"} on {chain}.
      </p>
    ) : (
      <p className={NOTE} data-reserve-read-failed="">
        Couldn&apos;t read the {what}. Reload to retry.
      </p>
    );
  const gaps = h ? gapLines(h, m.marketLabel, r.symbol) : [];
  const history: ProductSection = {
    scope: "reserve-history",
    anatomy: "M3.4",
    title: "History",
    tools: {
      exports: h
        ? {
            csv: {
              filename: `${m.key}-${r.symbol}-history.csv`,
              build: () =>
                csvRows(
                  ["date", "close_block", "borrow_apr", "supply_apr", "utilisation"],
                  h.points.map((p) => [p.date, p.closeBlock, p.borrowApr, p.supplyApr, p.utilisation]),
                ),
              subtitle: "Each day's closing rates and utilisation",
            },
          }
        : undefined,
    },
    body:
      h && (hr.state === "ok" || hr.state === "loading") ? (
        <div className="rounded-lg bg-raised p-4">
          <ReserveHistoryChart
            h={h}
            symbol={r.symbol}
            changes={changes}
            range={x.range}
            onRange={x.onRange}
            loadingAll={hr.state === "loading"}
          />
          {gaps.map((g) => (
            <p key={g} className="mt-2 text-[12px] text-rb-500" data-history-gap-note="">
              {g}
            </p>
          ))}
        </div>
      ) : hr.state === "ok" ? (
        <p className={NOTE}>No rate history held for this reserve.</p>
      ) : (
        missing(hr, "reserve's history", 360)
      ),
  };
  const changeLog: ProductSection = {
    scope: "reserve-changes",
    anatomy: "M3.6",
    title: "Configuration changes",
    tools: {
      exports:
        cr.state === "ok" && changes
          ? {
              csv: {
                filename: `${m.key}-${r.symbol}-changes.csv`,
                build: () =>
                  csvRows(
                    ["timestamp", "block", "transaction", "kind", "change"],
                    changes.map(({ row, words }) => [
                      row.timestamp,
                      row.block,
                      row.txHash,
                      row.kind,
                      `"${words.replace(/"/g, '""')}"`,
                    ]),
                  ),
                subtitle: "Every change held, newest first",
              },
            }
          : undefined,
    },
    body:
      cr.state === "ok" && changes ? (
        <ReserveChangeLog
          changes={changes}
          chainId={chainId}
          held={heldLine(cr.data, dateOf)}
          automatorNote={m.key === "spark"}
          configurator={cr.data.configurator}
        />
      ) : (
        missing(cr, "configuration changes", 240)
      ),
  };
  const holders: ProductSection[] =
    hd.state === "ok"
      ? (["suppliers", "borrowers"] as const).map((side) => {
          const rows = hd.data[side];
          const amountLabel = side === "suppliers" ? "Supplied" : "Borrowed";
          return {
            scope: `reserve-${side}`,
            anatomy: side === "suppliers" ? "M3.7" : "M3.8",
            title: `Largest ${side}`,
            tools: {
              exports: {
                csv: {
                  filename: `${m.key}-${r.symbol}-${side}.csv`,
                  build: () =>
                    csvRows(
                      ["rank", "wallet", "amount_raw", "decimals"],
                      rows.map((x) => [x.rank, x.wallet, x.amount, r.decimals]),
                    ),
                  subtitle: `The ten largest ${side}`,
                },
              },
            },
            body: (
              <HoldersTable
                side={side}
                amountLabel={amountLabel}
                unit={{ symbol: r.symbol, address: r.address }}
                refreshedAt={hd.data.refreshedAt}
                leftOut={hd.data.leftOut?.[side]?.length ?? 0}
                rows={rows.map((x) => {
                  const t = formatCompactTitled(Number(x.amount) / 10 ** r.decimals);
                  return {
                    wallet: x.wallet,
                    rank: x.rank,
                    href: x.positionPath,
                    hooks: { "data-holder-amount": x.amount },
                    amount: (
                      <Prov
                        info={holderAmountProv(
                          side === "suppliers" ? "supplied" : "borrowed",
                          r.symbol,
                          r.decimals,
                          x.wallet,
                          x.amount,
                          hd.data,
                        )}
                      >
                        <span title={t.title}>{t.display}</span>
                      </Prov>
                    ),
                  };
                })}
              />
            ),
          };
        })
      : [
          {
            scope: "reserve-holders",
            anatomy: "M3.7 M3.8",
            title: "Largest suppliers and borrowers",
            tools: {},
            body: missing(hd, "largest suppliers and borrowers", 240),
          },
        ];
  return [history, parameters, ...(deficit ? [deficit] : []), changeLog, ...holders];
}

export function AaveReservePage({ marketKey, asset }: { marketKey: AaveMarketKey; asset: string }) {
  const m = aaveMarketConfig(marketKey);
  const read = useAaveMarket(m);
  const { data, loading, error, view } = read;
  const [range, setRange] = useState<HistoryRange>("1Y");
  const from = useMemo(() => historyFrom(range === "All"), [range]);
  const reads = useReserveReads(m.key, asset, from);
  const [history, setHistory] = useState<ReserveHistory | null>(null);
  const hr = reads.history;
  useEffect(() => {
    if (hr.state === "ok") setHistory(hr.data);
  }, [hr]);
  const cr = reads.changes;
  const r = view?.rows.find((x) => x.address === asset.toLowerCase()) ?? null;
  const changes = useMemo(
    () => (cr.state === "ok" && r ? reserveChanges(cr.data, r.symbol) : null),
    [cr, r?.symbol], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // "Supplied by vaults": Aave's vault roster is on Ethereum and wraps Core.
  const vaultsFor = m.key === "aave-v3" && r ? { address: r.address, symbol: r.symbol, decimals: r.decimals } : null;
  const [vaults, setVaults] = useState<SuppliedByRead | null>(null);
  useEffect(() => {
    if (!vaultsFor) return;
    let live = true;
    const qs = new URLSearchParams({
      asset: vaultsFor.address,
      symbol: vaultsFor.symbol,
      decimals: String(vaultsFor.decimals),
    });
    fetch(`/api/chain/aave-vaults/supplied-by?${qs.toString()}`)
      .then((res) => res.json() as Promise<SuppliedByRead>)
      .then((read) => live && read.asset && setVaults(read))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [vaultsFor?.address, vaultsFor?.symbol, vaultsFor?.decimals]); // eslint-disable-line react-hooks/exhaustive-deps
  const protocol = protocolForHref(m.listingHref);
  if (!protocol) throw new Error(`aave-family reserve: no roster entry for ${m.listingHref}`);
  const vocab = vocabOf(m, read);

  let reserve: Loadable<ReservePageData | null>;
  if (loading && !data) reserve = { state: "loading" };
  else if (error || !view || !vocab)
    reserve = { state: "error", message: error ?? "The RPC read failed: reload to retry." };
  else if (!r) reserve = { state: "ok", data: null };
  else {
    const z = reserveFigures({ r, vocab });
    const explorer = chainMeta(m.chainId).explorerName;
    const curve = curveOf(r, vocab);
    const indexed: IndexedReads = { reads, history, range, onRange: setRange };
    const parameters: ProductSection = {
      scope: "reserve-parameters",
      anatomy: "M3.5",
      title: "Parameters",
      raised: "narrow",
      tools: {
        links: [
          ...(r.oracleSource
            ? [
                {
                  item: "price-source",
                  title: `Price source on ${explorer}`,
                  subtitle: `The feed the oracle reads for ${r.symbol}`,
                  href: explorerUrl(m.chainId, "address", r.oracleSource),
                },
              ]
            : []),
          ...contractLinks(m, read).filter((l) => l.item === "oracle"),
        ],
      },
      body: <ReserveParameters r={r} vocab={vocab} price={z.price} />,
    };
    reserve = {
      state: "ok",
      data: {
        identity: { symbol: r.symbol, address: r.address, tags: <StateTags r={r} vocab={vocab} /> },
        head: reserveHead(m, r, vocab, read),
        sections: [
          {
            scope: "reserve-curve",
            anatomy: "M3.3",
            title: "Rate curve",
            raised: true,
            tools: {
              links: r.rateStrategy
                ? [
                    {
                      item: "strategy",
                      title: `Rate strategy on ${explorer}`,
                      subtitle: `The contract that sets ${r.symbol}'s rates`,
                      href: explorerUrl(m.chainId, "address", r.rateStrategy),
                    },
                  ]
                : [],
            },
            body: <RateCurve curve={curve} />,
          },
          ...indexedSections(
            m,
            r,
            indexed,
            changes,
            parameters,
            deficitSection(m, r, indexed, vocab, read.data?.blockNumber ?? null),
          ),
        ],
      },
    };
  }

  return (
    <ReservePage
      protocol={protocol}
      backHref={m.reservesHref}
      learnMore={marketModal(m)}
      reserve={reserve}
      what="the market"
      missing={{
        line: `${m.marketLabel} has no reserve for ${asset}.`,
        link: { label: `All ${m.marketLabel} reserves`, href: m.reservesHref },
      }}
      hooks={{ "data-reserve-page": asset.toLowerCase(), "data-market": m.key }}
      suppliedBy={
        vaults && r ? (
          <SuppliedByVaults
            read={vaults}
            noun="reserve"
            what={`the ${r.symbol} reserve of ${m.marketLabel}`}
            line={`The static aTokens that supply this reserve and the Umbrella stakes that cover it, largest first.`}
            learnMore={suppliedByContent("aave")}
            links={[
              {
                item: "vault-roster",
                title: "All Aave vaults",
                subtitle: "The roster on Ethereum",
                href: ethereumVaultRosterHref(),
                internal: true,
              },
            ]}
          />
        ) : undefined
      }
    />
  );
}
