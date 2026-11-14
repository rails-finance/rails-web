"use client";

// Fluid's vaults on the product shells (rails-ops ui-jobs 549 step 7;
// decisions 0043 and 0059). Fluid calls each borrow market a vault, and the
// word stays on screen: in the model each is a pair market, so its page
// carries what an R3 page would. fTokens and the Liquidity layer stay out.
//
//   • The roster (R1, /ethereum/fluid/vaults): one head for the protocol
//     (Vaults, Open positions over the count opened), then one house table grouped by vault type, T1 to
//     T4 (R1.1). A vault's sizes are in its own tokens, so no group or head
//     sums them. Every row opens its vault's page.
//   • A vault's page (R2, /ethereum/fluid/vaults/<id>): the head (house labels,
//     APR in the tips, Fluid's "Used" for its aggregate ratio, the vault type
//     and the ladder's three rungs in the band's foot), the rate curve as
//     missing, the parameters with the ladder drawn, and the holders, missing.
//
// The vault, oracle and resolver addresses sit in receipts and the ⋮s.

import type { ReactNode } from "react";
import { ExplainBullet, ExplainGroup, ExplainSub, Fig } from "@/components/shared/explain-groups";
import { readStampProv, type ReadContract } from "@/components/shared/read-stamp";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { MarketPage } from "@/components/shared/product/market-page";
import { ProductHeadSection } from "@/components/shared/product/product-head";
import { GroupedMarketsTable, type GroupedRow, type RowGroup } from "@/components/shared/product/grouped-table";
import { RateCurve } from "@/components/shared/product/rate-curve";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { AssetUnit } from "@/components/shared/asset-unit";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import { formatTinyNonZero } from "@/lib/utils/format";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { serverReadOf, type ServerRead } from "@/lib/shared/server-head-read";
import { FLUID_ADDRESSES, poolShareLabel, vaultKindOf, type FluidVaultKind } from "@/lib/fluid/asset-catalog";
import {
  fluidBorrowableProv,
  fluidOpenPositionsProv,
  fluidOraclePriceProv,
  fluidRosterPositionsProv,
  fluidRosterProv,
  fluidSmartLegProv,
  fluidVaultConfigProv,
  fluidVaultIdentityProv,
  fluidVaultPositionsProv,
  fluidVaultRateProv,
  fluidVaultSizeProv,
  fluidVaultUsedProv,
  type FluidVaultCoords,
} from "@/lib/fluid/vaults-provenance";
import type { FluidVaultDetail, FluidVaultRow, FluidVaultsChainResponse } from "@/lib/sources/chain/fluid-vaults";
import type { FluidOpenCount } from "@/lib/fluid/open-count";
import { COUNT_WORDS, openedInAll, utcStamp } from "@/lib/fluid/count-words";
import type { Loadable, MarketModel, ProductHead, ProductSection } from "@/lib/shared/product/model";

// ── Words ────────────────────────────────────────────────────────────────────

const ROOT = "/ethereum/fluid";
const DOCS = "https://docs.fluid.io";
const NOTE = "text-[13px] text-rb-500";
const NUM = "whitespace-nowrap tabular-nums text-foreground";

export const fluidVaultHref = (vaultId: number) => `${ROOT}/vaults/${vaultId}`;

const pctText = (f: number | null, dp = 0) => (f == null ? "none" : `${(f * 100).toFixed(dp)}%`);

/** Fluid's vault types, in its words. */
const TYPE: Record<FluidVaultKind, { code: string; name: string }> = {
  t1: { code: "T1", name: "Standard pair" },
  "smart-col": { code: "T2", name: "Smart collateral" },
  "smart-debt": { code: "T3", name: "Smart debt" },
  smart: { code: "T4", name: "Smart collateral and debt" },
};

const TIP = {
  supplied: "Collateral deposited in the vault, in its own token; a smart leg in the tokens its DEX shares hold",
  borrowed: "What borrowers owe the vault, interest included",
  available: "What borrowers can take now, before the vault's borrow limit",
  supplyRate: "What collateral earns a year, as an APR",
  borrowRate: "What borrowers pay a year, as an APR",
  used: "The whole vault's debt ÷ its collateral's value at the oracle's price",
  positions: COUNT_WORDS.openedTip,
  smartRate: "On a smart leg the vault's rate is the DEX pool's fee and reward share alone, so it is not stated",
};

/** A quantity, compact, never dollars: Fluid runs no USD feed. */
function amount(value: number): string {
  if (value === 0) return "0";
  const a = Math.abs(value);
  if (a >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  if (a < 0.001) return formatTinyNonZero(value);
  return value.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 4 : 2 });
}

