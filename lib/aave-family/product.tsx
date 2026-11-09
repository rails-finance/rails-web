"use client";

// The Aave family's product adapter (rails-ops ui-jobs 549 step 1; decision
// 0043 point 2): Aave V3 on Ethereum (Core, Prime, EtherFi), Base and
// Arbitrum, SparkLend and Seamless, mapped into the shared product model
// (lib/shared/product/model.ts) for the shells in components/shared/product/.
// The market read is `buildAaveMarketView` over the market's chain proxy
// (useAaveMarket); every figure is drawn by the family's parts
// (components/shared/aave-reserve-parts.tsx) with its receipt from
// `AaveMarketVocab`. The reserve page is lib/aave-family/reserve.tsx.
//
// Surface rules (decision 0059): house labels, APR in the rate tips, the read
// time in the head's stamp with the block and contracts in its receipt, the
// Pool and oracle pages in the head's ⋮.

import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { readStampProv } from "@/components/shared/read-stamp";
import { Prov } from "@/components/shared/provenance";
import { Ban } from "lucide-react";
import {
  availableTokens,
  CapPill,
  ClassDot,
  CLASS_ORDER,
  Collateral,
  collateralRank,
  CompositionBar,
  HEADER_TIP,
  pct,
  ReserveDetails,
  reserveFigures,
  StateTags,
  UtilBar,
} from "@/components/shared/aave-reserve-parts";
import { marketModal, useAaveMarket, type AaveMarketRead } from "@/components/shared/aave-market-page";
import { MarketPage } from "@/components/shared/product/market-page";
import { MarketRoster } from "@/components/shared/product/market-roster";
import { positionEntry } from "@/components/shared/product/position-entry";
import { fmtUsd } from "@/lib/aave-v4/format";
import { ASSET_CLASS_COLOR, ASSET_CLASS_TITLE } from "@/lib/aave-v4/asset-class";
import {
  aaveMarketContractNames,
  aaveMarketReadContracts,
  aaveMarketVocab,
  type AaveMarketVocab,
} from "@/lib/shared/aave-market-provenance";
import { marketSummaryText, type AaveMarketView } from "@/lib/shared/aave-market-view";
import { reserveHref, type AaveMarketConfig } from "@/lib/shared/aave-market-configs";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";
import { EXPLORERS_WITHOUT_LISTING } from "@/lib/shared/coverage";
import { protocolForHref } from "@/lib/shared/protocols";
import type {
  EntryLink,
  Loadable,
  MarketModel,
  ProductTerms,
  ReadAt,
  ReserveRowModel,
  ReserveTableModel,
  SectionTools,
} from "@/lib/shared/product/model";
import type { SectionMenuLink } from "@/components/shared/section-menu";

export const AAVE_TERMS: ProductTerms = {
  market: { one: "market", many: "markets" },
  reserve: { one: "reserve", many: "reserves" },
  position: { one: "position", many: "positions" },
};

/** The rate tips: the basis goes here, the label stays the house's. */
export const RATE_TIP = {
  supply: "What suppliers earn a year, as an APR (simple, not compounded)",
  borrow: "The variable rate borrowers pay a year, as an APR (simple, not compounded)",
} as const;

/** The vocabulary for a market's read. */
export function vocabOf(m: AaveMarketConfig, read: AaveMarketRead): AaveMarketVocab | null {
  const { data, readBy } = read;
  if (!data) return null;
  return aaveMarketVocab(m.key, {
    readBy,
    blockNumber: data.blockNumber,
    pool: data.pool,
    oracle: data.oracle,
    capAutomator: data.capAutomator,
  });
}

/** The read behind every figure on a market's pages. */
export function readAtOf(m: AaveMarketConfig, read: AaveMarketRead, what: string): ReadAt | null {
  const { data, readBy } = read;
  if (!data || data.chainStale || data.blockNumber <= 0) return null;
  const contracts = aaveMarketReadContracts(m.key, data);
  return {
    chainId: m.chainId,
    block: data.blockNumber,
    readBy,
    receipt: (at) => readStampProv({ chainId: m.chainId, block: data.blockNumber, at, readBy, what, contracts }),
  };
}

