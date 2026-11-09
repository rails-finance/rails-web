"use client";

// f(x)'s product adapter (rails-ops ui-jobs 549/550; decision 0059): the pools
// read (`loadFxSystemFromChain`, one pinned-block read of both pools) mapped
// into the shared product model. `/ethereum/fx/pools` is the roster (A1), one
// head per pool; `/ethereum/fx/pools/<pool>` is the pool's page (A2), its head
// then f(x)'s sections: the oracle's prices, the tick ladder, the
// reconciliation, funding and fees, capacity, and the ticks. "Pools" is f(x)'s
// noun (decision 0059 point 8); a pool's key (`wsteth`, `wbtc`) is its slug.
//
// Surface rules (decision 0059): house labels where the measure is the same
// (Supplied, Borrowed), f(x)'s words where it differs (Debt ratio, Funding
// rate, rebalance and liquidation); ticks, the two keeper lines and the
// oracle's prices on the head's structure slot. Contract and function names,
// raw share integers and the read path live in receipts; the contracts Rails
// reads are on the info page ("How Rails reads it").

import { useEffect, useState, type ReactNode } from "react";
import { AssetUnit } from "@/components/shared/asset-unit";
import { AmountText } from "@/components/shared/amount-text";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { Prov } from "@/components/shared/provenance";
import { readStampProv } from "@/components/shared/read-stamp";
import { Stat } from "@/components/shared/stat";
import { MarketPage } from "@/components/shared/product/market-page";
import { MarketRoster } from "@/components/shared/product/market-roster";
import { positionEntry } from "@/components/shared/product/position-entry";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatExact, formatNumber, formatTinyNonZero } from "@/lib/utils/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { fxEventFallbackContent } from "@/lib/shared/learn-more-content";
import { serverReadAt, stampServerRead, type ServerRead } from "@/lib/shared/server-head-read";
import { FX_ADDRESSES, FX_POOL_KEYS, FX_POOLS, isFxPoolKey, type FxPoolKey } from "@/lib/fx/asset-catalog";
import type { FxPoolSystem, FxSystemChainResponse, FxTickRow } from "@/lib/sources/chain/fx-system";
import {
  capacityProv,
  collOutsideLadderProv,
  defaultFeesProv,
  dustTicksProv,
  fundingCheckpointProv,
  fundingRateProv,
  indexIdentityProv,
  indexProv,
  ladderReconcileProv,
  maxRedeemProv,
  occupiedTicksProv,
  oracleLegProv,
  pausedProv,
  poolCollateralProv,
  poolDebtProv,
  poolDebtRatioProv,
  positionsMintedProv,
  redeemGateProv,
  rungProv,
  tickCollProv,
  tickDebtProv,
  tickIdProv,
  tickRatioProv,
  tickShareProv,
  topTickProv,
  treeNodesProv,
} from "@/lib/fx/system-provenance";
import type {
  EntryLink,
  Loadable,
  MarketModel,
  TicksStructure,
  ProductHead,
  ProductSection,
  ProductTerms,
  ReadAt,
  SectionTools,
} from "@/lib/shared/product/model";

export const FX_TERMS: ProductTerms = {
  market: { one: "pool", many: "pools" },
  reserve: { one: "tick", many: "ticks" },
  position: { one: "position", many: "positions" },
};

const LISTING = "/ethereum/fx";
const ROSTER = "/ethereum/fx/pools";
const DOCS = "https://fxprotocol.gitbook.io/fx-docs";
const PROTOCOL = protocolForHref(LISTING)!;

/** A pool's page. */
export const fxPoolHref = (key: FxPoolKey) => `${ROSTER}/${key}`;
const poolLabel = (p: { tokenSymbol: string }) => `${p.tokenSymbol} pool`;

// ── Formats ──────────────────────────────────────────────────────────────────

// A percentage with the false-zero guard: a tick holding 1e-12 fxUSD of the
// pool must never render as "0.0%".
const pctOf = (x: number, dp: number) => {
  const p = x * 100;
  const s = p.toFixed(dp);
  if (p !== 0 && parseFloat(s) === 0) return `${formatTinyNonZero(p)}%`;
  return `${s}%`;
};

/** A token amount with the same guard: dust reads as dust. */
const amt = (v: number): string => {
  if (v !== 0 && Math.abs(v) < 0.0001) return formatTinyNonZero(v);
  return formatNumber(v);
};

const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Age of a unix timestamp against the read block's timestamp: the page never
 *  consults the wall clock, so the server and the browser agree. */
const ageText = (ts: number, blockTs: number): string => {
  const s = Math.max(0, blockTs - ts);
  if (s < 90) return `${s} seconds`;
  if (s < 5400) return `${Math.round(s / 60)} minutes`;
  if (s < 129600) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
};

/** The pool's debt over its collateral at the anchor price; null with no collateral. */
const debtRatioOf = (p: FxPoolSystem) =>
  p.totalRawColl > 0 && p.priceAnchor > 0 ? p.totalRawDebt / (p.totalRawColl * p.priceAnchor) : null;

const redemptionWords = (p: FxPoolSystem) =>
  p.redeemPaused
    ? "Redemption paused"
    : p.redeemAllowed
      ? "Redemption open: fxUSD is below its peg"
      : "Redemption closed: it opens only while fxUSD trades below its peg";

