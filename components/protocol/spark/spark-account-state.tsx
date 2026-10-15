"use client";

// The SparkLend event card's account figures (T2), under the Aave V3 family's
// Collateral and Debt cells (aave-family-cells.tsx): the health factor, LTV
// against its limits with what could still be borrowed, and the e-mode
// category (rails-ops TO-DO-ui-jobs §213) — read from the chain at blocks N−1
// and N through the Aave V3 Base lane's loader (/api/chain/spark/position-state).
// The receipts are the Aave V3 family's at-block receipts (SparkLend runs Aave
// V3's account arithmetic), naming the SparkLend Pool.
//
// A liquidation states its "before" health factor and loan-to-value at the
// prices inside the liquidation call, the rule every Aave-V3-architecture
// explorer shares (liquidationBasis in lib/aave-v3/position-state.ts,
// LiquidationBasisNote in aave-family-cells.tsx).
//
// E-mode always draws, "None" included, so a reader can tell the account's
// limits are each asset's figures; an account with no debt says it has no
// health factor.

import type { ReactNode } from "react";
import type { EventCellValue, EventStatCellSpec } from "@/components/shared/event-cells";
import { hfLabelV4 } from "@/lib/aave-v4/format";
import { emodeCategoryProv, healthFactorProv, type V3Coords } from "@/lib/aave-v3/event-provenance";
import { bpsPct, type AaveV3PositionState } from "@/lib/aave-v3/position-state";
import { emodeLabel, type SparkEventState } from "@/lib/spark/event-state";
import { fig, LiquidationBasisNote, ltvCells } from "@/components/protocol/aave-v3/aave-family-cells";
import { hfAtCallProv, ltvAtCallProv, type Figure } from "@/components/protocol/aave-v3/aave-v3-position-state";

type Fig = Figure;

/** Before → after, the before drawn where the event moved the figure. */
const pair = (before: Fig, after: Fig, changed: boolean): EventCellValue => ({
  ...(changed ? { before: fig(before) } : {}),
  after: fig(after),
  afterClass: `tabular-nums ${changed ? "text-foreground" : "text-rb-500"}`,
});

/** SparkLend's figures under the side cells, and the line naming a
 *  liquidation's basis. */
export function sparkRiskCells({
  state,
  raw,
  coords,
  isLiquidation,
  hfFormat = hfLabelV4,
}: {
  state: SparkEventState;
  raw: AaveV3PositionState;
  coords: V3Coords;
  isLiquidation: boolean;
  /** The explorer's health-factor format; SparkLend's by default. */
  hfFormat?: (hf: number | null) => string;
}): { cells: EventStatCellSpec[]; notes: ReactNode } {
  const acc = raw.account;
  if (!acc) return { cells: [], notes: null };
  const { before, after } = state;

  const hfBeforeValue = isLiquidation && state.liqHfAtCall != null ? state.liqHfAtCall : before.hf;
  const hfFig = (hf: number | null, when: "before" | "after"): Fig => {
    const side = when === "before" ? acc.before : acc.after;
    const atCall = when === "before" && isLiquidation && state.liqHfAtCall != null;
    return {
      text: hfFormat(hf),
      value: hf == null ? "∞" : hfFormat(hf),
      prov: atCall
        ? hfAtCallProv(coords, state.liqHfAtCall as number, before.hf, "SparkLend")
        : healthFactorProv(when, coords, {
            wad: side.healthFactor,
            collateralBase: side.totalCollateralBase,
            debtBase: side.totalDebtBase,
            thresholdBps: side.liquidationThresholdBps,
          }),
    };
  };
  // A liquidation's before LTV is at the prices the call ran at.
  const ltvAtCall = isLiquidation && state.liqLtvAtCall != null ? state.liqLtvAtCall : null;
  const ltvBefore: Fig | undefined =
    ltvAtCall != null
      ? {
          text: `${(ltvAtCall * 100).toFixed(2)}%`,
          value: `${(ltvAtCall * 100).toFixed(2)}%`,
          prov: ltvAtCallProv(coords, ltvAtCall, before.ltv, "SparkLend"),
        }
      : undefined;
  const emodeFig = (when: "before" | "after"): Fig => {
    const e = when === "before" ? state.emodeBefore : state.emodeAfter;
    const name = emodeLabel(e);
    return {
      text: e.id === 0 ? "None" : name,
      value: String(e.id),
      prov: emodeCategoryProv(
        when,
        { id: e.id, name, generation: raw.emode?.categories[String(e.id)]?.generation ?? null },
        coords,
      ),
    };
  };

  const hfChanged = hfBeforeValue !== after.hf;
  const emodeChanged = state.emodeBefore.id !== state.emodeAfter.id;

  const cells: EventStatCellSpec[] = [];
  cells.push(
    before.hf != null || after.hf != null
      ? {
          key: "health-factor",
          kind: "stat",
          label: "Health factor",
          changed: hfChanged,
          inputs: ["collateral", "debt"],
          value: pair(hfFig(hfBeforeValue, "before"), hfFig(after.hf, "after"), hfChanged),
          data: { "data-position-card": "health-factor" },
        }
      : {
          key: "health-factor",
          kind: "stat",
          label: "Health factor",
          changed: false,
          inputs: ["collateral", "debt"],
          value: { none: "None" },
          sub: [{ content: "no debt, so no health factor" }],
          data: { "data-position-card": "health-factor" },
        },
  );
  // The collateral the category covers, with its own figures outside it.
  const outside = raw.reserves.filter(
    (r) =>
      r.inEmode &&
      r.collateral?.after &&
      r.supply.after !== "0" &&
      r.ltvBps != null &&
      r.liquidationThresholdBps != null &&
      r.symbol != null,
  );
  cells.push(...ltvCells(raw, coords, ltvBefore));
  // E-mode always draws ("None" says the limits are each asset's own).
  cells.push({
    key: "emode",
    kind: "stat",
    label: "E-mode",
    changed: emodeChanged,
    value: pair(emodeFig("before"), emodeFig("after"), emodeChanged),
    sub:
      state.emodeAfter.id !== 0 && state.emodeAfter.ltvBps != null && state.emodeAfter.liquidationThresholdBps != null
        ? [
            {
              content: `LTV ${bpsPct(state.emodeAfter.ltvBps)} · liquidation at ${bpsPct(state.emodeAfter.liquidationThresholdBps)}${
                outside.length > 0
                  ? ` (outside e-mode: ${outside
                      .map(
                        (r) =>
                          `${r.symbol} ${bpsPct(r.ltvBps as number)} · ${bpsPct(r.liquidationThresholdBps as number)}`,
                      )
                      .join(", ")})`
                  : ""
              }`,
            },
          ]
        : state.emodeAfter.id === 0
          ? [{ content: <>limits are each asset&rsquo;s own</> }]
          : undefined,
    data: { "data-position-card": "emode" },
  });

  const notes =
    isLiquidation && state.liqHfAtCall != null ? (
      <LiquidationBasisNote
        basis={{
          hf: state.liqHfAtCall,
          ltv: state.liqLtvAtCall ?? null,
          endHf: before.hf,
          endLtv: before.ltv,
          priceMove: state.liqPriceMove,
        }}
        block={raw.block}
        hfFormat={hfFormat}
      />
    ) : null;
  return { cells, notes };
}
