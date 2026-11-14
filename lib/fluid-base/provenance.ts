// The receipts of a Fluid position page on Base (rails-ops ui-jobs 574; the
// figures are lib/fluid-base/position.ts): each figure traces to the
// VaultResolver read behind it, at the head and, for interest, at the UTC
// midnight 30 days back. The surface names no function or block (decision 0059
// point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { FluidBasePosition } from "@/lib/fluid-base/position";
import { FLUID_BASE_CONTRACTS, type FluidBasePositionRead } from "@/lib/fluid-base/types";
import { FLUID_BASE_DOLLARS } from "@/lib/fluid-base/dollars";

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: { block: number; time: number }) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });

export interface FluidBaseReceiptContext {
  p: FluidBasePosition;
  r: FluidBasePositionRead;
}

const resolver = { name: "Fluid VaultResolver (Base)", address: FLUID_BASE_CONTRACTS.vaultResolver };
const oracleC = { name: "Aave V3 Base AaveOracle", address: FLUID_BASE_CONTRACTS.aaveOracle };
const via = (blocks: string) => `rails-server · eth_call @ ${blocks}`;
const headVia = (c: FluidBaseReceiptContext) => via(`block ${n(c.r.head.block)}`);
const bothVia = (c: FluidBaseReceiptContext) => via(`blocks ${n(c.r.then.block)} and ${n(c.r.head.block)}`);
const chain = (label: string, value: string): ProvInput => ({ label, value, kind: "chain", pclass: "state" });
const derived = (label: string, value: string): ProvInput => ({ label, value, kind: "derived" });
const byId = (c: FluidBaseReceiptContext) => `positionByNftId(${c.r.id})`;

/** The contracts a page's read stamp names. */
export function readContracts(c: FluidBaseReceiptContext) {
  return [
    {
      name: "Fluid VaultResolver",
      address: FLUID_BASE_CONTRACTS.vaultResolver,
      reads: `the position and its vault at both blocks (positionByNftId(${c.r.id}))`,
    },
    ...(FLUID_BASE_DOLLARS
      ? [
          {
            name: "Aave V3 Base AaveOracle",
            address: FLUID_BASE_CONTRACTS.aaveOracle,
            reads: "each side's USD price at the head",
          },
        ]
      : []),
  ];
}

export type FluidBaseFigure =
  | "collateral"
  | "debt"
  | "ratio"
  | "borrow-rate"
  | "room"
  | "threshold"
  | "interest-collateral"
  | "interest-debt"
  | "usd-collateral"
  | "usd-debt"
  | "usd-interest-collateral"
  | "usd-interest-debt"
  | "collateral-factor";

