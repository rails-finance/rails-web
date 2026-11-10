"use client";

// LlamaLend's markets on the product shells (rails-ops ui-jobs 549 step 7;
// decisions 0043 and 0059). Each Controller is one isolated market, so a
// market's page carries what an R3 page would.
//
//   • The roster (R1, /ethereum/llamalend/markets): one head for the protocol
//     (Markets, Borrowed on the crvUSD markets, Loans), then one house table
//     grouped by era (R1.1): V1 and V2 for the markets that lend crvUSD, whose
//     debts sum in crvUSD, then the markets that lend another token, each in
//     its own. Every row opens its market's page.
//   • A market's page (R2, /ethereum/llamalend/markets/<controller>): the head
//     (house labels, APR in the tips; the era and the band terms A, loan
//     discount and liquidation discount in the band's foot), the rate curve
//     where the policy is the semi-log one, the parameters, and the holders
//     section, missing until Rails's server ranks LlamaLend's loans.
//
// Sizes are in the borrowed token. The controller, AMM, policy and vault
// addresses sit in receipts and the ⋮s.

import type { ReactNode } from "react";
import { ExplainBullet, ExplainGroup, ExplainSub, Fig } from "@/components/shared/explain-groups";
import { readStampProv, type ReadContract } from "@/components/shared/read-stamp";
import { Prov } from "@/components/shared/provenance";
import { AssetUnit } from "@/components/shared/asset-unit";
import { MarketPage } from "@/components/shared/product/market-page";
import { ProductHeadSection } from "@/components/shared/product/product-head";
import { GroupedMarketsTable, type GroupedRow, type RowGroup } from "@/components/shared/product/grouped-table";
import { RateCurve } from "@/components/shared/product/rate-curve";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { formatDate } from "@/lib/date";
import { formatTinyNonZero } from "@/lib/utils/format";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { serverReadAt, type ServerRead } from "@/lib/shared/server-head-read";
import { FACTORY_LABEL, LLAMALEND_ADDRESSES } from "@/lib/llamalend/asset-catalog";
import {
  llamaAmplificationProv,
  llamaAvailableProv,
  llamaBorrowRateProv,
  llamaCeilingProv,
  llamaChargedRateProv,
  llamaCurveProv,
  llamaDebtProv,
  llamaDiscountProv,
  llamaGroupDebtProv,
  llamaGroupLoansProv,
  llamaMarketIdentityProv,
  llamaOpenLoansProv,
  llamaPriceOracleProv,
  llamaSummaryDebtProv,
  llamaSummaryLoansProv,
  llamaSuppliedProv,
  llamaSupplyRateProv,
  llamaUtilisationProv,
  type LlamalendMarketCoords,
} from "@/lib/llamalend/markets-provenance";
import type {
  LlamalendMarketDetail,
  LlamalendMarketRow,
  LlamalendMarketsResponse,
} from "@/lib/sources/chain/llamalend-markets";
import type {
  Loadable,
  MarketModel,
  Missing,
  ProductHead,
  ProductSection,
  RateCurveModel,
} from "@/lib/shared/product/model";

// ── Words ────────────────────────────────────────────────────────────────────

const ROOT = "/ethereum/llamalend";
const DOCS = "https://docs.curve.finance/user/llamalend";
const NOTE = "text-[13px] text-rb-500";
const NUM = "whitespace-nowrap tabular-nums text-foreground";
const SECONDS_PER_YEAR = 31_536_000;

export const llamalendMarketHref = (controller: string) => `${ROOT}/markets/${controller.toLowerCase()}`;

const pctText = (f: number | null, dp = 1) => (f == null ? "none" : `${(f * 100).toFixed(dp)}%`);

/** A quantity in the borrowed token, compact: never dollars. */
function amount(value: number): string {
  if (value === 0) return "0";
  const a = Math.abs(value);
  if (a >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  if (a < 0.001) return formatTinyNonZero(value);
  return value.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 4 : 2 });
}

const KIND: Record<LlamalendMarketRow["factory"], string> = { oneway: "Lend", crvusd: "Mint", v2: "Lend" };

const TIP = {
  borrowed: "What borrowers owe the market, interest included, in the borrowed token",
  borrowRate: "What borrowers pay a year, as an APR, at the rate the market's policy sets now",
  supplyRate: "What lenders earn a year, as an APR, from the market's vault",
  utilLend: "Borrowed ÷ lenders' deposits",
  utilMint: "Borrowed ÷ the market's debt ceiling",
  a: "The band width: each band spans about 1/A of its price. Fixed per market",
  loanDiscount:
    "Sets how much can be borrowed: a loan may draw what its bands would hold with the price at their bottom, less this discount",
  liquidationDiscount: "Sets when a loan's health reaches 0, past which anyone may liquidate it",
  loans: "Loans open in the market now",
  available: "What a new loan can draw now",
};

/** Collateral tokens that are vault shares of a dollar stablecoin: each share
 *  redeems for more of the stablecoin as yield accrues, which is why the
 *  oracle prices them above 1. Each checked on chain (ERC-4626 asset() and
 *  convertToAssets against the market's oracle, 2026-09-29). */
