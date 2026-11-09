"use client";

// Dolomite's product adapter (rails-ops ui-jobs 549/550; decision 0059):
// the markets read (`loadDolomiteMarkets`, one head-block read of
// DolomiteMargin) mapped into the shared product model for the A2 market page
// shell. Dolomite is one pool, so it has no roster (A1): its Markets tab opens
// this page. Its markets have no page of their own yet, so rows link nowhere.
//
// Surface rules (decision 0059): house labels, APR in the rate tips, function
// names only in receipts, the read time in the head's stamp with the block and
// contracts in its receipt, the core on Etherscan in the head's ⋮. A market's
// id and token address are its asset cell's receipt. A shared price feed is a
// tag on the row. The account-level override and the shared-price check live
// on the info page ("How Rails reads it").

import type { ReactNode } from "react";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { readStampProv } from "@/components/shared/read-stamp";
import { Prov } from "@/components/shared/provenance";
import { MarketPage } from "@/components/shared/product/market-page";
import { DATA_TABLE_PILL } from "@/components/shared/data-table/data-table";
import { positionEntry } from "@/components/shared/product/position-entry";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import { formatTinyNonZero } from "@/lib/utils/format";
import { DOLOMITE_ADDRESSES, formatDolomitePrice } from "@/lib/dolomite/asset-catalog";
import {
  type DolomiteMarketCoords,
  dolGlobalMinProv,
  dolGlobalSpreadProv,
  dolMarginPremiumProv,
  dolMarketIdentityProv,
  dolMarketPriceProv,
  dolMarketSpreadProv,
  dolMarketValueProv,
  dolMinCollatProv,
  dolRateProv,
  dolRosterCountProv,
  dolSpreadPremiumProv,
  dolSummaryValueProv,
} from "@/lib/dolomite/markets-provenance";
import type { DolomiteMarketRow, DolomiteMarketsResponse } from "@/lib/sources/chain/dolomite-markets";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { dolomiteEventFallbackContent } from "@/lib/shared/learn-more-content";
import { serverReadAt, type ServerRead } from "@/lib/shared/server-head-read";
import type {
  EntryLink,
  Loadable,
  MarketModel,
  ProductHead,
  ProductTerms,
  ReadAt,
  ReserveRowModel,
  ReserveTableModel,
} from "@/lib/shared/product/model";

export const DOLOMITE_TERMS: ProductTerms = {
  market: { one: "market", many: "markets" },
  reserve: { one: "market", many: "markets" },
  position: { one: "position", many: "positions" },
};

const LISTING = "/ethereum/dolomite";
const DOCS = "https://docs.dolomite.io";

/** The rate tips: the basis here, the label the house's. */
const RATE_TIP = {
  supply: "What suppliers earn a year, as an APR (simple, not compounded)",
  borrow: "What borrowers pay a year, as an APR (simple, not compounded)",
} as const;

const TIP = {
  collateral:
    "The collateral an account needs against a loan that uses this market: the global minimum, raised by the market's margin premium",
  price: "The price Dolomite values and liquidates this market at",
  spread:
    "The liquidation penalty on this market: the extra collateral a liquidator takes, which the borrower bears. The global spread, raised by the market's spread premium",
  util: "Borrowed ÷ supplied",
  premiums: "Markets that raise the collateral an account needs when it holds or borrows them",
  closing: "Markets that take no new borrowing; existing loans still run and the supply still earns",
} as const;

// ── Formats ──────────────────────────────────────────────────────────────────

const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);
/** A premium without trailing zeros ("200%", "27.5%"). */
const premiumText = (f: number) => `${Number((f * 100).toFixed(1))}%`;
const usd = (v: number | null): string =>
  v == null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
