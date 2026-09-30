"use client";

// The SparkLend event card's account block (T2): the whole account before and
// after the event's transaction — health factor, loan-to-value against its
// limits, and the e-mode category — read from the chain at blocks N−1 and N
// through the Aave V3 Base lane's loader (/api/chain/spark/position-state).
// The receipts are the Aave V3 family's at-block receipts (SparkLend runs Aave
// V3's account arithmetic), naming the SparkLend Pool.
//
// A liquidation states its "before" health factor and loan-to-value at the
// prices the call ran at (the balances before it, at block N's oracle prices),
// both on that one basis: the end of N−1 can sit above 1 when the oracle update
// that made the account liquidatable landed in block N ahead of the call. A
// line under the grid names the basis and gives the end-of-N−1 figures.
//
// E-mode always draws, "None" included, so a reader can tell the account's
// limits are each asset's own figures; an account with no debt says it has no
// health factor rather than leaving the grid empty.

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

/** The at-call loan-to-value's receipt: the same balances and prices as the
 *  at-call health factor. */
function ltvAtCallProv(coords: V3Coords, ltv: number, endOfPrevious: number | null): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Loan-to-value at the moment of the liquidation — the account's debt before the call divided by its collateral before the call, both valued at the SparkLend oracle's prices in the liquidation's block, the prices the call ran at.${endOfPrevious != null ? ` At the end of the block before, at that block's prices, it was ${(endOfPrevious * 100).toFixed(2)}%.` : ""}`,
    contract: coords.pool,
    via: `Σ debt before × price at block ${coords.blockNumber ?? "N"} ÷ Σ collateral before × price = ${(ltv * 100).toFixed(2)}%`,
    formula: "debt ÷ collateral",
  };
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
  hfFormat = hfLabelV4,
}: {
  state: SparkEventState;
  raw: AaveV3PositionState;
  coords: V3Coords;
  isLiquidation: boolean;
  /** The explorer's health-factor format; SparkLend's by default. */
  hfFormat?: (hf: number | null) => string;
}) {
  const acc = raw.account;
  if (!acc) return null;
  const { before, after } = state;

  const hfBeforeValue = isLiquidation && state.liqHfAtCall != null ? state.liqHfAtCall : before.hf;
  const hfFig = (hf: number | null, when: "before" | "after"): Fig => {
    const side = when === "before" ? acc.before : acc.after;
    const atCall = when === "before" && isLiquidation && state.liqHfAtCall != null;
    return {
      text: hfFormat(hf),
      value: hf == null ? "∞" : hfFormat(hf),
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
  const ltvAtCall = isLiquidation && state.liqLtvAtCall != null ? state.liqLtvAtCall : null;
  const ltvFig = (when: "before" | "after"): Fig => {
    const a = when === "before" ? before : after;
    const v = when === "before" && ltvAtCall != null ? ltvAtCall : a.ltv;
    const text = v == null ? "—" : `${(v * 100).toFixed(2)}%`;
    return {
      text,
      value: text,
      prov:
        when === "before" && ltvAtCall != null
          ? ltvAtCallProv(coords, ltvAtCall, before.ltv)
          : currentLtvProv(when, coords, { debtUsd: a.debtUsd, collateralUsd: a.collateralUsd }),
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
  const ltvBeforeValue = ltvAtCall ?? before.ltv;
  const ltvChanged = (ltvBeforeValue ?? -1).toFixed(4) !== (after.ltv ?? -1).toFixed(4);
  const emodeChanged = state.emodeBefore.id !== state.emodeAfter.id;

  const cards: { key: string; label: string; body: ReactNode }[] = [];
  if (before.hf != null || after.hf != null)
    cards.push({
      key: "health-factor",
      label: "Health factor",
      body: <Pair before={hfFig(hfBeforeValue, "before")} after={hfFig(after.hf, "after")} changed={hfChanged} />,
    });
  else
    cards.push({
      key: "health-factor",
      label: "Health factor",
      body: (
        <>
          <span className="text-sm font-semibold text-rb-500">None</span>
          <StatSubline>no debt, so no health factor</StatSubline>
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
  // E-mode always draws: "None" says the limits above are each asset's own.
  {
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
          {state.emodeAfter.id === 0 && <StatSubline>limits are each asset&rsquo;s own</StatSubline>}
        </>
      ),
    });
  }

  // A liquidation's before figures are read at the prices the call ran at; the
  // end of the block before is the second basis, named here once.
  const priceMove = state.liqPriceMove;
  const basis =
    isLiquidation && state.liqHfAtCall != null ? (
      <p className="mt-2 text-xs leading-relaxed text-rb-500" data-spark-liq-basis="">
        Before: the balances before this transaction at the oracle prices the liquidation ran at
        {priceMove ? ` (${priceMove.symbol} ${usd2(priceMove.to)})` : ""}. At the end of the block before
        {priceMove ? `, with ${priceMove.symbol} at ${usd2(priceMove.from)},` : ""} the health factor was{" "}
        {hfFormat(before.hf)}
        {before.ltv != null ? ` and the loan-to-value ${(before.ltv * 100).toFixed(2)}%` : ""}.
      </p>
    ) : null;

  return (
    <div className="px-5 pb-2" data-spark-account-state="ready">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.key} className="h-full" data-position-card={c.key}>
            <StatCard label={c.label}>{c.body}</StatCard>
          </div>
        ))}
      </div>
      {basis}
    </div>
  );
}

/** An oracle price as the card's price chip states it ("$1,572.11"). */
const usd2 = (p: number): string =>
  `$${p.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