const YIELD_SHARES: Record<string, string> = {
  "0x9d39a5de30e57443bff2a8307a4256c8797a3497": "USDe", // sUSDe
  "0xa663b02cf0a4b149d2ad41910cb81e23e1c41c32": "FRAX", // sFRAX
  "0xb45ad160634c528cc3d2926d9807104fa3157305": "DOLA", // sDOLA
  "0xcf62f905562626cfcdd2261162a51fd02fc9c5b6": "frxUSD", // sfrxUSD
  "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd": "USDS", // sUSDS
  "0xc8cf6d7991f15525488b2a83df53468d682ba4b0": "USDf", // sUSDf
  "0xbe53a109b494e5c9f97b9cd39fe969be68bf6204": "USDC", // yvUSDC-1
  "0x182863131f9a4630ff9e27830d945b1413e347e8": "USDS", // yvUSDS-1
  "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b": "USDC", // syrupUSDC
};

/** Rate policies whose rate is a function of time alone ("Flat Time-Linear
 *  Monetary Policy", verified source): rate(t) = clamp(base_rate + slope ×
 *  (t − snapshot_time), min_rate, max_rate). base_rate, slope and
 *  snapshot_time have no setter; min_rate and max_rate are read per market.
 *  Read 2026-10-02 (TO-DO-ui-jobs 171). */
const TIME_LINEAR_POLICIES: Record<string, { basePct: number; slopePctPerYear: number; since: number }> = {
  // base_rate 3170979198 (10%/yr), slope 904 wei/s² (89.9 points a year),
  // snapshot_time 1779714611 (25 May 2026).
  "0x066a89bdf4efb6ad58427d278f16b7a2c53c3cee": { basePct: 10, slopePctPerYear: 89.9, since: 1779714611 },
};

const perSecondYearly = (raw: string) => (Number(raw) / 1e18) * SECONDS_PER_YEAR;

type RatePolicy =
  | { kind: "semilog"; min: number; max: number }
  | { kind: "time"; basePct: number; slopePctPerYear: number; since: number; min: number | null; max: number | null }
  | { kind: "peg" }
  | { kind: "other"; min: number | null; max: number | null };

/** What sets the market's rate. A policy with a min and a max is drawn as the
 *  semi-log curve only where min × (max ÷ min)^U gives back the rate the
 *  policy states now (within 2% of it, or 0.01 points). */
function ratePolicyOf(m: LlamalendMarketRow): RatePolicy {
  const min = m.minRateRaw != null ? perSecondYearly(m.minRateRaw) : null;
  const max = m.maxRateRaw != null ? perSecondYearly(m.maxRateRaw) : null;
  const time = TIME_LINEAR_POLICIES[m.monetaryPolicy];
  if (time) return { kind: "time", ...time, min, max };
  if (m.factory === "crvusd") return { kind: "peg" };
  if (min != null && max != null && m.utilisation != null && m.borrowAprPct != null) {
    const expected = (min > 0 ? min * (max / min) ** m.utilisation : max * m.utilisation) * 100;
    const diff = Math.abs(expected - m.borrowAprPct);
    if (diff <= 0.01 || diff <= Math.abs(m.borrowAprPct) * 0.02) return { kind: "semilog", min, max };
  }
  return { kind: "other", min, max };
}

const coordsOf = (m: LlamalendMarketRow, block: number, readBy?: ServerRead): LlamalendMarketCoords => ({
  blockNumber: block,
  readBy,
  controller: m.controller,
  amm: m.amm,
  monetaryPolicy: m.monetaryPolicy,
  collateralSymbol: m.collateralSymbol,
  borrowedSymbol: m.borrowedSymbol,
  borrowedIsCrvusd: m.borrowedIsCrvusd,
  utilisationBasis: m.utilisationBasis,
});

