// The receipts of Compound V3's Optimism pages (rails-ops ui-jobs 578; the
// figures are lib/compound-v3-optimism/position.ts): each figure traces to the
// Comet or CometRewards read behind it, at the head and, for interest, at the UTC
// midnight 30 days back. The page names no function or block (decision 0059
// point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { OpcAccountFigures, OpcCollateralFigures, OpcPositionFigures } from "@/lib/compound-v3-optimism/position";
import type { BlockRef, OpcAccount, OpcEthUsd, OpcPositionRead } from "@/lib/compound-v3-optimism/types";

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: BlockRef) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });
const via = (blocks: string) => `rails-server · eth_call @ ${blocks}`;
const chain = (label: string, value: string, note?: string, pclass: ProvInput["pclass"] = "state"): ProvInput => ({
  label,
  value,
  kind: "chain",
  pclass,
  ...(note ? { note } : {}),
});

/** What every receipt of one Comet account needs: the raw account, its figures, the head and the dollar leg. */
export interface OpcReceiptContext {
  a: OpcAccount;
  f: OpcAccountFigures;
  head: BlockRef;
  ethUsd: OpcEthUsd | null;
  /** The position read, where the page has one (rates, interest, rewards). */
  r?: OpcPositionRead;
  p?: OpcPositionFigures;
}

const cometC = (a: OpcAccount) => ({ name: `Compound V3 ${a.label} (Optimism)`, address: a.comet });
const unit = (a: OpcAccount) => (a.quoteUnit === "USD" ? "USD" : "ETH");

/** The contracts a card's read stamp names. */
export function readContracts(c: OpcReceiptContext) {
  const out = [
    {
      name: `Comet ${c.a.label}`,
      address: c.a.comet,
      reads: c.r
        ? "the account's base balance, principal, collateral, prices, factors and verdicts, the rates, and the principal and balance 30 days back"
        : "the account's base balance, principal, collateral, prices, factors and verdicts",
    },
  ];
  if (c.ethUsd)
    out.push({
      name: "Comet cUSDCv3",
      address: c.ethUsd.comet,
      reads: "WETH's dollar price, for this Comet's ETH figures",
    });
  if (c.r?.rewards)
    out.push({ name: "CometRewards", address: c.r.rewards.contract, reads: "the COMP the account can claim" });
  return out;
}

const ethInput = (c: OpcReceiptContext): ProvInput[] =>
  c.ethUsd
    ? [
        chain(
          "WETH price, USD",
          `$${fig(Number(c.ethUsd.price) / 1e8)}`,
          `cUSDCv3 getPrice(${c.ethUsd.priceFeed}) at block ${n(c.head.block)}, 8 decimals`,
          "oracle",
        ),
      ]
    : [];
const basePriceInput = (c: OpcReceiptContext): ProvInput =>
  chain(
    `${c.a.baseSymbol} price`,
    `${fig(c.f.basePrice)} ${unit(c.a)}`,
    `getPrice(${c.a.baseFeed}) at block ${n(c.head.block)}, 8 decimals`,
    "oracle",
  );
const toUsd = (c: OpcReceiptContext) => (c.a.quoteUnit === "ETH" ? " × WETH's dollar price from cUSDCv3" : "");

export type OpcCollateralFigure = "amount" | "usd" | "factors";

/** One collateral asset's figure. */
export function opcCollateralProv(key: OpcCollateralFigure, c: OpcReceiptContext, x: OpcCollateralFigures): Provenance {
  const raw = c.a.collateral.find((y) => y.asset === x.asset)!;
  const head = { block: c.head.block };
  const blk = via(`block ${n(c.head.block)}`);
  if (key === "amount")
    return {
      kind: "chain",
      pclass: "state",
      source: head,
      contract: cometC(c.a),
      summary: `${x.symbol} collateral. The amount the account holds in ${c.a.label}, read at ${at(c.head)}.`,
      via: `${blk} · Comet collateralBalanceOf(wallet, ${x.symbol}) ÷ getAssetInfo.scale`,
      inputs: [chain("collateralBalanceOf", raw.balance), chain("scale", raw.scale)],
    };
  if (key === "usd")
    return {
      kind: "chain-derived",
      pclass: "oracle",
      source: head,
      contract: cometC(c.a),
      summary: `${x.symbol} collateral in USD. The amount at the Comet's price for it${c.a.quoteUnit === "ETH" ? " in ETH, then WETH's dollar price" : ""}, both read at ${at(c.head)}.`,
      via: `${blk} · collateralBalanceOf × getPrice(${raw.priceFeed})${toUsd(c)}`,
      formula: c.a.quoteUnit === "ETH" ? "amount × price × WETH/USD" : "amount × price",
      inputs: [
        chain(`${x.symbol} held`, fig(x.amount)),
        chain(`${x.symbol} price`, `${fig(x.price)} ${unit(c.a)}`, `getPrice(${raw.priceFeed}), 8 decimals`, "oracle"),
        ...ethInput(c),
      ],
    };
  return {
    kind: "chain",
    pclass: "state",
    source: head,
    contract: cometC(c.a),
    summary: `${x.symbol} borrow and liquidate factors. The share of its value that counts toward the borrowing capacity and toward the liquidation point in ${c.a.label}, read at ${at(c.head)}.`,
    via: `${blk} · Comet getAssetInfo(${x.symbol}).borrowCollateralFactor, .liquidateCollateralFactor ÷ 10^18`,
    inputs: [
      chain("borrowCollateralFactor", raw.borrowCollateralFactor, "1e18"),
      chain("liquidateCollateralFactor", raw.liquidateCollateralFactor, "1e18"),
    ],
  };
}

