// The receipts of Morpho Blue's Arc position and wallet pages (rails-ops
// ui-jobs 577; the figures are lib/morpho-arc/position.ts): each figure traces
// to the Morpho, IRM, oracle or feed read behind it, at the head and, for
// interest, at the UTC midnight 30 days back. The page names no function or
// block (decision 0059 point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { ArcMorphoFigures, ArcMorphoPositionFigures, ArcInterest } from "@/lib/morpho-arc/position";
import {
  MORPHO_ARC_CONTRACTS,
  type ArcMorphoMarket,
  type ArcMorphoPosition,
  type ArcMorphoPositionRead,
  type BlockRef,
} from "@/lib/morpho-arc/types";
import { pairName } from "@/lib/morpho-arc/words";

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: BlockRef) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });
const via = (blocks: string) => `rails-server · eth_call @ ${blocks}`;
const chain = (label: string, value: string, note?: string): ProvInput => ({
  label,
  value,
  kind: "chain",
  pclass: "state",
  ...(note ? { note } : {}),
});
const oracleIn = (
  label: string,
  value: string,
  note: string,
  contract?: { name: string; address: string },
): ProvInput => ({
  label,
  value,
  kind: "chain",
  pclass: "oracle",
  note,
  ...(contract ? { contract } : {}),
});
const morphoC = { name: "Morpho Blue (Arc)", address: MORPHO_ARC_CONTRACTS.morpho };

/** What a receipt needs: the figures, the market and position as read, and the block. */
export interface MorphoArcReceiptContext {
  f: ArcMorphoFigures;
  m: ArcMorphoMarket;
  p: ArcMorphoPosition;
  head: BlockRef;
  /** The position page's read, for the 30-day figures. */
  r?: ArcMorphoPositionRead;
  pf?: ArcMorphoPositionFigures;
}

/** The contracts a position page's read stamp names. */
export function readContracts(r: ArcMorphoPositionRead, f: ArcMorphoFigures) {
  return [
    {
      name: "Morpho Blue (Arc)",
      address: MORPHO_ARC_CONTRACTS.morpho,
      reads: "the market, its totals and the position at both blocks",
    },
    ...(r.market.irm !== "0x0000000000000000000000000000000000000000"
      ? [{ name: "Adaptive Curve IRM", address: r.market.irm, reads: "the market's borrow rate at both blocks" }]
      : []),
    ...(f.collateralToken
      ? [{ name: `${pairName(f)} oracle`, address: r.market.oracle, reads: "the collateral's price in the loan token" }]
      : []),
    ...(f.usd
      ? [
          {
            name: `Chainlink ${f.usd.feed.description ?? "USD"} feed`,
            address: f.usd.feed.feed,
            reads: "the loan token's USD price",
          },
        ]
      : []),
  ];
}

const rateInputs = (c: MorphoArcReceiptContext): ProvInput[] => [
  chain("borrowRateView", c.m.borrowRate ?? "—", "per second, WAD, on the market as stored"),
  chain(
    "market lastUpdate",
    c.m.state?.lastUpdate ?? "—",
    `${c.f.totals ? n(c.f.totals.elapsed) : "—"} seconds before the block`,
  ),
];
const usdInput = (c: MorphoArcReceiptContext): ProvInput =>
  c.f.usd
    ? oracleIn(
        `${c.f.loan.symbol} / USD`,
        `$${fig(c.f.usd.price)}`,
        `Chainlink ${c.f.usd.feed.description ?? ""} latestRoundData at ${at(c.head)}, ${c.f.usd.feed.decimals} decimals; feed from Aave's address book (${c.f.usd.feed.name})`,
        { name: `Chainlink ${c.f.usd.feed.description ?? "USD"} feed`, address: c.f.usd.feed.feed },
      )
    : oracleIn(`${c.f.loan.symbol} / USD`, "—", "no feed on Arc");
const priceInput = (c: MorphoArcReceiptContext): ProvInput =>
  oracleIn(
    `${c.f.collateralToken?.symbol ?? "collateral"} in ${c.f.loan.symbol}`,
    c.f.oraclePrice == null ? "—" : fig(c.f.oraclePrice),
    `the market oracle's price() at ${at(c.head)}: ${c.m.price ?? "—"}, scaled 10^(36 + ${c.f.loan.decimals} − ${c.f.collateralToken?.decimals ?? 18})`,
    { name: "Market oracle", address: c.m.oracle },
  );

