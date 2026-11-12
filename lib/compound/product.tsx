"use client";

// Compound V3's product adapter (rails-ops ui-jobs 549/550; decision 0059): the
// Comet read (`loadCompoundV3Markets`, one pinned-block read of a chain's
// Comets) mapped into the shared product model, for Ethereum, Base and
// Arbitrum, and Optimism, whose Comets rails-server reads when the page opens. `/<chain>/compound-v3/markets` is the roster (A1), one head per
// Comet; `/<chain>/compound-v3/markets/<comet>` is a Comet's page (A2), its
// head then its collateral. A Comet's slug is its roster key (`usdc`, `weth`),
// the key its positions' routes already use.
//
// Surface rules (decision 0059): house labels where the measure is the same
// (Supplied, Borrowed, Supply rate, Borrow rate, Utilisation); Compound's words
// where it differs (Kink, Reserves, Min borrow on the head's structure slot;
// Borrow, Liquidate, Credited on the collateral). Comet addresses, function
// names and explorer links live in receipts and the ⋮; the contracts Rails
// reads are on the info page ("How Rails reads it").

import { rowAssetKeys } from "@/lib/shared/focus-row-keys";
import type { ReactNode } from "react";
import { AssetUnit } from "@/components/shared/asset-unit";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { ExplainBullet, ExplainGroup, ExplainSub, Fig } from "@/components/shared/explain-groups";
import { Prov } from "@/components/shared/provenance";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { RevealTip } from "@/components/shared/reveal-tip";
import { readStampProv } from "@/components/shared/read-stamp";
import { MarketPage } from "@/components/shared/product/market-page";
import { MarketRoster } from "@/components/shared/product/market-roster";
import { positionEntry } from "@/components/shared/product/position-entry";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatTinyNonZero } from "@/lib/utils/format";
import {
  ARBITRUM_CHAIN_ID,
  BASE_CHAIN_ID,
  MAINNET_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  chainMeta,
  explorerUrl,
  type ChainId,
} from "@/lib/shared/chains";
import { protocolForSession } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { headReadOf, type ServerRead } from "@/lib/shared/server-head-read";
import { cometDeploymentOf, type CompoundDeploymentKey } from "@/lib/compound/deployments";
import { COMPOUND_OPTIMISM_DEPLOYMENT } from "@/lib/compound-v3-optimism/asset-catalog";
import type { CometDeployment } from "@/lib/compound/asset-catalog";
import {
  type CompoundMarketCoords,
  cvBaseBorrowMinProv,
  cvCollateralBackingProv,
  cvCollateralFactorProv,
  cvCollateralIdentityProv,
  cvCollateralSuppliedProv,
  cvCollateralValueProv,
  cvKinkProv,
  cvMarketBaseProv,
  cvMarketValueProv,
  cvRateProv,
  cvReservesProv,
  cvUtilizationProv,
} from "@/lib/compound/markets-provenance";
import type {
  CompoundV3CollateralRow,
  CompoundV3MarketRow,
  CompoundV3MarketsResponse,
} from "@/lib/sources/chain/compound-markets";
import type {
  CometStructure,
  EntryLink,
  Loadable,
  MarketModel,
  ProductHead,
  ProductSection,
  ProductTerms,
  ReadAt,
} from "@/lib/shared/product/model";

export const COMPOUND_V3_TERMS: ProductTerms = {
  market: { one: "market", many: "markets" },
  reserve: { one: "collateral asset", many: "collateral assets" },
  position: { one: "position", many: "positions" },
};

const DOCS = "https://docs.compound.xyz";

/** What differs per chain: where the explorer lives, and whether its listing
 *  filters by market (Arbitrum's lists the wallets Rails has read, unfiltered). */
interface ChainSpec {
  chainId: ChainId;
  session: SessionProtocol;
  name: string;
  root: string;
  /** The listing filtered to one Comet; null where the listing cannot filter. */
  listing: ((key: string) => string) | null;
  /** The positions page where the listing cannot filter. */
  positions?: { href: string; title: string; subtitle: string };
}

/** A chain with Comets: the three indexed deployments and Optimism, read when a page opens. */
export type CometChainKey = CompoundDeploymentKey | "optimism";

const rosterOf = (chain: CometChainKey): CometDeployment =>
  chain === "optimism" ? COMPOUND_OPTIMISM_DEPLOYMENT : cometDeploymentOf(chain);

