"use client";

// The SparkLend event card's account block (T2): the whole account before and
// after the event's transaction — health factor, loan-to-value against its
// limits, and the e-mode category — read from the chain at blocks N−1 and N
// through the Aave V3 Base lane's loader (/api/chain/spark/position-state).
// The receipts are the Aave V3 family's at-block receipts (SparkLend runs Aave
// V3's account arithmetic), naming the SparkLend Pool.
//
// A liquidation states its "before" health factor at the prices the call ran
// at (the balances before it, at block N's oracle prices): the end of N−1 can
// sit above 1 when the oracle update that made the account liquidatable landed
// in block N ahead of the call.

import type { ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { StatCard, StatSubline, StateTransition, TransitionArrow } from "@/components/shared/state-transition";
import { hfLabelV4 } from "@/lib/aave-v4/format";
import {
  accountRatioProv,
  currentLtvProv,
  emodeCategoryProv,
  healthFactorProv,
  type V3Coords,
} from "@/lib/aave-v3/event-provenance";
import { bpsPct, type AaveV3PositionState } from "@/lib/aave-v3/position-state";
import { emodeLabel, type SparkEventState } from "@/lib/spark/event-state";

interface Fig {
  text: string;
  value: string;
  prov: Provenance;
}

function Pair({ before, after, changed }: { before: Fig; after: Fig; changed: boolean }) {
  return (
    <StateTransition>
      {changed && (
        <>
          <span className="text-sm font-semibold tabular-nums text-rb-500">
            <Prov info={before.prov} value={before.value}>
              {before.text}
            </Prov>
          </span>
          <TransitionArrow size="sm" />
        </>
      )}
      <span className={`text-sm font-semibold tabular-nums ${changed ? "" : "text-rb-500"}`}>
        <Prov info={after.prov} value={after.value}>
          {after.text}
        </Prov>
      </span>
    </StateTransition>
  );
}

/** The at-call health factor's receipt: the balances before the liquidation
 *  valued at the oracle prices of its block. */
function hfAtCallProv(coords: V3Coords, hf: number, endOfPrevious: number | null): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Health factor at the moment of the liquidation — the account's balances before the call, valued at the SparkLend oracle's prices in the liquidation's block, each collateral counted up to its liquidation threshold, divided by the debt. The liquidation ran at these prices: the collateral seized equals the debt repaid plus the bonus at this price.${endOfPrevious != null ? ` At the end of the block before, at that block's prices, the factor was ${hfLabelV4(endOfPrevious)}.` : ""}`,
    contract: coords.pool,
    via: `Σ collateral before × price at block ${coords.blockNumber ?? "N"} × threshold ÷ Σ debt before × price = ${hf.toFixed(4)}`,
    formula: "collateral × threshold ÷ debt",
  };
}

export function SparkAccountState({
  state,
  raw,
  coords,
  isLiquidation,
}: {
  state: SparkEventState;
  raw: AaveV3PositionState;
  coords: V3Coords;
  isLiquidation: boolean;
}) {
  const acc = raw.account;
  if (!acc) return null;
  const { before, after } = state;

  const hfBeforeValue = isLiquidation && state.liqHfAtCall != null ? state.liqHfAtCall : before.hf;
  const hfFig = (hf: number | null, when: "before" | "after"): Fig => {
    const side = when === "before" ? acc.before : acc.after;
    const atCall = when === "before" && isLiquidation && state.liqHfAtCall != null;
    return {
      text: hfLabelV4(hf),
      value: hf == null ? "∞" : hfLabelV4(hf),
      prov: atCall
        ? hfAtCallProv(coords, state.liqHfAtCall as number, before.hf)
        : healthFactorProv(when, coords, {
            wad: side.healthFactor,
            collateralBase: side.totalCollateralBase,
            debtBase: side.totalDebtBase,
            thresholdBps: side.liquidationThresholdBps,
          }),
    };
  };
  const ltvFig = (when: "before" | "after"): Fig => {
    const a = when === "before" ? before : after;
    const text = a.ltv == null ? "—" : `${(a.ltv * 100).toFixed(2)}%`;
    return {
      text,
      value: text,
      prov: currentLtvProv(when, coords, { debtUsd: a.debtUsd, collateralUsd: a.collateralUsd }),
    };
  };
  const inEmode = state.emodeBefore.id !== 0 || state.emodeAfter.id !== 0;
  const limitFig = (which: "ltv" | "lt"): Fig => {
    const bps = which === "ltv" ? after.maxLtvBps : after.liquidationThresholdBps;
    return {
      text: bpsPct(bps),
      value: bpsPct(bps),
      prov: accountRatioProv(which, "after", coords, { bps, emode: inEmode }),
    };
  };
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
  const ltvChanged = (before.ltv ?? -1).toFixed(4) !== (after.ltv ?? -1).toFixed(4);
  const emodeChanged = state.emodeBefore.id !== state.emodeAfter.id;

  const cards: { key: string; label: string; body: ReactNode }[] = [];
  if (before.hf != null || after.hf != null)
    cards.push({
      key: "health-factor",
      label: "Health factor",
      body: (
        <>
          <Pair before={hfFig(hfBeforeValue, "before")} after={hfFig(after.hf, "after")} changed={hfChanged} />
          {isLiquidation && state.liqHfAtCall != null && (
            <StatSubline>before: at the prices the liquidation ran at</StatSubline>
          )}
        </>
      ),
    });
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
  if (before.debtUsd > 0 || after.debtUsd > 0)
    cards.push({
      key: "ltv",
      label: "Loan-to-value",
      body: (
        <>
          <Pair before={ltvFig("before")} after={ltvFig("after")} changed={ltvChanged} />
          {after.debtUsd > 0 && (
            <StatSubline>
              max{" "}
              <Prov info={limitFig("ltv").prov} value={limitFig("ltv").value}>
                {limitFig("ltv").text}
              </Prov>{" "}
              · liquidation at{" "}
              <Prov info={limitFig("lt").prov} value={limitFig("lt").value}>
                {limitFig("lt").text}
              </Prov>
            </StatSubline>
          )}
        </>
      ),
    });
  // E-mode draws where the account used a category on either side, or had one
  // at the previous event (the change is the news).
  const emodeShown = inEmode || (state.emodePrevious != null && state.emodePrevious.id !== state.emodeBefore.id);
  if (emodeShown)
    cards.push({
      key: "emode",
      label: "E-mode",
      body: (
        <>
          <Pair before={emodeFig("before")} after={emodeFig("after")} changed={emodeChanged} />
          {state.emodeAfter.id !== 0 &&
            state.emodeAfter.ltvBps != null &&
            state.emodeAfter.liquidationThresholdBps != null && (
              <StatSubline>
                LTV {bpsPct(state.emodeAfter.ltvBps)} · liquidation at{" "}
                {bpsPct(state.emodeAfter.liquidationThresholdBps)}
                {outside.length > 0
                  ? ` (outside e-mode: ${outside
                      .map(
                        (r) =>
                          `${r.symbol} ${bpsPct(r.ltvBps as number)} · ${bpsPct(r.liquidationThresholdBps as number)}`,
                      )
                      .join(", ")})`
                  : ""}
              </StatSubline>
            )}
        </>
      ),
    });

  return (
    <div className="px-5 pb-2" data-spark-account-state="ready">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.key} className="h-full" data-position-card={c.key}>
            <StatCard label={c.label}>{c.body}</StatCard>
          </div>
        ))}
      </div>
    </div>
  );
}