const pairOf = (m: LlamalendMarketRow) => `${m.collateralSymbol} / ${m.borrowedSymbol}`;

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function marketsCsv(rows: LlamalendMarketRow[]): string {
  const head = [
    "controller",
    "amm",
    "monetary_policy",
    "version",
    "factory",
    "collateral",
    "collateral_symbol",
    "borrowed",
    "borrowed_symbol",
    "debt",
    "loans",
    "borrow_apr_pct",
    "utilisation",
    "utilisation_basis",
    "a",
    "loan_discount",
    "liquidation_discount",
    "price_oracle",
  ];
  return [
    head.join(","),
    ...rows.map((m) =>
      [
        m.controller,
        m.amm,
        m.monetaryPolicy,
        m.version,
        m.factory,
        m.collateralToken,
        m.collateralSymbol,
        m.borrowedToken,
        m.borrowedSymbol,
        m.totalDebt,
        m.nLoans,
        m.borrowAprPct,
        m.utilisation,
        m.utilisationBasis,
        m.A,
        m.loanDiscount,
        m.liquidationDiscount,
        m.priceOracle,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}

function readContracts(extra: ReadContract[] = []): ReadContract[] {
  return [
    {
      name: "OneWayLendingFactory",
      address: LLAMALEND_ADDRESSES.ONEWAY_FACTORY,
      reads: "the V1 lend markets: each one's controller, AMM and tokens",
    },
    {
      name: "crvUSD ControllerFactory",
      address: LLAMALEND_ADDRESSES.CRVUSD_FACTORY,
      reads: "the V1 mint markets and each one's debt ceiling",
    },
    {
      name: "LlamaLend V2 Factory",
      address: LLAMALEND_ADDRESSES.V2_FACTORY,
      reads: "the V2 markets, each struct's addresses classified by probing them",
    },
    ...extra,
  ];
}

const docsLink: SectionMenuLink = {
  item: "docs",
  title: "Curve's docs",
  subtitle: "LlamaLend",
  href: `${DOCS}/overview`,
};

// ── The roster (R1) ──────────────────────────────────────────────────────────

const GROUP_NAME = { v1: "V1", v2: "V2", "not-crvusd": "Lending another token" } as const;
type GroupKey = keyof typeof GROUP_NAME;

const groupOf = (m: LlamalendMarketRow): GroupKey => (!m.borrowedIsCrvusd ? "not-crvusd" : m.version);

function rosterRow(m: LlamalendMarketRow, block: number, readBy?: ServerRead): GroupedRow {
  const c = coordsOf(m, block, readBy);
  const util =
    m.utilisation != null ? (
      <Prov info={llamaUtilisationProv(c)}>{pctText(m.utilisation)}</Prov>
    ) : (
      <span className="text-rb-500">none</span>
    );
  return {
    key: m.controller,
    href: llamalendMarketHref(m.controller),
    icons: {
      first: { symbol: m.collateralSymbol, address: m.collateralToken },
      second: { symbol: m.borrowedSymbol, address: m.borrowedToken },
    },
    name: <Prov info={llamaMarketIdentityProv(c)}>{pairOf(m)}</Prov>,
    sub: `${KIND[m.factory]} market`,
    sort: pairOf(m).toLowerCase(),
    hooks: { "data-llamalend-market": m.controller },
    cells: {
      borrowed: {
        node: (
          // The amount with its token's mark (D1's amount cell, one line: no
          // oracle dollars, decision 0047).
          <Prov info={llamaDebtProv(c)}>
            <span className="inline-flex items-center gap-1.5 text-foreground/80">
              {amount(m.totalDebt)}
              <AssetUnit symbol={m.borrowedSymbol} address={m.borrowedToken} />
            </span>
          </Prov>
        ),
        sort: m.totalDebt,
      },
      borrowRate: {
        node:
          m.borrowAprPct != null ? (
            <Prov info={llamaBorrowRateProv(c)}>{ratePercentText(m.borrowAprPct / 100)}</Prov>
          ) : (
            <span className="text-rb-500">none</span>
          ),
        sort: m.borrowAprPct ?? -1,
      },
      utilisation: {
        node: util,
        sort: m.utilisation ?? -1,
        title: m.utilisationBasis === "crvUSD debt ceiling" ? TIP.utilMint : TIP.utilLend,
      },
      a: { node: <Prov info={llamaAmplificationProv(c)}>{m.A}</Prov>, sort: m.A },
      loanDiscount: {
        node: <Prov info={llamaDiscountProv("loan", c)}>{pctText(m.loanDiscount)}</Prov>,
        sort: m.loanDiscount,
      },
      loans: {
        node: <Prov info={llamaOpenLoansProv(c)}>{m.nLoans.toLocaleString("en-US")}</Prov>,
        sort: m.nLoans,
      },
    },
  };
}

function RosterExplainer({ data }: { data: LlamalendMarketsResponse }) {
  const s = data.summary;
  return (
    <>
      <ExplainGroup title="The markets">
        <ExplainBullet
          sub={
            <ExplainSub>
              <Fig bold>{s.v1Lend}</Fig> V1 lend, <Fig bold>{s.v1Mint}</Fig> V1 mint and <Fig bold>{s.v2}</Fig> V2
              markets; <Fig bold>{s.live}</Fig> have open loans.
            </ExplainSub>
          }
        >
          LlamaLend runs <Fig bold>{s.total}</Fig> isolated markets, each lending one token against one collateral.
        </ExplainBullet>
        <ExplainBullet>
          Borrowers owe <Fig bold>{amount(s.totalDebtCrvusd)} crvUSD</Fig> on the markets that lend crvUSD.
        </ExplainBullet>
        <ExplainBullet>
          <Fig bold>{s.totalLoans.toLocaleString("en-US")}</Fig> loans are open across every market.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Reading the table">
        <ExplainBullet>
          A mint market creates crvUSD for each loan, up to its debt ceiling. A lend market lends lenders&apos;
          deposits.
        </ExplainBullet>
        <ExplainBullet>
          Utilisation is borrowed over the debt ceiling on a mint market, and over deposits on a lend market.
        </ExplainBullet>
        {s.nonCrvusdBorrow > 0 && (
          <ExplainBullet>
            <Fig>{s.nonCrvusdBorrow}</Fig> markets lend another token; their figures are in that token.
          </ExplainBullet>
        )}
      </ExplainGroup>
    </>
  );
}

export function LlamalendRosterPage({
  data,
  learnMore,
}: {
  data: LlamalendMarketsResponse;
  learnMore?: LearnMoreContent;
}) {
  const protocol = protocolForHref(ROOT)!;
  if (data.chainStale)
    return (
      <div className="min-h-screen" data-anatomy="R1">
        <div className="py-8">
          <SubPageHeader protocol={protocol} title="Markets" learnMore={learnMore} />
          <p className={NOTE}>The market roster could not be read from chain. Reload to try again.</p>
        </div>
      </div>
    );
  const block = data.blockNumber;
  const readBy = serverReadAt(data.head, block);
  const s = data.summary;
  const sc: LlamalendMarketCoords = { blockNumber: block, readBy };
  const head: ProductHead = {
    scope: "markets-head",
    title: "LlamaLend on Ethereum",
    figures: [
      {
        slot: "roster",
        label: "Markets",
        value: <span data-prov-exempt="">{s.total}</span>,
        tip: "Every market the three factories list",
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        tip: "Owed on the markets that lend crvUSD, interest included",
        value: (
          <span data-vital="borrowed">
            <Prov info={llamaSummaryDebtProv(sc)}>{amount(s.totalDebtCrvusd)} crvUSD</Prov>
          </span>
        ),
      },
      {
        slot: "population",
        label: "Loans",
        tip: "Loans open across every market",
        value: <Prov info={llamaSummaryLoansProv(sc)}>{s.totalLoans.toLocaleString("en-US")}</Prov>,
      },
    ],
    notes: (
      <>
        <span data-prov-exempt="">
          <span className="text-foreground">{s.v1Lend}</span> V1 lend ·{" "}
          <span className="text-foreground">{s.v1Mint}</span> V1 mint · <span className="text-foreground">{s.v2}</span>{" "}
          V2
        </span>
        <span data-prov-exempt="">
          <span className="text-foreground">{s.live}</span> with open loans
        </span>
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
                contracts: readContracts(),
              }),
          }
        : null,
    tools: {
      links: [
        {
          item: "positions",
          title: "All LlamaLend positions",
          subtitle: "Every loan Rails holds",
          href: ROOT,
          internal: true,
        },
        {
          item: "about",
          title: "About this explorer",
          subtitle: "How Rails reads LlamaLend",
          href: `${ROOT}/info`,
          internal: true,
        },
        {
          item: "factory-v1",
          title: "V1 lend factory on Etherscan",
          subtitle: "OneWayLendingFactory",
          href: explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.ONEWAY_FACTORY),
        },
        {
          item: "factory-mint",
          title: "Mint factory on Etherscan",
          subtitle: "crvUSD ControllerFactory",
          href: explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.CRVUSD_FACTORY),
        },
        {
          item: "factory-v2",
          title: "V2 factory on Etherscan",
          subtitle: "LlamaLend V2 Factory",
          href: explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.V2_FACTORY),
        },
        docsLink,
      ],
    },
    explainer: { body: <RosterExplainer data={data} />, label: "roster explanation" },
    learnMore: null,
    anatomy: "M4",
  };

  const groups: RowGroup[] = (["v1", "v2", "not-crvusd"] as const)
    .map((g) => {
      const ms = data.markets.filter((m) => groupOf(m) === g);
      const debt = ms.reduce((t, m) => t + m.totalDebt, 0);
      const loans = ms.reduce((t, m) => t + m.nLoans, 0);
      const gc: LlamalendMarketCoords = { blockNumber: block, readBy };
      return {
        key: g,
        label: (
          <>
            {GROUP_NAME[g]}
            <span className="font-normal text-rb-500" data-prov-exempt="">
              {" "}
              · {ms.length} {ms.length === 1 ? "market" : "markets"}
            </span>
          </>
        ),
        summary:
          g === "not-crvusd" ? (
            "sizes in each market's borrowed token"
          ) : (
            <>
              <span className="text-foreground">
                <Prov info={llamaGroupDebtProv(GROUP_NAME[g], gc)}>{amount(debt)} crvUSD</Prov>
              </span>{" "}
              borrowed ·{" "}
              <span className="text-foreground">
                <Prov info={llamaGroupLoansProv(GROUP_NAME[g], gc)}>{loans.toLocaleString("en-US")}</Prov>
              </span>{" "}
              loans
            </>
          ),
        rows: ms.map((m) => rosterRow(m, block, readBy)),
        hooks: { "data-llamalend-group": g },
      };
    })
    .filter((g) => g.rows.length > 0);

  return (
    <div className="min-h-screen" data-anatomy="R1" data-llamalend-roster="">
      <div className="py-8">
        <SubPageHeader protocol={protocol} title="Markets" learnMore={learnMore} />
        <ProductHeadSection head={head} titled={false} />
        <GroupedMarketsTable
          t={{
            scope: "markets-table",
            title: "Markets by version",
            line: "The markets that lend crvUSD by the factory that made them, then those that lend another token. Each opens its page.",
            anatomy: "R1.1",
            nameLabel: "Market",
            columns: [
              { key: "borrowed", label: "Borrowed", align: "right", tip: TIP.borrowed, className: NUM },
              { key: "borrowRate", label: "Borrow rate", align: "right", tip: TIP.borrowRate, className: NUM },
              {
                key: "utilisation",
                label: "Utilisation",
                align: "right",
                tip: "Borrowed ÷ deposits on a lend market, ÷ the debt ceiling on a mint market",
                className: NUM,
              },
              { key: "a", label: "A", align: "right", tip: TIP.a, className: NUM },
              { key: "loanDiscount", label: "Loan discount", align: "right", tip: TIP.loanDiscount, className: NUM },
              { key: "loans", label: "Loans", align: "right", tip: TIP.loans, className: NUM },
            ],
            groups,
            defaultSort: { key: "borrowed", dir: "desc" },
            tools: {
              exports: {
                csv: {
                  filename: "llamalend-ethereum-markets.csv",
                  build: () => marketsCsv(data.markets),
                  subtitle: "Every market on the roster",
                },
              },
            },
            hooks: { "data-llamalend-markets-table": "" },
          }}
        />
      </div>
    </div>
  );
}