// ── Receipt context ──────────────────────────────────────────────────────────

interface Ctx {
  p: FxPoolSystem;
  label: string;
  readBy: ServerRead | null;
  block: number;
  blockTs: number;
}

const ctxOf = (p: FxPoolSystem, data: FxSystemChainResponse): Ctx => ({
  p,
  label: poolLabel(p),
  readBy: serverReadAt(data.head, data.blockNumber) ?? null,
  block: data.blockNumber,
  blockTs: data.blockTimestamp,
});

const stamp = (c: Ctx, info: Parameters<typeof stampServerRead>[0]) => stampServerRead(info, c.readBy);

// ── The head ─────────────────────────────────────────────────────────────────

function structureOf(c: Ctx): TicksStructure {
  const { p, label } = c;
  const leg = (which: "min" | "anchor" | "max", value: number) => (
    <Prov
      info={stamp(c, oracleLegProv(which, label, p.address, p.oracle, p.normalizedSymbol))}
      value={formatExact(value)}
    >
      ${formatNumber(value)}
    </Prov>
  );
  return {
    kind: "ticks",
    ticks: {
      label: "Ticks holding debt",
      tip: "Positions with nearly the same debt ratio share a tick; the pool rebalances and liquidates a tick whole",
      value: (
        <Prov info={stamp(c, occupiedTicksProv(label, p.address))} value={formatExact(p.occupiedTicks)}>
          {p.occupiedTicks.toLocaleString("en-US")}
        </Prov>
      ),
      hooks: { "data-fx-ticks": String(p.occupiedTicks) },
    },
    rebalance: {
      label: "Rebalance from",
      tip: `From this debt ratio, at the min price, a keeper can rebalance a whole tick for a ${pctOf(p.rebalanceBonus, 1)} bonus`,
      value: (
        <Prov info={stamp(c, rungProv("rebalance", label, p.address))} value={formatExact(p.rebalanceRatio * 100)}>
          {pctOf(p.rebalanceRatio, 0)}
        </Prov>
      ),
    },
    liquidation: {
      label: "Liquidation from",
      tip: `From this debt ratio, at the min price, a keeper can liquidate a whole tick for a ${pctOf(p.liquidateBonus, 1)} bonus`,
      value: (
        <Prov info={stamp(c, rungProv("liquidate", label, p.address))} value={formatExact(p.liquidateRatio * 100)}>
          {pctOf(p.liquidateRatio, 0)}
        </Prov>
      ),
    },
    oracle: {
      unit: `USD per ${p.normalizedSymbol}`,
      min: { label: "Min price", tip: "Borrowing, rebalancing and liquidation", value: leg("min", p.priceMin) },
      anchor: { label: "Anchor price", tip: "A position's debt ratio", value: leg("anchor", p.priceAnchor) },
      max: { label: "Max price", tip: "Redemption", value: leg("max", p.priceMax) },
    },
  };
}

/** The head's (i): a first draft to the charter, polished by /newcomer-review. */
function PoolExplainer({ p }: { p: FxPoolSystem }) {
  const ratio = debtRatioOf(p);
  return (
    <>
      <ExplainGroup title="This pool">
        <ExplainBullet>
          The {poolLabel(p)} holds{" "}
          <Fig bold>
            {formatCompact(p.totalRawColl)} {p.normalizedSymbol}
          </Fig>{" "}
          of collateral against <Fig bold>{formatCompact(p.totalRawDebt)} fxUSD</Fig> of debt.
        </ExplainBullet>
        <ExplainBullet>
          Each position locks {p.tokenSymbol} and borrows fxUSD against it, a leveraged long on {p.normalizedSymbol}.
        </ExplainBullet>
        <ExplainBullet>
          The funding rate is <Fig bold>{pctOf(p.fundingRatioAnnual, 2)}</Fig> a year, charged on every position&rsquo;s
          collateral; it follows Aave&rsquo;s borrow rate.
        </ExplainBullet>
        {ratio != null && (
          <ExplainBullet>
            The pool&rsquo;s debt ratio <Fig bold>{pctOf(ratio, 1)}</Fig> is that debt over the collateral&rsquo;s value
            at the anchor price.
          </ExplainBullet>
        )}
        <ExplainBullet>
          <Fig bold>{p.positionsMinted.toLocaleString("en-US")}</Fig> positions have been opened in it.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Ticks">
        <ExplainBullet>
          Positions with nearly the same debt ratio share a tick, and <Fig bold>{p.occupiedTicks}</Fig> ticks hold debt.
        </ExplainBullet>
        <ExplainBullet>
          From a debt ratio of <Fig bold>{pctOf(p.rebalanceRatio, 0)}</Fig> a keeper can rebalance a whole tick: it
          repays part of the debt and takes collateral plus a bonus.
        </ExplainBullet>
        <ExplainBullet>
          From <Fig bold>{pctOf(p.liquidateRatio, 0)}</Fig> the whole tick can be liquidated.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Limits">
        {p.borrowPaused && <ExplainBullet>Borrowing is paused.</ExplainBullet>}
        <ExplainBullet>{redemptionWords(p)}.</ExplainBullet>
      </ExplainGroup>
    </>
  );
}