export type OpcBaseFigure = "amount" | "usd" | "rate" | "interest" | "usd-interest";

/** The base balance's figures: the amount lent or borrowed, its dollars, the rate and the 30-day interest. */
export function opcBaseProv(key: OpcBaseFigure, c: OpcReceiptContext): Provenance {
  const { a, f } = c;
  const lend = f.supplied > 0;
  const fn = lend ? "balanceOf" : "borrowBalanceOf";
  const raw = lend ? a.supply : a.borrow;
  const amt = lend ? f.supplied : f.borrowed;
  const head = { block: c.head.block };
  const blk = via(`block ${n(c.head.block)}`);
  switch (key) {
    case "amount":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        contract: cometC(a),
        summary: `${a.baseSymbol} ${lend ? "lent" : "owed"}. The balance with its interest, read at ${at(c.head)}.`,
        via: `${blk} · Comet ${fn}(wallet) ÷ 10^${a.baseDecimals}`,
        inputs: [chain(fn, raw), chain("principal", a.principal, "userBasic(wallet).principal")],
      };
    case "usd":
      return {
        kind: "chain-derived",
        pclass: "oracle",
        source: head,
        contract: cometC(a),
        summary: `${a.baseSymbol} ${lend ? "lent" : "owed"} in USD. The amount at the Comet's base price${a.quoteUnit === "ETH" ? " in ETH, then WETH's dollar price" : ""}, read at ${at(c.head)}.`,
        via: `${blk} · ${fn} × getPrice(base feed)${toUsd(c)}`,
        formula: a.quoteUnit === "ETH" ? "amount × price × WETH/USD" : "amount × price",
        inputs: [chain(`${a.baseSymbol} ${lend ? "lent" : "owed"}`, fig(amt)), basePriceInput(c), ...ethInput(c)],
      };
    case "rate": {
      const r = c.r!;
      const m = lend ? "getSupplyRate" : "getBorrowRate";
      return {
        kind: "chain-derived",
        pclass: "state",
        source: head,
        contract: cometC(a),
        summary: `${a.label} ${lend ? "supply" : "borrow"} rate. The rate at the market's utilization, a year, read at ${at(c.head)}.`,
        via: `${blk} · Comet ${m}(getUtilization()) × 31,536,000 ÷ 10^18`,
        formula: "per-second rate × seconds a year",
        inputs: [
          chain(m, lend ? r.supplyRate : r.borrowRate, "per second, 1e18"),
          chain("getUtilization", r.utilization, "1e18"),
        ],
      };
    }
    default: {
      const r = c.r!;
      const usdKey = key === "usd-interest";
      const pastRaw = r.past ? (lend ? r.past.supply : r.past.borrow) : "—";
      const inputs: ProvInput[] = [
        chain("principal, both dates", a.principal, "userBasic(wallet).principal; the same at both dates"),
        chain(`${fn} now`, raw, `at ${at(r.head)}`),
        chain(`${fn} 30 days back`, pastRaw, `at ${at(r.then)}`),
      ];
      if (usdKey) inputs.push(basePriceInput(c), ...ethInput(c));
      return {
        kind: "chain-derived",
        pclass: usdKey ? "oracle" : "state",
        source: head,
        contract: cometC(a),
        summary: `${a.baseSymbol} interest ${lend ? "earned" : "owed"}, 30 days${usdKey ? ", in USD" : ""}. The balance at ${at(r.head)} less the balance at ${at(r.then)}, the principal being the same at both: the growth of the Comet's ${lend ? "supply" : "borrow"} index on it${usdKey ? ", valued at the Comet's base price at the head" : ""}.`,
        via: `${via(`blocks ${n(r.then.block)} and ${n(r.head.block)}`)} · Comet ${fn}(wallet) at each block${usdKey ? ` · × getPrice(base feed)${toUsd(c)}` : ""}`,
        formula: usdKey ? "(now − then) × price" : "now − then",
        inputs,
      };
    }
  }
}

export type OpcCardFigure =
  | "collateral-total"
  | "base-usd"
  | "limit"
  | "room"
  | "absorbed-at"
  | "line"
  | "verdict"
  | "drop"
  | "rewards";