export function fluidBaseProv(key: FluidBaseFigure, c: FluidBaseReceiptContext): Provenance {
  const { p, r } = c;
  const head = { block: r.head.block };
  const C = p.colUnit;
  const D = p.debtUnit;
  const priceIn = derived(`Vault oracle, ${D} per ${C}`, p.priceLiquidate == null ? "—" : fig(p.priceLiquidate));
  switch (key) {
    case "collateral":
    case "debt": {
      const side = key === "collateral" ? "supply" : "borrow";
      const unit = key === "collateral" ? C : D;
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `${key === "collateral" ? "Collateral" : "Debt"} — the position's ${side} at ${at(r.head)}, settled by the vault's math (liquidations applied, interest through the vault's exchange price): ${key === "collateral" ? p.supplyExact : p.borrowExact} ${unit}.`,
        contract: resolver,
        via: headVia(c),
        inputs: [
          chain(`${byId(c)} · ${side}`, side === "supply" ? r.now.supply : r.now.borrow),
          chain("vault", r.vault),
        ],
        scaling: {
          raw: side === "supply" ? r.now.supply : r.now.borrow,
          from: "call",
          places:
            side === "supply"
              ? r.supplyLeg.kind === "shares"
                ? 18
                : r.supplyLeg.token.decimals
              : r.borrowLeg.kind === "shares"
                ? 18
                : r.borrowLeg.token.decimals,
          why: `${unit} counts in that many decimals`,
        },
      };
    }
    case "ratio":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Debt to collateral ratio — debt divided by collateral at the vault oracle's liquidate price, at ${at(r.head)}: the figure Fluid's liquidation engine compares with the vault's limits.`,
        contract: resolver,
        via: headVia(c),
        formula: "debt ÷ (collateral × oraclePriceLiquidate)",
        inputs: [
          derived(D, p.borrowExact),
          derived(C, p.supplyExact),
          chain("configs · oraclePriceLiquidate", r.now.oraclePriceLiquidate),
          priceIn,
        ],
      };
    case "borrow-rate":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Borrow rate — the vault's borrow rate at ${at(r.head)}, annual: ${p.borrowRate?.toFixed(2)}%.`,
        contract: resolver,
        via: headVia(c),
        inputs: [chain("exchangePricesAndRates · borrowRateVault (×100)", r.now.borrowRateVault)],
      };
    case "room":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Room to borrow — the debt the position can add before reaching the vault's collateral factor, at ${at(r.head)}.`,
        contract: resolver,
        via: headVia(c),
        formula: "collateral × oraclePriceLiquidate × collateralFactor − debt",
        inputs: [
          derived(C, p.supplyExact),
          priceIn,
          chain("configs · collateralFactor (1e4 = 100%)", String(r.now.collateralFactor)),
          derived(D, p.borrowExact),
        ],
      };
    case "threshold":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Liquidation threshold — the vault's liquidation threshold at ${at(r.head)}. Above its liquidation max limit of ${fig(p.liquidationMaxLimit * 100)}%, all of the debt can be liquidated; a liquidator receives a ${fig(p.liquidationPenalty * 100)}% discount.`,
        contract: resolver,
        via: headVia(c),
        inputs: [
          chain("configs · liquidationThreshold (1e4 = 100%)", String(r.now.liquidationThreshold)),
          chain("configs · liquidationMaxLimit", String(r.now.liquidationMaxLimit)),
          chain("configs · liquidationPenalty", String(r.now.liquidationPenalty)),
        ],
      };
    case "interest-collateral":
    case "interest-debt": {
      const supply = key === "interest-collateral";
      const ex = supply ? "vaultSupplyExchangePrice" : "vaultBorrowExchangePrice";
      const past = r.past;
      const amount = p.interest.state === "ok" ? (supply ? p.interest.supplyExact : p.interest.borrowExact) : "—";
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Interest over 30 days — the position's raw ${supply ? "supply" : "borrow"} was the same at ${at(r.then)} and ${at(r.head)}, so the interest is today's amount less that raw amount at the earlier exchange price: ${amount} ${supply ? C : D}.`,
        contract: resolver,
        via: bothVia(c),
        formula: "amount now − raw × exchange price then ÷ 10¹²; raw = amount now × 10¹² ÷ exchange price now",
        inputs: [
          chain(`${byId(c)} · ${supply ? "supply" : "borrow"} (now)`, supply ? r.now.supply : r.now.borrow),
          chain(`${ex} (now)`, r.now[ex]),
          chain(`${ex} (30 days back)`, past ? past[ex] : "—"),
          chain(
            `${byId(c)} · ${supply ? "supply" : "borrow"} (30 days back)`,
            past ? (supply ? past.supply : past.borrow) : "—",
          ),
        ],
      };
    }
    case "usd-collateral":
    case "usd-debt": {
      const supply = key === "usd-collateral";
      const leg = supply ? r.supplyLeg : r.borrowLeg;
      const priceRaw = supply ? r.usd.supply : r.usd.borrow;
      const usd = supply ? p.usd.supply : p.usd.borrow;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `In dollars — the ${supply ? "collateral" : "debt"} at Aave V3 Base's oracle price for ${leg.priceAsset === "0x4200000000000000000000000000000000000006" ? "WETH" : leg.token.symbol} at ${at(r.head)}: $${usd == null ? "—" : fig(usd)}. Fluid runs no USD feed.`,
        contract: oracleC,
        via: headVia(c),
        formula: "amount × getAssetPrice ÷ BASE_CURRENCY_UNIT",
        inputs: [
          derived(supply ? C : D, supply ? p.supplyExact : p.borrowExact),
          chain(`getAssetPrice(${leg.priceAsset ?? "—"})`, priceRaw ?? "—"),
          chain("BASE_CURRENCY_UNIT", r.usd.baseUnit),
        ],
      };
    }
    case "usd-interest-collateral":
    case "usd-interest-debt": {
      const supply = key === "usd-interest-collateral";
      const x = p.interest.state === "ok" ? (supply ? p.interest.supply : p.interest.borrow) : null;
      const v = supply ? p.usd.supplyInterest : p.usd.borrowInterest;
      const leg = supply ? r.supplyLeg : r.borrowLeg;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Interest in dollars — the 30 days' interest on the ${supply ? "collateral" : "debt"} at Aave V3 Base's oracle price at ${at(r.head)}: $${v == null ? "—" : fig(v)}.`,
        contract: oracleC,
        via: headVia(c),
        formula: "interest × getAssetPrice ÷ BASE_CURRENCY_UNIT",
        inputs: [
          derived(supply ? C : D, x == null ? "—" : fig(x)),
          chain(`getAssetPrice(${leg.priceAsset ?? "—"})`, (supply ? r.usd.supply : r.usd.borrow) ?? "—"),
          chain("BASE_CURRENCY_UNIT", r.usd.baseUnit),
        ],
      };
    }
    case "collateral-factor":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Collateral factor — the vault's collateral factor at ${at(r.head)}: Fluid lends up to ${fig(p.collateralFactor * 100)}% of the collateral's value.`,
        contract: resolver,
        via: headVia(c),
        inputs: [chain("configs · collateralFactor (1e4 = 100%)", String(r.now.collateralFactor))],
      };
  }
}
