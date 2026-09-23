// Polaris liquidation forensics — the valued two-leg breakdown, in the
// market's own unit.
// ----------------------------------------------------------------------------
// Modelled on the Liquity-fork adapter (components/protocol/liquity-fork/
// liquity-fork-forensics.ts): the collateral leg valued at the block, the debt
// leg at the face the protocol's own ICR math uses, the premium derived from
// the two and checked against the deployment's own constant.
//
// THE LEG IS NOT THE SEIZED TOTAL. `_collLiquidated` is the ENTIRE collateral
// the manager took; the owner's `_collSurplus` and the liquidator's
// `_collateralComp` are carved out of it, so what the stability pool received
// is `_collLiquidated − _collSurplus − _collateralComp`. Valued at the block
// and divided by `_debtLiquidated`, that leg lands on the protocol's own 5%
// penalty to four decimal places on both of Sepolia's liquidations; the whole
// seized figure over the same debt is a different quantity — the CDP's
// collateral ratio at the moment it fired — and is stated as such in the
// explainer, never as the premium.
//
// UNITS: everything is in the market's own stablecoin (USDp, or GOLDp on the
// gold market), from the oracle-at-block lane's `previewPrice()`. Never "$".
// The shared card's leg field is called `usd` for the Aave build's sake; here
// the number in it is a value in the debt unit, and the receipts say so.
//
// Undefined when the oracle-at-block lane has not priced the event's block —
// the card then stays native-only, exactly as the fork adapter does.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import type { LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  atBlockPriceProv,
  liqPoolLegProv,
  liqLegValueProv,
  liqPremiumProv,
  liqPenaltyConstantProv,
  type PolarisCoords,
} from "@/lib/polaris/event-provenance";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { formatExact } from "@/lib/utils/format";

/** The deployment's own liquidation constants, read on BOTH markets'
 *  cdpManagers at block 11,674,201 (2026-09-10) — identical on each:
 *  `LIQUIDATION_PENALTY_SP()` 0.05e18, `LIQUIDATION_PENALTY_REDISTRIBUTION()`
 *  0.15e18, `MCR()` 1.15e18. Constants of the deployment, so they are stated
 *  here rather than read per event; the receipts name the function to re-run
 *  and the block they were read at. */
export const POLARIS_LIQ_CONSTANTS = {
  sp: { fn: "LIQUIDATION_PENALTY_SP()", fraction: 0.05, raw: "50000000000000000", label: "5%" },
  redistribution: {
    fn: "LIQUIDATION_PENALTY_REDISTRIBUTION()",
    fraction: 0.15,
    raw: "150000000000000000",
    label: "15%",
  },
  /** The normal-mode minimum collateral ratio. A defensive-mode minimum (150%)
   *  in force at a past block is not indexed, so the explainer names this one
   *  and says which it is. */
  mcr: { fn: "MCR()", fraction: 1.15, raw: "1150000000000000000", label: "115%" },
  readAtBlock: 11674201,
} as const;

/** The market's own unit — USDp to 2dp, GOLDp to 4dp (the finer precision an
 *  ounce of gold's own price needs). Exported so the detail, the explainer and
 *  the markdown export all state a figure the same way. */
export const polarisValueFormat =
  (market: PolarisMarket) =>
  (n: number): string =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: market === "goldp" ? 4 : 2,
      maximumFractionDigits: market === "goldp" ? 4 : 2,
    });

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** The figures the forensics rests on, shared by the card, the explainer and
 *  the markdown export so no surface can state a different number. */
export interface PolarisLiquidationFigures {
  /** Which constant the protocol applied — the stability pool's or the
   *  redistribution's. */
  path: "sp" | "redistribution";
  /** The collateral leg the penalty applies to, in pETH. */
  leg: number;
  /** That leg valued at the block's feed price, in the market's own unit. */
  legValue: number;
  /** The debt the leg cleared, at face, in the market's own unit. */
  cleared: number;
  /** legValue ÷ cleared − 1. */
  premium: number;
  /** The ENTIRE seized collateral valued at the same price ÷ the same debt —
   *  the CDP's collateral ratio at the moment it fired. */
  icrAtFire: number;
  /** pETH in the market's own unit at this block. */
  priceInDebt: number;
}

/** The figures, or undefined when this row cannot carry them: no at-block
 *  price, no debt cleared, or a MIXED liquidation.
 *
 *  ⚠️ The redistribution path is UNEXERCISED on Sepolia as of 2026-09-10 —
 *  both of the two liquidations the index has ever seen were absorbed whole by
 *  the stability pool (`_debtRedistributed` = 0 on each; recovery mode
 *  disables redistribution). The branch below is built from the log's own
 *  fields so a redistribution renders the moment one appears, but no fixture
 *  proves it and the verifier asserts only the stability-pool path — extend it
 *  when a redistributed liquidation lands. A MIXED row (both legs non-zero) is
 *  refused outright: the log does not say how the surplus and the liquidator's
 *  compensation split across the two paths, so neither leg could be stated
 *  without inventing that split. */
