// The receipts of Aave V4's Arc account pages (rails-ops ui-jobs 577; the
// figures are lib/aave-v4-arc/position.ts): each figure traces to the spoke,
// oracle or hub read behind it, at the head and, for interest, at the UTC
// midnight 30 days back. The page names no function or block (decision 0059
// point 1); this module is where they live.

import { APY_FORMULA, COMPOUNDED } from "@/lib/aave-v4/rates";
import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { ArcPositionFigures, ArcReserveFigures, ArcWalletSpoke } from "@/lib/aave-v4-arc/position";
import { AAVE_V4_ARC_CONTRACTS, type ArcPositionRead, type ArcWalletRead } from "@/lib/aave-v4-arc/types";

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
const oracleIn = (label: string, value: string, note: string): ProvInput => ({
  label,
  value,
  kind: "chain",
  pclass: "oracle",
  note,
});

export interface ArcReceiptContext {
  p: ArcPositionFigures;
  r: ArcPositionRead;
}

const spokeC = (r: ArcPositionRead) => ({ name: `${r.spoke.name} spoke`, address: r.spoke.address });
const hubC = { name: "Core hub", address: AAVE_V4_ARC_CONTRACTS.hub };

/** The contracts a page's read stamp names. */
export function readContracts(r: ArcPositionRead) {
  return [
    {
      name: `Aave V4 ${r.spoke.name} spoke`,
      address: r.spoke.address,
      reads: "the account, and each reserve's balances, shares and terms at both blocks",
    },
    { name: `${r.spoke.name} spoke oracle`, address: r.spoke.oracle, reads: "each reserve's USD price at the head" },
    { name: "Aave V4 Core hub", address: AAVE_V4_ARC_CONTRACTS.hub, reads: "each borrowed asset's drawn rate" },
  ];
}

const priceInput = (r: ArcPositionRead, x: ArcReserveFigures): ProvInput =>
  oracleIn(
    `${x.symbol} price`,
    x.price == null ? "—" : `$${fig(x.price)}`,
    `the ${r.spoke.name} spoke oracle's getReservePrice(${x.reserveId}) at block ${n(r.head.block)}, ${r.spoke.priceDecimals} decimals`,
  );

export type ArcReserveFigure =
  | "supplied"
  | "debt"
  | "usd-supplied"
  | "usd-debt"
  | "collateral-factor"
  | "borrow-rate"
  | "interest-supply"
  | "interest-debt"
  | "usd-interest-supply"
  | "usd-interest-debt";