const tokenAmount = (v: number, symbol: string): string => {
  const n =
    v === 0
      ? "0"
      : Math.abs(v) < 0.001
        ? formatTinyNonZero(v)
        : v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 });
  return `${n} ${symbol}`;
};
/** The full figure above $1k, two decimals from $1, four significant digits below. */
function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${formatDolomitePrice(n)}`;
}

const NUM = "tabular-nums text-[13px] text-foreground/80";
const SUB = "mt-1 whitespace-nowrap text-[10px] font-normal text-rb-500";
const DASH = <span className="text-rb-500">—</span>;

// ── Cells ────────────────────────────────────────────────────────────────────

/** A compact fill bar: decorative, beside a figure already traced. */
function MiniBar({ frac, title }: { frac: number; title: string }) {
  const clamped = Math.max(0, Math.min(1, frac));
  return (
    <span className="inline-flex items-center gap-1.5" data-prov-exempt="" title={title}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-foreground/10">
        <span className="block h-full rounded-full bg-foreground/50" style={{ width: `${clamped * 100}%` }} />
      </span>
    </span>
  );
}

/** Utilisation: a ratio of the row's two traced sizes, so exempt. */
function UtilMini({ m }: { m: DolomiteMarketRow }) {
  if (m.utilisation == null || m.totalBorrowUsd == null || m.totalBorrowUsd <= 0)
    return <span className="text-[12px] text-rb-500">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5" data-prov-exempt="" title={TIP.util}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-foreground/10">
        <span
          className="block h-full rounded-full bg-foreground/50"
          style={{ width: `${Math.max(0, Math.min(1, m.utilisation)) * 100}%` }}
        />
      </span>
      <span className="tabular-nums text-[11px] text-rb-500">{pctText(m.utilisation, 0)}</span>
    </span>
  );
}

/** A row's state tags: closing, and a shared price feed. */
function Tags({ m }: { m: DolomiteMarketRow }) {
  return (
    <>
      {m.isClosing && (
        <span
          className={`${DATA_TABLE_PILL} px-1 py-px text-[10px] uppercase tracking-wide`}
          title="Closing: no new borrowing; existing loans still run and the supply still earns"
          data-dolomite-closing=""
        >
          closing
        </span>
      )}
      {m.priceAliasOf && (
        <span
          className={`${DATA_TABLE_PILL} whitespace-nowrap px-1 py-px text-[10px] font-normal`}
          title={`This market uses ${m.priceAliasOf.symbol}'s price, so the two cannot diverge on Dolomite.`}
          data-dolomite-priced-as={m.priceAliasOf.symbol}
        >
          priced as {m.priceAliasOf.symbol}
        </span>
      )}
    </>
  );
}