// ── One market (R2) ──────────────────────────────────────────────────────────

interface Ctx {
  d: LlamalendMarketDetail;
  m: LlamalendMarketRow;
  c: LlamalendMarketCoords;
  pair: string;
  mint: boolean;
  policy: RatePolicy;
  /** The rate charged now, where it differs from the policy's by more than 0.01 points. */
  charged: number | null;
}

function ctxOf(d: LlamalendMarketDetail): Ctx {
  const m = d.market;
  const readBy = serverReadAt(d.head, d.blockNumber);
  const charged =
    d.chargedAprPct != null && m.borrowAprPct != null && Math.abs(d.chargedAprPct - m.borrowAprPct) > 0.01
      ? d.chargedAprPct
      : null;
  return {
    d,
    m,
    c: coordsOf(m, d.blockNumber, readBy),
    pair: pairOf(m),
    mint: m.factory === "crvusd",
    policy: ratePolicyOf(m),
    charged,
  };
}

const era = (m: LlamalendMarketRow) => FACTORY_LABEL[m.factory].replace(" (crvUSD)", "");

const sym = (x: Ctx, n: number) => `${amount(n)} ${x.m.borrowedSymbol}`;

function supplied(x: Ctx): number | null {
  return x.m.available != null ? x.m.totalDebt + x.m.available : null;
}