function readAtOf(c: Ctx): ReadAt | null {
  const { p, block } = c;
  if (block <= 0) return null;
  return {
    chainId: MAINNET_CHAIN_ID,
    block,
    blockTime: c.blockTs || null,
    readBy: c.readBy,
    receipt: (at) =>
      readStampProv({
        chainId: MAINNET_CHAIN_ID,
        block,
        at,
        readBy: c.readBy,
        what: `Every figure on the ${c.label}`,
        contracts: [
          {
            name: `AaveFundingPool (${c.label})`,
            address: p.address,
            reads:
              "getTotalRawCollaterals(), getTotalRawDebts(), getDebtAndCollateralIndex(), getDebtAndCollateralShares(), getDebtRatioRange(), getRebalanceRatios(), getLiquidateRatios(), getMaxRedeemRatioPerTick(), getTopTick(), getNextPositionId(), getNextTreeNodeId(), borrowRateSnapshot(), isBorrowPaused(), isRedeemPaused(), priceOracle(), configuration(); tickBitmap, tickData and tickTreeData for every tick holding debt; on its configuration getLongPoolFundingRatio, getPoolFeeRatio and isRedeemAllowed",
          },
          { name: "PriceOracle", address: p.oracle, reads: "getPrice(): the anchor, min and max prices" },
          {
            name: "PoolManager",
            address: FX_ADDRESSES.POOL_MANAGER,
            reads: "getPoolInfo(pool): the caps and balances",
          },
        ],
      }),
  };
}

function poolMarkdown(p: FxPoolSystem, block: number): string {
  const ratio = debtRatioOf(p);
  return [
    `# f(x) ${poolLabel(p)}`,
    "",
    `Leveraged longs that lock ${p.tokenSymbol} and borrow fxUSD against it, on Ethereum.`,
    "",
    `- Supplied: ${formatNumber(p.totalRawColl)} ${p.normalizedSymbol} (${usd(p.totalRawColl * p.priceAnchor)} at the anchor price)`,
    `- Borrowed: ${formatNumber(p.totalRawDebt)} fxUSD`,
    `- Funding rate: ${pctOf(p.fundingRatioAnnual, 2)} a year, on collateral`,
    ...(ratio != null ? [`- Debt ratio: ${pctOf(ratio, 2)}`] : []),
    `- Positions ever opened: ${p.positionsMinted}`,
    `- Ticks holding debt: ${p.occupiedTicks}`,
    `- Rebalance from: ${pctOf(p.rebalanceRatio, 2)} (bonus ${pctOf(p.rebalanceBonus, 1)})`,
    `- Liquidation from: ${pctOf(p.liquidateRatio, 2)} (bonus ${pctOf(p.liquidateBonus, 1)})`,
    `- Prices, USD per ${p.normalizedSymbol}: min ${formatNumber(p.priceMin)}, anchor ${formatNumber(p.priceAnchor)}, max ${formatNumber(p.priceMax)}`,
    `- ${redemptionWords(p)}`,
    "",
    `Read from Ethereum at block ${block.toLocaleString("en-US")}.`,
  ].join("\n");
}

function head(c: Ctx, overview: boolean): ProductHead {
  const { p, label } = c;
  const ratio = debtRatioOf(p);
  const listing = `${LISTING}?pool=${p.key}`;
  const entries = [
    overview ? { label: `View ${label}`, href: fxPoolHref(p.key), hooks: { "data-fx-pool-link": p.key } } : null,
    positionEntry({ href: listing, name: label, noun: FX_TERMS.position }),
  ].filter((e): e is EntryLink => e != null);
  const links: SectionMenuLink[] = [
    overview
      ? {
          item: "pool",
          title: label,
          subtitle: "Its prices, ticks and funding",
          href: fxPoolHref(p.key),
          internal: true,
        }
      : { item: "pools", title: "All pools", subtitle: "Both f(x) pools", href: ROSTER, internal: true },
    { item: "positions", title: "Positions", subtitle: `Every ${label} position`, href: listing, internal: true },
    {
      item: "info",
      title: "About f(x)",
      subtitle: "How it works and how Rails reads it",
      href: `${LISTING}/info`,
      internal: true,
    },
    {
      item: "contract",
      title: "The pool on Etherscan",
      subtitle: "Its contract, which also mints the positions",
      href: explorerUrl(MAINNET_CHAIN_ID, "address", p.address),
    },
    { item: "docs", title: "f(x)'s docs", subtitle: "fxprotocol.gitbook.io", href: DOCS },
  ];
  return {
    scope: `pool-${p.key}`,
    title: label,
    titleHref: listing,
    purpose: `Leveraged longs on ${p.normalizedSymbol}: each position locks ${p.tokenSymbol} and borrows fxUSD against it.`,
    figures: [
      {
        slot: "sizeIn",
        label: "Supplied",
        tip: `The pool's collateral, counted in ${p.normalizedSymbol}; ${usd(p.totalRawColl * p.priceAnchor)} at the anchor price`,
        value: (
          <Prov
            info={stamp(c, poolCollateralProv(label, p.address, p.normalizedSymbol))}
            value={formatExact(p.totalRawColl)}
          >
            {formatCompact(p.totalRawColl)} {p.normalizedSymbol}
          </Prov>
        ),
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        tip: "The fxUSD the pool's positions owe",
        value: (
          <Prov info={stamp(c, poolDebtProv(label, p.address))} value={formatExact(p.totalRawDebt)}>
            {formatCompact(p.totalRawDebt)} fxUSD
          </Prov>
        ),
      },
      {
        slot: "rateOut",
        label: "Funding rate",
        tip: "A yearly charge on every position's collateral, as an APR; it follows Aave's borrow rate",
        value: (
          <Prov info={stamp(c, fundingRateProv(label, p.address))} value={formatExact(p.fundingRatioAnnual * 100)}>
            {pctOf(p.fundingRatioAnnual, 2)}
          </Prov>
        ),
      },
      ...(ratio != null
        ? [
            {
              slot: "usage" as const,
              label: "Debt ratio",
              tip: "Borrowed ÷ the collateral's value at the anchor price, across the pool",
              value: (
                <Prov info={stamp(c, poolDebtRatioProv(label, p.address, p.oracle))} value={formatExact(ratio * 100)}>
                  {pctOf(ratio, 1)}
                </Prov>
              ),
            },
          ]
        : []),
      {
        slot: "population",
        label: "Positions ever opened",
        value: (
          <Prov info={stamp(c, positionsMintedProv(label, p.address))} value={formatExact(p.positionsMinted)}>
            {p.positionsMinted.toLocaleString("en-US")}
          </Prov>
        ),
      },
    ],
    structure: structureOf(c),
    notes: (
      <>
        {p.borrowPaused && (
          <Prov info={stamp(c, pausedProv("borrow", label, p.address))}>
            <span>Borrowing paused</span>
          </Prov>
        )}
        <Prov
          info={stamp(c, p.redeemPaused ? pausedProv("redeem", label, p.address) : redeemGateProv(label, p.address))}
        >
          <span data-fx-redemption="">{redemptionWords(p)}</span>
        </Prov>
      </>
    ),
    entries,
    readAt: readAtOf(c),
    tools: {
      links,
      exports: {
        markdown: { build: () => poolMarkdown(p, c.block), copySubtitle: "This pool as Markdown, for an LLM" },
      },
    },
    explainer: { body: <PoolExplainer p={p} />, label: "pool explanation" },
    hooks: { "data-fx-pool": p.key },
    bandHooks: { "data-market-panel": "fx" },
  };
}

