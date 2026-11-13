"use client";

// The Comptroller family's product adapter (rails-ops ui-jobs 549 step 3;
// decisions 0043 and 0059): Compound V2 on Ethereum and Moonwell on Ethereum
// and Base, one adapter over a per-family config (lib/comptroller/families.ts).
// Each runs one Comptroller, so each explorer is one market: the Markets tab
// is the market page (R2: the head, then one row per cToken or mToken, which
// the protocol calls a market), and each row opens that market's page (R3:
// the head, the rate curve, the parameters, and history and holders as
// missing, since rails-server keeps those for the Aave family alone).
//
// Surface rules (decision 0059): the docs' APY labels on the rates; the
// read time in the head's stamp with the block and contracts in its receipt;
// the Comptroller, oracle and rate model off-site in the ⋮; a market token's
// address in its asset cell's receipt. A state every market shares (borrowing
// paused on all of Compound V2, every Base borrow cap closed) is said once on
// the head; a row carries only what sets it apart.

import Link from "next/link";
import type { ReactNode } from "react";
import { ExplainBullet, ExplainGroup, ExplainSub, Fig } from "@/components/shared/explain-groups";
import { readStampProv } from "@/components/shared/read-stamp";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { AssetUnit } from "@/components/shared/asset-unit";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { DATA_TABLE_PILL, DataTableAmount } from "@/components/shared/data-table/data-table";
import { MarketPage } from "@/components/shared/product/market-page";
import { ReservePage } from "@/components/shared/product/reserve-page";
import { RateCurve } from "@/components/shared/product/rate-curve";
import { positionEntry } from "@/components/shared/product/position-entry";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import { fmtUsd } from "@/lib/aave-v4/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { capShows, type CapState } from "@/lib/shared/aave-market-view";
import { DEPRECATED_CONSEQUENCE } from "@/lib/compound-v2/deprecated-markets";
import { MOONWELL_BASE_BORROW_FREEZE_DATE } from "@/lib/moonwell-base/borrow-freeze";
import { COMPTROLLER_FAMILIES, vocabFamily, type ComptrollerFamily } from "@/lib/comptroller/families";
import type { ComptrollerMarket, ComptrollerRead } from "@/lib/comptroller/markets";
import { curveConstants, modelUtilisation } from "@/lib/comptroller/rate-model";
import { apyOfYear, yearOfApy } from "@/lib/comptroller/apy";
import {
  cmAmountProv,
  cmAvailableProv,
  cmCapProv,
  cmCloseFactorProv,
  cmCollateralFactorProv,
  cmCurveProv,
  cmIdentityProv,
  cmLiquidationIncentiveProv,
  cmPauseProv,
  cmPriceProv,
  cmRateProv,
  cmRateTermProv,
  cmReserveFactorProv,
  cmRosterProv,
  cmSummaryValueProv,
  cmUtilisationProv,
  cmValueProv,
  type ComptrollerCoords,
  type ComptrollerVocabFamily,
} from "@/lib/comptroller/markets-provenance";
import type {
  EntryLink,
  Loadable,
  MarketModel,
  Missing,
  ProductHead,
  ProductSection,
  ReadAt,
  RateCurveModel,
  ReserveRowModel,
  ReserveTableModel,
} from "@/lib/shared/product/model";
import type { ReservePageData } from "@/components/shared/product/reserve-page";

// ── Words ────────────────────────────────────────────────────────────────────

/** The rate columns' tips: an APY, compounded the family's way. */
const rateTip = (f: ComptrollerFamily, side: "supply" | "borrow") =>
  `What ${side === "supply" ? "suppliers earn" : "borrowers pay"} a year as an APY, ${f.apy.compounding}`;

const TIP = {
  available: "The token the market holds now: what can be withdrawn or borrowed",
  collateral: "The share of a supply's value that counts toward borrowing",
  util: "Borrowed ÷ (cash + borrowed − reserves), the quotient the rate model prices from",
} as const;

/** The (i) and "?" for each family's page header. */
const LEARN_MORE: Record<ComptrollerFamily["token"], (f: ComptrollerFamily) => LearnMoreContent> = {
  cToken: (f) => ({
    title: `How a ${f.name} market works`,
    intro: `${f.name} runs one Comptroller over many markets. Each market is one token in its own pool: suppliers put the token in and get cTokens back, and borrowers take it out against collateral in any market they have entered.`,
    detailsHeading: "Key terms:",
    details: [
      { bold: "cToken", text: "the supplier's receipt. Its exchange rate rises as borrowers pay interest." },
      {
        bold: "Collateral factor",
        text: "the share of a supply's value that counts toward borrowing. At zero the market backs no loans.",
      },
      {
        bold: "Reserve factor",
        text: "the share of borrowers' interest the market keeps as reserves. Suppliers earn the rest.",
      },
      {
        bold: "Rate model",
        text: "the contract that sets the borrow rate from utilization. Most turn steeper at a kink.",
      },
    ],
    links: [{ label: f.docs.label, url: f.docs.href }],
  }),
  mToken: (f) => ({
    title: `How a ${f.name} market works`,
    intro: `${f.name} runs one Comptroller over many markets on ${chainMeta(f.chainId).name}. Each market is one token in its own pool: suppliers put the token in and get mTokens back, and borrowers take it out against collateral in any market they have entered.`,
    detailsHeading: "Key terms:",
    details: [
      { bold: "mToken", text: "the supplier's receipt. Its exchange rate rises as borrowers pay interest." },
      {
        bold: "Collateral factor",
        text: "the share of a supply's value that counts toward borrowing. At zero the market backs no loans.",
      },
      {
        bold: "Caps",
        text: "the most a market accepts in supply, and the most that can be borrowed from it. A cap of one base unit closes that side.",
      },
      {
        bold: "Rate model",
        text: "the contract that sets the borrow rate from utilization. It turns steeper at a kink.",
      },
    ],
    links: [{ label: f.docs.label, url: f.docs.href }],
  }),
};

const CURVE_HELP: LearnMoreContent = {
  title: "How the rate curve works",
  intro:
    "Each market names a rate model. The model sets the borrow rate from the market's utilization, the share of its money on loan.",
  detailsHeading: "The model's terms:",
  details: [
    { bold: "Base rate", text: "the borrow rate at zero utilization." },
    { bold: "Multiplier", text: "how much the rate climbs for each unit of utilization, up to the kink." },
    { bold: "Kink", text: "the utilization where the rate turns steeper." },
    { bold: "Jump multiplier", text: "how much it climbs for each unit past the kink." },
  ],
  extraParagraphs: [
    "Suppliers earn the borrow rate times utilization, less the reserve factor. A model with no kink climbs in a straight line.",
  ],
};

/** Moonwell on Base closed every market to new borrowing on this date. */
const FREEZE: Partial<Record<ComptrollerFamily["key"], string>> = { "moonwell-base": MOONWELL_BASE_BORROW_FREEZE_DATE };

// ── Formats ──────────────────────────────────────────────────────────────────

const pct = (f: number | null, dp = 1) => (f == null ? "—" : `${Number((f * 100).toFixed(dp))}%`);
const usdText = (v: number) => fmtUsd(v).display;
const tokens = (v: number, symbol: string) => `${formatCompact(v)} ${symbol}`;
const NUM = "tabular-nums text-[13px]";
const RATE = "whitespace-nowrap tabular-nums text-[13px] text-foreground/80";
const NOTE = "text-[13px] text-rb-500";
const TAG = `${DATA_TABLE_PILL} whitespace-nowrap px-1 py-px text-[10px] uppercase tracking-wide`;
const PILL = `${DATA_TABLE_PILL} inline-block whitespace-nowrap px-1 py-px text-[10px] leading-tight`;
const PILL_CLOSED = `${PILL} text-tone-caution dark:text-tone-caution`;
const DASH = <span className="text-rb-500">—</span>;