function marketRow(m: DolomiteMarketRow, axisMax: number, block: number, readBy: ServerRead | undefined) {
  const coords: DolomiteMarketCoords = { blockNumber: block, marketId: m.marketId, symbol: m.symbol, readBy };
  const row: ReserveRowModel = {
    key: String(m.marketId),
    asset: {
      symbol: m.symbol,
      address: m.token,
      receipt: dolMarketIdentityProv(m.token, coords),
      tags: <Tags m={m} />,
      // Dolomite's own key: the symbol space collides on purpose (rUSD, srUSD,
      // wsrUSD, cUSD, stcUSD).
      sort: m.marketId,
    },
    hooks: { "data-dolomite-market": String(m.marketId) },
    cells: {
      collateral: {
        sort: m.minCollateralization,
        node: (
          <>
            <Prov info={dolMinCollatProv(coords)}>{pctText(m.minCollateralization, 1)}</Prov>
            <div className="mt-1 flex items-center gap-1.5">
              <MiniBar
                frac={m.minCollateralization / axisMax}
                title={`${pctText(m.minCollateralization, 1)} minimum collateralisation, on one axis for every market`}
              />
              <span className="whitespace-nowrap text-[10px] font-normal text-rb-500">
                {m.marginPremium > 0 ? (
                  <Prov info={dolMarginPremiumProv(coords)}>+{premiumText(m.marginPremium)} margin premium</Prov>
                ) : (
                  "no margin premium"
                )}
              </span>
            </div>
          </>
        ),
      },
      price: {
        sort: m.priceUsd ?? -1,
        node: m.priceUsd != null ? <Prov info={dolMarketPriceProv(coords)}>{fmtPrice(m.priceUsd)}</Prov> : DASH,
      },
      supplied: {
        sort: m.totalSupplyUsd ?? -1,
        title: `${tokenAmount(m.totalSupplyUnderlying, m.symbol)} supplied`,
        node: <Prov info={dolMarketValueProv("supplied", coords)}>{usd(m.totalSupplyUsd)}</Prov>,
      },
      borrowed: {
        sort: m.totalBorrowUsd ?? -1,
        title: `${tokenAmount(m.totalBorrowUnderlying, m.symbol)} borrowed`,
        node: <Prov info={dolMarketValueProv("borrowed", coords)}>{usd(m.totalBorrowUsd)}</Prov>,
      },
      borrowRate: {
        sort: m.borrowAprPct ?? -1,
        title: `Borrow rate: ${RATE_TIP.borrow.toLowerCase()}`,
        node:
          m.borrowAprPct != null ? (
            <Prov info={dolRateProv("borrow", coords)}>{m.borrowAprPct.toFixed(2)}%</Prov>
          ) : (
            DASH
          ),
      },
      supplyRate: {
        sort: m.supplyAprPct ?? -1,
        title: `Supply rate: ${RATE_TIP.supply.toLowerCase()}`,
        node:
          m.supplyAprPct != null ? (
            <Prov info={dolRateProv("supply", coords)}>{m.supplyAprPct.toFixed(2)}%</Prov>
          ) : (
            DASH
          ),
      },
      spread: {
        sort: m.liquidationSpread,
        node: (
          <>
            <Prov info={dolMarketSpreadProv(coords)}>{pctText(m.liquidationSpread, 1)}</Prov>
            <div className={SUB}>
              {m.spreadPremium > 0 ? (
                <Prov info={dolSpreadPremiumProv(coords)}>+{premiumText(m.spreadPremium)} spread premium</Prov>
              ) : (
                "no spread premium"
              )}
            </div>
          </>
        ),
      },
      util: { sort: m.utilisation ?? -1, node: <UtilMini m={m} /> },
    },
  };
  return row;
}

// ── Exports ──────────────────────────────────────────────────────────────────