// ── The oracle's prices ──────────────────────────────────────────────────────

const ORACLE_HELP = (p: FxPoolSystem): LearnMoreContent => ({
  title: "The pool's three prices",
  intro: `The pool's oracle gives three prices for ${p.normalizedSymbol}, each for a different job. The anchor is a price feed's reading; the min and max are the lowest and highest of it and the prices on trading venues, and each falls back to the anchor when a venue's price strays too far.`,
  detailsHeading: "Which price does what:",
  details: [
    {
      bold: "Min price",
      text: "the pool judges borrowing, rebalancing and liquidation at it, so every tick's debt ratio uses it.",
    },
    { bold: "Anchor price", text: "a position's debt ratio, as its page states it, uses the anchor." },
    { bold: "Max price", text: "a redeemer's collateral is priced at it, the price least in the redeemer's favour." },
  ],
  extraParagraphs: [
    `Prices are in USD per ${p.normalizedSymbol}. ${p.tokenSymbol === p.normalizedSymbol ? "" : `The pool counts ${p.tokenSymbol} at its rate to ${p.normalizedSymbol}.`}`.trim(),
  ],
  links: [{ label: "f(x) docs", url: DOCS }],
});

function OracleLegs({ s }: { s: TicksStructure }) {
  const row = (f: TicksStructure["oracle"]["min"], key: string) => (
    <div className="flex items-baseline justify-between gap-3" data-fx-leg={key}>
      <span className="min-w-0 text-rb-500">
        <span className="text-foreground">{f.label}</span> · {f.tip?.toLowerCase()}
      </span>
      <span className="shrink-0 text-foreground">{f.value}</span>
    </div>
  );
  return (
    <div className="space-y-1.5 text-[13px] tabular-nums">
      {row(s.oracle.min, "min")}
      {row(s.oracle.anchor, "anchor")}
      {row(s.oracle.max, "max")}
      <p className="pt-1 text-[11px] text-rb-500">{s.oracle.unit}</p>
    </div>
  );
}

// ── The ladder drawing ───────────────────────────────────────────────────────

/** One series (fxUSD debt), one axis (debt ratio at the min price), the
 *  lines as hairlines: structural blue for the data, neutral for the borrow
 *  cap and rebalance lines, red for the liquidation line. Heights are on a
 *  square-root scale, said in the caption. */