const CHAINS: Record<CometChainKey, ChainSpec> = {
  ethereum: {
    chainId: MAINNET_CHAIN_ID,
    session: "compound",
    name: "Ethereum",
    root: "/ethereum/compound-v3",
    listing: (k) => `/ethereum/compound-v3?market=${k}`,
  },
  base: {
    chainId: BASE_CHAIN_ID,
    session: "compound-base",
    name: "Base",
    root: "/base/compound-v3",
    listing: (k) => `/base/compound-v3?market=${k}`,
  },
  arbitrum: {
    chainId: ARBITRUM_CHAIN_ID,
    session: "compound-v3-arbitrum",
    name: "Arbitrum",
    root: "/arbitrum/compound-v3",
    listing: null,
    positions: {
      href: "/arbitrum/compound-v3/positions",
      title: "Positions Rails has read",
      subtitle: "Every Compound V3 wallet read on Arbitrum",
    },
  },
  optimism: {
    chainId: OPTIMISM_CHAIN_ID,
    session: "compound-v3-optimism",
    name: "Optimism",
    root: "/optimism/compound-v3",
    listing: null,
  },
};

/** The overview of a chain's Comets. */
export const compoundMarketsHref = (chain: CometChainKey) => `${CHAINS[chain].root}/markets`;
/** One Comet's page. */
export const cometHref = (chain: CometChainKey, key: string) => `${compoundMarketsHref(chain)}/${key}`;

// ── Formats ──────────────────────────────────────────────────────────────────

const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);

/** Compact quantity: token units or a quote-unit value, no currency mark. */
const qty = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (a > 0 && a < 0.001) return formatTinyNonZero(v);
  return v.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 4 : 2 });
};

/** A value in the market's quote unit: dollars carry the mark, ETH its name. */
const val = (v: number | null, unit: string): string => {
  if (v == null) return "—";
  if (unit !== "USD") return `${qty(v)} ETH`;
  if (v > 0 && v < 0.01) return "< $0.01";
  return `$${qty(v)}`;
};

/** One base unit (1e-6 USDC on Base's cUSDCv3) is a minimum in name only. */
const nominalMin = (m: CompoundV3MarketRow) => m.baseBorrowMin > 0 && m.baseBorrowMin <= 1e-6;

const sameKink = (m: CompoundV3MarketRow) => Math.abs(m.supplyKink - m.borrowKink) < 1e-9;

// ── Receipt context ──────────────────────────────────────────────────────────

interface Ctx {
  m: CompoundV3MarketRow;
  chain: CometChainKey;
  spec: ChainSpec;
  block: number;
  readBy: ServerRead | undefined;
  coords: CompoundMarketCoords;
}

function ctxOf(data: CompoundV3MarketsResponse, chain: CometChainKey, m: CompoundV3MarketRow): Ctx {
  const readBy = headReadOf(data.head, data.blockNumber, data.stored);
  return {
    m,
    chain,
    spec: CHAINS[chain],
    block: data.blockNumber,
    readBy,
    coords: {
      readBy,
      blockNumber: data.blockNumber,
      comet: m.comet,
      baseSymbol: m.baseSymbol,
      quoteUnit: m.quoteUnit,
    },
  };
}

// ── The head ─────────────────────────────────────────────────────────────────

function structureOf({ m, coords }: Ctx): CometStructure {
  const sym = m.baseSymbol;
  return {
    kind: "comet",
    kink: {
      label: "Kink",
      tip: "The utilisation where the rates turn steep: above it, borrowing costs rise fast",
      value: (
        <>
          <Prov info={cvKinkProv("borrow", coords)}>{pctText(m.borrowKink, 0)}</Prov>
          {!sameKink(m) && (
            <>
              {" borrow, "}
              <Prov info={cvKinkProv("supply", coords)}>{pctText(m.supplyKink, 0)}</Prov> supply
            </>
          )}
        </>
      ),
      hooks: { "data-comet-kink": "" },
    },
    reserves: {
      label: "Reserves",
      tip: "The base the market holds against bad debt. Below the target it sells collateral taken in liquidations to refill them; at or above it, those sales stop. The line can run negative.",
      value: (
        <>
          <Prov info={cvReservesProv("line", coords)}>
            {qty(m.reservesBase)} {sym}
          </Prov>{" "}
          of{" "}
          <Prov info={cvReservesProv("target", coords)}>
            {qty(m.targetReservesBase)} {sym}
          </Prov>{" "}
          target
          {m.reservesOfTarget != null && ` (${pctText(m.reservesOfTarget, 0)})`}
        </>
      ),
      hooks: { "data-comet-reserves": "" },
    },
    minBorrow: {
      label: "Min borrow",
      tip: "The smallest debt a new borrow may leave; repayments may leave less",
      value: (
        <>
          <Prov info={cvBaseBorrowMinProv(coords)}>
            {qty(m.baseBorrowMin)} {sym}
          </Prov>
          {nominalMin(m) && " (no practical minimum)"}
        </>
      ),
      hooks: { "data-comet-min-borrow": "" },
    },
  };
}