const legLabel = (symbol: string | null, pool: [string, string] | null) =>
  symbol ?? poolShareLabel(pool) ?? "DEX shares";
const colOf = (v: FluidVaultRow) => legLabel(v.supplySymbol, v.supplyPool);
const debtOf = (v: FluidVaultRow) => legLabel(v.borrowSymbol, v.borrowPool);
const pairOf = (v: FluidVaultRow) => `${colOf(v)} / ${debtOf(v)}`;

const coordsOf = (v: FluidVaultRow, block: number, readBy?: ServerRead): FluidVaultCoords => ({
  blockNumber: block,
  readBy,
  vault: v.vault,
  vaultId: v.vaultId,
  pair: pairOf(v),
  oracle: v.oracle,
  colSym: v.supplySymbol ?? colOf(v),
  debtSym: v.borrowSymbol ?? debtOf(v),
});

/** A leg's size: a token leg in its token; a smart leg in the tokens its DEX
 *  shares hold where the pool states them, else the share count. */
function LegSize({ v, side }: { v: FluidVaultRow; side: "supply" | "borrow" }) {
  const value = side === "supply" ? v.totalSupply : v.totalBorrow;
  const symbol = side === "supply" ? v.supplySymbol : v.borrowSymbol;
  const tokens = side === "supply" ? v.supplyLegTokens : v.borrowLegTokens;
  const pool = side === "supply" ? v.supplyPool : v.borrowPool;
  if (tokens && tokens.length > 0)
    return (
      <span className="inline-flex flex-col items-end max-lg:items-start">
        {tokens.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            {i > 0 && "+ "}
            {amount(t.amount)}
            <AssetUnit symbol={t.symbol ?? "?"} address="" named={t.symbol != null} />
          </span>
        ))}
      </span>
    );
  if (symbol)
    return (
      <span className="inline-flex items-center gap-1.5">
        {amount(value)}
        <AssetUnit symbol={symbol} address="" />
      </span>
    );
  return (
    <span className="inline-flex flex-col items-end max-lg:items-start">
      {amount(value)}
      <span className="text-[11px] text-rb-500">{legLabel(symbol, pool)}</span>
    </span>
  );
}

function legProv(v: FluidVaultRow, side: "supply" | "borrow", c: FluidVaultCoords): Provenance {
  const tokens = side === "supply" ? v.supplyLegTokens : v.borrowLegTokens;
  const smart = side === "supply" ? v.isSmartCol : v.isSmartDebt;
  return tokens != null ? fluidSmartLegProv(side, c) : fluidVaultSizeProv(side, smart, c);
}

const Size = ({ v, side, c }: { v: FluidVaultRow; side: "supply" | "borrow"; c: FluidVaultCoords }) => (
  <Prov info={legProv(v, side, c)}>
    <LegSize v={v} side={side} />
  </Prov>
);

const Rate = ({ v, side, c }: { v: FluidVaultRow; side: "supply" | "borrow"; c: FluidVaultCoords }) => {
  const pct = side === "supply" ? v.supplyRatePct : v.borrowRatePct;
  return pct != null ? (
    <Prov info={fluidVaultRateProv(side, c)}>{ratePercentText(pct / 100)}</Prov>
  ) : (
    <span className="text-rb-500" title={TIP.smartRate}>
      none
    </span>
  );
};

function ladderTicks(v: FluidVaultRow): RatioBarTick[] {
  const ticks: RatioBarTick[] = [];
  if (v.collateralFactor != null)
    ticks.push({ f: v.collateralFactor, kind: "neutral", title: `Borrowing stops at ${pctText(v.collateralFactor)}` });
  if (v.liquidationThreshold != null)
    ticks.push({
      f: v.liquidationThreshold,
      kind: "liquidation",
      title: `Liquidation starts at ${pctText(v.liquidationThreshold)}`,
    });
  if (v.liquidationMaxLimit != null)
    ticks.push({
      f: v.liquidationMaxLimit,
      kind: "neutral",
      title: `Liquidation max limit ${pctText(v.liquidationMaxLimit)}`,
    });
  return ticks;
}

function Ladder({ v, c }: { v: FluidVaultRow; c: FluidVaultCoords }) {
  return (
    <>
      <RatioBar fill={v.aggregateRatio ?? 0} ticks={ladderTicks(v)} />
      <span className="mt-1.5 flex items-baseline gap-x-2 whitespace-nowrap text-[11px] text-rb-500">
        <span>
          borrow <Prov info={fluidVaultConfigProv("collateralFactor", c)}>{pctText(v.collateralFactor)}</Prov>
        </span>
        <span>
          liquidate{" "}
          <Prov info={fluidVaultConfigProv("liquidationThreshold", c)}>{pctText(v.liquidationThreshold)}</Prov>
        </span>
        <span>
          max limit <Prov info={fluidVaultConfigProv("liquidationMaxLimit", c)}>{pctText(v.liquidationMaxLimit)}</Prov>
        </span>
        {v.aggregateRatio != null && (
          <span>
            · <Prov info={fluidVaultUsedProv(c)}>{pctText(v.aggregateRatio, 1)}</Prov> used
          </span>
        )}
      </span>
    </>
  );
}