/** One reserve's figure. */
export function arcReserveProv(key: ArcReserveFigure, c: ArcReceiptContext, x: ArcReserveFigures): Provenance {
  const { r } = c;
  const head = { block: r.head.block };
  const raw = r.reserves.find((y) => y.reserveId === x.reserveId)!;
  const sup = key.includes("suppl");
  const fn = sup ? "getUserSuppliedAssets" : "getUserTotalDebt";
  const rawNow = sup ? raw.supplied : raw.debt;
  switch (key) {
    case "supplied":
    case "debt":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        contract: spokeC(r),
        summary: `${x.symbol} ${sup ? "supplied" : "owed"} on ${r.spoke.name}. ${sup ? "What the account has supplied to the spoke" : "What the account owes the spoke, drawn and premium, with interest"}, read at ${at(r.head)}.`,
        via: `${via(`block ${n(r.head.block)}`)} · spoke ${fn}(${x.reserveId}, wallet) ÷ 10^${x.decimals}`,
        inputs: [chain(fn, rawNow, `${x.decimals} decimals`)],
      };
    case "usd-supplied":
    case "usd-debt":
      return {
        kind: "chain-derived",
        pclass: "oracle",
        source: head,
        contract: { name: `${r.spoke.name} spoke oracle`, address: r.spoke.oracle },
        summary: `${x.symbol} ${sup ? "supplied" : "owed"} in USD. The amount at the ${r.spoke.name} spoke oracle's price, both read at ${at(r.head)}.`,
        via: `${via(`block ${n(r.head.block)}`)} · spoke ${fn} × oracle getReservePrice`,
        formula: "amount × price",
        inputs: [chain(fn, rawNow, `${x.decimals} decimals`), priceInput(r, x)],
      };
    case "collateral-factor":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        contract: spokeC(r),
        summary: `${x.symbol} collateral factor. The share of its value that counts toward a borrow on the ${r.spoke.name} spoke, at the config key this account holds (${raw.position.dynamicConfigKey}), read at ${at(r.head)}.`,
        via: `${via(`block ${n(r.head.block)}`)} · spoke getDynamicReserveConfig(${x.reserveId}, ${raw.position.dynamicConfigKey}).collateralFactor ÷ 10,000`,
        inputs: [
          chain("collateralFactor", raw.collateralFactor == null ? "—" : String(raw.collateralFactor), "basis points"),
        ],
      };
    case "borrow-rate":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        contract: hubC,
        summary: `${x.symbol} borrow APY. The Core hub's drawn rate, read at ${at(r.head)}, ${COMPOUNDED}; the account pays its premium on top.`,
        via: `${via(`block ${n(r.head.block)}`)} · hub getAssetDrawnRate(${raw.assetId}) ÷ 10^27, compounded`,
        formula: APY_FORMULA,
        inputs: [
          chain("getAssetDrawnRate", raw.drawnRate ?? "—", "a ray"),
          chain("riskPremium", c.r.account.riskPremium, "basis points of drawn debt, getUserAccountData"),
        ],
      };
    default: {
      const usdKey = key.startsWith("usd-");
      const past = raw.past;
      const rawThen = past ? (sup ? past.supplied : past.debt) : "—";
      const inputs: ProvInput[] = [
        chain(`${fn} now`, rawNow, `at ${at(r.head)}`),
        chain(`${fn} 30 days back`, rawThen, `at ${at(r.then)}`),
        chain(
          "shares, both dates",
          sup
            ? raw.position.suppliedShares
            : `${raw.position.drawnShares} drawn, ${raw.position.premiumShares} premium`,
          "getUserPosition; the same at both dates",
        ),
      ];
      if (usdKey) inputs.push(priceInput(r, x));
      return {
        kind: "chain-derived",
        pclass: usdKey ? "oracle" : "state",
        source: head,
        contract: spokeC(r),
        summary: `${x.symbol} interest ${sup ? "earned" : "owed"}, 30 days${usdKey ? ", in USD" : ""}. The balance at ${at(r.head)} less the balance at ${at(r.then)}, the account's shares being the same at both${usdKey ? ", valued at the spoke oracle's price at the head" : ""}.`,
        via: `${via(`blocks ${n(r.then.block)} and ${n(r.head.block)}`)} · spoke ${fn}, getUserPosition${usdKey ? " · × oracle getReservePrice" : ""}`,
        formula: usdKey ? "(now − then) × price" : "now − then",
        inputs,
      };
    }
  }
}

export type ArcCardFigure = "supplied-total" | "debt-total" | "health" | "borrow-limit";