/** The utilisation bar with the kink on it: one axis, the fill and the
 *  curve's turn. */
function UtilisationBar({ m }: { m: CompoundV3MarketRow }) {
  const ticks: RatioBarTick[] = sameKink(m)
    ? [{ f: m.borrowKink, kind: "neutral", title: `Kink ${pctText(m.borrowKink, 0)}` }]
    : [
        { f: m.supplyKink, kind: "neutral", title: `Supply kink ${pctText(m.supplyKink, 0)}` },
        { f: m.borrowKink, kind: "neutral", title: `Borrow kink ${pctText(m.borrowKink, 0)}` },
      ];
  return (
    <div className="w-full min-w-40" data-comet-utilisation-bar="">
      <RatioBar fill={m.utilization} ticks={ticks} />
      <p className="mt-1.5 text-[11px] text-rb-500">Utilisation against the kink</p>
    </div>
  );
}

/** The head's (i): a first draft to the charter, polished by /newcomer-review. */
function CometExplainer({ m }: { m: CompoundV3MarketRow }) {
  const sym = m.baseSymbol;
  const below = m.reservesOfTarget != null && m.reservesOfTarget < 1;
  return (
    <>
      <ExplainGroup title="This market">
        <ExplainBullet>
          The {m.label} market lends one asset, {sym}, against <Fig bold>{m.collateral.length}</Fig> collateral assets.
        </ExplainBullet>
        <ExplainBullet>
          Lenders have supplied{" "}
          <Fig bold>
            {qty(m.totalSupplyBase)} {sym}
          </Fig>
          , worth <Fig bold>{val(m.totalSupplyValue, m.quoteUnit)}</Fig>.
        </ExplainBullet>
        <ExplainBullet>
          Borrowers owe{" "}
          <Fig bold>
            {qty(m.totalBorrowBase)} {sym}
          </Fig>
          , worth <Fig bold>{val(m.totalBorrowValue, m.quoteUnit)}</Fig>.
        </ExplainBullet>
        {m.quoteUnit === "ETH" && (
          <ExplainBullet>This market prices its assets in ETH, so its values are in ETH.</ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Rates">
        <ExplainBullet>
          Lenders earn <Fig bold>{pctText(m.supplyApr, 2)}</Fig> a year.
        </ExplainBullet>
        <ExplainBullet>
          Borrowers pay <Fig bold>{pctText(m.borrowApr, 2)}</Fig> a year.
        </ExplainBullet>
        {sameKink(m) ? (
          <ExplainBullet>
            Both rates rise with utilisation and turn steep above the kink at <Fig bold>{pctText(m.borrowKink, 0)}</Fig>
            .
          </ExplainBullet>
        ) : (
          <ExplainBullet>
            Both rates rise with utilisation; the borrow rate turns steep above{" "}
            <Fig bold>{pctText(m.borrowKink, 0)}</Fig> and the supply rate above{" "}
            <Fig bold>{pctText(m.supplyKink, 0)}</Fig>.
          </ExplainBullet>
        )}
        <ExplainBullet
          sub={
            m.utilization > 1 && (
              <ExplainSub>
                Borrowers owe more than lenders are owed: the borrow rate runs ahead of the supply rate, and the
                difference builds the reserves.
              </ExplainSub>
            )
          }
        >
          Utilisation <Fig bold>{pctText(m.utilization)}</Fig> is the share of the supply on loan.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Reserves">
        <ExplainBullet>
          The market holds{" "}
          <Fig bold>
            {qty(m.reservesBase)} {sym}
          </Fig>{" "}
          of reserves against a target of{" "}
          <Fig bold>
            {qty(m.targetReservesBase)} {sym}
          </Fig>
          {m.reservesOfTarget != null && (
            <>
              {" "}
              (<Fig bold>{pctText(m.reservesOfTarget, 0)}</Fig>)
            </>
          )}
          .
        </ExplainBullet>
        <ExplainBullet>
          {below
            ? "Below the target, the market sells collateral taken in liquidations to refill its reserves."
            : "At or above the target, the market keeps the collateral it takes in liquidations."}
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Borrowing">
        <ExplainBullet>
          {nominalMin(m) ? (
            <>
              The minimum borrow is{" "}
              <Fig bold>
                {qty(m.baseBorrowMin)} {sym}
              </Fig>
              , so in practice there is none.
            </>
          ) : (
            <>
              A new borrow must leave a debt of at least{" "}
              <Fig bold>
                {qty(m.baseBorrowMin)} {sym}
              </Fig>
              .
            </>
          )}
        </ExplainBullet>
        <ExplainBullet>
          Collateral assets earn no interest; each sets how much can be borrowed against it.
        </ExplainBullet>
      </ExplainGroup>
    </>
  );
}

function readAtOf(c: Ctx): ReadAt | null {
  const { m, block, spec, readBy } = c;
  if (block <= 0) return null;
  return {
    chainId: spec.chainId,
    block,
    readBy,
    receipt: (at) =>
      readStampProv({
        chainId: spec.chainId,
        block,
        at,
        readBy,
        what: `Every figure on the ${m.label} market`,
        contracts: [
          {
            name: `${m.label} (Comet)`,
            address: m.comet,
            reads:
              "totalSupply(), totalBorrow(), getUtilization(), getSupplyRate(), getBorrowRate(), supplyKink(), borrowKink(), getReserves(), targetReserves(), baseBorrowMin(), baseTokenPriceFeed(), numAssets(); per collateral asset getAssetInfo(i), totalsCollateral(asset) and getPrice(feed)",
          },
        ],
      }),
  };
}

function cometMarkdown(c: Ctx): string {
  const { m, spec } = c;
  const sym = m.baseSymbol;
  return [
    `# Compound V3 ${m.label} on ${spec.name}`,
    "",
    `A Compound V3 market that lends and borrows ${sym} against ${m.collateral.length} collateral assets. Values in ${m.quoteUnit}.`,
    "",
    `- Supplied: ${qty(m.totalSupplyBase)} ${sym} (${val(m.totalSupplyValue, m.quoteUnit)})`,
    `- Borrowed: ${qty(m.totalBorrowBase)} ${sym} (${val(m.totalBorrowValue, m.quoteUnit)})`,
    `- Supply rate: ${pctText(m.supplyApr, 2)} APR`,
    `- Borrow rate: ${pctText(m.borrowApr, 2)} APR`,
    `- Utilisation: ${pctText(m.utilization, 2)}`,
    `- Kink: borrow ${pctText(m.borrowKink, 0)}, supply ${pctText(m.supplyKink, 0)}`,
    `- Reserves: ${qty(m.reservesBase)} ${sym} of ${qty(m.targetReservesBase)} ${sym} target`,
    `- Min borrow: ${qty(m.baseBorrowMin)} ${sym}`,
    "",
    "| Collateral | Supplied | Value | Cap used | Borrow | Liquidate | Credited |",
    "|---|---|---|---|---|---|---|",
    ...m.collateral.map(
      (x) =>
        `| ${x.symbol} | ${qty(x.totalSupplied)} | ${val(x.suppliedValue, m.quoteUnit)} | ${x.capUsed == null ? "cap 0" : pctText(x.capUsed, 0)} | ${x.borrowCollateralFactor === 0 ? "off" : pctText(x.borrowCollateralFactor, 0)} | ${pctText(x.liquidateCollateralFactor, 0)} | ${pctText(x.liquidationFactor, 0)} |`,
    ),
    "",
    `Read from ${spec.name} at block ${c.block.toLocaleString("en-US")}.`,
  ].join("\n");
}

function head(c: Ctx, overview: boolean): ProductHead {
  const { m, chain, spec, coords } = c;
  const sym = m.baseSymbol;
  const listing = spec.listing?.(m.key) ?? null;
  const page = cometHref(chain, m.key);
  const explorer = chainMeta(spec.chainId).explorerName;
  const entries = [
    overview ? { label: `View ${m.label}`, href: page, hooks: { "data-comet-link": m.key } } : null,
    positionEntry({ href: listing, name: m.label, noun: COMPOUND_V3_TERMS.position }),
  ].filter((e): e is EntryLink => e != null);
  const links = [
    overview
      ? { item: "comet", title: m.label, subtitle: "Its rates, reserves and collateral", href: page, internal: true }
      : {
          item: "markets",
          title: "All markets",
          subtitle: `Every Compound V3 market on ${spec.name}`,
          href: compoundMarketsHref(chain),
          internal: true,
        },
    listing
      ? { item: "positions", title: "Positions", subtitle: `Every ${m.label} position`, href: listing, internal: true }
      : spec.positions
        ? { item: "positions", ...spec.positions, internal: true }
        : null,
    {
      item: "info",
      title: "About Compound V3",
      subtitle: "How it works and how Rails reads it",
      href: `${spec.root}/info`,
      internal: true,
    },
    {
      item: "contract",
      title: `${m.label} on ${explorer}`,
      subtitle: "The market's contract",
      href: explorerUrl(spec.chainId, "address", m.comet),
    },
    { item: "docs", title: "Compound's docs", subtitle: "docs.compound.xyz", href: DOCS },
  ].filter((l): l is SectionMenuLink => l != null);
  const size = (side: "supplied" | "borrowed") => {
    const value = side === "supplied" ? m.totalSupplyValue : m.totalBorrowValue;
    const base = side === "supplied" ? m.totalSupplyBase : m.totalBorrowBase;
    return (
      <>
        <div>
          <Prov info={cvMarketValueProv(side, coords)}>{val(value, m.quoteUnit)}</Prov>
        </div>
        <div className="text-[11px] font-normal text-rb-500">
          <Prov info={cvMarketBaseProv(side, coords)}>
            {qty(base)} {sym}
          </Prov>
        </div>
      </>
    );
  };
  return {
    scope: `comet-${chain}-${m.key}`,
    title: m.label,
    titleHref: listing ?? undefined,
    purpose: `Lends and borrows ${sym} against ${m.collateral.length} collateral assets.`,
    figures: [
      {
        slot: "sizeIn",
        label: "Supplied",
        value: size("supplied"),
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        value: size("borrowed"),
      },
      {
        slot: "rateIn",
        label: "Supply rate",
        tip: `What lenders of ${sym} earn now, as an APR`,
        value: <Prov info={cvRateProv("supply", coords)}>{pctText(m.supplyApr, 2)}</Prov>,
      },
      {
        slot: "rateOut",
        label: "Borrow rate",
        tip: `What borrowers of ${sym} pay now, as an APR`,
        value: <Prov info={cvRateProv("borrow", coords)}>{pctText(m.borrowApr, 2)}</Prov>,
      },
      {
        slot: "usage",
        label: "Utilisation",
        tip: `Borrowed ÷ supplied, both in ${sym}`,
        value: <Prov info={cvUtilizationProv(coords)}>{pctText(m.utilization)}</Prov>,
      },
    ],
    aside: <UtilisationBar m={m} />,
    structure: structureOf(c),
    notes:
      m.utilization > 1 || m.quoteUnit === "ETH" ? (
        <>
          {m.utilization > 1 && (
            <span title="Borrowers owe more than lenders are owed: the borrow rate runs ahead of the supply rate, and the difference builds the reserves">
              Borrowed above supplied
            </span>
          )}
          {m.quoteUnit === "ETH" && (
            <span title="This market's prices are in ETH, its base asset's unit, so its values are in ETH">
              Values in ETH
            </span>
          )}
        </>
      ) : undefined,
    entries,
    readAt: readAtOf(c),
    tools: {
      links,
      exports: {
        markdown: { build: () => cometMarkdown(c), copySubtitle: "This market as Markdown, for an LLM" },
      },
    },
    explainer: { body: <CometExplainer m={m} />, label: "market explanation" },
    hooks: { "data-comet": m.key },
    bandHooks: { "data-market-panel": `compound-v3-${m.key}` },
  };
}

// ── The collateral ───────────────────────────────────────────────────────────

const TIP_PROSE = "block w-64 whitespace-normal text-left font-normal normal-nums leading-snug";
const TIPPED = "cursor-help tip-underline";

/** A tip on a label, mark or bar: a keyboard control (Tab, then Enter or
 *  Space) whose accessible name is `name` and the tip, as the shared
 *  HeadingTip's (ui-jobs 602). */
function Tip({
  text,
  name,
  children,
  align,
  className,
}: {
  text: string;
  /** What the control is called: the visible text, or what a bar shows. */
  name: string;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <RevealTip
      tip={<span className={TIP_PROSE}>{text}</span>}
      label={`${name}: ${text}`}
      focusable
      align={align}
      className={`focus-ring rounded-sm ${className ?? ""}`}
    >
      {children}
    </RevealTip>
  );
}

const CAP_TIP = "The share of the supply cap in use: amount supplied ÷ cap, both in the asset's own units.";
const BORROW_TIP = "Collateral factor for borrowing: the share of this asset's value that can be borrowed against.";
const LIQUIDATE_TIP =
  "Liquidation collateral factor: the share of this asset's value that counts toward the liquidation line.";
const CREDITED_TIP =
  "Comet's liquidation factor: the share of this asset's value an account is credited at if it is absorbed. The protocol keeps the rest.";

/** A column's name with its tip: over the column from lg, and as a card's
 *  label below it (D6). */
function TipLabel({ text, tip, align }: { text: string; tip: string; align: "start" | "end" }) {
  return (
    <Tip text={tip} name={text} align={align}>
      <span className={TIPPED}>{text}</span>
    </Tip>
  );
}

const FIGURE_CELL = "whitespace-nowrap text-sm tabular-nums";

/** One collateral asset as a row of the house table (D1, unlinked; D6 below
 *  lg). The token's identity and explorer link are the symbol's receipt. */
function CollateralRow({ x, c }: { x: CompoundV3CollateralRow; c: Ctx }) {
  const unit = c.m.quoteUnit;
  const cc: CompoundMarketCoords = { ...c.coords, collateralSymbol: x.symbol, collateralAsset: x.asset };
  return (
    <DataTableRow data-comet-collateral={x.asset}>
      <DataTableCell rowHeader>
        <div className="flex min-w-0 items-center gap-2.5">
          <TokenChipIcon symbol={x.symbol} address={x.asset} size={28} filterable={false} />
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            <Prov info={cvCollateralIdentityProv(c.spec.chainId, cc)}>{x.symbol}</Prov>
          </span>
        </div>
      </DataTableCell>

      <DataTableCell align="right" className={`${FIGURE_CELL} text-foreground`} label="Supplied">
        <Prov info={cvCollateralSuppliedProv(cc)}>
          <span className="inline-flex items-center gap-1">
            {qty(x.totalSupplied)} <AssetUnit symbol={x.symbol} address={x.asset} />
          </span>
        </Prov>
      </DataTableCell>

      <DataTableCell align="right" className={`${FIGURE_CELL} text-rb-500`} label="Value">
        <Prov info={cvCollateralValueProv(cc)}>{val(x.suppliedValue, unit)}</Prov>
      </DataTableCell>

      {/* Cap used: supplied ÷ supply cap, both in the asset's own units, one
          axis. RatioBar's card offset is zeroed in a row. */}
      <DataTableCell
        className={`${FIGURE_CELL} lg:w-[200px] lg:min-w-[150px]`}
        label={<TipLabel text="Cap used" tip={CAP_TIP} align="start" />}
      >
        <div className="flex items-center gap-2.5">
          <Tip
            text={
              x.capUsed != null
                ? `Supply cap ${qty(x.supplyCap)} ${x.symbol}, ${pctText(x.capUsed, 0)} used. The bar is supplied ÷ cap.`
                : "The supply cap is zero: no more of this asset can enter the market. What is supplied entered before the cap was set."
            }
            name="Supply cap"
            className="min-w-12 flex-1"
          >
            <div className="w-full [&>div]:mt-0">
              {x.capUsed != null ? (
                <RatioBar fill={x.capUsed} ticks={[]} />
              ) : (
                <div className="h-2.5 rounded-full bg-rb-200 dark:bg-rb-500/30" />
              )}
            </div>
          </Tip>
          {/* A ratio of two receipted figures (supplied, cap): no receipt of its own. */}
          <span className="w-11 shrink-0 text-right text-rb-500" data-prov-exempt="">
            {x.capUsed == null ? (
              <Tip text="The supply cap is zero: no more can be added; what is in stays." name="Cap 0" align="end">
                <span className={TIPPED}>Cap 0</span>
              </Tip>
            ) : x.capUsed > 1 ? (
              <Tip
                text="Governance lowered the supply cap below what is already supplied. Nothing more can enter until supply falls under the cap; what is in stays."
                name={`${pctText(x.capUsed, 0)} of the cap`}
                align="end"
              >
                <span className={TIPPED}>{pctText(x.capUsed, 0)}</span>
              </Tip>
            ) : (
              pctText(x.capUsed, 0)
            )}
          </span>
        </div>
      </DataTableCell>

      {/* The factors, stated in text: a different axis from utilisation. A
          zero borrow factor switches off new borrowing against the asset
          while it stays liquidation-eligible. */}
      <DataTableCell
        align="right"
        className={`${FIGURE_CELL} text-foreground/80`}
        label={<TipLabel text="Borrow" tip={BORROW_TIP} align="start" />}
      >
        {x.borrowCollateralFactor === 0 ? (
          <Tip text="Borrowing against this asset is switched off." name="Borrowing off" align="end">
            <span className={`${TIPPED} text-rb-500`}>Off</span>
          </Tip>
        ) : (
          <Prov info={cvCollateralFactorProv("borrow", cc)}>{pctText(x.borrowCollateralFactor, 0)}</Prov>
        )}
      </DataTableCell>
      <DataTableCell
        align="right"
        className={`${FIGURE_CELL} text-foreground/80`}
        label={<TipLabel text="Liquidate" tip={LIQUIDATE_TIP} align="start" />}
      >
        <Prov info={cvCollateralFactorProv("liquidate", cc)}>{pctText(x.liquidateCollateralFactor, 0)}</Prov>
      </DataTableCell>
      <DataTableCell
        align="right"
        className={`${FIGURE_CELL} text-foreground/80`}
        label={<TipLabel text="Credited" tip={CREDITED_TIP} align="start" />}
      >
        <Prov info={cvCollateralFactorProv("liquidation", cc)}>{pctText(x.liquidationFactor, 0)}</Prov>
      </DataTableCell>
    </DataTableRow>
  );
}

/** The collateral section's body: one line, then the house table on the page
 *  canvas, largest value first. */
function CollateralBody({ c }: { c: Ctx }) {
  const { m, coords } = c;
  return (
    <>
      <p className="max-w-2xl text-[13px] leading-relaxed text-rb-500" data-comet-collateral-line="">
        {/* A count of the Comet's roster: no read of its own. */}
        <span className="text-foreground" data-prov-exempt="">
          {m.collateral.length}
        </span>{" "}
        assets,{" "}
        <Prov info={cvCollateralBackingProv(coords)}>
          <span className="text-foreground">{val(m.totalCollateralValue, m.quoteUnit)}</span>
        </Prov>{" "}
        backing{" "}
        <Prov info={cvMarketValueProv("borrowed", coords)}>
          <span className="text-foreground">{val(m.totalBorrowValue, m.quoteUnit)}</span>
        </Prov>{" "}
        borrowed. Each bar is supplied against the asset&rsquo;s supply cap.
      </p>
      <div className="mt-3">
        <DataTable
          label={`${m.label} collateral`}
          tableClassName="lg:min-w-[860px]"
          stacked
          stackBelow="lg"
          rowHeight="one"
        >
          <DataTableHead>
            <DataTableHeader label="Asset" />
            <DataTableHeader label="Supplied" align="right" />
            <DataTableHeader label="Value" align="right" />
            <DataTableHeader label={<TipLabel text="Cap used" tip={CAP_TIP} align="start" />} />
            <DataTableHeader label={<TipLabel text="Borrow" tip={BORROW_TIP} align="end" />} align="right" />
            <DataTableHeader label={<TipLabel text="Liquidate" tip={LIQUIDATE_TIP} align="end" />} align="right" />
            <DataTableHeader label={<TipLabel text="Credited" tip={CREDITED_TIP} align="end" />} align="right" />
          </DataTableHead>
          <DataTableBody>
            {m.collateral.map((x) => (
              <CollateralRow key={x.asset} x={x} c={c} />
            ))}
          </DataTableBody>
        </DataTable>
      </div>
    </>
  );
}

const COLLATERAL_HELP: LearnMoreContent = {
  title: "How to read the collateral",
  intro:
    "The collateral a Compound V3 market accepts, as its contract lists it. Each bar is the amount supplied against the asset's supply cap, in the asset's own units.",
  detailsHeading: "The three factors, in Compound's words:",
  details: [
    {
      bold: "Borrow",
      text: "the share of an asset's value that can be borrowed against. Off means borrowing against it is switched off.",
    },
    { bold: "Liquidate", text: "the share of an asset's value that counts toward the liquidation line." },
    {
      bold: "Credited",
      text: "the liquidation factor: the share of its value an account is credited at if it is absorbed. The protocol keeps the rest.",
    },
  ],
  extraParagraphs: [
    "Cap 0 means the supply cap is zero, and a cap lowered below what is supplied shows over 100%. Either way no more of that asset can be added; what is in stays.",
  ],
  links: [{ label: "Collateral and borrowing", url: `${DOCS}/collateral-and-borrowing/` }],
};

const csvCell = (v: string | number | null | undefined) => {
  const t = v == null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function collateralCsv(m: CompoundV3MarketRow): string {
  const headRow = [
    "symbol",
    "token",
    "supplied",
    "supply_cap",
    "cap_used",
    `price_${m.quoteUnit.toLowerCase()}`,
    `value_${m.quoteUnit.toLowerCase()}`,
    "borrow_collateral_factor",
    "liquidate_collateral_factor",
    "liquidation_factor",
  ];
  const rows = m.collateral.map((x) =>
    [
      x.symbol,
      x.asset,
      x.totalSupplied,
      x.supplyCap,
      x.capUsed,
      x.price,
      x.suppliedValue,
      x.borrowCollateralFactor,
      x.liquidateCollateralFactor,
      x.liquidationFactor,
    ]
      .map(csvCell)
      .join(","),
  );
  return [headRow.join(","), ...rows].join("\n");
}

function sections(c: Ctx): ProductSection[] {
  const { m, chain } = c;
  return [
    {
      scope: `comet-${chain}-${m.key}-collateral`,
      anatomy: "M1",
      title: "Collateral",
      learnMore: COLLATERAL_HELP,
      tools: {
        exports: {
          csv: {
            filename: `compound-v3-${chain}-${m.key}-collateral.csv`,
            build: () => collateralCsv(m),
            subtitle: "Every collateral asset, figures unrounded",
          },
        },
      },
      body: <CollateralBody c={c} />,
      hooks: { "data-comet-collateral-section": "" },
    },
  ];
}

// ── The models ───────────────────────────────────────────────────────────────

const FAILED = "The Comets could not be read at this block. This view reads the chain live; try again shortly.";

export function cometModel(
  data: CompoundV3MarketsResponse,
  chain: CometChainKey,
  key: string,
  overview: boolean,
): Loadable<MarketModel> {
  const m = data.markets.find((x) => x.key === key);
  if (data.chainStale || data.blockNumber <= 0 || !m) return { state: "error", message: FAILED };
  const c = ctxOf(data, chain, m);
  return { state: "ok", data: { head: head(c, overview), ...(overview ? {} : { sections: sections(c) }) } };
}

const LEARN_MORE: LearnMoreContent = {
  title: "How a Compound V3 market works",
  intro:
    "Each Compound V3 market is one contract, a Comet, that lends a single base asset. Lenders supply the base asset and earn interest; borrowers deposit collateral and borrow the base asset alone. Markets share nothing with each other.",
  detailsHeading: "Key terms:",
  details: [
    { bold: "Utilisation", text: "the share of the supplied base asset that is on loan. Both rates follow it." },
    { bold: "Kink", text: "the utilisation where the rates turn steep, to draw lenders in and borrowers out." },
    {
      bold: "Reserves",
      text: "base the market holds against bad debt. Below its target the market sells collateral taken in liquidations to refill them.",
    },
    {
      bold: "Absorb",
      text: "Compound's liquidation: the market takes over an account's debt and collateral and credits the borrower part of the collateral's value.",
    },
  ],
  links: [{ label: "Compound III docs", url: `${DOCS}/` }],
};

const protocolOf = (chain: CometChainKey) => protocolForSession(CHAINS[chain].session)!;

/** A chain's Comets (A1): a head per Comet. */
export function CompoundMarketsOverview({
  data,
  chain,
}: {
  data: CompoundV3MarketsResponse;
  chain: CometChainKey;
}): ReactNode {
  const useMarket = (k: string) => cometModel(data, chain, k, true);
  return (
    <MarketRoster
      header={{ protocol: protocolOf(chain), title: "Markets", learnMore: LEARN_MORE }}
      markets={rosterOf(chain).markets.map((m) => ({ key: m.key, name: m.label }))}
      useMarket={useMarket}
      keysOf={(k) =>
        rowAssetKeys(
          rosterOf(chain).markets.find((m) => m.key === k),
          protocolOf(chain).chainId,
        )
      }
    />
  );
}

/** One Comet's page (A2): its head, then its collateral. */
export function CompoundCometPage({
  data,
  chain,
  comet,
}: {
  data: CompoundV3MarketsResponse;
  chain: CometChainKey;
  comet: string;
}): ReactNode {
  const label = rosterOf(chain).markets.find((m) => m.key === comet)?.label ?? comet;
  return (
    <MarketPage
      header={{ protocol: protocolOf(chain), title: label, learnMore: LEARN_MORE }}
      market={cometModel(data, chain, comet, false)}
      what={`Compound V3's ${label} market`}
    />
  );
}