export type MorphoArcFigure =
  | "collateral"
  | "debt"
  | "supplied"
  | "usd-collateral"
  | "usd-debt"
  | "usd-supplied"
  | "ltv"
  | "health"
  | "borrow-rate"
  | "supply-rate"
  | "room"
  | "drop"
  | "interest-supply"
  | "interest-debt"
  | "usd-interest-supply"
  | "usd-interest-debt";

export function morphoArcProv(key: MorphoArcFigure, c: MorphoArcReceiptContext): Provenance {
  const { f, m, p, head } = c;
  const source = { block: head.block };
  const v = via(`block ${n(head.block)}`);
  const pair = pairName(f);
  const L = f.loan.symbol;
  const C = f.collateralToken?.symbol ?? "collateral";
  const s = m.state;
  switch (key) {
    case "collateral":
      return {
        kind: "chain",
        pclass: "state",
        source,
        contract: morphoC,
        summary: `${C} collateral. Posted in the ${pair} market, read at ${at(head)}.`,
        via: `${v} · position(id, wallet).collateral ÷ 10^${f.collateralToken?.decimals ?? 18}`,
        inputs: [
          chain("position · collateral", p.collateral, `${f.collateralToken?.decimals ?? 18} decimals`),
          chain("market id", m.id),
        ],
        scaling: {
          raw: p.collateral,
          from: "call",
          places: f.collateralToken?.decimals ?? 18,
          why: `${C} counts in that many decimals`,
        },
      };
    case "debt":
    case "supplied": {
      const debt = key === "debt";
      const shares = debt ? p.borrowShares : p.supplyShares;
      return {
        kind: "chain-derived",
        pclass: "state",
        source,
        contract: morphoC,
        summary: `${L} ${debt ? "debt" : "supplied"}. The wallet's ${debt ? "borrow" : "supply"} shares in the ${pair} market at its totals, with the interest since the market last settled, at ${at(head)}; rounded ${debt ? "up" : "down"}, as Morpho rounds.`,
        via: `${v} · position, market and the IRM's borrowRateView`,
        formula: `shares × (total ${debt ? "borrow" : "supply"} assets + 1) ÷ (total ${debt ? "borrow" : "supply"} shares + 10^6), the totals compounded since lastUpdate`,
        inputs: [
          chain(`position · ${debt ? "borrowShares" : "supplyShares"}`, shares),
          chain(
            `market · total${debt ? "Borrow" : "Supply"}Assets`,
            (debt ? s?.totalBorrowAssets : s?.totalSupplyAssets) ?? "—",
          ),
          chain(
            `market · total${debt ? "Borrow" : "Supply"}Shares`,
            (debt ? s?.totalBorrowShares : s?.totalSupplyShares) ?? "—",
          ),
          ...rateInputs(c),
        ],
      };
    }
    case "usd-collateral":
    case "usd-debt":
    case "usd-supplied": {
      const what = key === "usd-collateral" ? `${C} collateral` : key === "usd-debt" ? `${L} debt` : `${L} supplied`;
      const amountText =
        key === "usd-collateral"
          ? `${fig(f.collateral)} ${C}`
          : key === "usd-debt"
            ? `${fig(f.debt)} ${L}`
            : `${fig(f.supplied)} ${L}`;
      return {
        kind: "chain-derived",
        pclass: "oracle",
        source,
        contract: f.usd
          ? { name: `Chainlink ${f.usd.feed.description ?? "USD"} feed`, address: f.usd.feed.feed }
          : undefined,
        summary:
          key === "usd-collateral"
            ? `${what} in USD. The collateral at the market's oracle price in ${L}, then ${L} at its Chainlink feed on Arc, at ${at(head)}.`
            : `${what} in USD. The amount at ${L}'s Chainlink feed on Arc, at ${at(head)}.`,
        via: `${v} · ${key === "usd-collateral" ? "oracle price() × " : ""}feed latestRoundData`,
        formula: key === "usd-collateral" ? "collateral × oracle price ÷ 10^36 × feed answer" : "amount × feed answer",
        inputs: [derivedIn(what, amountText), ...(key === "usd-collateral" ? [priceInput(c)] : []), usdInput(c)],
      };
    }
    case "ltv":
    case "health":
      return {
        kind: "chain-derived",
        pclass: "oracle",
        source,
        contract: { name: "Market oracle", address: m.oracle },
        summary:
          key === "ltv"
            ? `LTV. The debt over the collateral's value in ${L} at the market's oracle, at ${at(head)}. Morpho liquidates once it passes the LLTV, ${(f.lltv * 100).toFixed(1)}%, fixed when the market was created.`
            : `Health factor. The collateral's value in ${L} times the LLTV, over the debt, at ${at(head)}. Below 1 the position can be liquidated.`,
        via: `${v} · position, market, oracle price()`,
        formula: key === "ltv" ? "debt ÷ (collateral × price ÷ 10^36)" : "collateral × price ÷ 10^36 × LLTV ÷ debt",
        inputs: [
          derivedIn(`${L} debt`, fig(f.debt)),
          derivedIn(`${C} collateral`, fig(f.collateral)),
          priceInput(c),
          chain("LLTV", m.lltv, "WAD, from idToMarketParams"),
        ],
      };
    case "borrow-rate":
    case "supply-rate":
      return {
        kind: key === "borrow-rate" ? "chain" : "chain-derived",
        pclass: "state",
        source,
        contract: { name: "Adaptive Curve IRM", address: m.irm },
        summary:
          key === "borrow-rate"
            ? `Borrow rate. The market rate model's borrowRateView on the market as stored, per second, times a year, at ${at(head)}.`
            : `Supply rate. The borrow rate times the share of supply lent out, less the market's fee, at ${at(head)}.`,
        via: `${v} · IRM borrowRateView`,
        formula:
          key === "borrow-rate" ? "borrowRateView × 31,536,000 ÷ 10^18" : "borrow rate × utilisation × (1 − fee)",
        inputs: [
          chain("borrowRateView", m.borrowRate ?? "—", "per second, WAD"),
          ...(key === "supply-rate"
            ? [
                derivedIn("utilisation", f.utilization == null ? "—" : `${(f.utilization * 100).toFixed(2)}%`),
                chain("market · fee", s?.fee ?? "—", "WAD"),
              ]
            : []),
        ],
      };
    case "room":
    case "drop":
      return {
        kind: "derived",
        pclass: "oracle",
        source,
        contract: { name: "Market oracle", address: m.oracle },
        summary:
          key === "room"
            ? `Room to borrow. What the collateral can carry at the LLTV, less the debt, at ${at(head)}.`
            : `Liquidation drop. How far the collateral's price in ${L} can fall before the LTV reaches the LLTV, at ${at(head)}.`,
        via: `${v} · position, market, oracle price()`,
        formula: key === "room" ? "collateral × price ÷ 10^36 × LLTV − debt" : "1 − LTV ÷ LLTV",
        inputs: [
          derivedIn(`${L} debt`, fig(f.debt)),
          derivedIn(`${C} collateral`, fig(f.collateral)),
          priceInput(c),
          chain("LLTV", m.lltv, "WAD"),
        ],
      };
    default:
      return interestProv(key, c);
  }
}