function MarketExplainer({ x }: { x: Ctx }) {
  const m = x.m;
  const s = supplied(x);
  const p = x.policy;
  return (
    <>
      <ExplainGroup title="This market">
        {x.mint ? (
          <ExplainBullet>
            This <Fig bold>{era(m)}</Fig> mints crvUSD for borrowers against {m.collateralSymbol}, up to its debt
            ceiling of <Fig bold>{m.debtCeiling != null ? sym(x, m.debtCeiling) : "none"}</Fig>.
          </ExplainBullet>
        ) : (
          <>
            <ExplainBullet>
              Lenders supply {m.borrowedSymbol} to this <Fig bold>{era(m)}</Fig>, and borrowers take it against{" "}
              {m.collateralSymbol}.
            </ExplainBullet>
            {s != null && (
              <ExplainBullet>
                Lenders have put in <Fig bold>{sym(x, s)}</Fig>.
              </ExplainBullet>
            )}
          </>
        )}
        <ExplainBullet>
          Borrowers owe <Fig bold>{sym(x, m.totalDebt)}</Fig>, interest included.
        </ExplainBullet>
        {m.available != null && (
          <ExplainBullet>
            <Fig bold>{sym(x, m.available)}</Fig> can be borrowed now.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Rates">
        {x.mint ? (
          <ExplainBullet>The market has no lenders, so no supply rate: its interest goes to Curve.</ExplainBullet>
        ) : (
          x.d.lendAprPct != null && (
            <ExplainBullet>
              Lenders earn <Fig bold>{ratePercentText(x.d.lendAprPct / 100)}</Fig> a year, as an APR.
            </ExplainBullet>
          )
        )}
        {m.borrowAprPct != null && (
          <ExplainBullet
            sub={
              x.charged != null && (
                <ExplainSub>
                  Until the next loan action they are charged <Fig bold>{ratePercentText(x.charged / 100)}</Fig>, the
                  rate set at the last one.
                </ExplainSub>
              )
            }
          >
            Borrowers pay <Fig bold>{ratePercentText(m.borrowAprPct / 100)}</Fig> a year, as an APR.
          </ExplainBullet>
        )}
        {m.utilisation != null && (
          <ExplainBullet>
            Utilisation <Fig bold>{pctText(m.utilisation)}</Fig> is the share of the{" "}
            {x.mint ? "debt ceiling" : "deposits"} on loan.
          </ExplainBullet>
        )}
        {p.kind === "semilog" && (
          <ExplainBullet>
            The borrow rate climbs from <Fig>{ratePercentText(p.min)}</Fig> with nothing lent to{" "}
            <Fig>{ratePercentText(p.max)}</Fig> with everything lent.
          </ExplainBullet>
        )}
        {p.kind === "time" && (
          <ExplainBullet>
            The borrow rate follows time alone, rising about <Fig>{Math.round(p.slopePctPerYear)}</Fig> points a year.
          </ExplainBullet>
        )}
        {p.kind === "peg" && (
          <ExplainBullet>The borrow rate follows crvUSD&apos;s price and the Peg Stabilization Reserve.</ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Loans and bands">
        <ExplainBullet>
          <Fig bold>{m.nLoans.toLocaleString("en-US")}</Fig> loans are open.
        </ExplainBullet>
        <ExplainBullet>
          A loan&apos;s collateral sits in bands, each about <Fig>{((1 / m.A) * 100).toFixed(1)}%</Fig> of the price
          wide at A <Fig bold>{m.A}</Fig>.
        </ExplainBullet>
        <ExplainBullet>
          A loan may draw what its bands would hold at their lowest price, less the{" "}
          <Fig bold>{pctText(m.loanDiscount)}</Fig> loan discount.
        </ExplainBullet>
        <ExplainBullet>
          A loan&apos;s health counts its bands less the <Fig bold>{pctText(m.liquidationDiscount)}</Fig> liquidation
          discount; below 0 anyone may liquidate it.
        </ExplainBullet>
      </ExplainGroup>
    </>
  );
}

function marketMarkdown(x: Ctx): string {
  const m = x.m;
  const s = supplied(x);
  return [
    `# ${x.pair}, a LlamaLend market on Ethereum`,
    "",
    `- Market: ${FACTORY_LABEL[m.factory]}`,
    x.mint
      ? `- Debt ceiling: ${m.debtCeiling != null ? sym(x, m.debtCeiling) : "not read"}`
      : `- Supplied: ${s != null ? sym(x, s) : "not read"}`,
    `- Borrowed: ${sym(x, m.totalDebt)}`,
    ...(m.available != null ? [`- Available: ${sym(x, m.available)}`] : []),
    ...(x.d.lendAprPct != null ? [`- Supply rate: ${ratePercentText(x.d.lendAprPct / 100)} APR`] : []),
    ...(m.borrowAprPct != null ? [`- Borrow rate: ${ratePercentText(m.borrowAprPct / 100)} APR`] : []),
    ...(m.utilisation != null ? [`- Utilisation: ${pctText(m.utilisation)} of ${m.utilisationBasis}`] : []),
    `- Loans: ${m.nLoans}`,
    `- A: ${m.A}`,
    `- Loan discount: ${pctText(m.loanDiscount)}`,
    `- Liquidation discount: ${pctText(m.liquidationDiscount)}`,
    `- Oracle price: ${m.priceOracle} ${m.borrowedSymbol} per ${m.collateralSymbol}`,
    `- Controller: ${m.controller}`,
    "",
    `Read from Ethereum at block ${x.d.blockNumber.toLocaleString("en-US")}.`,
  ].join("\n");
}

function headOf(x: Ctx): ProductHead {
  const m = x.m;
  const c = x.c;
  const s = supplied(x);
  const none = (title: string) => (
    <span className="text-rb-500" title={title}>
      none
    </span>
  );
  const contracts: ReadContract[] = [
    {
      name: `${x.pair} controller`,
      address: m.controller,
      reads: "total_debt, n_loans, loan_discount, liquidation_discount and monetary_policy",
    },
    { name: `${x.pair} AMM (LLAMMA)`, address: m.amm, reads: "A, price_oracle and the rate it charges now" },
    { name: `${x.pair} monetary policy`, address: m.monetaryPolicy, reads: "rate(controller), min_rate and max_rate" },
    ...(x.d.vault ? [{ name: `${x.pair} vault`, address: x.d.vault, reads: "lend_apr" }] : []),
  ];
  return {
    scope: "market-head",
    title: x.pair,
    subtitle: (
      <p className="mt-1 text-[13px] text-rb-500" data-llamalend-market-line="">
        <Prov info={llamaMarketIdentityProv(c)}>
          {x.mint
            ? `Mints crvUSD against ${m.collateralSymbol}`
            : `Lends ${m.borrowedSymbol} against ${m.collateralSymbol}`}
        </Prov>
      </p>
    ),
    figures: [
      x.mint
        ? {
            slot: "sizeIn" as const,
            label: "Debt ceiling",
            tip: "The most crvUSD this market may have out",
            value: (
              <span data-vital="debt-ceiling">
                {m.debtCeiling != null ? (
                  <Prov info={llamaCeilingProv(c)}>{sym(x, m.debtCeiling)}</Prov>
                ) : (
                  none("Not read")
                )}
              </span>
            ),
          }
        : {
            slot: "sizeIn" as const,
            label: "Supplied",
            tip: "Lenders' deposits: what is lent plus what is available",
            value: (
              <span data-vital="supplied">
                {s != null ? <Prov info={llamaSuppliedProv(c)}>{sym(x, s)}</Prov> : none("Not read")}
              </span>
            ),
          },
      {
        slot: "sizeOut",
        label: "Borrowed",
        tip: TIP.borrowed,
        value: (
          <span data-vital="borrowed">
            <Prov info={llamaDebtProv(c)}>{sym(x, m.totalDebt)}</Prov>
          </span>
        ),
      },
      {
        slot: "sizeFree",
        label: "Available",
        tip: TIP.available,
        value: (
          <span data-vital="available">
            {m.available != null ? <Prov info={llamaAvailableProv(c)}>{sym(x, m.available)}</Prov> : none("Not read")}
          </span>
        ),
      },
      {
        slot: "rateIn",
        label: "Supply rate",
        tip: x.mint ? "A mint market has no lenders" : TIP.supplyRate,
        value: (
          <span data-vital="supply-rate">
            {x.d.lendAprPct != null ? (
              <Prov info={llamaSupplyRateProv(x.d.vault, c)}>{ratePercentText(x.d.lendAprPct / 100)}</Prov>
            ) : (
              none(x.mint ? "A mint market has no lenders" : "Not read")
            )}
          </span>
        ),
      },
      {
        slot: "rateOut",
        label: "Borrow rate",
        tip: TIP.borrowRate,
        value: (
          <span data-vital="borrow-rate">
            {m.borrowAprPct != null ? (
              <Prov info={llamaBorrowRateProv(c)}>{ratePercentText(m.borrowAprPct / 100)}</Prov>
            ) : (
              none("Not read")
            )}
            {x.charged != null && (
              <span className="block text-[11px] font-normal text-rb-500" data-llamalend-charged="">
                <Prov info={llamaChargedRateProv(c)}>{ratePercentText(x.charged / 100)}</Prov> until the next loan
                action
              </span>
            )}
          </span>
        ),
      },
      {
        slot: "usage",
        label: "Utilisation",
        tip: x.mint ? TIP.utilMint : TIP.utilLend,
        value: (
          <span data-vital="utilisation">
            {m.utilisation != null ? (
              <Prov info={llamaUtilisationProv(c)}>{pctText(m.utilisation)}</Prov>
            ) : (
              none("Nothing to measure against")
            )}
          </span>
        ),
      },
      {
        slot: "population",
        label: "Loans",
        tip: TIP.loans,
        value: <Prov info={llamaOpenLoansProv(c)}>{m.nLoans.toLocaleString("en-US")}</Prov>,
      },
    ],
    structure: {
      kind: "eras",
      era: {
        label: "Market",
        value: <span data-prov-exempt="">{era(m)}</span>,
        tip: "The factory that created the market",
        hooks: { "data-llamalend-era": m.version },
      },
    },
    collateral: {
      kind: "bands",
      a: { label: "A", tip: TIP.a, value: <Prov info={llamaAmplificationProv(c)}>{m.A}</Prov> },
      loanDiscount: {
        label: "Loan discount",
        tip: TIP.loanDiscount,
        value: <Prov info={llamaDiscountProv("loan", c)}>{pctText(m.loanDiscount)}</Prov>,
      },
      liquidationDiscount: {
        label: "Liquidation discount",
        tip: TIP.liquidationDiscount,
        value: <Prov info={llamaDiscountProv("liquidation", c)}>{pctText(m.liquidationDiscount)}</Prov>,
      },
    },
    readAt:
      x.d.blockNumber > 0
        ? {
            chainId: MAINNET_CHAIN_ID,
            block: x.d.blockNumber,
            readBy: x.c.readBy,
            receipt: (at) =>
              readStampProv({
                chainId: MAINNET_CHAIN_ID,
                block: x.d.blockNumber,
                at,
                readBy: x.c.readBy,
                what: `Every figure on the ${x.pair} market`,
                contracts: readContracts(contracts),
              }),
          }
        : null,
    tools: {
      links: [
        {
          item: "markets",
          title: "All markets",
          subtitle: "Every LlamaLend market",
          href: `${ROOT}/markets`,
          internal: true,
        },
        {
          item: "positions",
          title: "All LlamaLend positions",
          subtitle: "Every loan Rails holds",
          href: ROOT,
          internal: true,
        },
        {
          item: "controller",
          title: `Controller on Etherscan`,
          subtitle: `The ${x.pair} market`,
          href: explorerUrl(MAINNET_CHAIN_ID, "address", m.controller),
        },
        docsLink,
      ],
      exports: { markdown: { build: () => marketMarkdown(x), copySubtitle: "This market as Markdown, for an LLM" } },
    },
    explainer: { body: <MarketExplainer x={x} />, label: "market explanation" },
    learnMore: null,
    anatomy: "M3.1",
    bandHooks: { "data-anatomy": "M3.2", "data-reserve-vitals": "" },
  };
}

const CURVE_HELP: LearnMoreContent = {
  title: "How a lend market's rate is set",
  intro:
    "A LlamaLend lend market's monetary policy sets the borrow rate from utilisation, the share of lenders' deposits on loan. The rate climbs exponentially from its minimum with nothing lent to its maximum with everything lent.",
  detailsHeading: "The policy's terms:",
  details: [
    { bold: "Minimum rate", text: "the borrow rate at 0% utilisation." },
    { bold: "Maximum rate", text: "the borrow rate at 100% utilisation." },
    {
      bold: "When it applies",
      text: "the market writes the policy's rate at each loan action, and charges it until the next.",
    },
  ],
  extraParagraphs: ["Lenders earn the interest borrowers pay, spread over all deposits."],
  links: [{ label: "Curve docs: lend market rates", url: `${DOCS}/borrowing#lend-market-rates` }],
};

function curveOf(x: Ctx): RateCurveModel | Missing {
  const m = x.m;
  const p = x.policy;
  if (p.kind === "peg")
    return {
      missing:
        "A mint market's rate follows crvUSD's price and the Peg Stabilization Reserve, so it has no utilisation curve.",
    };
  if (p.kind === "time")
    return {
      missing: `This market's rate follows time alone: it started at ${p.basePct}% a year on ${formatDate(p.since)} and rises about ${Math.round(p.slopePctPerYear)} points a year${p.min != null && p.max != null ? `, held between ${ratePercentText(p.min)} and ${ratePercentText(p.max)}` : ""}${x.d.policySharers > 1 ? `. ${x.d.policySharers - 1} other markets use the same policy` : ""}.`,
    };
  if (p.kind === "other") return { missing: "Rails does not draw this market's rate policy yet." };
  const u = m.utilisation;
  const borrow = (m.borrowAprPct ?? 0) / 100;
  return {
    optimal: 1,
    noKink: true,
    base: 0,
    slope1: 0,
    slope2: 0,
    semilog: { min: p.min, max: p.max },
    reserveFactor: 0,
    now: {
      utilisation: u,
      borrow,
      supply: x.d.lendAprPct != null ? x.d.lendAprPct / 100 : borrow * (u ?? 0),
    },
    symbol: m.borrowedSymbol,
    receipt: llamaCurveProv(x.c),
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

function CurveTerms({ x }: { x: Ctx }) {
  const p = x.policy;
  if (p.kind !== "semilog") return null;
  return (
    <dl className="mt-4 grid max-w-md grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]" data-rate-terms="">
      <Term term="Minimum rate" title="The borrow rate with nothing lent">
        <Prov info={llamaCurveProv(x.c)}>{ratePercentText(p.min)} a year</Prov>
      </Term>
      <Term term="Maximum rate" title="The borrow rate with everything lent">
        <Prov info={llamaCurveProv(x.c)}>{ratePercentText(p.max)} a year</Prov>
      </Term>
    </dl>
  );
}

function Parameters({ x }: { x: Ctx }) {
  const m = x.m;
  const c = x.c;
  const share = YIELD_SHARES[m.collateralToken?.toLowerCase() ?? ""];
  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]" data-reserve-parameters="">
        <Term term="Collateral">{m.collateralSymbol}</Term>
        <Term term="Borrowed token">{m.borrowedSymbol}</Term>
        <Term term="Market" title="The factory that created the market">
          {era(m)}
        </Term>
        <Term term="Oracle price" title="The price the market's AMM uses for the collateral, in the borrowed token">
          <Prov info={llamaPriceOracleProv(c)}>
            {m.priceOracle.toLocaleString("en-US", { maximumFractionDigits: m.priceOracle < 10 ? 4 : 2 })}{" "}
            {m.borrowedSymbol}
          </Prov>
        </Term>
        <Term term="A" title={TIP.a}>
          <Prov info={llamaAmplificationProv(c)}>{m.A}</Prov>
        </Term>
        <Term term="Loan discount" title={TIP.loanDiscount}>
          <Prov info={llamaDiscountProv("loan", c)}>{pctText(m.loanDiscount)}</Prov>
        </Term>
        <Term term="Liquidation discount" title={TIP.liquidationDiscount}>
          <Prov info={llamaDiscountProv("liquidation", c)}>{pctText(m.liquidationDiscount)}</Prov>
        </Term>
        {x.mint && (
          <Term term="Debt ceiling">
            {m.debtCeiling != null ? <Prov info={llamaCeilingProv(c)}>{sym(x, m.debtCeiling)}</Prov> : "not read"}
          </Term>
        )}
        <Term term="Interest goes to">{x.mint ? "Curve: scrvUSD savers and veCRV holders" : "the lenders"}</Term>
      </dl>
      {share && (
        <p className="mt-3 text-[13px] text-rb-500" data-llamalend-yield-share="">
          {m.collateralSymbol} is a yield-bearing share of {share}: each share redeems for more {share} as yield
          accrues, so the oracle prices it above 1.
        </p>
      )}
    </>
  );
}

function sectionsOf(x: Ctx): ProductSection[] {
  const m = x.m;
  const link = (item: string, title: string, subtitle: string, address: string): SectionMenuLink => ({
    item,
    title,
    subtitle,
    href: explorerUrl(MAINNET_CHAIN_ID, "address", address),
  });
  return [
    {
      scope: "market-curve",
      anatomy: "M3.3",
      title: "Rate curve",
      raised: true,
      learnMore: x.policy.kind === "semilog" ? CURVE_HELP : null,
      tools: {
        links: [link("rate-model", "Monetary policy on Etherscan", `The ${x.pair} rate policy`, m.monetaryPolicy)],
      },
      body: (
        <>
          <RateCurve curve={curveOf(x)} />
          <CurveTerms x={x} />
        </>
      ),
    },
    {
      scope: "market-parameters",
      anatomy: "M3.5",
      title: "Parameters",
      raised: "narrow",
      tools: {
        links: [
          link("amm", "AMM on Etherscan", "The LLAMMA that holds the collateral in bands", m.amm),
          ...(x.d.vault ? [link("vault", "Vault on Etherscan", "Lenders' deposits", x.d.vault)] : []),
          link("collateral", `${m.collateralSymbol} on Etherscan`, "The collateral token", m.collateralToken),
          link("borrowed", `${m.borrowedSymbol} on Etherscan`, "The borrowed token", m.borrowedToken),
        ],
        exports: { markdown: { build: () => marketMarkdown(x), copySubtitle: "This market as Markdown, for an LLM" } },
      },
      body: <Parameters x={x} />,
    },
    {
      scope: "market-holders",
      anatomy: "M3.7 M3.8",
      title: x.mint ? "Largest borrowers" : "Largest suppliers and borrowers",
      tools: {
        links: [
          {
            item: "positions",
            title: "All LlamaLend positions",
            subtitle: "Every loan Rails holds",
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

export function LlamalendMarketPage({ data, pair }: { data: LlamalendMarketDetail | null; pair: string }) {
  const x = data ? ctxOf(data) : null;
  const market: Loadable<MarketModel> = x
    ? { state: "ok", data: { head: headOf(x), sections: sectionsOf(x) } }
    : { state: "error", message: "The market could not be read from chain. Reload to try again." };
  return (
    <MarketPage
      header={{ protocol: protocolForHref(ROOT)!, title: x?.pair ?? pair }}
      market={market}
      what={`the ${pair} market`}
      hooks={{ "data-llamalend-market-page": data?.market.controller }}
    />
  );
}