const csvCell = (x: string | number | null | undefined) => {
  const s = x == null ? "" : String(x);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function vaultsCsv(rows: FluidVaultRow[]): string {
  const head = [
    "vault_id",
    "vault",
    "vault_type",
    "collateral",
    "debt",
    "supplied",
    "borrowed",
    "supply_rate_pct",
    "borrow_rate_pct",
    "collateral_factor",
    "liquidation_threshold",
    "liquidation_max_limit",
    "used",
    "positions",
    "oracle",
  ];
  return [
    head.join(","),
    ...rows.map((v) =>
      [
        v.vaultId,
        v.vault,
        v.vaultType,
        colOf(v),
        debtOf(v),
        v.totalSupply,
        v.totalBorrow,
        v.supplyRatePct,
        v.borrowRatePct,
        v.collateralFactor,
        v.liquidationThreshold,
        v.liquidationMaxLimit,
        v.aggregateRatio,
        v.totalPositions,
        v.oracle,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}

const RESOLVER_READ: ReadContract = {
  name: "Fluid VaultResolver",
  address: FLUID_ADDRESSES.VAULT_RESOLVER,
  reads: "getAllVaultsAddresses, then getVaultEntireData for each vault",
};
const DEX_READ: ReadContract = {
  name: "Fluid DexResolver",
  address: "0x11D80CfF056Cef4F9E6d23da8672fE9873e5cC07",
  reads: "getDexEntireDatas for the pools a smart vault's legs hold shares of",
};

const docsLink: SectionMenuLink = { item: "docs", title: "Fluid's docs", subtitle: "Vaults", href: DOCS };

// ── The roster (R1) ──────────────────────────────────────────────────────────

function rosterRow(v: FluidVaultRow, block: number, readBy?: ServerRead): GroupedRow {
  const c = coordsOf(v, block, readBy);
  return {
    key: v.vault,
    href: fluidVaultHref(v.vaultId),
    icons: { first: { symbol: colOf(v) }, second: { symbol: debtOf(v) } },
    name: (
      <span className="inline-block max-w-[12rem] truncate align-bottom" title={pairOf(v)}>
        <Prov info={fluidVaultIdentityProv(v.vaultType, c)}>{pairOf(v)}</Prov>
      </span>
    ),
    sub: `Vault ${v.vaultId}`,
    sort: v.vaultId,
    hooks: { "data-fluid-vault": String(v.vaultId) },
    cells: {
      supplied: { node: <Size v={v} side="supply" c={c} />, sort: v.totalSupply },
      borrowed: { node: <Size v={v} side="borrow" c={c} />, sort: v.totalBorrow },
      supplyRate: { node: <Rate v={v} side="supply" c={c} />, sort: v.supplyRatePct ?? -1 },
      borrowRate: { node: <Rate v={v} side="borrow" c={c} />, sort: v.borrowRatePct ?? -1 },
      ladder: { node: <Ladder v={v} c={c} />, sort: v.aggregateRatio ?? -1 },
      positions: {
        node: <Prov info={fluidVaultPositionsProv(c)}>{v.totalPositions.toLocaleString("en-US")}</Prov>,
        sort: v.totalPositions,
      },
    },
  };
}

function RosterExplainer({
  data,
  open,
  positions,
}: {
  data: FluidVaultsChainResponse;
  open: number | null;
  positions: number;
}) {
  const s = data.summary;
  return (
    <>
      <ExplainGroup title="The vaults">
        <ExplainBullet
          sub={
            <ExplainSub>
              <Fig>{s.configured}</Fig> are configured: <Fig>{s.tokenPair}</Fig> plain token pairs and{" "}
              <Fig>{s.smart}</Fig> that hold DEX shares on a leg.
            </ExplainSub>
          }
        >
          Fluid has minted <Fig bold>{s.total}</Fig> vaults. Each lends one token against one collateral on its own
          ladder.
        </ExplainBullet>
        <ExplainBullet>
          {open != null ? (
            <>
              <Fig bold>{open.toLocaleString("en-US")}</Fig> positions are open across them, of{" "}
              <Fig>{positions.toLocaleString("en-US")}</Fig> opened in all.
            </>
          ) : (
            <>
              <Fig bold>{positions.toLocaleString("en-US")}</Fig> positions have been opened across them, open or
              closed.
            </>
          )}
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Reading the table">
        <ExplainBullet>
          Each vault states its sizes in its own tokens. A smart leg shows the tokens its DEX shares hold.
        </ExplainBullet>
        <ExplainBullet>
          The ladder bar fills to the whole vault&apos;s debt over its collateral&apos;s value; the red rung is where
          liquidation starts.
        </ExplainBullet>
      </ExplainGroup>
    </>
  );
}

export function FluidRosterPage({ data, open }: { data: FluidVaultsChainResponse; open: FluidOpenCount | null }) {
  const protocol = protocolForHref(ROOT)!;
  if (data.chainStale)
    return (
      <div className="min-h-screen" data-anatomy="R1">
        <div className="py-8">
          <SubPageHeader protocol={protocol} title="Vaults" />
          <p className={NOTE}>The vault roster could not be read from chain. Reload to try again.</p>
        </div>
      </div>
    );
  const block = data.blockNumber;
  const readBy = serverReadOf(data);
  const s = data.summary;
  const configured = data.vaults.filter((v) => v.configured);
  const shells = data.vaults.filter((v) => !v.configured);
  const positions = data.vaults.reduce((t, v) => t + v.totalPositions, 0);
  const sc: FluidVaultCoords = { blockNumber: block, readBy, skipped: data.skipped?.length };
  const head: ProductHead = {
    scope: "vaults-head",
    title: "Fluid on Ethereum",
    figures: [
      {
        slot: "roster",
        label: "Vaults",
        tip: "Every vault the factory has minted, configured or not",
        value: <Prov info={fluidRosterProv(sc)}>{s.total}</Prov>,
      },
      {
        slot: "population",
        label: COUNT_WORDS.openLabel,
        tip: COUNT_WORDS.openTip,
        value: (
          <span data-fluid-open-positions={open?.total ?? ""}>
            {open ? (
              <Prov info={fluidOpenPositionsProv(open.readAt, utcStamp(open.readAt))}>
                {open.total.toLocaleString("en-US")}
              </Prov>
            ) : (
              <span className="text-rb-500" title={COUNT_WORDS.openMissing}>
                none
              </span>
            )}
            <span className="block text-[11px] font-normal text-rb-500" data-fluid-positions-opened={positions}>
              <Prov info={fluidRosterPositionsProv(sc)}>{openedInAll(positions)}</Prov>
            </span>
          </span>
        ),
      },
    ],
    notes: (
      <>
        <span data-prov-exempt="">
          <span className="text-foreground">{s.configured}</span> configured ·{" "}
          <span className="text-foreground">{s.tokenPair}</span> token pairs ·{" "}
          <span className="text-foreground">{s.smart}</span> hold DEX shares on a leg
        </span>
        {s.oracleSilent > 0 && (
          <span data-prov-exempt="">
            <span className="text-foreground">{s.oracleSilent}</span> with a silent oracle
          </span>
        )}
      </>
    ),
    readAt:
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
                what: "Every figure on this page",
                contracts: [RESOLVER_READ, DEX_READ],
              }),
          }
        : null,
    tools: {
      links: [
        {
          item: "positions",
          title: "All Fluid positions",
          subtitle: "Every position Rails holds",
          href: ROOT,
          internal: true,
        },
        {
          item: "about",
          title: "About this explorer",
          subtitle: "How Rails reads Fluid",
          href: `${ROOT}/info`,
          internal: true,
        },
        {
          item: "resolver",
          title: "VaultResolver on Etherscan",
          subtitle: "The contract every figure is read through",
          href: explorerUrl(MAINNET_CHAIN_ID, "address", FLUID_ADDRESSES.VAULT_RESOLVER),
        },
        docsLink,
      ],
    },
    explainer: {
      body: <RosterExplainer data={data} open={open?.total ?? null} positions={positions} />,
      label: "roster explanation",
    },
    learnMore: null,
    anatomy: "M4",
  };

  const groups: RowGroup[] = (Object.keys(TYPE) as FluidVaultKind[])
    .map((k) => {
      const vs = configured.filter((v) => vaultKindOf(v.vaultType) === k);
      return {
        key: TYPE[k].code.toLowerCase(),
        label: (
          <>
            {TYPE[k].code} · {TYPE[k].name}
            <span className="font-normal text-rb-500" data-prov-exempt="">
              {" "}
              · {vs.length} {vs.length === 1 ? "vault" : "vaults"}
            </span>
          </>
        ),
        rows: vs.map((v) => rosterRow(v, block, readBy)),
        hooks: { "data-fluid-type": TYPE[k].code },
      };
    })
    .filter((g) => g.rows.length > 0);

  return (
    <div className="min-h-screen" data-anatomy="R1" data-fluid-roster="">
      <div className="py-8">
        <SubPageHeader protocol={protocol} title="Vaults" />
        <ProductHeadSection head={head} titled={false} />
        <GroupedMarketsTable
          t={{
            scope: "vaults-table",
            title: "Vaults by type",
            line: "Each vault is one borrow market: one collateral, one debt token. Grouped by which legs hold DEX shares; each opens its page.",
            anatomy: "R1.1",
            nameLabel: "Vault",
            columns: [
              { key: "supplied", label: "Supplied", align: "right", tip: TIP.supplied, className: NUM },
              { key: "borrowed", label: "Borrowed", align: "right", tip: TIP.borrowed, className: NUM },
              { key: "supplyRate", label: "Supply rate", align: "right", tip: TIP.supplyRate, className: NUM },
              { key: "borrowRate", label: "Borrow rate", align: "right", tip: TIP.borrowRate, className: NUM },
              {
                key: "ladder",
                label: "Ladder",
                tip: "Collateral factor, liquidation threshold and liquidation max limit, each a share of collateral value; the fill is the vault's debt over its collateral",
                className: "min-w-[220px] text-foreground",
                wide: true,
              },
              { key: "positions", label: COUNT_WORDS.openedLabel, align: "right", tip: TIP.positions, className: NUM },
            ],
            groups,
            defaultSort: { key: "name", dir: "asc" },
            tools: {
              exports: {
                csv: {
                  filename: "fluid-ethereum-vaults.csv",
                  build: () => vaultsCsv(data.vaults),
                  subtitle: "Every vault on the roster",
                },
              },
            },
            tableClassName: "text-[13px] lg:min-w-[64rem]",
            hooks: { "data-fluid-vaults-table": "" },
            foot: (
              <div className="mt-3 space-y-1 text-[12px] text-rb-500" data-prov-exempt="">
                {shells.length > 0 && (
                  <p data-fluid-shells={shells.length}>
                    {shells.length} vaults were minted and never configured; they hold nothing (vaults{" "}
                    {shells.map((v) => v.vaultId).join(", ")}).
                  </p>
                )}
                {(data.skipped?.length ?? 0) > 0 && (
                  <p data-fluid-skipped={data.skipped!.length}>
                    {data.skipped!.length} {data.skipped!.length === 1 ? "vault is" : "vaults are"} left out: the chain
                    gives no answer for {data.skipped!.length === 1 ? "it" : "them"} at this read.
                  </p>
                )}
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}

// ── One vault (R2) ───────────────────────────────────────────────────────────

interface Ctx {
  d: FluidVaultDetail;
  v: FluidVaultRow;
  c: FluidVaultCoords;
  pair: string;
  type: { code: string; name: string };
}

function ctxOf(d: FluidVaultDetail): Ctx {
  const v = d.vault;
  return {
    d,
    v,
    c: coordsOf(v, d.blockNumber, serverReadOf(d)),
    pair: pairOf(v),
    type: TYPE[vaultKindOf(v.vaultType)],
  };
}

/** A leg's size as text: the tokens a smart leg's shares hold where stated. */
function legText(v: FluidVaultRow, side: "supply" | "borrow"): string {
  const tokens = side === "supply" ? v.supplyLegTokens : v.borrowLegTokens;
  if (tokens && tokens.length > 0) return tokens.map((t) => `${amount(t.amount)} ${t.symbol ?? "?"}`).join(" + ");
  return side === "supply" ? `${amount(v.totalSupply)} ${colOf(v)}` : `${amount(v.totalBorrow)} ${debtOf(v)}`;
}

function VaultExplainer({ x }: { x: Ctx }) {
  const v = x.v;
  const smart = v.isSmartCol || v.isSmartDebt;
  return (
    <>
      <ExplainGroup title="This vault">
        <ExplainBullet>
          Borrowers deposit {colOf(v)} in this <Fig bold>{x.type.code}</Fig> vault, {x.type.name.toLowerCase()}, and
          borrow {debtOf(v)} against it.
        </ExplainBullet>
        {smart && (
          <ExplainBullet>
            Its{" "}
            {v.isSmartCol && v.isSmartDebt
              ? "two legs hold"
              : v.isSmartCol
                ? "collateral is held as"
                : "debt is held as"}{" "}
            DEX shares, shown as the tokens they hold.
          </ExplainBullet>
        )}
        <ExplainBullet>
          Borrowers have deposited <Fig bold>{legText(v, "supply")}</Fig> and owe <Fig bold>{legText(v, "borrow")}</Fig>
          .
        </ExplainBullet>
        {v.borrowable != null && (
          <ExplainBullet>
            <Fig bold>
              {amount(v.borrowable)} {debtOf(v)}
            </Fig>{" "}
            can be borrowed now.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Rates">
        {v.supplyRatePct != null && (
          <ExplainBullet>
            Collateral earns <Fig bold>{ratePercentText(v.supplyRatePct / 100)}</Fig> a year, as an APR.
          </ExplainBullet>
        )}
        {v.borrowRatePct != null && (
          <ExplainBullet>
            Borrowers pay <Fig bold>{ratePercentText(v.borrowRatePct / 100)}</Fig> a year, as an APR.
          </ExplainBullet>
        )}
        {smart && <ExplainBullet>A smart leg earns or pays the DEX pool&apos;s trading fees.</ExplainBullet>}
        {v.aggregateRatio != null && (
          <ExplainBullet>
            The vault&apos;s debt is <Fig bold>{pctText(v.aggregateRatio, 1)}</Fig> of its collateral&apos;s value
            (Used); one position can sit far above it.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Positions and the ladder">
        <ExplainBullet>
          <Fig bold>{v.totalPositions.toLocaleString("en-US")}</Fig>{" "}
          {v.totalPositions === 1 ? "position has" : "positions have"} been opened in this vault, open or closed.
        </ExplainBullet>
        <ExplainBullet>
          The collateral factor is <Fig bold>{pctText(v.collateralFactor)}</Fig>: a position may borrow up to that share
          of its collateral&apos;s value.
        </ExplainBullet>
        <ExplainBullet>
          Liquidation starts at the liquidation threshold, <Fig bold>{pctText(v.liquidationThreshold)}</Fig>; a
          liquidator takes collateral at a <Fig>{pctText(v.liquidationPenalty, 1)}</Fig> discount.
        </ExplainBullet>
        <ExplainBullet>
          Past the liquidation max limit, <Fig bold>{pctText(v.liquidationMaxLimit)}</Fig>, 100% of a position gets
          liquidated.
        </ExplainBullet>
      </ExplainGroup>
    </>
  );
}

function vaultMarkdown(x: Ctx): string {
  const v = x.v;
  const size = (n: number, s: string | null, pool: [string, string] | null) => `${amount(n)} ${legLabel(s, pool)}`;
  return [
    `# ${x.pair}, Fluid vault ${v.vaultId} on Ethereum`,
    "",
    `- Type: ${x.type.code}, ${x.type.name}`,
    `- Supplied: ${size(v.totalSupply, v.supplySymbol, v.supplyPool)}`,
    `- Borrowed: ${size(v.totalBorrow, v.borrowSymbol, v.borrowPool)}`,
    ...(v.borrowable != null ? [`- Available: ${amount(v.borrowable)} ${debtOf(v)}`] : []),
    ...(v.supplyRatePct != null ? [`- Supply rate: ${ratePercentText(v.supplyRatePct / 100)} APR`] : []),
    ...(v.borrowRatePct != null ? [`- Borrow rate: ${ratePercentText(v.borrowRatePct / 100)} APR`] : []),
    ...(v.aggregateRatio != null ? [`- Used: ${pctText(v.aggregateRatio, 1)}`] : []),
    `- Positions opened, open or closed: ${v.totalPositions}`,
    `- Collateral factor: ${pctText(v.collateralFactor)}`,
    `- Liquidation threshold: ${pctText(v.liquidationThreshold)}`,
    `- Liquidation max limit: ${pctText(v.liquidationMaxLimit)}`,
    `- Vault: ${v.vault}`,
    "",
    `Read from Ethereum at block ${x.d.blockNumber.toLocaleString("en-US")}.`,
  ].join("\n");
}

function headOf(x: Ctx): ProductHead {
  const v = x.v;
  const c = x.c;
  const none = (title: string) => (
    <span className="text-rb-500" title={title}>
      none
    </span>
  );
  const contracts: ReadContract[] = [
    {
      name: "Fluid VaultFactory",
      address: FLUID_ADDRESSES.VAULT_FACTORY,
      reads: `getVaultAddress(${v.vaultId}) and totalVaults`,
    },
    { ...RESOLVER_READ, reads: "getVaultEntireData for this vault" },
    ...(v.isSmartCol || v.isSmartDebt ? [DEX_READ] : []),
    {
      name: `Vault ${v.vaultId}`,
      address: v.vault,
      reads: "its configuration, totals and rates, through the resolver",
    },
  ];
  return {
    scope: "vault-head",
    title: x.pair,
    subtitle: (
      <p className="mt-1 text-[13px] text-rb-500" data-fluid-vault-line="">
        <Prov info={fluidVaultIdentityProv(v.vaultType, c)}>Vault {v.vaultId}</Prov> · lends {debtOf(v)} against{" "}
        {colOf(v)}
      </p>
    ),
    figures: [
      {
        slot: "sizeIn",
        label: "Supplied",
        tip: TIP.supplied,
        value: (
          <span data-vital="supplied">
            <Size v={v} side="supply" c={c} />
          </span>
        ),
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        tip: TIP.borrowed,
        value: (
          <span data-vital="borrowed">
            <Size v={v} side="borrow" c={c} />
          </span>
        ),
      },
      {
        slot: "sizeFree",
        label: "Available",
        tip: TIP.available,
        value: (
          <span data-vital="available">
            {v.borrowable != null ? (
              <Prov info={fluidBorrowableProv(c)}>
                {amount(v.borrowable)} {debtOf(v)}
              </Prov>
            ) : (
              none("A smart debt leg counts DEX shares")
            )}
          </span>
        ),
      },
      {
        slot: "rateIn",
        label: "Supply rate",
        tip: TIP.supplyRate,
        value: (
          <span data-vital="supply-rate">
            <Rate v={v} side="supply" c={c} />
          </span>
        ),
      },
      {
        slot: "rateOut",
        label: "Borrow rate",
        tip: TIP.borrowRate,
        value: (
          <span data-vital="borrow-rate">
            <Rate v={v} side="borrow" c={c} />
          </span>
        ),
      },
      {
        slot: "usage",
        label: "Used",
        tip: TIP.used,
        value: (
          <span data-vital="used">
            {v.aggregateRatio != null ? (
              <Prov info={fluidVaultUsedProv(c)}>{pctText(v.aggregateRatio, 1)}</Prov>
            ) : (
              none("A smart leg's shares have no single price to measure against")
            )}
          </span>
        ),
      },
      {
        slot: "population",
        label: COUNT_WORDS.openedLabel,
        tip: TIP.positions,
        value: <Prov info={fluidVaultPositionsProv(c)}>{v.totalPositions.toLocaleString("en-US")}</Prov>,
      },
    ],
    structure: {
      kind: "ladder",
      vaultType: {
        label: "Type",
        tip: "Which legs hold DEX shares",
        value: (
          <span data-prov-exempt="">
            {x.type.code}, {x.type.name.toLowerCase()}
          </span>
        ),
        hooks: { "data-fluid-type": x.type.code },
      },
      borrowTo: {
        label: "Collateral factor",
        tip: "The most a position may borrow, as a share of its collateral's value",
        value: <Prov info={fluidVaultConfigProv("collateralFactor", c)}>{pctText(v.collateralFactor)}</Prov>,
      },
      liquidateFrom: {
        label: "Liquidation threshold",
        tip: "Where liquidation starts",
        value: <Prov info={fluidVaultConfigProv("liquidationThreshold", c)}>{pctText(v.liquidationThreshold)}</Prov>,
      },
      absorbFrom: {
        label: "Liquidation max limit",
        tip: "Past this, 100% of a position gets liquidated",
        value: <Prov info={fluidVaultConfigProv("liquidationMaxLimit", c)}>{pctText(v.liquidationMaxLimit)}</Prov>,
      },
    },
    readAt:
      x.d.blockNumber > 0
        ? {
            chainId: MAINNET_CHAIN_ID,
            block: x.d.blockNumber,
            readBy: c.readBy,
            receipt: (at) =>
              readStampProv({
                chainId: MAINNET_CHAIN_ID,
                block: x.d.blockNumber,
                at,
                readBy: c.readBy,
                what: `Every figure on vault ${v.vaultId}`,
                contracts,
              }),
          }
        : null,
    tools: {
      links: [
        { item: "vaults", title: "All vaults", subtitle: "Every Fluid vault", href: `${ROOT}/vaults`, internal: true },
        {
          item: "positions",
          title: "All Fluid positions",
          subtitle: "Every position Rails holds",
          href: ROOT,
          internal: true,
        },
        {
          item: "vault",
          title: "Vault on Etherscan",
          subtitle: `Vault ${v.vaultId}`,
          href: explorerUrl(MAINNET_CHAIN_ID, "address", v.vault),
        },
        docsLink,
      ],
      exports: { markdown: { build: () => vaultMarkdown(x), copySubtitle: "This vault as Markdown, for an LLM" } },
    },
    explainer: { body: <VaultExplainer x={x} />, label: "vault explanation" },
    learnMore: null,
    anatomy: "M3.1",
    bandHooks: { "data-anatomy": "M3.2", "data-reserve-vitals": "" },
  };
}

function Term({ term, title, children }: { term: string; title?: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-rb-500" title={title}>
        {term}
      </dt>
      <dd className="text-right tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

function Parameters({ x }: { x: Ctx }) {
  const v = x.v;
  const c = x.c;
  return (
    <>
      {v.configured && (
        <div className="mb-4" data-fluid-ladder="">
          <Ladder v={v} c={c} />
        </div>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]" data-reserve-parameters="">
        <Term term="Type">
          {x.type.code}, {x.type.name.toLowerCase()}
        </Term>
        <Term term="Collateral">{colOf(v)}</Term>
        <Term term="Debt">{debtOf(v)}</Term>
        <Term term="Oracle price" title="The collateral's price in the debt token, the one liquidations use">
          {v.oraclePriceLiquidate != null ? (
            <Prov info={fluidOraclePriceProv(c)}>
              {v.oraclePriceLiquidate.toLocaleString("en-US", { maximumFractionDigits: 4 })} {debtOf(v)}
            </Prov>
          ) : v.oracle ? (
            "silent: the oracle answers 0"
          ) : (
            "no oracle"
          )}
        </Term>
        <Term term="Collateral factor" title="The most a position may borrow, as a share of its collateral's value">
          <Prov info={fluidVaultConfigProv("collateralFactor", c)}>{pctText(v.collateralFactor)}</Prov>
        </Term>
        <Term term="Liquidation threshold" title="Where liquidation starts">
          <Prov info={fluidVaultConfigProv("liquidationThreshold", c)}>{pctText(v.liquidationThreshold)}</Prov>
        </Term>
        <Term term="Liquidation max limit" title="Past this, 100% of a position gets liquidated">
          <Prov info={fluidVaultConfigProv("liquidationMaxLimit", c)}>{pctText(v.liquidationMaxLimit)}</Prov>
        </Term>
        <Term term="Liquidation penalty" title="The discount a liquidator takes collateral at">
          <Prov info={fluidVaultConfigProv("liquidationPenalty", c)}>{pctText(v.liquidationPenalty, 1)}</Prov>
        </Term>
      </dl>
    </>
  );
}

function sectionsOf(x: Ctx): ProductSection[] {
  const v = x.v;
  const link = (item: string, title: string, subtitle: string, address: string): SectionMenuLink => ({
    item,
    title,
    subtitle,
    href: explorerUrl(MAINNET_CHAIN_ID, "address", address),
  });
  return [
    {
      scope: "vault-curve",
      anatomy: "M3.3",
      title: "Rate curve",
      raised: true,
      tools: {},
      body: (
        <RateCurve
          curve={{
            missing: v.isSmartDebt
              ? "This vault's debt is DEX shares, whose cost is the pool's trading fees, so it has no rate curve."
              : `Fluid's Liquidity Layer sets this rate for every vault that borrows ${debtOf(v)}. Rails reads the vault's rate alone, so it draws no curve.`,
          }}
        />
      ),
    },
    {
      scope: "vault-parameters",
      anatomy: "M3.5",
      title: "Parameters",
      raised: "narrow",
      tools: {
        links: v.oracle ? [link("oracle", "Oracle on Etherscan", `The price feed for ${x.pair}`, v.oracle)] : [],
        exports: { markdown: { build: () => vaultMarkdown(x), copySubtitle: "This vault as Markdown, for an LLM" } },
      },
      body: <Parameters x={x} />,
    },
    {
      scope: "vault-holders",
      anatomy: "M3.7 M3.8",
      title: "Largest positions",
      tools: {
        links: [
          {
            item: "positions",
            title: "All Fluid positions",
            subtitle: "Every position Rails holds",
            href: ROOT,
            internal: true,
          },
        ],
      },
      body: (
        <p className={NOTE} data-reserve-missing-section="">
          No ranking yet. Rails&apos;s server ranks suppliers and borrowers for the Aave family&apos;s reserves only.
        </p>
      ),
    },
  ];
}

export function FluidVaultPage({ data, vaultId }: { data: FluidVaultDetail | null; vaultId: number }) {
  const x = data ? ctxOf(data) : null;
  const market: Loadable<MarketModel> = x
    ? { state: "ok", data: { head: headOf(x), sections: sectionsOf(x) } }
    : { state: "error", message: "The vault could not be read from chain. Reload to try again." };
  return (
    <MarketPage
      header={{ protocol: protocolForHref(ROOT)!, title: x?.pair ?? `Vault ${vaultId}` }}
      market={market}
      what={`vault ${vaultId}`}
      hooks={{ "data-fluid-vault-page": String(vaultId) }}
      focusSource={data}
    />
  );
}