// ── A market, read ───────────────────────────────────────────────────────────

/** What a page needs about the family it draws. */
interface Ctx {
  f: ComptrollerFamily;
  v: ComptrollerVocabFamily;
  read: ComptrollerRead;
  /** States every market shares, said once on the head. */
  shared: { mintPaused: boolean; borrowPaused: boolean; borrowClosed: boolean };
}

function ctxOf(read: ComptrollerRead): Ctx {
  const f = COMPTROLLER_FAMILIES[read.family];
  const ms = read.markets;
  const all = (p: (m: ComptrollerMarket) => boolean) => ms.length > 1 && ms.every(p);
  return {
    f,
    v: vocabFamily(f),
    read,
    shared: {
      mintPaused: all((m) => m.mintPaused),
      borrowPaused: all((m) => m.borrowPaused),
      borrowClosed: all((m) => m.borrowCapOneUnit),
    },
  };
}

const coordsOf = (x: Ctx, m?: ComptrollerMarket): ComptrollerCoords => ({
  readBy: x.read.readBy,
  blockNumber: x.read.blockNumber,
  oracle: x.read.oracle,
  ...(m
    ? { market: m.market, marketSymbol: m.marketSymbol, symbol: m.symbol, irm: m.irm, priceFeed: m.priceFeed }
    : {}),
});

const utilisationOf = (m: ComptrollerMarket) =>
  m.supplied > 0 ? modelUtilisation(m.rateModel ?? { reservesInUtil: true }, m.cash, m.borrowed, m.reserves) : null;

/** One side's cap, as the Aave family's `CapState`. A pause is its own line. */
function capOf(x: Ctx, m: ComptrollerMarket, side: "supply" | "borrow"): CapState {
  if (side === "supply" ? m.supplyCapOneUnit : m.borrowCapOneUnit) return { state: "closed", basis: "live" };
  const cap = side === "supply" ? (x.f.supplyCaps ? m.supplyCap : null) : m.borrowCap;
  if (cap == null || cap <= 0) return { state: "none", why: "zero", basis: "live" };
  const amount = side === "supply" ? m.supplied : m.borrowed;
  return { state: "used", used: amount / cap, amount, cap, basis: "live", liveCap: null };
}

/** The listing filtered to one side of a market, where the filter names it alone. */
function listingHref(x: Ctx, m: ComptrollerMarket, side: "supply" | "borrow"): string | null {
  const value = x.f.listingFilter === "symbol" ? m.symbol : m.market;
  if (x.f.listingFilter === "symbol" && x.read.markets.filter((o) => o.symbol === m.symbol).length > 1) return null;
  return `${x.f.root}?${side}=${encodeURIComponent(value)}`;
}

// ── Figures ──────────────────────────────────────────────────────────────────

/** A size in dollars at the oracle's price, or in the token where it has none. */
function Size({ x, m, side }: { x: Ctx; m: ComptrollerMarket; side: "supplied" | "borrowed" }) {
  const c = coordsOf(x, m);
  const n = side === "supplied" ? m.supplied : m.borrowed;
  if (m.priceUsd == null) return <Prov info={cmAmountProv(x.v, c, side)}>{tokens(n, m.symbol)}</Prov>;
  return <Prov info={cmValueProv(x.v, c, side)}>{usdText(n * m.priceUsd)}</Prov>;
}

