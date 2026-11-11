// The receipts of Aave V3's Optimism account page (rails-ops ui-jobs 578; the
// figures are lib/aave-v3-optimism/position.ts): each figure traces to the Pool,
// UiPoolDataProvider or AaveOracle read behind it, at the head and, for
// interest, at the UTC midnight 30 days back. The page names no function or
// block (decision 0059 point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { OpPositionFigures, OpReserveFigures } from "@/lib/aave-v3-optimism/position";
import type { OpPositionRead } from "@/lib/aave-v3-optimism/types";

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: { block: number; time: number }) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });
const via = (blocks: string) => `rails-server · eth_call @ ${blocks}`;
const chain = (label: string, value: string, note?: string): ProvInput => ({
  label,
  value,
  kind: "chain",
  pclass: "state",
  ...(note ? { note } : {}),
});

export interface OpReceiptContext {
  p: OpPositionFigures;
  r: OpPositionRead;
}

const poolC = (r: OpPositionRead) => ({ name: "Aave V3 Optimism Pool", address: r.pool });
const uiC = (r: OpPositionRead) => ({ name: "Aave UiPoolDataProvider", address: r.uiPoolDataProvider });
const oracleC = (r: OpPositionRead) => ({ name: "Aave V3 Optimism IAaveOracle", address: r.oracle });

/** The contracts the card's read stamp names. */
export function readContracts(r: OpPositionRead) {
  return [
    {
      name: "Aave V3 Optimism Pool",
      address: r.pool,
      reads: "the account's totals and health factor, and each reserve's terms and indexes at both blocks",
    },
    {
      name: "Aave UiPoolDataProvider",
      address: r.uiPoolDataProvider,
      reads: "the account's scaled balances, collateral switches and eMode category at both blocks",
    },
    { name: "Aave V3 Optimism IAaveOracle", address: r.oracle, reads: "each reserve's USD price at the head" },
  ];
}

const priceInput = (r: OpPositionRead, x: OpReserveFigures): ProvInput => ({
  label: `${x.symbol} price`,
  value: x.price == null ? "—" : `$${fig(x.price)}`,
  kind: "chain",
  pclass: "oracle",
  note: `the AaveOracle's getAssetPrice(${x.symbol}) at block ${n(r.head.block)}, 8 decimals`,
});

export type OpReserveFigure =
  | "supplied"
  | "debt"
  | "usd-supplied"
  | "usd-debt"
  | "threshold"
  | "supply-rate"
  | "borrow-rate"
  | "interest-supply"
  | "interest-debt"
  | "usd-interest-supply"
  | "usd-interest-debt";

