"use client";

// The SparkLend event card's account block (T2): the whole account before and
// after the event's transaction — Collateral and Debt (the totals with each
// reserve beneath, the Aave V3 family's cells), health factor, LTV against its
// limits with what could still be borrowed, and the e-mode category (rails-ops
// TO-DO-ui-jobs §213) — read from the chain at blocks N−1 and N
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
// limits are each asset's figures; an account with no debt says it has no
// health factor.

import { Prov, type Provenance } from "@/components/shared/provenance";
import { StatSubline, StateTransition, TransitionArrow } from "@/components/shared/state-transition";
import { hfLabelV4 } from "@/lib/aave-v4/format";
import { emodeCategoryProv, healthFactorProv, type V3Coords } from "@/lib/aave-v3/event-provenance";
import { bpsPct, type AaveV3PositionState } from "@/lib/aave-v3/position-state";
import { emodeLabel, type SparkEventState } from "@/lib/spark/event-state";
import { LtvCellBody, type TouchedLeg } from "@/components/protocol/aave-v3/aave-v3-position-state";
import { AaveFamilyEventReceipt, type RiskItem } from "@/components/protocol/aave-v3/aave-family-event-receipt";

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
  touched = [],
  hfFormat = hfLabelV4,
  eventId,
  eventTs,
}: {
  /** The timeline event, for the card's lifetime sum. */
  eventId?: string;
  eventTs?: number;
  state: SparkEventState;
  raw: AaveV3PositionState;
  coords: V3Coords;
  isLiquidation: boolean;
  /** The reserves the event touched: their rows always draw (§47, §52). */
  touched?: TouchedLeg[];
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
  // A liquidation's before LTV is at the prices the call ran at.
  const ltvAtCall = isLiquidation && state.liqLtvAtCall != null ? state.liqLtvAtCall : null;
  const ltvBefore: Fig | undefined =
    ltvAtCall != null
      ? {
          text: `${(ltvAtCall * 100).toFixed(2)}%`,
          value: `${(ltvAtCall * 100).toFixed(2)}%`,
          prov: ltvAtCallProv(coords, ltvAtCall, before.ltv),
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

  // The row under the two side cells (aave-family-event-receipt.tsx):
  // health factor, LTV, what can still be borrowed, and E-mode, which always
  // draws ("None" says the limits are each asset's own).
  const risk: RiskItem[] = [];
  if (before.hf != null || after.hf != null)
    risk.push({
      key: "health-factor",
      label: "Health factor",
      body: <Pair before={hfFig(hfBeforeValue, "before")} after={hfFig(after.hf, "after")} changed={hfChanged} />,
    });
  else
    risk.push({
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
  risk.push({
    key: "ltv",
    label: "LTV",
    body: <LtvCellBody state={raw} coords={coords} before={ltvBefore} part="ratio" />,
  });
  risk.push({
    key: "borrowable",
    label: "Still borrowable",
    body: <LtvCellBody state={raw} coords={coords} part="borrowable" />,
  });
  risk.push({
    key: "emode",
    label: "E-mode",
    body: (
      <>
        <Pair before={emodeFig("before")} after={emodeFig("after")} changed={emodeChanged} />
        {state.emodeAfter.id !== 0 &&
          state.emodeAfter.ltvBps != null &&
          state.emodeAfter.liquidationThresholdBps != null && (
            <StatSubline>
              LTV {bpsPct(state.emodeAfter.ltvBps)} · liquidation at {bpsPct(state.emodeAfter.liquidationThresholdBps)}
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
    <div data-spark-account-state="ready">
      <AaveFamilyEventReceipt
        state={raw}
        coords={coords}
        touched={touched}
        eventId={eventId}
        eventTs={eventTs}
        risk={risk}
        notes={basis}
      />
    </div>
  );
}

/** An oracle price as the card's price chip states it ("$1,572.11"). */
const usd2 = (p: number): string =>
  `$${p.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