const csvCell = (v: string | number | null | undefined) => {
  const t = v == null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function marketsCsv(data: DolomiteMarketsResponse): string {
  const head = [
    "market_id",
    "symbol",
    "token",
    "min_collateralisation",
    "margin_premium",
    "price_usd",
    "supplied",
    "supplied_usd",
    "borrowed",
    "borrowed_usd",
    "borrow_apr_pct",
    "supply_apr_pct",
    "liquidation_spread",
    "spread_premium",
    "utilisation",
    "closing",
    "priced_as",
  ];
  const rows = data.markets.map((m) =>
    [
      m.marketId,
      m.symbol,
      m.token,
      m.minCollateralization,
      m.marginPremium,
      m.priceUsd,
      m.totalSupplyUnderlying,
      m.totalSupplyUsd,
      m.totalBorrowUnderlying,
      m.totalBorrowUsd,
      m.borrowAprPct,
      m.supplyAprPct,
      m.liquidationSpread,
      m.spreadPremium,
      m.utilisation,
      m.isClosing ? "yes" : "",
      m.priceAliasOf?.symbol ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

function marketsMarkdown(data: DolomiteMarketsResponse): string {
  const s = data.summary;
  const r = data.risk;
  return [
    "# Dolomite markets",
    "",
    `Dolomite is one lending pool of ${s.total} markets on Ethereum.`,
    "",
    `- Markets listed: ${s.total}`,
    `- Supplied: ${usd(s.totalSuppliedUsd)}`,
    `- Borrowed: ${usd(s.totalBorrowedUsd)}`,
    `- Utilisation: ${pctText(s.utilisation)}`,
    `- Markets with a margin premium: ${s.withPremium}`,
    ...(s.closing > 0 ? [`- Markets closed to new borrowing: ${s.closing}`] : []),
    `- Global minimum collateralisation: ${pctText(1 + r.marginRatio, 2)}`,
    `- Global liquidation spread: ${pctText(r.liquidationSpread, 0)}`,
    "",
    "| Asset | Min collateralisation | Price | Supplied | Borrowed | Borrow rate | Supply rate | Spread | Utilisation |",
    "|---|---|---|---|---|---|---|---|---|",
    ...data.markets.map(
      (m) =>
        `| ${m.symbol}${m.priceAliasOf ? ` (priced as ${m.priceAliasOf.symbol})` : ""}${m.isClosing ? " (closing)" : ""} | ${pctText(m.minCollateralization)} | ${m.priceUsd != null ? fmtPrice(m.priceUsd) : "—"} | ${usd(m.totalSupplyUsd)} | ${usd(m.totalBorrowUsd)} | ${m.borrowAprPct != null ? `${m.borrowAprPct.toFixed(2)}%` : "—"} | ${m.supplyAprPct != null ? `${m.supplyAprPct.toFixed(2)}%` : "—"} | ${pctText(m.liquidationSpread)} | ${pctText(m.utilisation, 0)} |`,
    ),
    "",
    `Read from Ethereum at block ${data.blockNumber.toLocaleString("en-US")}. Rates are APRs.`,
  ].join("\n");
}

// ── The head ─────────────────────────────────────────────────────────────────

/** The head's (i): a first draft to the charter, polished by /newcomer-review. */
function MarketsExplainer({ data, coords }: { data: DolomiteMarketsResponse; coords: DolomiteMarketCoords }) {
  const s = data.summary;
  return (
    <>
      <ExplainGroup title="Size">
        <ExplainBullet>
          Dolomite is one lending pool of <Fig bold>{s.total}</Fig> markets.
        </ExplainBullet>
        <ExplainBullet>
          Suppliers have put in <Fig bold>{usd(s.totalSuppliedUsd)}</Fig> and borrowers owe{" "}
          <Fig bold>{usd(s.totalBorrowedUsd)}</Fig>.
        </ExplainBullet>
        {s.utilisation != null && (
          <ExplainBullet>
            Utilisation <Fig bold>{pctText(s.utilisation)}</Fig> is the share of the supply on loan.
          </ExplainBullet>
        )}
        <ExplainBullet>
          Anyone can supply an asset to earn interest, or borrow one against what they supply.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Collateral" data-dolomite-premiums="">
        <ExplainBullet>
          An account needs collateral worth{" "}
          <Fig bold>
            <Prov info={dolGlobalMinProv(coords)}>{pctText(1 + data.risk.marginRatio, 2)}</Prov>
          </Fig>{" "}
          of its debt.
        </ExplainBullet>
        {s.withPremium > 0 && (
          <ExplainBullet>
            <Fig bold>{s.withPremium}</Fig> markets carry a margin premium, which raises the minimum collateral for any
            loan that uses them.
          </ExplainBullet>
        )}
        <ExplainBullet>
          Some accounts carry special collateral terms; the table shows each market&rsquo;s standard terms.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Liquidation">
        <ExplainBullet>An account below its minimum can be liquidated.</ExplainBullet>
        <ExplainBullet>
          The liquidator repays its debt and takes collateral worth{" "}
          <Fig bold>
            <Prov info={dolGlobalSpreadProv(coords)}>{pctText(data.risk.liquidationSpread, 0)}</Prov>
          </Fig>{" "}
          more, a penalty the borrower bears.
        </ExplainBullet>
        <ExplainBullet>
          A market&rsquo;s spread premium raises the liquidation penalty when its collateral is taken.
        </ExplainBullet>
      </ExplainGroup>
      {s.closing > 0 && (
        <ExplainGroup title="Closing">
          <ExplainBullet>
            <Fig bold>{s.closing}</Fig> {s.closing === 1 ? "market is" : "markets are"} closed to new borrowing;
            existing loans still run and the supply still earns.
          </ExplainBullet>
        </ExplainGroup>
      )}
    </>
  );
}

function head(data: DolomiteMarketsResponse, readBy: ServerRead | undefined): ProductHead {
  const s = data.summary;
  const coords: DolomiteMarketCoords = { blockNumber: data.blockNumber, readBy };
  const block = data.blockNumber;
  const readAt: ReadAt | null =
    block > 0
      ? {
          chainId: MAINNET_CHAIN_ID,
          block,
          readBy,
          receipt: (at) =>
            readStampProv({
              chainId: MAINNET_CHAIN_ID,
              block,
              at,
              readBy,
              what: "Every figure on Dolomite's markets page",
              contracts: [
                {
                  name: "DolomiteMargin",
                  address: DOLOMITE_ADDRESSES.MARGIN,
                  reads:
                    "getNumMarkets(), getMarginRatio(), getLiquidationSpread(), getEarningsRate(), getDefaultAccountRiskOverrideSetter(); per market getMarketTokenAddress, getMarketPrice, getMarketMarginPremium, getMarketSpreadPremium, getMarketTotalPar, getMarketCurrentIndex, getMarketInterestRate, getMarketIsClosing",
                },
                ...(data.risk.overrideSetter
                  ? [
                      {
                        name: "DefaultAccountRiskOverrideSetter",
                        address: data.risk.overrideSetter,
                        reads:
                          "named by DolomiteMargin; its terms are per account, read by getAccountRiskOverrideByAccount on each position page",
                      },
                    ]
                  : []),
              ],
            }),
        }
      : null;
  const links: SectionMenuLink[] = [
    {
      item: "positions",
      title: "All Dolomite positions",
      subtitle: "Every account, open or closed",
      href: LISTING,
      internal: true,
    },
    {
      item: "info",
      title: "About Dolomite",
      subtitle: "How it works and how Rails reads it",
      href: `${LISTING}/info`,
      internal: true,
    },
    {
      item: "margin",
      title: "DolomiteMargin on Etherscan",
      subtitle: "The contract every market lives in",
      href: explorerUrl(MAINNET_CHAIN_ID, "address", DOLOMITE_ADDRESSES.MARGIN),
    },
    { item: "docs", title: "Dolomite's docs", subtitle: "docs.dolomite.io", href: DOCS },
  ];
  const entries = [positionEntry({ href: LISTING, name: "Dolomite", noun: DOLOMITE_TERMS.position })].filter(
    (e): e is EntryLink => e != null,
  );
  return {
    scope: "market-dolomite",
    title: "Dolomite",
    titleHref: LISTING,
    purpose: "Every asset Dolomite lists on Ethereum, each a market in one lending pool.",
    figures: [
      {
        slot: "roster",
        label: "Markets listed",
        value: <Prov info={dolRosterCountProv(coords)}>{s.total}</Prov>,
      },
      {
        slot: "sizeIn",
        label: "Supplied",
        value: <Prov info={dolSummaryValueProv("supplied", coords)}>{usd(s.totalSuppliedUsd)}</Prov>,
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        value: <Prov info={dolSummaryValueProv("borrowed", coords)}>{usd(s.totalBorrowedUsd)}</Prov>,
      },
      {
        slot: "usage",
        label: "Utilisation",
        // A ratio of the two traced figures beside it.
        value: <span data-prov-exempt="">{pctText(s.utilisation)}</span>,
        tip: "Borrowed ÷ supplied, both in USD at Dolomite's prices: the two figures beside it in this band.",
      },
    ],
    // Counts over each market's traced premium and closing reads: exempt, since
    // one receipt would claim them as a single read.
    notes: (
      <>
        <span data-prov-exempt="" title={TIP.premiums}>
          <span className="text-foreground">{s.withPremium}</span> carry a margin premium
        </span>
        {s.closing > 0 && (
          <span data-prov-exempt="" title={TIP.closing}>
            <span className="text-foreground">{s.closing}</span> closed to new borrowing
          </span>
        )}
      </>
    ),
    entries,
    readAt,
    tools: {
      links,
      exports: {
        markdown: { build: () => marketsMarkdown(data), copySubtitle: "Every market as Markdown, for an LLM" },
        csv: {
          filename: "dolomite-markets.csv",
          build: () => marketsCsv(data),
          subtitle: "Every market, figures unrounded",
        },
      },
    },
    explainer: { body: <MarketsExplainer data={data} coords={coords} />, label: "markets explanation" },
    bandHooks: { "data-dolomite-vitals": "" },
  };
}

// ── The table ────────────────────────────────────────────────────────────────

function table(data: DolomiteMarketsResponse, readBy: ServerRead | undefined): ReserveTableModel {
  const baseline = 1 + data.risk.marginRatio;
  const axisMax = Math.max(baseline, ...data.markets.map((m) => m.minCollateralization), 1);
  const R = "right" as const;
  return {
    scope: "markets-dolomite",
    title: "All markets",
    line: "Every market in the pool; sort any column. A premium shows under the figure it raises.",
    label: "Dolomite markets",
    anatomy: "M1",
    assetLabel: "Asset",
    tableClassName: "lg:min-w-[980px]",
    columns: [
      {
        key: "collateral",
        label: "Min collateralisation",
        className: NUM,
        tip: TIP.collateral,
        hooks: { "data-collateral": "" },
      },
      { key: "price", label: "Price", align: R, className: NUM, tip: TIP.price },
      { key: "supplied", label: "Supplied", align: R, className: NUM },
      { key: "borrowed", label: "Borrowed", align: R, className: NUM },
      {
        key: "borrowRate",
        label: "Borrow rate",
        align: R,
        className: NUM,
        tip: RATE_TIP.borrow,
        hooks: { "data-rate": "borrow" },
      },
      {
        key: "supplyRate",
        label: "Supply rate",
        align: R,
        className: NUM,
        tip: RATE_TIP.supply,
        hooks: { "data-rate": "supply" },
      },
      { key: "spread", label: "Spread", align: R, className: NUM, tip: TIP.spread },
      { key: "util", label: "Utilisation", wide: true, tip: TIP.util },
    ],
    rows: data.markets.map((m) => marketRow(m, axisMax, data.blockNumber, readBy)),
    defaultSort: { key: "supplied", dir: "desc" },
    emptyFiltered: "No markets match this filter.",
    tools: {
      links: [
        {
          item: "positions",
          title: "All Dolomite positions",
          subtitle: "Every account, open or closed",
          href: LISTING,
          internal: true,
        },
      ],
      exports: {
        csv: {
          filename: "dolomite-markets.csv",
          build: () => marketsCsv(data),
          subtitle: "Every market, figures unrounded",
        },
      },
    },
  };
}

// ── The page ─────────────────────────────────────────────────────────────────

export function dolomiteMarketModel(data: DolomiteMarketsResponse): Loadable<MarketModel> {
  if (data.chainStale || data.blockNumber <= 0)
    return { state: "error", message: "The market list could not be read at this block." };
  const readBy = serverReadAt(data.head, data.blockNumber) ?? undefined;
  return { state: "ok", data: { head: head(data, readBy), reserves: table(data, readBy) } };
}

const PROTOCOL = protocolForHref(LISTING)!;

/** Dolomite's markets page (A2): its head, then every market. */
export function DolomiteMarketsPage({ data }: { data: DolomiteMarketsResponse }): ReactNode {
  return (
    <MarketPage
      header={{ protocol: PROTOCOL, title: "Markets", learnMore: dolomiteEventFallbackContent() }}
      market={dolomiteMarketModel(data)}
      what="Dolomite's markets"
    />
  );
}