/** One reserve's figure. */
export function opReserveProv(key: OpReserveFigure, c: OpReceiptContext, x: OpReserveFigures): Provenance {
  const { r } = c;
  const head = { block: r.head.block };
  const raw = r.reserves.find((y) => y.asset === x.asset)!;
  const sup = key.includes("suppl");
  const scaledName = sup ? "scaledATokenBalance" : "scaledVariableDebt";
  const indexFn = sup ? "getReserveNormalizedIncome" : "getReserveNormalizedVariableDebt";
  const scaledNow = sup ? raw.scaledSupply : raw.scaledDebt;
  const indexNow = sup ? raw.indexes.income : raw.indexes.debt;
  const rounding = sup ? "rounded down" : "rounded up";
  switch (key) {
    case "supplied":
    case "debt":
      return {
        kind: "chain-derived",
        pclass: "state",
        source: head,
        contract: uiC(r),
        summary: `${x.symbol} ${sup ? "supplied" : "owed"}. The account's scaled ${sup ? "supply" : "debt"} grown by the reserve's index, read at ${at(r.head)}.`,
        via: `${via(`block ${n(r.head.block)}`)} · UiPoolDataProvider getUserReservesData(provider, wallet).${scaledName} × Pool ${indexFn}(${x.symbol}) ÷ 10^27, ${rounding}, ÷ 10^${x.decimals}`,
        formula: "scaled × index",
        inputs: [chain(scaledName, scaledNow, "getUserReservesData"), chain(indexFn, indexNow, "a ray")],
      };
    case "usd-supplied":
    case "usd-debt":
      return {
        kind: "chain-derived",
        pclass: "oracle",
        source: head,
        contract: oracleC(r),
        summary: `${x.symbol} ${sup ? "supplied" : "owed"} in USD. The amount at Aave's oracle price, both read at ${at(r.head)}.`,
        via: `${via(`block ${n(r.head.block)}`)} · scaled × index × oracle getAssetPrice`,
        formula: "amount × price",
        inputs: [
          chain(sup ? "supplied" : "owed", sup ? x.suppliedRaw : x.debtRaw, `${x.decimals} decimals`),
          priceInput(r, x),
        ],
      };
    case "threshold":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        contract: poolC(r),
        summary:
          x.ltSource === "emode"
            ? `${x.symbol} liquidation threshold. The share of its value that counts toward the health factor, from the ${c.p.emode?.label ?? "eMode"} category this account is in, read at ${at(r.head)}.`
            : `${x.symbol} liquidation threshold. The share of its value that counts toward the health factor, from the reserve's configuration, read at ${at(r.head)}.`,
        via:
          x.ltSource === "emode"
            ? `${via(`block ${n(r.head.block)}`)} · Pool getEModeCategoryCollateralConfig(${r.emode?.id}).liquidationThreshold ÷ 10,000`
            : `${via(`block ${n(r.head.block)}`)} · Pool getReserveData(${x.symbol}).configuration bits 16-31 ÷ 10,000`,
        inputs: [
          chain(
            "liquidationThreshold",
            x.liquidationThreshold == null ? "—" : String(Math.round(x.liquidationThreshold * 10_000)),
            "basis points",
          ),
        ],
      };
    case "supply-rate":
    case "borrow-rate": {
      const field = key === "supply-rate" ? "currentLiquidityRate" : "currentVariableBorrowRate";
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        contract: poolC(r),
        summary: `${x.symbol} ${key === "supply-rate" ? "supply" : "borrow"} rate. The reserve's variable rate as an APR, read at ${at(r.head)}.`,
        via: `${via(`block ${n(r.head.block)}`)} · Pool getReserveData(${x.symbol}).${field} ÷ 10^27`,
        inputs: [chain(field, key === "supply-rate" ? raw.liquidityRate : raw.variableBorrowRate, "a ray")],
      };
    }
    default: {
      const usdKey = key.startsWith("usd-");
      const past = raw.past;
      const inputs: ProvInput[] = [
        chain(`${scaledName}, both dates`, scaledNow, "getUserReservesData; the same at both dates"),
        chain(`${indexFn} now`, indexNow, `at ${at(r.head)}`),
        chain(
          `${indexFn} 30 days back`,
          past ? (sup ? past.indexes.income : past.indexes.debt) : "—",
          `at ${at(r.then)}`,
        ),
      ];
      if (usdKey) inputs.push(priceInput(r, x));
      return {
        kind: "chain-derived",
        pclass: usdKey ? "oracle" : "state",
        source: head,
        contract: poolC(r),
        summary: `${x.symbol} interest ${sup ? "earned" : "owed"}, 30 days${usdKey ? ", in USD" : ""}. The balance at ${at(r.head)} less the balance at ${at(r.then)}, the scaled balance being the same at both${usdKey ? ", valued at Aave's oracle price at the head" : ""}.`,
        via: `${via(`blocks ${n(r.then.block)} and ${n(r.head.block)}`)} · scaled × Pool ${indexFn} at each block ÷ 10^27, ${rounding}${usdKey ? " · × oracle getAssetPrice" : ""}`,
        formula: usdKey ? "(now − then) × price" : "now − then",
        inputs,
      };
    }
  }
}

export type OpCardFigure = "supplied-total" | "debt-total" | "health" | "room";

/** A headline: a total over the reserves, or a figure of getUserAccountData. */
export function opCardProv(key: OpCardFigure, c: OpReceiptContext): Provenance {
  const { p, r } = c;
  const head = { block: r.head.block };
  if (key === "health")
    return {
      kind: "chain",
      pclass: "state",
      source: head,
      contract: poolC(r),
      summary: `Health factor. Collateral at each asset's liquidation threshold ÷ debt, both at Aave's oracle, read at ${at(r.head)}.`,
      via: `${via(`block ${n(r.head.block)}`)} · Pool getUserAccountData(wallet).healthFactor ÷ 10^18`,
      inputs: [chain("healthFactor", r.account.healthFactor, "18 decimals")],
    };
  if (key === "room")
    return {
      kind: "chain",
      pclass: "oracle",
      source: head,
      contract: poolC(r),
      summary: `Room to borrow in USD. Collateral at each asset's loan-to-value at Aave's oracle, less the debt, read at ${at(r.head)}.`,
      via: `${via(`block ${n(r.head.block)}`)} · Pool getUserAccountData(wallet).availableBorrowsBase ÷ 10^8`,
      inputs: [chain("availableBorrowsBase", r.account.availableBorrowsBase, "USD, 8 decimals")],
    };
  const debt = key === "debt-total";
  const rows = debt
    ? p.borrowed.map((x) => ({ x, v: x.debtUsd, a: x.debt }))
    : p.supplied.map((x) => ({ x, v: x.suppliedUsd, a: x.supplied }));
  const gap = p.unpriced.length ? ` It leaves out ${p.unpriced.join(", ")}, which the oracle did not price.` : "";
  return {
    kind: "chain-derived",
    pclass: "oracle",
    source: head,
    contract: oracleC(r),
    summary: `${debt ? "Debt" : "Supplied"} in USD. Each ${debt ? "borrowed" : "supplied"} asset's amount at Aave's oracle price, added up, at ${at(r.head)}.${gap}`,
    via: `${via(`block ${n(r.head.block)}`)} · scaled × index × oracle getAssetPrice · summed`,
    formula: "Σ (amount × price)",
    inputs: rows.map(({ x, v, a }) => ({
      label: x.symbol,
      value: v == null ? "no price" : `$${fig(v)}`,
      kind: "chain" as const,
      pclass: "oracle" as const,
      note: `${fig(a)} ${x.symbol} × $${x.price == null ? "—" : fig(x.price)}`,
    })),
  };
}