function LadderStrip({ c }: { c: Ctx }) {
  const { p, label } = c;
  const drawn = p.ticks.filter((t) => !t.dust && t.debtRatio != null);
  const maxDebt = drawn.reduce((m, t) => Math.max(m, t.rawDebt), 0);
  if (maxDebt === 0) return <p className="text-[12px] text-rb-500">No tick above the dust line to draw.</p>;
  const x = (ratio: number) => Math.min(1, Math.max(0, ratio)) * 100;
  return (
    <div>
      <div className="relative h-28 overflow-hidden rounded-md bg-rb-100 dark:bg-rb-500/10" data-fx-ladder="">
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${x(p.maxBorrowRatio)}%` }}
          title={`Borrow cap ${pctOf(p.maxBorrowRatio, 2)}`}
        />
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${x(p.rebalanceRatio)}%` }}
          title={`Rebalance from ${pctOf(p.rebalanceRatio, 0)}`}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-red-500"
          style={{ left: `${x(p.liquidateRatio)}%` }}
          title={`Liquidation from ${pctOf(p.liquidateRatio, 0)}`}
        />
        {drawn.map((t) => (
          <div
            key={t.tick}
            className="absolute bottom-0 w-[3px] -translate-x-1/2 rounded-t-sm bg-blue-500"
            style={{
              left: `${x(t.debtRatio as number)}%`,
              height: `${Math.max(4, Math.sqrt(t.rawDebt / maxDebt) * 100)}%`,
            }}
            title={`Tick ${t.tick} · debt ratio ${pctOf(t.debtRatio as number, 2)} · ${formatCompact(t.rawDebt)} fxUSD · ${amt(t.rawColl)} ${p.normalizedSymbol}`}
          />
        ))}
      </div>
      {/* Axis labels: the drawing's chrome. */}
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-rb-400" data-prov-exempt="">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] tabular-nums text-rb-500">
        <span>
          borrow to{" "}
          <Prov info={stamp(c, rungProv("open", label, p.address))} value={formatExact(p.maxBorrowRatio * 100)}>
            <span className="text-foreground">{pctOf(p.maxBorrowRatio, 2)}</span>
          </Prov>
        </span>
        <span>
          rebalance from{" "}
          <Prov
            info={stamp(c, rungProv("rebalance", label, p.address))}
            value={formatExact(p.rebalanceRatio * 100)}
            echo
          >
            <span className="text-foreground">{pctOf(p.rebalanceRatio, 0)}</span>
          </Prov>{" "}
          (+{pctOf(p.rebalanceBonus, 1)} bonus)
        </span>
        <span>
          liquidate from{" "}
          <Prov
            info={stamp(c, rungProv("liquidate", label, p.address))}
            value={formatExact(p.liquidateRatio * 100)}
            echo
          >
            <span className="text-foreground">{pctOf(p.liquidateRatio, 0)}</span>
          </Prov>{" "}
          (+{pctOf(p.liquidateBonus, 1)} bonus)
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-rb-500">
        Each column is a tick at its debt ratio, at the min price. Heights follow the square root of a tick&rsquo;s
        debt, so the small ticks stay visible beside the largest; the table below has every figure. Funding moves every
        column right at once. Neighbouring ticks can overlap here.
      </p>
    </div>
  );
}

// ── The reconciliation ───────────────────────────────────────────────────────

function Reconcile({ c }: { c: Ctx }) {
  const { p, label } = c;
  const reconcile = stamp(
    c,
    ladderReconcileProv(label, p.address, p.debtSharesReconcile, p.occupiedTicks, {
      ticks: p.tickDebtSharesSumRaw,
      pool: p.totalDebtSharesRaw,
    }),
  );
  return (
    <div className="space-y-2 text-[13px] leading-relaxed" data-fx-reconcile={p.debtSharesReconcile ? "ok" : "off"}>
      <p>
        <Prov info={reconcile}>
          {p.debtSharesReconcile ? (
            <span className="text-foreground">Reconciles: every debt share sits in one tick.</span>
          ) : (
            <span className="text-red-500">
              Does not reconcile: the ticks hold less debt than the pool&rsquo;s total. The tick figures are this
              read&rsquo;s.
            </span>
          )}
        </Prov>
      </p>
      <p className="text-rb-500">
        <Prov info={stamp(c, occupiedTicksProv(label, p.address))} value={formatExact(p.occupiedTicks)} echo>
          <span className="tabular-nums text-foreground">{p.occupiedTicks}</span>
        </Prov>{" "}
        ticks hold debt
        {p.topTick != null && (
          <>
            ; the top one is tick{" "}
            <Prov info={stamp(c, topTickProv(label, p.address))} value={formatExact(p.topTick)}>
              <span className="tabular-nums text-foreground">{p.topTick}</span>
            </Prov>
            , where redemption starts
          </>
        )}
        .
      </p>
      <p className="text-rb-500">
        {p.collOutsideLadder > 0 ? (
          <>
            <Prov
              info={stamp(c, collOutsideLadderProv(label, p.address, p.normalizedSymbol))}
              value={formatExact(p.collOutsideLadder)}
            >
              <span className="tabular-nums text-foreground">
                {amt(p.collOutsideLadder)} {p.normalizedSymbol}
              </span>
            </Prov>{" "}
            of collateral sits outside the ticks, held by positions with no debt: a position with no debt has no tick.
          </>
        ) : (
          <Prov info={stamp(c, collOutsideLadderProv(label, p.address, p.normalizedSymbol))}>
            <span>All the pool&rsquo;s collateral sits in ticks.</span>
          </Prov>
        )}
        {p.dustTicks > 0 && (
          <>
            {" "}
            <Prov
              info={stamp(c, dustTicksProv(label, p.address, p.dustPastLiquidate))}
              value={formatExact(p.dustTicks)}
            >
              <span className="tabular-nums text-foreground">{p.dustTicks}</span>
            </Prov>{" "}
            ticks hold only dust, too little for a keeper to clear
            {p.dustPastLiquidate > 0 && <>, {p.dustPastLiquidate} of them past the liquidation line</>}. They count in
            the totals and stay out of the drawing.
          </>
        )}
      </p>
    </div>
  );
}