const capacityInputs = (c: OpcReceiptContext, factor: "borrow" | "liquidate"): ProvInput[] => [
  ...c.f.collateral.map((x) => ({
    label: x.symbol,
    value: `${fig(x.value * (factor === "borrow" ? x.borrowFactor : x.liquidateFactor))} ${unit(c.a)}`,
    kind: "chain" as const,
    pclass: "oracle" as const,
    note: `${fig(x.amount)} × ${fig(x.price)} × ${factor} factor ${fig(factor === "borrow" ? x.borrowFactor : x.liquidateFactor)}`,
  })),
  chain(`${c.a.baseSymbol} owed`, fig(c.f.borrowed), "borrowBalanceOf"),
  basePriceInput(c),
];

/** A headline or panel figure over the whole account. */
export function opcCardProv(key: OpcCardFigure, c: OpcReceiptContext): Provenance {
  const { a, f } = c;
  const head = { block: c.head.block };
  const blk = via(`block ${n(c.head.block)}`);
  const base = { source: head, contract: cometC(a) };
  switch (key) {
    case "collateral-total": {
      const gap = f.unpriced.length ? ` It leaves out ${f.unpriced.join(", ")}, which the Comet prices at zero.` : "";
      return {
        kind: "chain-derived",
        pclass: "oracle",
        ...base,
        summary: `Collateral in USD. Each asset's amount at the Comet's price${a.quoteUnit === "ETH" ? " in ETH, then WETH's dollar price" : ""}, added up, at ${at(c.head)}.${gap}`,
        via: `${blk} · collateralBalanceOf × getPrice${toUsd(c)} · summed`,
        formula: "Σ (amount × price)",
        inputs: [
          ...f.collateral.map((x) => ({
            label: x.symbol,
            value: x.usd == null ? "no price" : `$${fig(x.usd)}`,
            kind: "chain" as const,
            pclass: "oracle" as const,
            note: `${fig(x.amount)} ${x.symbol} × ${fig(x.price)} ${unit(a)}`,
          })),
          ...ethInput(c),
        ],
      };
    }
    case "base-usd":
      return opcBaseProv("usd", c);
    case "limit":
      return {
        kind: "chain-derived",
        pclass: "state",
        ...base,
        summary: `Share of the borrowing capacity used. The debt's value over the collateral's value at each asset's borrow factor, all at the Comet's prices, read at ${at(c.head)}.`,
        via: `${blk} · borrowBalanceOf × getPrice(base) ÷ Σ collateralBalanceOf × getPrice × getAssetInfo.borrowCollateralFactor`,
        formula: "debt value ÷ borrow capacity",
        inputs: capacityInputs(c, "borrow"),
      };
    case "room":
      return {
        kind: "chain-derived",
        pclass: "state",
        ...base,
        summary: `Room to borrow, in ${a.baseSymbol}. The borrow capacity less the debt's value, over the base price, read at ${at(c.head)}.`,
        via: `${blk} · (Σ collateral × price × borrow factor − debt value) ÷ base price`,
        formula: "(borrow capacity − debt value) ÷ base price",
        inputs: capacityInputs(c, "borrow"),
      };
    case "absorbed-at":
      return {
        kind: "chain-derived",
        pclass: "state",
        ...base,
        summary: `The liquidation point, in ${a.baseSymbol}. The collateral's value at each asset's liquidate factor, over the base price, read at ${at(c.head)}.`,
        via: `${blk} · Σ collateralBalanceOf × getPrice × liquidateCollateralFactor ÷ base price`,
        formula: "Σ collateral × price × liquidate factor ÷ base price",
        inputs: capacityInputs(c, "liquidate"),
      };
    case "line":
      return {
        kind: "chain-derived",
        pclass: "state",
        ...base,
        summary: `Liquidation point reached. The debt as a share of the liquidation point, read at ${at(c.head)}.`,
        via: `${blk} · debt value ÷ liquidation capacity`,
        formula: "debt value ÷ liquidation capacity",
        inputs: capacityInputs(c, "liquidate"),
      };
    case "verdict":
      return {
        kind: "chain",
        pclass: "state",
        ...base,
        summary: `Liquidatable. Whether anyone can call absorb on the account: the Comet's isLiquidatable answer at ${at(c.head)}.`,
        via: `${blk} · Comet isLiquidatable(wallet)`,
        inputs: [
          chain("isLiquidatable", String(a.isLiquidatable)),
          chain("isBorrowCollateralized", String(a.isBorrowCollateralized)),
        ],
      };
    case "drop":
      return {
        kind: "chain-derived",
        pclass: "state",
        ...base,
        summary: `Drop to the liquidation point. The fall in collateral value, every asset together, that brings the debt to the line, read at ${at(c.head)}.`,
        via: `${blk} · 1 − debt value ÷ liquidation capacity`,
        formula: "1 − debt value ÷ liquidation capacity",
        inputs: capacityInputs(c, "liquidate"),
      };
    case "rewards": {
      const r = c.r!.rewards!;
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        contract: { name: "CometRewards (Optimism)", address: r.contract },
        summary: `COMP to claim. What the account can claim from CometRewards for ${a.label}, read at ${at(c.head)}.`,
        via: `${blk} · CometRewards getRewardOwed(${a.label}, wallet).owed ÷ 10^18`,
        inputs: [chain("owed", r.owed), chain("token", r.token)],
      };
    }
  }
}