function figuresOf(x: Ctx, m: ComptrollerMarket) {
  const c = coordsOf(x, m);
  const link = (side: "supply" | "borrow", body: ReactNode, n: number) => {
    const href = n > 0 ? listingHref(x, m, side) : null;
    return href ? (
      <Link
        href={href}
        className={INLINE_LINK}
        title={`Positions ${side === "supply" ? "supplying" : "borrowing"} ${m.symbol}`}
      >
        {body}
      </Link>
    ) : (
      <span className={n > 0 ? "text-foreground/80" : "text-rb-500"}>{body}</span>
    );
  };
  const supplied = link("supply", <Size x={x} m={m} side="supplied" />, m.supplied);
  const borrowed = m.borrowed > 0 ? link("borrow", <Size x={x} m={m} side="borrowed" />, m.borrowed) : null;
  const available = (
    <span className={m.cash > 0 ? "text-foreground/80" : "text-rb-500"}>
      <Prov info={cmAvailableProv(x.v, c, m.priceUsd != null)}>
        {m.priceUsd != null ? usdText(m.cash * m.priceUsd) : tokens(m.cash, m.symbol)}
      </Prov>
    </span>
  );
  const supplyRate =
    m.supplyApr != null && m.supplied > 0 ? (
      <Prov
        info={cmRateProv(x.v, c, "supply", {
          perPeriodRaw: m.supplyRatePerPeriodRaw,
          modelPeriodsPerYear: m.modelPeriodsPerYear,
        })}
      >
        {ratePercentText(m.supplyApr)}
      </Prov>
    ) : (
      DASH
    );
  const borrowRate =
    m.borrowApr != null && m.borrowed > 0 ? (
      <Prov
        info={cmRateProv(x.v, c, "borrow", {
          perPeriodRaw: m.borrowRatePerPeriodRaw,
          modelPeriodsPerYear: m.modelPeriodsPerYear,
        })}
      >
        {ratePercentText(m.borrowApr)}
      </Prov>
    ) : (
      DASH
    );
  const u = utilisationOf(m);
  const utilization =
    u != null && m.rateModel ? (
      <Prov info={cmUtilisationProv(x.v, c, m.rateModel)}>{pct(u, 0)}</Prov>
    ) : u != null ? (
      <Prov info={cmUtilisationProv(x.v, c, { reservesInUtil: true })}>{pct(u, 0)}</Prov>
    ) : (
      "—"
    );
  const price =
    m.priceUsd != null ? (
      <Prov info={cmPriceProv(x.v, c, m.priceHasFeed)}>
        {m.priceUsd >= 1000
          ? `$${m.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
          : `$${m.priceUsd.toLocaleString("en-US", { maximumSignificantDigits: 4 })}`}
      </Prov>
    ) : (
      DASH
    );
  // The table's amount cells (D1, decision 0047): the token amount over its
  // oracle dollars, the amount an echo of the dollar figure's receipt and the
  // carrier of the side's link. Null where the cell keeps one line: no oracle
  // price (tokens only) or a side at zero.
  const amountOf = (n: number, info: Provenance, side: "supply" | "borrow" | null) => {
    const figure = (
      <Prov info={info} echo>
        <span className="inline-flex items-center gap-1.5">
          {formatCompact(n)}
          <AssetUnit symbol={m.symbol} address={m.underlying ?? m.market} />
        </span>
      </Prov>
    );
    const href = side ? listingHref(x, m, side) : null;
    return href ? (
      <Link
        href={href}
        className={INLINE_LINK}
        title={`Positions ${side === "supply" ? "supplying" : "borrowing"} ${m.symbol}`}
      >
        {figure}
      </Link>
    ) : (
      figure
    );
  };
  const p = m.priceUsd;
  const pair = (n: number, info: Provenance, side: "supply" | "borrow" | null) =>
    p != null && n > 0 ? { amount: amountOf(n, info, side), value: <Prov info={info}>{usdText(n * p)}</Prov> } : null;
  const amounts = {
    supplied: pair(m.supplied, cmValueProv(x.v, c, "supplied"), "supply"),
    borrowed: pair(m.borrowed, cmValueProv(x.v, c, "borrowed"), "borrow"),
    available: pair(m.cash, cmAvailableProv(x.v, c, true), null),
  };
  return { supplied, borrowed, available, amounts, supplyRate, borrowRate, utilization, price, u };
}

/** The Collateral cell: the collateral factor, or "Not collateral" at zero. */
function Collateral({ x, m }: { x: Ctx; m: ComptrollerMarket }) {
  const info = cmCollateralFactorProv(x.v, coordsOf(x, m));
  if (m.collateralFactor == null)
    return (
      <span
        className="text-rb-500"
        title="A collateral factor of 0: supplying it adds nothing to what a wallet can borrow"
      >
        <Prov info={info}>Not collateral</Prov>
      </span>
    );
  return <Prov info={info}>{pct(m.collateralFactor)}</Prov>;
}

/** A side's cap beside its dollar value (under its size when unpriced), near binding or closed. */
function CapPill({ x, m, side }: { x: Ctx; m: ComptrollerMarket; side: "supply" | "borrow" }) {
  const c = capOf(x, m, side);
  if (side === "borrow" && (x.shared.borrowClosed || x.shared.borrowPaused)) return null;
  if (!capShows(c)) return null;
  const co = coordsOf(x, m);
  if (c.state === "closed")
    return (
      <span
        className={PILL_CLOSED}
        title={`A ${side} cap of one base unit of ${m.symbol}: governance closes a side this way, so no share is quoted.`}
        data-caps={side}
      >
        cap <Prov info={cmCapProv(x.v, co, side, "closed")}>closed</Prov>
      </span>
    );
  if (c.state !== "used") return null;
  if (c.used >= 1)
    return (
      <span
        className={PILL_CLOSED}
        title={`Governance set the ${side} cap, ${tokens(c.cap, m.symbol)}, at or below the ${tokens(c.amount, m.symbol)} ${side === "supply" ? "supplied" : "borrowed"}, so no new ${side === "supply" ? "supply" : "borrowing"} is taken.`}
        data-caps={side}
      >
        cap <Prov info={cmCapProv(x.v, co, side, "used", { amount: c.amount, cap: c.cap })}>reached</Prov>
      </span>
    );
  return (
    <span
      className={PILL}
      title={`${tokens(c.amount, m.symbol)} of a ${tokens(c.cap, m.symbol)} ${side} cap`}
      data-caps={side}
    >
      cap <Prov info={cmCapProv(x.v, co, side, "used", { amount: c.amount, cap: c.cap })}>{pct(c.used, 0)}</Prov>
    </span>
  );
}

/** The row's state tags: deprecated, a fixed price, a pause the other markets do not share. */
function Tags({ x, m }: { x: Ctx; m: ComptrollerMarket }) {
  const c = coordsOf(x, m);
  const mint = m.mintPaused && !x.shared.mintPaused;
  const borrow = m.borrowPaused && !x.shared.borrowPaused;
  return (
    <>
      {m.deprecatedSince && (
        <span
          className={TAG}
          title={`Deprecated since ${m.deprecatedSince}: ${DEPRECATED_CONSEQUENCE}`}
          data-market-deprecated=""
        >
          deprecated
        </span>
      )}
      {!m.priceHasFeed && m.priceUsd != null && (
        <span className={TAG} title="A price governance stored, with no feed behind it" data-market-fixed-price="">
          <Prov info={cmPriceProv(x.v, c, false)}>fixed price</Prov>
        </span>
      )}
      {(mint || borrow) && (
        <span
          className={TAG}
          title={mint && borrow ? x.f.pause.both : mint ? x.f.pause.supply : x.f.pause.borrow}
          data-market-paused=""
        >
          <Prov info={cmPauseProv(x.v, c, mint ? "supply" : "borrow", true)}>
            {mint && borrow ? "paused" : mint ? "supply paused" : "borrow paused"}
          </Prov>
        </span>
      )}
    </>
  );
}

/** The utilization bar with the kink tick; the share beside it carries its receipt. */
function UtilBar({ m, value }: { m: ComptrollerMarket; value: ReactNode }) {
  const u = utilisationOf(m);
  const kink = m.rateModel?.kink ?? null;
  const ticks: RatioBarTick[] =
    kink != null
      ? [
          {
            f: kink,
            kind: "neutral",
            title: `Rate model kink · the utilization this market's curve turns at (${pct(kink, 0)})`,
          },
        ]
      : [];
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 [&>div]:mt-0">
        <RatioBar fill={Math.min(1, u ?? 0)} ticks={ticks} />
      </div>
      <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-foreground/80">{value}</span>
    </div>
  );
}

// ── Exports ──────────────────────────────────────────────────────────────────