// ── The tick table ───────────────────────────────────────────────────────────

function TickRow({ c, t, mine }: { c: Ctx; t: FxTickRow; mine: boolean }) {
  const { p, label } = c;
  // The linked tick's row: a blue ground over both stripes.
  const cell = `whitespace-nowrap tabular-nums ${mine ? "bg-blue-500/10!" : ""}`;
  return (
    <DataTableRow id={`tick-${p.key}-${t.tick}`} data-fx-tick={t.tick}>
      <DataTableCell rowHeader className={`${cell} text-foreground`}>
        <Prov info={stamp(c, tickIdProv(label, p.address, t.tick))} value={String(t.tick)}>
          {t.tick}
        </Prov>
        {mine && (
          <span className="ml-1.5 text-[11px] text-blue-600 dark:text-[var(--text-link)]">
            the position&rsquo;s tick
          </span>
        )}
      </DataTableCell>
      <DataTableCell label="Debt ratio" className={cell}>
        {t.debtRatio != null ? (
          <Prov info={stamp(c, tickRatioProv(label, p.address, t.tick))} value={formatExact(t.debtRatio * 100)}>
            <span className="text-foreground">{pctOf(t.debtRatio, 2)}</span>
          </Prov>
        ) : (
          <span className="text-rb-400" title="Debt against no collateral: no ratio exists">
            —
          </span>
        )}
        {t.pastLiquidate && <span className="ml-1.5 text-[11px] text-rb-500">past the liquidation line</span>}
      </DataTableCell>
      <DataTableCell label="Debt" align="right" className={`${cell} text-foreground`}>
        <span className="inline-flex items-center gap-1.5">
          <Prov info={stamp(c, tickDebtProv(label, p.address, t.tick, t.debtSharesRaw))} value={formatExact(t.rawDebt)}>
            {t.rawDebt !== 0 && t.rawDebt < 0.01 ? formatTinyNonZero(t.rawDebt) : formatCompact(t.rawDebt)}
          </Prov>
          <AssetUnit symbol="fxUSD" address="" />
        </span>
      </DataTableCell>
      <DataTableCell label="Share of pool" align="right" className={`${cell} text-rb-500`}>
        <Prov info={stamp(c, tickShareProv(label, p.address, t.tick))} value={formatExact(t.shareOfDebt * 100)}>
          {pctOf(t.shareOfDebt, 2)}
        </Prov>
      </DataTableCell>
      <DataTableCell label="Collateral" align="right" className={`${cell} text-foreground`}>
        <span className="inline-flex items-center gap-1.5">
          <Prov
            info={stamp(c, tickCollProv(label, p.address, t.tick, t.collSharesRaw, p.normalizedSymbol))}
            value={formatExact(t.rawColl)}
          >
            {amt(t.rawColl)}
          </Prov>
          <AssetUnit symbol={p.normalizedSymbol} address="" />
        </span>
      </DataTableCell>
    </DataTableRow>
  );
}

/** The default cut: ticks holding at least 0.1% of the pool's debt. "Show all"
 *  draws every tick, dust included; every tick is in the reconciliation. */
const SHARE_CUT = 0.001;