export function polarisLiquidationFigures(ctx: PolarisContext): PolarisLiquidationFigures | undefined {
  const price = ctx.priceAtBlock?.pethInDebt;
  if (price == null || !Number.isFinite(price) || price <= 0) return undefined;

  const seized = num(ctx.collLiquidated);
  const clearedSp = num(ctx.debtLiquidated);
  const redistColl = num(ctx.collRedistributed);
  const redistDebt = num(ctx.debtRedistributed);
  const surplus = num(ctx.collSurplus);
  const comp = num(ctx.collateralComp);

  const spPath = clearedSp > 0;
  const redistPath = redistDebt > 0;
  if (spPath === redistPath) return undefined; // neither, or a mixed row (see above)

  const leg = spPath ? seized - surplus - comp : redistColl - surplus - comp;
  const cleared = spPath ? clearedSp : redistDebt;
  if (!(leg > 0) || !(cleared > 0)) return undefined;

  const legValue = leg * price;
  const wholeSeized = spPath ? seized : redistColl;
  return {
    path: spPath ? "sp" : "redistribution",
    leg,
    legValue,
    cleared,
    premium: legValue / cleared - 1,
    icrAtFire: (wholeSeized * price) / cleared,
    priceInDebt: price,
  };
}

/** The valued breakdown for the shared card. Undefined exactly where
 *  `polarisLiquidationFigures` is. */
export function buildPolarisLiquidationForensics(
  ctx: PolarisContext,
  coords: PolarisCoords,
  market: PolarisMarket,
): LiquidationForensicsProps | undefined {
  const f = polarisLiquidationFigures(ctx);
  if (!f) return undefined;

  const stable = POLARIS_MARKET_CONFIG[market].stable.symbol;
  const value = polarisValueFormat(market);
  const constant = POLARIS_LIQ_CONSTANTS[f.path];
  const legName = f.path === "sp" ? ("pool collateral" as const) : ("redistributed collateral" as const);
  const exactPrice = formatExact(f.priceInDebt);

  return {
    seized: {
      symbol: stable,
      usd: f.legValue,
      usdProv: liqLegValueProv(legName, coords, {
        amount: `${formatExact(f.leg)} ${PETH.symbol}`,
        priceInDebt: `${exactPrice} ${stable}`,
      }),
    },
    cleared: {
      symbol: stable,
      usd: f.cleared,
      usdProv: liqLegValueProv("cleared debt", coords, { amount: `${formatExact(f.cleared)} ${stable}` }),
    },
    premium: f.premium,
    premiumProv: liqPremiumProv(coords, {
      legValue: `${value(f.legValue)} ${stable}`,
      clearedValue: `${value(f.cleared)} ${stable}`,
      constant: constant.label,
      fn: constant.fn,
    }),
    premiumLabel: f.path === "sp" ? "Stability pool's premium" : "Redistribution premium",
    premiumReference: {
      label: "protocol's liquidation penalty",
      value: constant.label,
      prov: liqPenaltyConstantProv(coords, f.path, {
        fn: constant.fn,
        value: constant.label,
        raw: constant.raw,
        readAtBlock: POLARIS_LIQ_CONSTANTS.readAtBlock,
      }),
    },
    // The card carries the row's ONE at-block price pill: the detail's
    // standalone `AtBlockPriceFootnote` is withheld on a liquidation row so
    // the same price is never stated twice.
    pricePills: ctx.priceAtBlock
      ? [
          {
            symbol: PETH.symbol,
            address: PETH.address,
            priceUsd: f.priceInDebt,
            priceProv: atBlockPriceProv(coords, ctx.priceAtBlock, market),
            note: "oracle at block",
          },
        ]
      : [],
    format: { value, price: value },
  };
}

/** The receipt for the derived pool-leg row in the detail's native-unit grid —
 *  built here so the row and the card cannot disagree about the subtraction. */
export function polarisPoolLegProv(ctx: PolarisContext, coords: PolarisCoords) {
  return liqPoolLegProv(coords, {
    seized: `${formatExact(num(ctx.collLiquidated))} ${PETH.symbol}`,
    surplus: `${formatExact(num(ctx.collSurplus))} ${PETH.symbol}`,
    comp: `${formatExact(num(ctx.collateralComp))} ${PETH.symbol}`,
  });
}