const csvCell = (v: string | number | null | undefined) => {
  const t = v == null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function marketsCsv(x: Ctx): string {
  const head = [
    "market",
    "market_symbol",
    "underlying",
    "symbol",
    "price_usd",
    "supplied",
    "borrowed",
    "available",
    "reserves",
    "supply_apy",
    "borrow_apy",
    "collateral_factor",
    "reserve_factor",
    "utilization",
    "supply_cap",
    "borrow_cap",
    "supply_paused",
    "borrow_paused",
  ];
  const rows = x.read.markets.map((m) =>
    [
      m.market,
      m.marketSymbol,
      m.underlying ?? "",
      m.symbol,
      m.priceUsd,
      m.supplied,
      m.borrowed,
      m.cash,
      m.reserves,
      m.supplyApr,
      m.borrowApr,
      m.collateralFactor ?? 0,
      m.reserveFactor,
      utilisationOf(m),
      m.supplyCapOneUnit ? "one base unit" : m.supplyCap,
      m.borrowCapOneUnit ? "one base unit" : m.borrowCap,
      m.mintPaused ? "yes" : "",
      m.borrowPaused ? "yes" : "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

const sizeText = (m: ComptrollerMarket, n: number) =>
  m.priceUsd != null ? usdText(n * m.priceUsd) : tokens(n, m.symbol);

function marketsMarkdown(x: Ctx): string {
  const t = totals(x);
  const chain = chainMeta(x.f.chainId).name;
  return [
    `# ${x.f.name} markets on ${chain}`,
    "",
    `- Markets listed: ${x.read.markets.length}`,
    `- Supplied: ${usdText(t.supplied)}`,
    `- Borrowed: ${usdText(t.borrowed)}`,
    `- Utilization: ${pct(t.u)}`,
    "",
    "| Asset | Market | Supplied | Borrowed | Available | Supply APY | Borrow APY | Collateral factor | Utilization |",
    "|---|---|---|---|---|---|---|---|---|",
    ...x.read.markets.map(
      (m) =>
        `| ${m.symbol} | ${m.marketSymbol} | ${sizeText(m, m.supplied)} | ${sizeText(m, m.borrowed)} | ${sizeText(m, m.cash)} | ${m.supplyApr != null ? ratePercentText(m.supplyApr) : "—"} | ${m.borrowApr != null ? ratePercentText(m.borrowApr) : "—"} | ${m.collateralFactor != null ? pct(m.collateralFactor) : "Not collateral"} | ${pct(utilisationOf(m), 0)} |`,
    ),
    "",
    `Read from ${chain} at block ${x.read.blockNumber.toLocaleString("en-US")}. Rates are APYs, ${x.f.apy.compounding}.`,
  ].join("\n");
}

// ── The market page (R2) ─────────────────────────────────────────────────────

function totals(x: Ctx) {
  const priced = x.read.markets.filter((m) => m.priceUsd != null);
  const supplied = priced.reduce((s, m) => s + m.supplied * m.priceUsd!, 0);
  const borrowed = priced.reduce((s, m) => s + m.borrowed * m.priceUsd!, 0);
  return { supplied, borrowed, u: supplied > 0 ? borrowed / supplied : null };
}

/** The counts the head's notes and (i) state. */
function counts(x: Ctx) {
  const ms = x.read.markets;
  const n = (p: (m: ComptrollerMarket) => boolean) => ms.filter(p).length;
  return {
    total: ms.length,
    notCollateral: n((m) => m.collateralFactor == null),
    fixedPrice: n((m) => !m.priceHasFeed && m.priceUsd != null),
    deprecated: n((m) => m.deprecatedSince != null),
    mintPaused: n((m) => m.mintPaused),
    borrowPaused: n((m) => m.borrowPaused),
    closedToSupply: n((m) => m.supplyCapOneUnit || (m.supplyCap != null && m.supplied >= m.supplyCap)),
    closedToBorrow: n((m) => m.borrowCapOneUnit || (m.borrowCap != null && m.borrowed >= m.borrowCap)),
    fullReserveFactor: ms.length > 0 && ms.every((m) => (m.reserveFactor ?? 0) >= 0.9999),
  };
}

const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;

/** "every market" where all of them, else "N markets". */
const marketsWord = (n: number, total: number) =>
  n === total && total > 1 ? "every market" : many(n, "market", "markets");

function MarketsExplainer({ x }: { x: Ctx }) {
  const t = totals(x);
  const k = counts(x);
  const c = coordsOf(x);
  const chain = chainMeta(x.f.chainId).name;
  const freeze = FREEZE[x.f.key];
  const closedAny = k.mintPaused + k.borrowPaused + k.closedToSupply + k.closedToBorrow + k.deprecated > 0;
  return (
    <>
      <ExplainGroup title="Size">
        <ExplainBullet>
          {x.f.name} lists <Fig bold>{k.total}</Fig> markets on {chain}, each one token that wallets supply and borrow.
        </ExplainBullet>
        <ExplainBullet>
          Suppliers have put in <Fig bold>{usdText(t.supplied)}</Fig> and borrowers owe{" "}
          <Fig bold>{usdText(t.borrowed)}</Fig>.
        </ExplainBullet>
        {t.u != null && (
          <ExplainBullet>
            Utilization <Fig bold>{pct(t.u)}</Fig> is the share of the supply on loan.
          </ExplainBullet>
        )}
        {k.fixedPrice > 0 && (
          <ExplainBullet>
            <Fig bold>{k.fixedPrice}</Fig> {k.fixedPrice === 1 ? "market is" : "markets are"} priced at a number
            governance stored, with no feed behind it.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Rates">
        {k.fullReserveFactor ? (
          <ExplainBullet>
            Suppliers earn nothing: every market keeps all of its borrowers&rsquo; interest as reserves.
          </ExplainBullet>
        ) : (
          <ExplainBullet>
            A market&rsquo;s borrow rate rises with its utilization, and suppliers earn it less the reserve factor.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Collateral">
        <ExplainBullet>
          One Comptroller counts a wallet&rsquo;s supply in every market it has entered against all of its borrowing.
        </ExplainBullet>
        {k.notCollateral > 0 && (
          <ExplainBullet>
            <Fig bold>{k.notCollateral}</Fig> {k.notCollateral === 1 ? "market counts" : "markets count"} for nothing as
            collateral.
          </ExplainBullet>
        )}
        {x.read.closeFactor != null && x.read.liquidationIncentive != null && (
          <ExplainBullet>
            A liquidation repays up to{" "}
            <Fig bold>
              <Prov info={cmCloseFactorProv(x.v, c)}>{pct(x.read.closeFactor, 0)}</Prov>
            </Fig>{" "}
            of a borrow, and the liquidator takes collateral worth{" "}
            <Fig bold>
              <Prov info={cmLiquidationIncentiveProv(x.v, c)}>{x.read.liquidationIncentive.toFixed(2)}×</Prov>
            </Fig>{" "}
            what it repaid.
          </ExplainBullet>
        )}
      </ExplainGroup>
      {closedAny && (
        <ExplainGroup title="Closed">
          {(k.mintPaused > 0 || k.borrowPaused > 0) && (
            <ExplainBullet>
              {k.mintPaused > 0 && k.mintPaused === k.borrowPaused ? (
                <>
                  Supplying and borrowing are paused in <Fig bold>{marketsWord(k.mintPaused, k.total)}</Fig>
                </>
              ) : (
                <>
                  {k.mintPaused > 0 && (
                    <>
                      Supplying is paused in <Fig bold>{marketsWord(k.mintPaused, k.total)}</Fig>
                      {k.borrowPaused > 0 ? "; " : ""}
                    </>
                  )}
                  {k.borrowPaused > 0 && (
                    <>
                      {k.mintPaused > 0 ? "borrowing" : "Borrowing"} is paused in{" "}
                      <Fig bold>{marketsWord(k.borrowPaused, k.total)}</Fig>
                    </>
                  )}
                </>
              )}
              . Repaying and withdrawing still run.
            </ExplainBullet>
          )}
          {k.closedToSupply > 0 && (
            <ExplainBullet>
              <Fig bold>{k.closedToSupply}</Fig> {k.closedToSupply === 1 ? "market takes" : "markets take"} no new
              supply: the cap is one base unit, or below what is in.
            </ExplainBullet>
          )}
          {k.closedToBorrow > 0 && (
            <ExplainBullet>
              {k.closedToBorrow === k.total && freeze ? (
                <>
                  <Fig bold>Every market</Fig> takes no new borrowing: {x.f.name} set every borrow cap to one base unit
                  on {freeze}.
                </>
              ) : (
                <>
                  <Fig bold>{k.closedToBorrow}</Fig> {k.closedToBorrow === 1 ? "market takes" : "markets take"} no new
                  borrowing: the cap is one base unit, or at what is borrowed.
                </>
              )}
            </ExplainBullet>
          )}
          {k.deprecated > 0 && (
            <ExplainBullet>
              <Fig bold>{k.deprecated}</Fig> markets are deprecated: {DEPRECATED_CONSEQUENCE}.
            </ExplainBullet>
          )}
        </ExplainGroup>
      )}
    </>
  );
}

/** The head's notes: what qualifies the roster, counted, then the liquidation terms. */
function HeadNotes({ x }: { x: Ctx }) {
  const k = counts(x);
  const c = coordsOf(x);
  const note = (key: string, n: number, words: string, title: string) =>
    n > 0 ? (
      <span key={key} data-prov-exempt="" title={title} data-market-note={key}>
        <span className="text-foreground">{n === k.total && k.total > 1 ? "All" : n}</span> {words}
      </span>
    ) : null;
  return (
    <>
      {note("not-collateral", k.notCollateral, "not collateral", "Markets whose collateral factor is zero")}
      {note("fixed-price", k.fixedPrice, "with a fixed price", "Markets priced at a number governance stored")}
      {note("deprecated", k.deprecated, "deprecated", `Deprecated: ${DEPRECATED_CONSEQUENCE}`)}
      {k.mintPaused > 0 && k.mintPaused === k.borrowPaused
        ? note("paused", k.mintPaused, "paused to new supply and borrowing", x.f.pause.both)
        : [
            note("supply-paused", k.mintPaused, "paused to new supply", x.f.pause.supply),
            note("borrow-paused", k.borrowPaused, "paused to new borrowing", x.f.pause.borrow),
          ]}
      {note(
        "closed-to-supply",
        k.closedToSupply,
        "closed to new supply",
        "The supply cap is one base unit, or below what is in",
      )}
      {note(
        "closed-to-borrow",
        k.closedToBorrow,
        "closed to new borrowing",
        "The borrow cap is one base unit, or at what is borrowed",
      )}
      {x.read.closeFactor != null && (
        <span title="The share of one borrow a single liquidation may repay">
          close factor <Prov info={cmCloseFactorProv(x.v, c)}>{pct(x.read.closeFactor, 0)}</Prov>
        </span>
      )}
      {x.read.liquidationIncentive != null && (
        <span title="A liquidator takes collateral worth this multiple of what it repays">
          liquidation incentive{" "}
          <Prov info={cmLiquidationIncentiveProv(x.v, c)}>{x.read.liquidationIncentive.toFixed(2)}×</Prov>
        </span>
      )}
    </>
  );
}

function readAtOf(x: Ctx, what: string, m?: ComptrollerMarket): ReadAt | null {
  const block = x.read.blockNumber;
  if (block <= 0) return null;
  const { f, read } = x;
  const capReads = f.supplyCaps ? "supplyCaps(), borrowCaps()" : "borrowCaps()";
  const rate = f.period === "block" ? "PerBlock" : "PerTimestamp";
  const contracts = [
    {
      name: "Comptroller",
      address: f.comptroller,
      reads: `getAllMarkets(), oracle(), closeFactorMantissa(), liquidationIncentiveMantissa(); per market markets(), ${capReads}, mintGuardianPaused(), borrowGuardianPaused()`,
    },
    ...(m
      ? [
          {
            name: m.marketSymbol,
            address: m.market,
            reads: `underlying(), totalSupply(), exchangeRateStored(), totalBorrows(), getCash(), totalReserves(), supplyRate${rate}(), borrowRate${rate}(), reserveFactorMantissa(), interestRateModel()`,
          },
          ...(m.irm
            ? [
                {
                  name: `${m.symbol} rate model`,
                  address: m.irm,
                  reads: `kink(), ${f.period === "block" ? "blocksPerYear()" : "timestampsPerYear()"} and the base, multiplier and jump terms`,
                },
              ]
            : []),
        ]
      : []),
    ...(read.oracle
      ? [
          {
            name: f.oracleName,
            address: read.oracle,
            reads:
              f.token === "cToken"
                ? "getUnderlyingPrice() and getConfig() per market"
                : "getUnderlyingPrice() per market",
          },
        ]
      : []),
  ];
  return {
    chainId: f.chainId,
    block,
    readBy: read.readBy,
    receipt: (at) => readStampProv({ chainId: f.chainId, block, at, readBy: read.readBy, what, contracts }),
  };
}

function marketHead(x: Ctx): ProductHead {
  const { f } = x;
  const t = totals(x);
  const c = coordsOf(x);
  const explorer = chainMeta(f.chainId).explorerName;
  const links: SectionMenuLink[] = [
    {
      item: "positions",
      title: `All ${f.name} positions`,
      subtitle: "Every account, open or closed",
      href: f.root,
      internal: true,
    },
    {
      item: "info",
      title: `About ${f.name}`,
      subtitle: "How it works and how Rails reads it",
      href: `${f.root}/info`,
      internal: true,
    },
    {
      item: "comptroller",
      title: `Comptroller on ${explorer}`,
      subtitle: "The contract that lists every market",
      href: explorerUrl(f.chainId, "address", f.comptroller),
    },
    { item: "docs", title: f.docs.label, subtitle: new URL(f.docs.href).host, href: f.docs.href },
  ];
  const entries = [positionEntry({ href: f.root, name: f.name, noun: { one: "position", many: "positions" } })].filter(
    (e): e is EntryLink => e != null,
  );
  return {
    scope: `market-${f.key}`,
    title: f.name,
    titleHref: f.root,
    purpose: `Every market ${f.name} lists on ${chainMeta(f.chainId).name}. Each is one token, and one Comptroller counts a wallet's supply in all of them against its borrowing.`,
    figures: [
      {
        slot: "roster",
        label: "Markets listed",
        value: <Prov info={cmRosterProv(x.v, c)}>{x.read.markets.length}</Prov>,
      },
      {
        slot: "sizeIn",
        label: "Supplied",
        value: <Prov info={cmSummaryValueProv(x.v, c, "supplied")}>{usdText(t.supplied)}</Prov>,
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        value: <Prov info={cmSummaryValueProv(x.v, c, "borrowed")}>{usdText(t.borrowed)}</Prov>,
      },
      {
        slot: "usage",
        label: "Utilization",
        // A ratio of the two traced figures beside it.
        value: <span data-prov-exempt="">{pct(t.u)}</span>,
        tip: "Borrowed ÷ supplied, both in USD at the oracle's prices: the two figures beside it in this band.",
      },
    ],
    notes: <HeadNotes x={x} />,
    entries,
    readAt: readAtOf(x, `Every figure on ${f.name}'s markets page`),
    tools: {
      links,
      exports: {
        markdown: { build: () => marketsMarkdown(x), copySubtitle: "Every market as Markdown, for an LLM" },
        csv: {
          filename: `${f.key}-markets.csv`,
          build: () => marketsCsv(x),
          subtitle: "Every market, figures unrounded",
        },
      },
    },
    explainer: { body: <MarketsExplainer x={x} />, label: "markets explanation" },
    bandHooks: { "data-comptroller-vitals": f.key },
  };
}

function marketRow(x: Ctx, m: ComptrollerMarket): ReserveRowModel {
  const z = figuresOf(x, m);
  const c = coordsOf(x, m);
  const avail = m.priceUsd != null ? m.cash * m.priceUsd : m.cash;
  return {
    key: m.key,
    href: `${x.f.root}/markets/${m.key}`,
    asset: {
      symbol: m.symbol,
      address: m.underlying ?? m.market,
      receipt: cmIdentityProv(x.v, c, m.underlying, m.identityNote),
      tags: <Tags x={x} m={m} />,
      sub: <div className="truncate text-[12px] text-rb-500">{m.marketSymbol}</div>,
    },
    hooks: { "data-comptroller-market": m.market },
    cells: {
      supplied: {
        sort: [m.priceUsd != null ? m.supplied * m.priceUsd : 0, m.supplied],
        title: `${tokens(m.supplied, m.symbol)} supplied`,
        node: z.amounts.supplied ? (
          <DataTableAmount {...z.amounts.supplied} tag={<CapPill x={x} m={m} side="supply" />} />
        ) : (
          <>
            <div>{z.supplied}</div>
            <CapPill x={x} m={m} side="supply" />
          </>
        ),
      },
      borrowed: {
        sort: [m.priceUsd != null ? m.borrowed * m.priceUsd : 0, m.borrowed],
        title: `${tokens(m.borrowed, m.symbol)} borrowed`,
        node: z.amounts.borrowed ? (
          <DataTableAmount {...z.amounts.borrowed} tag={<CapPill x={x} m={m} side="borrow" />} />
        ) : (
          <>
            <div>{z.borrowed ?? <span className="text-rb-500">no borrows</span>}</div>
            <CapPill x={x} m={m} side="borrow" />
          </>
        ),
      },
      available: {
        sort: avail,
        title: `${tokens(m.cash, m.symbol)} the market holds`,
        node: z.amounts.available ? <DataTableAmount {...z.amounts.available} /> : z.available,
      },
      supplyRate: {
        sort: m.supplyApr ?? -1,
        title: `Supply APY: ${rateTip(x.f, "supply").toLowerCase()}`,
        node: z.supplyRate,
      },
      borrowRate: {
        sort: m.borrowApr ?? -1,
        title: `Borrow APY: ${rateTip(x.f, "borrow").toLowerCase()}`,
        node: z.borrowRate,
      },
      collateral: { sort: m.collateralFactor ?? 0, node: <Collateral x={x} m={m} /> },
      util: { sort: z.u ?? -1, node: <UtilBar m={m} value={z.utilization} /> },
    },
  };
}

function marketsTable(x: Ctx): ReserveTableModel {
  const { f } = x;
  const R = "right" as const;
  return {
    scope: `markets-${f.key}`,
    title: "All markets",
    line: (
      <>
        Every market the Comptroller lists; sort any column. USD is the oracle&rsquo;s price. A cap shows beside its
        dollar value once 90% of it is in use. The bar is utilization, and its tick is the rate model&rsquo;s kink. A
        row opens its market&rsquo;s page.
      </>
    ),
    label: `${f.name} markets`,
    anatomy: "M1",
    assetLabel: "Asset",
    tableClassName: "lg:min-w-[900px]",
    columns: [
      { key: "supplied", label: "Supplied", align: R, className: NUM },
      { key: "borrowed", label: "Borrowed", align: R, className: NUM },
      {
        key: "available",
        label: "Available",
        align: R,
        className: NUM,
        tip: TIP.available,
        hooks: { "data-available": "" },
      },
      {
        key: "supplyRate",
        label: "Supply APY",
        align: R,
        className: RATE,
        tip: rateTip(f, "supply"),
        hooks: { "data-rate": "supply" },
      },
      {
        key: "borrowRate",
        label: "Borrow APY",
        align: R,
        className: RATE,
        tip: rateTip(f, "borrow"),
        hooks: { "data-rate": "borrow" },
      },
      {
        key: "collateral",
        label: "Collateral factor",
        align: R,
        className: RATE,
        tip: TIP.collateral,
        hooks: { "data-collateral": "" },
      },
      { key: "util", label: "Utilization", className: "lg:w-[180px] lg:min-w-[112px]", wide: true, tip: TIP.util },
    ],
    rows: x.read.markets.map((m) => marketRow(x, m)),
    defaultSort: { key: "supplied", dir: "desc" },
    emptyFiltered: "No markets match this filter.",
    tools: {
      links: [
        {
          item: "positions",
          title: `All ${f.name} positions`,
          subtitle: "Every account, open or closed",
          href: f.root,
          internal: true,
        },
      ],
      exports: {
        csv: {
          filename: `${f.key}-markets.csv`,
          build: () => marketsCsv(x),
          subtitle: "Every market, figures unrounded",
        },
      },
    },
  };
}

const FAILED = "The market list could not be read at this block. This page reads the chain; try again shortly.";

export function comptrollerMarketModel(read: ComptrollerRead): Loadable<MarketModel> {
  if (read.failed) return { state: "error", message: FAILED };
  const x = ctxOf(read);
  return { state: "ok", data: { head: marketHead(x), reserves: marketsTable(x) } };
}

/** A Comptroller's markets page (R2): its head, then every market. */
export function ComptrollerMarketsPage({ read }: { read: ComptrollerRead }): ReactNode {
  const f = COMPTROLLER_FAMILIES[read.family];
  return (
    <MarketPage
      header={{ protocol: protocolForHref(f.root)!, title: "Markets", learnMore: LEARN_MORE[f.token](f) }}
      market={comptrollerMarketModel(read)}
      what={`${f.name}'s markets`}
    />
  );
}

// ── A market's page (R3) ─────────────────────────────────────────────────────

/** A size on the band: dollars, the token amount under it. */
function SizeVital({ x, m, side }: { x: Ctx; m: ComptrollerMarket; side: "supplied" | "borrowed" | "available" }) {
  const c = coordsOf(x, m);
  const n = side === "supplied" ? m.supplied : side === "borrowed" ? m.borrowed : m.cash;
  const z = figuresOf(x, m);
  const top =
    side === "supplied"
      ? z.supplied
      : side === "borrowed"
        ? (z.borrowed ?? <span className="text-rb-500">none</span>)
        : z.available;
  return (
    <>
      {top}
      {m.priceUsd != null && n > 0 && (
        <span className="block text-[11px] font-normal text-rb-500">
          {side === "available" ? (
            <Prov info={cmAvailableProv(x.v, c, false)}>{tokens(n, m.symbol)}</Prov>
          ) : (
            <Prov info={cmAmountProv(x.v, c, side)}>{tokens(n, m.symbol)}</Prov>
          )}
        </span>
      )}
    </>
  );
}

function MarketExplainer({ x, m }: { x: Ctx; m: ComptrollerMarket }) {
  const size = (n: number) => sizeText(m, n);
  const u = utilisationOf(m);
  const supplyCap = capOf(x, m, "supply");
  const borrowCap = capOf(x, m, "borrow");
  return (
    <>
      <ExplainGroup title="This reserve">
        <ExplainBullet>
          The {m.symbol} market holds <Fig bold>{size(m.supplied)}</Fig>
          {m.borrowed > 0 ? (
            <>
              , and borrowers owe <Fig bold>{size(m.borrowed)}</Fig> of it.
            </>
          ) : (
            ", none of it borrowed."
          )}
        </ExplainBullet>
        <ExplainBullet>
          <Fig bold>{size(m.cash)}</Fig> is in the market now, available to withdraw or borrow.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Rates">
        {m.supplyApr != null && m.supplied > 0 ? (
          <ExplainBullet
            sub={
              m.reserveFactor != null && (
                <ExplainSub>
                  {m.reserveFactor >= 0.9999
                    ? "The market keeps all of the borrowers' interest as reserves, so suppliers earn nothing."
                    : `The supply rate is the borrow rate times utilization, less the ${pct(m.reserveFactor, 0)} reserve factor.`}
                </ExplainSub>
              )
            }
          >
            Suppliers earn <Fig bold>{ratePercentText(m.supplyApr)}</Fig> a year, as an APY {x.f.apy.compounding}.
          </ExplainBullet>
        ) : (
          m.reserveFactor != null && (
            <ExplainBullet>
              {m.reserveFactor >= 0.9999
                ? "The market keeps all of the borrowers' interest as reserves, so suppliers earn nothing."
                : `The supply rate is the borrow rate times utilization, less the ${pct(m.reserveFactor, 0)} reserve factor.`}
            </ExplainBullet>
          )
        )}
        {m.borrowApr != null && m.borrowed > 0 && (
          <ExplainBullet>
            Borrowers pay <Fig bold>{ratePercentText(m.borrowApr)}</Fig> a year, as an APY {x.f.apy.compounding}.
          </ExplainBullet>
        )}
        {u != null && (
          <ExplainBullet>
            Utilization <Fig bold>{pct(u, 0)}</Fig> is the share of the supply on loan.
            {u > 1 ? " It passes 100% when the reserves are larger than the cash left." : ""}
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Collateral and limits">
        {m.collateralFactor != null ? (
          <ExplainBullet>
            A wallet can borrow up to {pct(m.collateralFactor)} of the value of the {m.symbol} it supplies here.
          </ExplainBullet>
        ) : (
          <ExplainBullet>Supplying {m.symbol} adds nothing to what a wallet can borrow.</ExplainBullet>
        )}
        {(m.mintPaused || m.borrowPaused) && (
          <ExplainBullet>
            {m.mintPaused && m.borrowPaused
              ? "Supplying and borrowing are"
              : m.mintPaused
                ? "Supplying is"
                : "Borrowing is"}{" "}
            paused here; repaying and withdrawing still run.
          </ExplainBullet>
        )}
        {supplyCap.state === "closed" && (
          <ExplainBullet>The supply cap is one base unit, so no new supply is taken.</ExplainBullet>
        )}
        {borrowCap.state === "closed" && (
          <ExplainBullet>The borrow cap is one base unit, so no new borrowing is taken.</ExplainBullet>
        )}
        {m.deprecatedSince && <ExplainBullet>The market is deprecated: {DEPRECATED_CONSEQUENCE}.</ExplainBullet>}
        {!m.priceHasFeed && m.priceUsd != null && (
          <ExplainBullet>Its price is a number governance stored, with no feed behind it.</ExplainBullet>
        )}
      </ExplainGroup>
    </>
  );
}

function marketMarkdown(x: Ctx, m: ComptrollerMarket): string {
  const u = utilisationOf(m);
  return [
    `# ${m.symbol}, a market of ${x.f.name} on ${chainMeta(x.f.chainId).name}`,
    "",
    `- Supplied: ${sizeText(m, m.supplied)}`,
    `- Borrowed: ${sizeText(m, m.borrowed)}`,
    `- Available: ${sizeText(m, m.cash)}`,
    ...(m.supplyApr != null ? [`- Supply APY: ${ratePercentText(m.supplyApr)}, ${x.f.apy.compounding}`] : []),
    ...(m.borrowApr != null ? [`- Borrow APY: ${ratePercentText(m.borrowApr)}, ${x.f.apy.compounding}`] : []),
    ...(u != null ? [`- Utilization: ${pct(u, 0)}`] : []),
    `- Collateral factor: ${m.collateralFactor != null ? pct(m.collateralFactor) : "0% (not collateral)"}`,
    ...(m.reserveFactor != null ? [`- Reserve factor: ${pct(m.reserveFactor)}`] : []),
    "",
    `Read from ${chainMeta(x.f.chainId).name} at block ${x.read.blockNumber.toLocaleString("en-US")}.`,
  ].join("\n");
}

function reserveHead(x: Ctx, m: ComptrollerMarket): ProductHead {
  const { f } = x;
  const marketsHref = `${f.root}/markets`;
  const explorer = chainMeta(f.chainId).explorerName;
  const u = figuresOf(x, m);
  const entry = (side: "supply" | "borrow", n: number) => {
    const href = n > 0 ? listingHref(x, m, side) : null;
    return positionEntry({
      href,
      name: m.symbol,
      noun: side === "supply" ? { one: "supplier", many: "suppliers" } : { one: "borrower", many: "borrowers" },
    });
  };
  const links: SectionMenuLink[] = [
    {
      item: "market",
      title: `${f.name} markets`,
      subtitle: "Every market the Comptroller lists",
      href: marketsHref,
      internal: true,
    },
    ...(m.underlying
      ? [
          {
            item: "asset",
            title: m.symbol,
            subtitle: `${m.symbol} on ${chainMeta(f.chainId).name}, across Rails`,
            href: `/assets/${chainMeta(f.chainId).slug}/${m.underlying}`,
            internal: true,
          },
        ]
      : []),
    {
      item: "token",
      title: `${m.marketSymbol} on ${explorer}`,
      subtitle: `The ${f.token} suppliers hold`,
      href: explorerUrl(f.chainId, "address", m.market),
    },
    {
      item: "comptroller",
      title: `Comptroller on ${explorer}`,
      subtitle: "The contract that sets the market's terms",
      href: explorerUrl(f.chainId, "address", f.comptroller),
    },
  ];
  return {
    scope: "reserve-head",
    title: `${m.symbol} market`,
    subtitle: (
      <p className="mt-1 text-[13px] text-rb-500">
        A market of{" "}
        <Link
          href={marketsHref}
          className="text-blue-600 hover:underline dark:text-[var(--text-link)]"
          data-reserve-market-link=""
        >
          {f.name}
        </Link>
      </p>
    ),
    figures: [
      {
        slot: "sizeIn",
        label: "Supplied",
        value: (
          <span data-vital="supplied">
            <SizeVital x={x} m={m} side="supplied" />
          </span>
        ),
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        value: (
          <span data-vital="borrowed">
            <SizeVital x={x} m={m} side="borrowed" />
          </span>
        ),
      },
      {
        slot: "sizeFree",
        label: "Available",
        tip: TIP.available,
        value: (
          <span data-vital="available">
            <SizeVital x={x} m={m} side="available" />
          </span>
        ),
      },
      {
        slot: "rateIn",
        label: "Supply APY",
        tip: rateTip(f, "supply"),
        value: <span data-vital="supply-rate">{u.supplyRate}</span>,
      },
      {
        slot: "rateOut",
        label: "Borrow APY",
        tip: rateTip(f, "borrow"),
        value: <span data-vital="borrow-rate">{u.borrowRate}</span>,
      },
      {
        slot: "usage",
        label: "Utilization",
        tip: TIP.util,
        value: <span data-vital="utilisation">{u.utilization}</span>,
      },
    ],
    entries: [entry("supply", m.supplied), entry("borrow", m.borrowed)].filter((e): e is EntryLink => e != null),
    readAt: readAtOf(x, `Every ${m.symbol} figure on this page`, m),
    tools: {
      links,
      exports: { markdown: { build: () => marketMarkdown(x, m), copySubtitle: "This market as Markdown, for an LLM" } },
    },
    explainer: { body: <MarketExplainer x={x} m={m} />, label: "market explanation" },
    learnMore: null,
    anatomy: "M3.1",
    bandHooks: { "data-anatomy": "M3.2", "data-reserve-vitals": "" },
  };
}

/** The curve's constants from the market's rate model, or why there are none. */
function curveOf(x: Ctx, m: ComptrollerMarket): RateCurveModel | Missing {
  const model = m.rateModel;
  if (!model) return { missing: "The rate model's terms could not be read." };
  const k = curveConstants(model);
  // The model's terms are simple rates a year; the chart draws them, and the
  // point now, as the family's APY.
  const steps = x.f.apy.steps;
  return {
    ...k,
    reserveFactor: m.reserveFactor ?? 0,
    now: {
      utilisation: m.supplied > 0 ? modelUtilisation(model, m.cash, m.borrowed, m.reserves) : null,
      borrow: yearOfApy(m.borrowApr ?? 0, steps),
      supply: yearOfApy(m.supplyApr ?? 0, steps),
    },
    form: { of: (rate: number) => apyOfYear(rate, steps), borrow: "Borrow APY", supply: "Supply APY" },
    utilizationWord: "utilization",
    symbol: m.symbol,
    receipt: cmCurveProv(x.v, coordsOf(x, m), model),
  };
}

/** One term line: the protocol's word, the value with its receipt. */
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

/** The rate model's terms under the curve, in the protocol's words. */
function RateTerms({ x, m }: { x: Ctx; m: ComptrollerMarket }) {
  const model = m.rateModel;
  if (!model) return null;
  const c = coordsOf(x, m);
  const wp = !model.reservesInUtil;
  const read = { modelPeriodsPerYear: m.modelPeriodsPerYear };
  const year = (v: number) => `${ratePercentText(v)} a year`;
  return (
    <dl className="mt-4 grid max-w-md grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]" data-rate-terms="">
      <Term term="Base rate" title="The borrow rate at zero utilization">
        <Prov info={cmRateTermProv(x.v, c, "base", wp, read)}>{year(model.base)}</Prov>
      </Term>
      <Term term="Multiplier" title="How much the borrow rate climbs per unit of utilization, up to the kink">
        <Prov info={cmRateTermProv(x.v, c, "multiplier", wp, read)}>{year(model.multiplier)}</Prov>
      </Term>
      {model.kink != null ? (
        <>
          <Term term="Kink" title="The utilization where the borrow rate turns steeper">
            <Prov info={cmRateTermProv(x.v, c, "kink", wp, read)}>{pct(model.kink)}</Prov>
          </Term>
          <Term term="Jump multiplier" title="How much the borrow rate climbs per unit of utilization past the kink">
            <Prov info={cmRateTermProv(x.v, c, "jump", wp, read)}>{year(model.jump ?? 0)}</Prov>
          </Term>
        </>
      ) : (
        <Term term="Kink">
          <span className="text-rb-500">none</span>
        </Term>
      )}
    </dl>
  );
}

/** One side's cap as a parameter line. */
function CapLine({ x, m, side }: { x: Ctx; m: ComptrollerMarket; side: "supply" | "borrow" }) {
  const c = capOf(x, m, side);
  const co = coordsOf(x, m);
  switch (c.state) {
    case "off":
    case "closed":
      return <Prov info={cmCapProv(x.v, co, side, "closed")}>closed</Prov>;
    case "none":
      return <Prov info={cmCapProv(x.v, co, side, "none")}>no cap</Prov>;
    case "used":
      return (
        <span title={`${tokens(c.amount, m.symbol)} of ${tokens(c.cap, m.symbol)}`}>
          <Prov info={cmCapProv(x.v, co, side, "used", { amount: c.amount, cap: c.cap })}>{pct(c.used)}</Prov>
          <span className="text-rb-500"> of {tokens(c.cap, m.symbol)}</span>
        </span>
      );
  }
}

function Parameters({ x, m, price }: { x: Ctx; m: ComptrollerMarket; price: ReactNode }) {
  const c = coordsOf(x, m);
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]" data-reserve-parameters="">
      <Term
        term={m.priceHasFeed ? "Oracle price" : "Fixed price"}
        title="The price the Comptroller values this market at, in USD"
      >
        {price}
      </Term>
      <Term term="Collateral factor" title={TIP.collateral}>
        <Prov info={cmCollateralFactorProv(x.v, c)}>{pct(m.collateralFactor ?? 0)}</Prov>
      </Term>
      {m.reserveFactor != null && (
        <Term term="Reserve factor" title="The share of borrowers' interest the market keeps; suppliers earn the rest">
          <Prov info={cmReserveFactorProv(x.v, c)}>{pct(m.reserveFactor)}</Prov>
        </Term>
      )}
      {x.f.supplyCaps && (
        <Term term="Supply cap" title="The share of the supply cap in use, and the cap">
          <CapLine x={x} m={m} side="supply" />
        </Term>
      )}
      <Term term="Borrow cap" title="The share of the borrow cap in use, and the cap">
        <CapLine x={x} m={m} side="borrow" />
      </Term>
      <Term term="Supplying" title="Whether new supply is open or paused">
        <Prov info={cmPauseProv(x.v, c, "supply", m.mintPaused)}>{m.mintPaused ? "paused" : "open"}</Prov>
      </Term>
      <Term term="Borrowing" title="Whether new borrowing is open or paused">
        <Prov info={cmPauseProv(x.v, c, "borrow", m.borrowPaused)}>{m.borrowPaused ? "paused" : "open"}</Prov>
      </Term>
      {m.deprecatedSince && (
        <Term term="Deprecated" title={DEPRECATED_CONSEQUENCE}>
          since {m.deprecatedSince}
        </Term>
      )}
    </dl>
  );
}

/** What Rails's server keeps only for the Aave family. */
const MISSING = {
  history: (f: ComptrollerFamily): Missing => ({
    missing: `No rate history yet. Rails's server keeps daily rates for the Aave family's reserves only, so this page shows ${f.name} as it reads now.`,
  }),
  holders: (): Missing => ({
    missing:
      "No ranking yet. Rails's server ranks suppliers and borrowers for the Aave family's reserves only; the positions listing shows every account in this market.",
  }),
};

function missingBody(m: Missing): ReactNode {
  return (
    <p className={NOTE} data-reserve-missing-section="">
      {m.missing}
    </p>
  );
}

export function ComptrollerMarketPage({ read, asset }: { read: ComptrollerRead; asset: string }): ReactNode {
  const f = COMPTROLLER_FAMILIES[read.family];
  const marketsHref = `${f.root}/markets`;
  const key = asset.toLowerCase();
  let reserve: Loadable<ReservePageData | null>;
  if (read.failed) reserve = { state: "error", message: FAILED };
  else {
    const x = ctxOf(read);
    const m = read.markets.find((o) => o.key === key || o.market === key) ?? null;
    if (!m) reserve = { state: "ok", data: null };
    else {
      const explorer = chainMeta(f.chainId).explorerName;
      const z = figuresOf(x, m);
      const sections: ProductSection[] = [
        {
          scope: "reserve-curve",
          anatomy: "M3.3",
          title: "Rate curve",
          raised: true,
          learnMore: CURVE_HELP,
          tools: {
            links: m.irm
              ? [
                  {
                    item: "rate-model",
                    title: `Rate model on ${explorer}`,
                    subtitle: `The contract that sets ${m.symbol}'s rates`,
                    href: explorerUrl(f.chainId, "address", m.irm),
                  },
                ]
              : [],
          },
          body: (
            <>
              <RateCurve curve={curveOf(x, m)} />
              <RateTerms x={x} m={m} />
            </>
          ),
        },
        {
          scope: "reserve-parameters",
          anatomy: "M3.5",
          title: "Parameters",
          raised: "narrow",
          tools: {
            links: [
              ...(m.priceFeed
                ? [
                    {
                      item: "price-source",
                      title: `Price feed on ${explorer}`,
                      subtitle: `The feed the oracle reads for ${m.symbol}`,
                      href: explorerUrl(f.chainId, "address", m.priceFeed),
                    },
                  ]
                : []),
              ...(read.oracle
                ? [
                    {
                      item: "oracle",
                      title: `Oracle on ${explorer}`,
                      subtitle: "The prices the Comptroller uses",
                      href: explorerUrl(f.chainId, "address", read.oracle),
                    },
                  ]
                : []),
            ],
          },
          body: <Parameters x={x} m={m} price={z.price} />,
        },
        {
          scope: "reserve-history",
          anatomy: "M3.4",
          title: "History",
          tools: {},
          body: missingBody(MISSING.history(f)),
        },
        {
          scope: "reserve-holders",
          anatomy: "M3.7 M3.8",
          title: "Largest suppliers and borrowers",
          tools: {
            links: [
              {
                item: "positions",
                title: `All ${f.name} positions`,
                subtitle: "Every account, open or closed",
                href: f.root,
                internal: true,
              },
            ],
          },
          body: missingBody(MISSING.holders()),
        },
      ];
      reserve = {
        state: "ok",
        data: {
          identity: {
            symbol: m.symbol,
            address: m.underlying ?? m.market,
            tags: <Tags x={{ ...x, shared: { mintPaused: false, borrowPaused: false, borrowClosed: false } }} m={m} />,
          },
          head: reserveHead(x, m),
          sections,
        },
      };
    }
  }
  return (
    <ReservePage
      protocol={protocolForHref(f.root)!}
      backHref={marketsHref}
      learnMore={LEARN_MORE[f.token](f)}
      reserve={reserve}
      what={`${f.name}'s markets`}
      missing={{
        line: `${f.name} lists no market for ${asset}.`,
        link: { label: `All ${f.name} markets`, href: marketsHref },
      }}
      hooks={{ "data-reserve-page": key, "data-market": f.key }}
    />
  );
}