function TickTable({ c }: { c: Ctx }) {
  const { p } = c;
  const [showAll, setShowAll] = useState(false);
  // The top of the ladder first: redemption and a pool-wide sweep bite there.
  const ordered = [...p.ticks].sort((a, b) => b.tick - a.tick);
  const major = ordered.filter((t) => t.shareOfDebt >= SHARE_CUT);
  const rows = showAll ? ordered : major;
  // A position page links here with ?tick=<tick>: that row is marked and
  // scrolled to, the whole roster opened if the cut hides it. Read after
  // mount: the page is cached for every visitor.
  const [mine, setMine] = useState<number | null>(null);
  useEffect(() => {
    const tick = Number(new URLSearchParams(window.location.search).get("tick"));
    if (!Number.isInteger(tick) || !p.ticks.some((t) => t.tick === tick)) return;
    setMine(tick);
    if (!p.ticks.some((t) => t.tick === tick && t.shareOfDebt >= SHARE_CUT)) setShowAll(true);
    requestAnimationFrame(() => document.getElementById(`tick-${p.key}-${tick}`)?.scrollIntoView({ block: "center" }));
  }, [p.key, p.ticks]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[12px] text-rb-500">
          {showAll
            ? `All ${ordered.length} ticks holding debt, top down.`
            : `The ${major.length} ticks holding at least 0.1% of the pool's debt, top down.`}
        </span>
        {ordered.length > major.length && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className={`shrink-0 text-[12px] ${INPLACE_TEXT}`}
          >
            {showAll ? "Show the larger ticks only" : `Show all ${ordered.length} ticks`}
          </button>
        )}
      </div>
      <DataTable label={`${poolLabel(p)} ticks, top down`} stacked tableClassName="text-sm sm:min-w-[36rem]">
        <DataTableHead>
          <DataTableHeader label="Tick" />
          <DataTableHeader label="Debt ratio" title="Each tick's debt over its collateral at the min price" />
          <DataTableHeader label="Debt" align="right" />
          <DataTableHeader label="Share of pool" align="right" />
          <DataTableHeader label="Collateral" align="right" />
        </DataTableHead>
        <DataTableBody>
          {rows.map((t) => (
            <TickRow key={t.tick} c={c} t={t} mine={t.tick === mine} />
          ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}

const csvCell = (v: string | number | null | undefined) => {
  const t = v == null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function ticksCsv(p: FxPoolSystem): string {
  const head = [
    "tick",
    "debt_ratio_min_price",
    "debt_fxusd",
    "share_of_debt",
    `collateral_${p.normalizedSymbol}`,
    "debt_shares_raw",
    "coll_shares_raw",
    "dust",
    "past_liquidation",
  ];
  const rows = [...p.ticks]
    .sort((a, b) => b.tick - a.tick)
    .map((t) =>
      [
        t.tick,
        t.debtRatio,
        t.rawDebt,
        t.shareOfDebt,
        t.rawColl,
        t.debtSharesRaw,
        t.collSharesRaw,
        t.dust ? "yes" : "",
        t.pastLiquidate ? "yes" : "",
      ]
        .map(csvCell)
        .join(","),
    );
  return [head.join(","), ...rows].join("\n");
}

// ── Funding and fees ─────────────────────────────────────────────────────────

function Funding({ c }: { c: Ctx }) {
  const { p, label } = c;
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Stat label="Funding last charged">
          <Prov info={stamp(c, fundingCheckpointProv(label, p.address))} value={String(p.fundingCheckpoint)}>
            {ageText(p.fundingCheckpoint, c.blockTs)} before the read
          </Prov>
        </Stat>
        <Stat label="Default fees" note="a router can set its own">
          <Prov
            info={stamp(c, defaultFeesProv(label, p.address))}
            value={`${formatExact(p.defaultFees.borrow * 100)} / ${formatExact(p.defaultFees.repay * 100)}`}
          >
            {[
              p.defaultFees.supply > 0 ? `deposit ${pctOf(p.defaultFees.supply, 1)}` : null,
              p.defaultFees.withdraw > 0 ? `withdraw ${pctOf(p.defaultFees.withdraw, 1)}` : null,
              `borrow ${pctOf(p.defaultFees.borrow, 1)}`,
              `repay ${pctOf(p.defaultFees.repay, 1)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Prov>
        </Stat>
        <Stat label="Redemption per tick" note="of a tick's debt in one pass">
          <Prov info={stamp(c, maxRedeemProv(label, p.address))} value={formatExact(p.maxRedeemPerTick * 100)}>
            {pctOf(p.maxRedeemPerTick, 0)}
          </Prov>
        </Stat>
        <Stat
          label="Debt index"
          note={`each debt share owes ${((p.debtIndexMultiplier - 1) * 100).toFixed(2)}% more than at the start`}
        >
          <Prov info={stamp(c, indexProv("debt", label, p.address))} value={formatExact(p.debtIndexMultiplier)}>
            ×{p.debtIndexMultiplier.toFixed(6)}
          </Prov>
        </Stat>
        <Stat
          label="Collateral index"
          note={`each collateral share holds ${((1 - 1 / p.collIndexMultiplier) * 100).toFixed(1)}% less than at the start`}
        >
          <Prov info={stamp(c, indexProv("coll", label, p.address))} value={formatExact(p.collIndexMultiplier)}>
            ÷{p.collIndexMultiplier.toFixed(6)}
          </Prov>
        </Stat>
      </div>
      <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-rb-500">
        Funding comes out of every position&rsquo;s collateral at once, through the collateral index. Debt a liquidation
        could not cover is added to every position through the debt index. Both indexes started at ×1, and neither
        change has a transaction of its own.
        {!p.indexIdentityExact && (
          <>
            {" "}
            <Prov info={stamp(c, indexIdentityProv(label, p.address, false))}>
              <span className="text-red-500">
                The indexes did not match the pool&rsquo;s totals on this read; treat the tick figures as suspect.
              </span>
            </Prov>
          </>
        )}
      </p>
    </div>
  );
}

// ── Capacity ─────────────────────────────────────────────────────────────────

function Capacity({ c }: { c: Ctx }) {
  const { p, label } = c;
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Stat label="Collateral cap" note={`${p.tokenSymbol} as deposited`}>
          <Prov
            info={stamp(c, capacityProv("collateral", label, p.tokenSymbol))}
            value={formatExact(p.collateralBalanceToken)}
          >
            <AmountText value={p.collateralBalanceToken} format="compact" />
          </Prov>{" "}
          of{" "}
          <Prov
            info={stamp(c, capacityProv("collateral", label, p.tokenSymbol))}
            value={formatExact(p.collateralCapacityToken)}
            echo
          >
            <AmountText value={p.collateralCapacityToken} format="compact" />
          </Prov>{" "}
          {p.tokenSymbol}
        </Stat>
        <Stat label="Debt cap">
          <Prov info={stamp(c, poolDebtProv(label, p.address))} value={formatExact(p.totalRawDebt)} echo>
            <AmountText value={p.totalRawDebt} format="compact" />
          </Prov>{" "}
          of{" "}
          <Prov info={stamp(c, capacityProv("debt", label, p.tokenSymbol))} value={formatExact(p.debtCapacity)}>
            <AmountText value={p.debtCapacity} format="compact" />
          </Prov>{" "}
          fxUSD
        </Stat>
        <Stat label="Tick nodes" note="one per tick rearrangement">
          <Prov info={stamp(c, treeNodesProv(label, p.address))} value={formatExact(p.treeNodes)}>
            {p.treeNodes.toLocaleString("en-US")}
          </Prov>
        </Stat>
      </div>
      <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-rb-500">
        {p.tokenSymbol === p.normalizedSymbol
          ? "The collateral cap counts the token as deposited."
          : `The collateral cap counts ${p.tokenSymbol} as deposited; the pool's Supplied counts it in ${p.normalizedSymbol} at its rate.`}{" "}
        A node records one tick&rsquo;s positions; every rebalance, liquidation and redemption of a tick opens a new
        one, so the node count against the{" "}
        <Prov info={stamp(c, occupiedTicksProv(label, p.address))} value={formatExact(p.occupiedTicks)} echo>
          <span className="tabular-nums text-foreground">{p.occupiedTicks}</span>
        </Prov>{" "}
        ticks holding debt shows how often ticks have moved.
      </p>
    </div>
  );
}

// ── The pool page's sections ─────────────────────────────────────────────────

function sections(c: Ctx, s: TicksStructure): ProductSection[] {
  const { p } = c;
  const scope = (k: string) => `pool-${p.key}-${k}`;
  const inspect: SectionTools = {};
  return [
    {
      scope: scope("prices"),
      anatomy: "X1",
      title: "Prices",
      learnMore: ORACLE_HELP(p),
      raised: "narrow",
      tools: {
        links: [
          {
            item: "oracle",
            title: "The oracle on Etherscan",
            subtitle: "The pool's price oracle",
            href: explorerUrl(MAINNET_CHAIN_ID, "address", p.oracle),
          },
        ],
      },
      body: <OracleLegs s={s} />,
      hooks: { "data-fx-oracle": "" },
    },
    {
      scope: scope("ladder"),
      anatomy: "X2",
      title: "The tick ladder",
      learnMore: null,
      raised: true,
      tools: inspect,
      body: <LadderStrip c={c} />,
    },
    {
      scope: scope("reconcile"),
      anatomy: "X3",
      title: "Every debt share accounted for",
      raised: "narrow",
      tools: inspect,
      body: <Reconcile c={c} />,
    },
    {
      scope: scope("funding"),
      anatomy: "X4",
      title: "Funding and fees",
      raised: true,
      tools: inspect,
      body: <Funding c={c} />,
    },
    {
      scope: scope("capacity"),
      anatomy: "X5",
      title: "Capacity",
      raised: true,
      tools: {
        links: [
          {
            item: "manager",
            title: "The pool manager on Etherscan",
            subtitle: "It keeps the caps",
            href: explorerUrl(MAINNET_CHAIN_ID, "address", FX_ADDRESSES.POOL_MANAGER),
          },
        ],
      },
      body: <Capacity c={c} />,
    },
    {
      scope: scope("ticks"),
      anatomy: "X6",
      title: "Ticks",
      tools: {
        exports: {
          csv: {
            filename: `fx-${p.key}-ticks.csv`,
            build: () => ticksCsv(p),
            subtitle: "Every tick holding debt, figures unrounded",
          },
        },
      },
      body: <TickTable c={c} />,
      hooks: { "data-fx-ticks-section": "" },
    },
  ];
}

// ── The models ───────────────────────────────────────────────────────────────

const FAILED = "f(x)'s pools could not be read at this block. This view reads the chain live; try again shortly.";

export function fxPoolModel(data: FxSystemChainResponse, key: FxPoolKey, overview: boolean): Loadable<MarketModel> {
  const p = data.pools.find((x) => x.key === key);
  if (data.chainStale || data.blockNumber <= 0 || !p) return { state: "error", message: FAILED };
  const c = ctxOf(p, data);
  const h = head(c, overview);
  return { state: "ok", data: { head: h, ...(overview ? {} : { sections: sections(c, structureOf(c)) }) } };
}

const learnMore = fxEventFallbackContent();

/** f(x)'s pools (A1): a head per pool. */
export function FxPoolsOverview({ data }: { data: FxSystemChainResponse }): ReactNode {
  // Links from before the pool pages (/ethereum/fx/pools?pool=wsteth&tick=n)
  // open the pool's page at the tick.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const pool = q.get("pool");
    if (!pool || !isFxPoolKey(pool)) return;
    const tick = q.get("tick");
    window.location.replace(
      `${fxPoolHref(pool)}${tick ? `?tick=${encodeURIComponent(tick)}#tick-${pool}-${tick}` : ""}`,
    );
  }, []);
  const useMarket = (k: FxPoolKey) => fxPoolModel(data, k, true);
  return (
    <MarketRoster
      header={{ protocol: PROTOCOL, title: "Pools", learnMore }}
      markets={FX_POOL_KEYS.map((k) => ({ key: k, name: poolLabel(FX_POOLS[k]) }))}
      useMarket={useMarket}
    />
  );
}

/** One pool's page (A2): its head, then f(x)'s sections. */
export function FxPoolPage({ data, pool }: { data: FxSystemChainResponse; pool: FxPoolKey }): ReactNode {
  return (
    <MarketPage
      header={{ protocol: PROTOCOL, title: poolLabel(FX_POOLS[pool]), learnMore }}
      market={fxPoolModel(data, pool, false)}
      what={`f(x)'s ${poolLabel(FX_POOLS[pool])}`}
    />
  );
}