const derivedIn = (label: string, value: string): ProvInput => ({ label, value, kind: "derived" });

function interestProv(key: MorphoArcFigure, c: MorphoArcReceiptContext): Provenance {
  const { f, m, head, r, pf } = c;
  const sup = key.includes("supply");
  const i: ArcInterest | null | undefined = sup ? pf?.supplyInterest : pf?.debtInterest;
  const then = r?.then ?? head;
  const past = r?.past;
  const shares = sup ? c.p.supplyShares : c.p.borrowShares;
  const L = f.loan.symbol;
  const base: ProvInput[] = [
    chain(`position · ${sup ? "supplyShares" : "borrowShares"}, both dates`, shares, "the same at both reads"),
    chain(
      `market · total${sup ? "Supply" : "Borrow"}Assets now`,
      (sup ? m.state?.totalSupplyAssets : m.state?.totalBorrowAssets) ?? "—",
      `at ${at(head)}`,
    ),
    chain(
      `market · total${sup ? "Supply" : "Borrow"}Assets 30 days back`,
      (sup ? past?.state.totalSupplyAssets : past?.state.totalBorrowAssets) ?? "—",
      `at ${at(then)}`,
    ),
    chain("borrowRateView, both dates", `${m.borrowRate ?? "—"} and ${past?.borrowRate ?? "—"}`, "per second, WAD"),
  ];
  const usdKey = key.startsWith("usd-");
  return {
    kind: usdKey ? "chain-derived" : "derived",
    pclass: usdKey ? "oracle" : "state",
    source: { block: head.block },
    contract: morphoC,
    summary: `${sup ? "Interest earned, 30 days" : "Interest on the debt, 30 days"}. The same shares valued at the market's totals at ${at(then)} and ${at(head)}${usdKey ? `, at ${L}'s Chainlink feed now` : ""}.${i?.state === "ok" ? ` ${fig(i.amount)} ${L}.` : ""}`,
    via: via(`blocks ${n(then.block)} and ${n(head.block)}`),
    formula: "shares at the totals now − shares at the totals 30 days back",
    inputs: usdKey ? [...base, usdInput(c)] : base,
  };
}