/** A headline: a total over the reserves, or the account's health factor. */
export function arcCardProv(key: ArcCardFigure, c: ArcReceiptContext): Provenance {
  const { p, r } = c;
  const head = { block: r.head.block };
  if (key === "health")
    return {
      kind: "chain",
      pclass: "state",
      source: head,
      contract: spokeC(r),
      summary: `Health factor on ${r.spoke.name}. Collateral at each asset's collateral factor ÷ debt, both at the spoke's oracle, read at ${at(r.head)}.`,
      via: `${via(`block ${n(r.head.block)}`)} · spoke getUserAccountData(wallet).healthFactor ÷ 10^18`,
      inputs: [chain("healthFactor", r.account.healthFactor, "18 decimals")],
    };
  const rows =
    key === "debt-total"
      ? p.borrowed.map((x) => ({ x, v: x.debtUsd, a: x.debt }))
      : key === "borrow-limit"
        ? p.supplied
            .filter((x) => x.isCollateral)
            .map((x) => ({ x, v: (x.suppliedUsd ?? 0) * (x.collateralFactor ?? 0), a: x.supplied }))
        : p.supplied.map((x) => ({ x, v: x.suppliedUsd, a: x.supplied }));
  const name = key === "debt-total" ? "Debt" : key === "borrow-limit" ? "Borrow limit" : "Supplied";
  const words =
    key === "debt-total"
      ? "Each borrowed asset's amount owed at the spoke oracle's price, added up"
      : key === "borrow-limit"
        ? "Each collateral's value at the spoke oracle's price × its collateral factor, added up"
        : "Each supplied asset's amount at the spoke oracle's price, added up";
  const gap = p.unpriced.length ? ` It leaves out ${p.unpriced.join(", ")}, which the oracle did not price.` : "";
  return {
    kind: "chain-derived",
    pclass: "oracle",
    source: head,
    contract: { name: `${r.spoke.name} spoke oracle`, address: r.spoke.oracle },
    summary: `${name} in USD. ${words}, at ${at(r.head)}.${gap}`,
    via: `${via(`block ${n(r.head.block)}`)} · spoke ${key === "debt-total" ? "getUserTotalDebt" : "getUserSuppliedAssets"} × oracle getReservePrice${key === "borrow-limit" ? " × getDynamicReserveConfig.collateralFactor" : ""} · summed`,
    formula: key === "borrow-limit" ? "Σ (amount × price × collateral factor)" : "Σ (amount × price)",
    inputs: rows.map(({ x, v, a }) => ({
      label: x.symbol,
      value: v == null ? "no price" : `$${fig(v)}`,
      kind: "chain" as const,
      pclass: "oracle" as const,
      note: `${fig(a)} ${x.symbol} × $${x.price == null ? "—" : fig(x.price)}`,
    })),
  };
}

/** A wallet page row's dollar figure. */
export function arcWalletProv(side: "supplied" | "debt", s: ArcWalletSpoke, r: ArcWalletRead): Provenance {
  const raw = r.spokes.find((x) => x.key === s.key)!;
  const items = side === "supplied" ? s.supplied : s.borrowed;
  return {
    kind: "chain-derived",
    pclass: "oracle",
    source: { block: r.head.block },
    contract: { name: `${s.name} spoke oracle`, address: raw.oracle },
    summary: `${side === "supplied" ? "Supplied" : "Debt"} on ${s.name} in USD. Each asset's amount at the spoke oracle's price, added up, at ${at(r.head)}.`,
    via: `${via(`block ${n(r.head.block)}`)} · spoke ${side === "supplied" ? "getUserSuppliedAssets" : "getUserTotalDebt"} × oracle getReservePrice · summed`,
    formula: "Σ (amount × price)",
    inputs: items.map((x) => ({
      label: x.symbol,
      value: x.usd == null ? "no price" : `$${fig(x.usd)}`,
      kind: "chain" as const,
      pclass: "oracle" as const,
      note: `${fig(x.amount)} ${x.symbol}`,
    })),
  };
}

/** A wallet page row's health factor. */
export function arcWalletHealthProv(s: ArcWalletSpoke, r: ArcWalletRead): Provenance {
  const raw = r.spokes.find((x) => x.key === s.key)!;
  return {
    kind: "chain",
    pclass: "state",
    source: { block: r.head.block },
    contract: { name: `${s.name} spoke`, address: s.address },
    summary: `Health factor on ${s.name}. Collateral at each asset's collateral factor ÷ debt, both at the spoke's oracle, read at ${at(r.head)}.`,
    via: `${via(`block ${n(r.head.block)}`)} · spoke getUserAccountData(wallet).healthFactor ÷ 10^18`,
    inputs: [chain("healthFactor", raw.account.healthFactor, "18 decimals")],
  };
}