/** The Pool and the oracle on the chain's explorer: the ⋮'s off-site rows. */
export function contractLinks(m: AaveMarketConfig, read: AaveMarketRead): SectionMenuLink[] {
  const { data } = read;
  if (!data) return [];
  const explorer = chainMeta(m.chainId).explorerName;
  const names = aaveMarketContractNames(m.key);
  return [
    {
      item: "pool",
      title: `Pool on ${explorer}`,
      subtitle: names.pool,
      href: explorerUrl(m.chainId, "address", data.pool),
    },
    {
      item: "oracle",
      title: `Oracle on ${explorer}`,
      subtitle: names.oracle,
      href: explorerUrl(m.chainId, "address", data.oracle),
    },
  ];
}

/** A market's name inside a sentence: "Aave V3 · Base" reads "Aave V3 on Base". */
export const sentenceName = (label: string) => label.replace(" · ", " on ");

/** Whether the explorer has a listing to send "View all … positions" to. */
const hasListingOf = (m: AaveMarketConfig) => !EXPLORERS_WITHOUT_LISTING.has(m.key);

// ── The head ─────────────────────────────────────────────────────────────────

/** The market head's (i): what the market is, its size and use, how it works. */
function MarketExplainer({ view }: { view: AaveMarketView }) {
  const supplied = fmtUsd(view.suppliedUsd).display;
  const borrowed = fmtUsd(view.borrowedUsd).display;
  const closed = view.rows.filter((r) => r.closed.length > 0).length;
  return (
    <>
      <ExplainGroup title="This market">
        <ExplainBullet>
          {sentenceName(view.label)} is one Pool of <Fig bold>{view.reserveCount}</Fig> reserves.
        </ExplainBullet>
        <ExplainBullet>
          Suppliers have put in <Fig bold>{supplied}</Fig> and borrowers owe <Fig bold>{borrowed}</Fig>.
        </ExplainBullet>
        {view.suppliedUsd > 0 && (
          <ExplainBullet>
            Utilisation <Fig bold>{pct(view.borrowedUsd / view.suppliedUsd)}</Fig> is the share of the supply on loan.
          </ExplainBullet>
        )}
        {closed > 0 && (
          <ExplainBullet>
            <Fig bold>{closed}</Fig> {closed === 1 ? "reserve is" : "reserves are"} closed to some new business, each
            tagged in the table.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="How it works">
        <ExplainBullet>Suppliers earn each reserve&rsquo;s supply rate; borrowers pay its borrow rate.</ExplainBullet>
        <ExplainBullet>A reserve&rsquo;s rates rise with its utilisation, steeply past its kink.</ExplainBullet>
        <ExplainBullet>A wallet borrows against all it supplies here, under one health factor.</ExplainBullet>
      </ExplainGroup>
    </>
  );
}

function marketMarkdown(m: AaveMarketConfig, view: AaveMarketView): string {
  const lines = [
    `# ${view.label}`,
    "",
    view.purpose,
    "",
    `- Reserves: ${view.reserveCount}`,
    `- Supplied: ${fmtUsd(view.suppliedUsd).display}`,
    `- Borrowed: ${fmtUsd(view.borrowedUsd).display}`,
    ...(view.suppliedUsd > 0 ? [`- Utilisation: ${pct(view.borrowedUsd / view.suppliedUsd)}`] : []),
    ...(view.composition.length
      ? [`- Supply mix: ${view.composition.map((c) => `${c.label} ${c.pct}%`).join(", ")}`]
      : []),
    "",
    `Read from the ${chainMeta(m.chainId).name} chain at block ${view.blockNumber.toLocaleString("en-US")}.`,
  ];
  const summary = marketSummaryText(view);
  if (summary) lines.splice(3, 0, summary, "");
  return lines.join("\n");
}

const csvCell = (v: string | number | null | undefined) => {
  const t = v == null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function reservesCsv(view: AaveMarketView): string {
  const head = [
    "symbol",
    "address",
    "supplied",
    "supplied_usd",
    "borrowed",
    "borrowed_usd",
    "available",
    "supply_apr",
    "borrow_apr",
    "ltv",
    "liquidation_threshold",
    "utilisation",
  ];
  const rows = view.rows.map((r) =>
    [
      r.symbol,
      r.address,
      r.supplied,
      r.priceUsd != null ? r.suppliedUsd : "",
      r.borrowed,
      r.priceUsd != null ? r.borrowedUsd : "",
      availableTokens(r),
      r.supplyApr,
      r.borrowApr,
      r.ltv ?? "",
      r.lt ?? "",
      r.utilization ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

/** The head of a market: its panel on the roster (A1) and its page (A2). */
function marketHead(m: AaveMarketConfig, read: AaveMarketRead, view: AaveMarketView, overview: boolean) {
  const vocab = vocabOf(m, read)!;
  const hasListing = hasListingOf(m);
  const supplied = fmtUsd(view.suppliedUsd);
  const borrowed = fmtUsd(view.borrowedUsd);
  const summary = marketSummaryText(view);
  // Absent (rather than 0%) when nothing is supplied to measure against.
  const usage = view.suppliedUsd > 0 ? view.borrowedUsd / view.suppliedUsd : null;
  const entries = [
    overview
      ? { label: `View ${view.label} reserves`, href: m.reservesHref, hooks: { "data-market-reserves-link": "" } }
      : null,
    positionEntry({ href: hasListing ? m.positionsHref : null, name: view.label, noun: AAVE_TERMS.position }),
  ].filter((e): e is EntryLink => e != null);
  const rails: SectionMenuLink[] = [
    ...(overview
      ? [
          {
            item: "reserves",
            title: "Reserves",
            subtitle: `Every ${view.label} reserve`,
            href: m.reservesHref,
            internal: true,
          },
        ]
      : []),
    ...(hasListing
      ? [
          {
            item: "positions",
            title: "Positions",
            subtitle: `Every ${view.label} position`,
            href: m.positionsHref,
            internal: true,
          },
        ]
      : []),
    {
      item: "info",
      title: `About ${m.protocolName}`,
      subtitle: "How it works and how Rails reads it",
      href: `${m.listingHref}/info`,
      internal: true,
    },
  ];
  const tools: SectionTools = {
    links: [...rails, ...contractLinks(m, read), ...(m.offsite ?? [])],
    exports: {
      markdown: { build: () => marketMarkdown(m, view), copySubtitle: "This market as Markdown, for an LLM" },
    },
  };
  return {
    scope: `market-${m.key}`,
    title: view.label,
    titleHref: hasListing ? m.positionsHref : undefined,
    purpose: view.purpose,
    summary: summary ? (
      <p className="mt-3 text-[12px] leading-relaxed text-rb-500" data-market-summary="">
        {summary}
      </p>
    ) : undefined,
    figures: [
      {
        slot: "roster" as const,
        label: "Reserves",
        value: <Prov info={vocab.reserveCountProv()}>{view.reserveCount}</Prov>,
      },
      {
        slot: "sizeIn" as const,
        label: "Supplied",
        value: <Prov info={vocab.marketTotalProv("supplied")}>{supplied.display}</Prov>,
        tip: supplied.title,
      },
      {
        slot: "sizeOut" as const,
        label: "Borrowed",
        value: <Prov info={vocab.marketTotalProv("borrowed")}>{borrowed.display}</Prov>,
        tip: borrowed.title,
      },
      ...(usage != null
        ? [
            {
              slot: "usage" as const,
              label: "Utilisation",
              // A ratio of the two receipted figures beside it: exempt from the
              // coverage tripwire, like the per-row utilisation.
              value: <span data-prov-exempt="">{pct(usage)}</span>,
              tip: "Borrowed ÷ supplied, both in USD at the market's oracle price: the two figures beside it in this band.",
            },
          ]
        : []),
    ],
    aside:
      view.composition.length > 0 ? (
        <>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-rb-500">Supply mix</div>
          <CompositionBar composition={view.composition} />
        </>
      ) : undefined,
    entries,
    readAt: readAtOf(m, read, `Every figure in ${view.label}`),
    tools,
    explainer: { body: <MarketExplainer view={view} />, label: "Show market explanation" },
    bandHooks: { "data-market-panel": view.protocol },
  };
}

// ── The reserves table ───────────────────────────────────────────────────────

const NUM = "tabular-nums text-[13px]";
const RATE = "whitespace-nowrap tabular-nums text-[13px] text-foreground/80";

function reserveRows(m: AaveMarketConfig, view: AaveMarketView, vocab: AaveMarketVocab): ReserveRowModel[] {
  return view.rows.map((r) => {
    const z = reserveFigures({ r, vocab, assetHref: m.assetHref });
    const availTokens = availableTokens(r);
    return {
      key: r.address,
      href: reserveHref(m, r.address),
      group: r.cls,
      asset: {
        symbol: r.symbol,
        address: r.address,
        tags: <StateTags r={r} vocab={vocab} />,
        sub: (
          <div className="flex items-center gap-1 text-[11px] text-rb-500" title={r.classLabel}>
            <ClassDot cls={r.cls} />
            <span className="truncate">{r.classLabel}</span>
          </div>
        ),
        details: <ReserveDetails r={r} vocab={vocab} price={z.price} />,
      },
      cells: {
        supplied: {
          sort: [r.suppliedUsd, r.supplied],
          node: (
            <>
              <div>{z.supplied}</div>
              <CapPill side="supply" c={r.supplyCapState} r={r} vocab={vocab} />
            </>
          ),
        },
        borrowed: {
          sort: [r.borrowedUsd, r.borrowed],
          node: (
            <>
              <div>
                {z.borrowed ??
                  (!r.borrowEnabled ? (
                    // Structurally not borrowable: a no-entry mark, apart from a
                    // borrowable reserve with no draws.
                    <span
                      className="inline-flex items-center justify-end gap-1 text-rb-500/70"
                      title="Not borrowable in this market"
                    >
                      <Ban className="h-3.5 w-3.5" aria-label="Not borrowable" />
                    </span>
                  ) : (
                    <span className="text-rb-500">no borrows</span>
                  ))}
              </div>
              {(z.borrowed != null || r.borrowEnabled) && (
                <CapPill side="borrow" c={r.borrowCapState} r={r} vocab={vocab} />
              )}
            </>
          ),
        },
        available: {
          sort: [availTokens * (r.priceUsd ?? 0), availTokens],
          title: r.virtualBalance != null ? "The Pool's balance of this reserve" : "Supplied less borrowed",
          node: z.available,
        },
        supplyRate: { sort: r.supplyApr, title: `Supply rate: ${RATE_TIP.supply.toLowerCase()}`, node: z.supplyRate },
        borrowRate: { sort: r.borrowApr, title: `Borrow rate: ${RATE_TIP.borrow.toLowerCase()}`, node: z.borrowRate },
        collateral: { sort: collateralRank(r), node: <Collateral r={r} vocab={vocab} /> },
        util: { sort: r.utilization ?? -1, node: <UtilBar r={r} /> },
      },
    };
  });
}

function reservesTable(m: AaveMarketConfig, read: AaveMarketRead, view: AaveMarketView): ReserveTableModel {
  const vocab = vocabOf(m, read)!;
  const scope = `reserves-${m.key}`;
  return {
    scope,
    title: "Reserves",
    line: (
      <>
        Every reserve on the Pool, filter by class, sort any column. Rates, caps and risk parameters are the
        configuration the Pool enforces; USD is the market&apos;s oracle price. A cap shows under its size once 90% of
        it is in use. The bar is utilisation, and its tick is the rate model&apos;s kink. A row opens its reserve&apos;s
        page; Details opens its parameters in place.
      </>
    ),
    label: `${view.label} reserves`,
    anatomy: "M1",
    assetLabel: "Asset",
    tableClassName: "lg:min-w-[900px]",
    columns: [
      { key: "supplied", label: "Supplied", align: "right", className: NUM },
      { key: "borrowed", label: "Borrowed", align: "right", className: NUM },
      {
        key: "available",
        label: "Available",
        align: "right",
        className: NUM,
        tip: HEADER_TIP.available,
        hooks: { "data-available": "" },
      },
      {
        key: "supplyRate",
        label: "Supply rate",
        align: "right",
        className: RATE,
        tip: HEADER_TIP.supplyRate,
        hooks: { "data-rate": "supply" },
      },
      {
        key: "borrowRate",
        label: "Borrow rate",
        align: "right",
        className: RATE,
        tip: HEADER_TIP.borrowRate,
        hooks: { "data-rate": "borrow" },
      },
      {
        key: "collateral",
        label: "Collateral",
        align: "right",
        className: RATE,
        tip: HEADER_TIP.collateral,
        hooks: { "data-collateral": "" },
      },
      {
        key: "util",
        label: "Utilisation",
        className: "lg:w-[180px] lg:min-w-[112px]",
        wide: true,
        tip: HEADER_TIP.util,
      },
    ],
    rows: reserveRows(m, view, vocab),
    groups: CLASS_ORDER.map((c) => ({ key: c, label: ASSET_CLASS_TITLE[c], color: ASSET_CLASS_COLOR[c] })),
    groupLabel: "Class",
    defaultSort: { key: "supplied", dir: "desc" },
    emptyFiltered: "No reserves match this filter.",
    tools: {
      links: hasListingOf(m)
        ? [
            {
              item: "positions",
              title: "Positions",
              subtitle: `Every ${view.label} position`,
              href: m.positionsHref,
              internal: true,
            },
          ]
        : [],
      exports: {
        csv: {
          filename: `${m.key}-reserves.csv`,
          build: () => reservesCsv(view),
          subtitle: "Every reserve, figures unrounded",
        },
      },
    },
  };
}

// ── The market's read as a model ─────────────────────────────────────────────

export function aaveMarketModel(m: AaveMarketConfig, read: AaveMarketRead, overview: boolean): Loadable<MarketModel> {
  const { data, loading, error, view } = read;
  if (loading && !data) return { state: "loading" };
  if (error || !view) return { state: "error", message: error ?? "The RPC read failed: reload to retry." };
  return {
    state: "ok",
    data: { head: marketHead(m, read, view, overview), reserves: reservesTable(m, read, view) },
  };
}

/** One market on the roster: its panel, read through its own proxy. */
function useOverviewMarket(m: AaveMarketConfig): Loadable<MarketModel> {
  return aaveMarketModel(m, useAaveMarket(m), true);
}

const protocolOf = (m: AaveMarketConfig) => {
  const p = protocolForHref(m.listingHref);
  if (!p) throw new Error(`aave-family product: no roster entry for ${m.listingHref}`);
  return p;
};

/** A market's page (A2): its head, then its reserves. */
export function AaveMarketPage({ market: m }: { market: AaveMarketConfig }) {
  const read = useAaveMarket(m);
  return (
    <MarketPage
      header={{
        protocol: protocolOf(m),
        title: m.reservesHref.includes("?market=")
          ? `${m.marketLabel.replace(/^Aave V3 /, "")} market`
          : "Market overview",
        learnMore: marketModal(m),
      }}
      market={aaveMarketModel(m, read, false)}
      what={m.marketLabel}
    />
  );
}

/** The roster of several Pools on one route (A1, anatomy M4): Aave V3 on
 *  Ethereum's Core, Prime and EtherFi, a panel each. */
export function AaveMarketsOverview({ markets }: { markets: readonly AaveMarketConfig[] }) {
  const byKey = new Map(markets.map((m) => [m.key, m]));
  const useMarket = (k: string) => useOverviewMarket(byKey.get(k as AaveMarketConfig["key"])!);
  return (
    <MarketRoster
      header={{ protocol: protocolOf(markets[0]), title: "Market overview", learnMore: marketModal(markets[0]) }}
      markets={markets.map((m) => ({ key: m.key, name: m.marketLabel }))}
      useMarket={useMarket}
    />
  );
}
