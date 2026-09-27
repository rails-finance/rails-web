// The Lifetime flows Explanation pane on an Alchemist position (T3 of the
// tower's ladder, rails-ops standards/detail-page-anatomy.md). Liquity V2's
// `liquityEconomicsExplanation` is the model: what each side sums, from this
// position's own figures, and where the gap between the flows and the reading
// now comes from.
//
// The tower sums the position's own events, plus one summed row per side for
// what the line's redemptions cleared and took (lib/alchemix/economics.ts):
// each a difference of two readings, not derived from a redemption's own log
// (rails-ops decisions/0032), and drawn only where every redemption on the
// timeline states its figure. This pane states the same figures in prose, in
// the foreground colour the bars already gave them.

import type { ReactNode } from "react";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatCompact, formatNumber } from "@/lib/utils/format";
import type { AlchemixEconomicsFigures } from "@/lib/alchemix/economics";

export interface AlchemixFlowsRedemptions {
  count: number;
  stated: number;
  cleared: number;
  /** Null where not every stated redemption has a collateral figure. */
  taken: number | null;
}

export interface AlchemixFlowsGas {
  /** Distinct transactions of this position's own events that carry gas. */
  transactions: number;
  eth: number;
}

/** Below this the collateral side is taken to close: the sums are of display
 *  figures, and one wei of shares is the getCDP rounding. */
const RECONCILE_TOLERANCE = 1e-6;

export function alchemixFlowsExplanation(opts: {
  figures: AlchemixEconomicsFigures;
  syntheticSymbol: string;
  mytSymbol: string;
  currentCollateral: number | null;
  currentDebt: number | null;
  redemptions: AlchemixFlowsRedemptions;
  gas: AlchemixFlowsGas | null;
}): ReactNode {
  const { figures: f, syntheticSymbol: sym, mytSymbol: myt, redemptions: r } = opts;
  // A figure the tower draws is foreground (`H`), at the tower's format; one
  // only this pane states is muted (rails-ops standards/detail-page-anatomy.md,
  // "Colour points back to T2").
  const n = (v: number, unit: string) => (
    <span className="tabular-nums">
      {formatNumber(v)} {unit}
    </span>
  );
  const h = (v: number, unit: string) => (
    <H>
      <span className="tabular-nums">
        {formatCompact(v)} {unit}
      </span>
    </H>
  );
  const redeemedAll = r.count > 0 && r.stated === r.count && r.cleared > 0;
  const items: ReactNode[] = [];

  if (f.deposited.amount > 0) {
    const exits: ReactNode[] = [];
    if (f.withdrawn.amount > 0) exits.push(<>{h(f.withdrawn.amount, myt)} withdrawn</>);
    if (f.spentRepaying.amount > 0)
      exits.push(<>{h(f.spentRepaying.amount, myt)} put against debt set aside for repayment, fee included</>);
    if (f.repayFeeShares > 0) exits.push(<>{n(f.repayFeeShares, myt)} taken as repay fees</>);
    if (f.closedWith.amount > 0) exits.push(<>{h(f.closedWith.amount, myt)} paid the rest of the debt at the close</>);
    if (f.returnedOnClose.amount > 0)
      exits.push(<>{h(f.returnedOnClose.amount, myt)} returned to the holder at the close</>);
    if (f.liquidated.amount > 0) exits.push(<>{h(f.liquidated.amount, myt)} taken by liquidation</>);
    if (redeemedAll && r.taken != null && r.taken > 0)
      exits.push(
        <>
          {h(r.taken, myt)} taken by {r.count} line {r.count === 1 ? "redemption" : "redemptions"}
        </>,
      );
    const accounted =
      f.deposited.amount -
      f.withdrawn.amount -
      f.spentRepaying.amount -
      f.repayFeeShares -
      f.closedWith.amount -
      f.returnedOnClose.amount -
      f.liquidated.amount -
      (redeemedAll && r.taken != null ? r.taken : 0);
    const current = opts.currentCollateral ?? 0;
    const closes = Math.abs(accounted - current) < RECONCILE_TOLERANCE;
    items.push(
      <>
        Collateral started from {h(f.deposited.amount, myt)} deposited
        {exits.length > 0 ? (
          <>
            , then{" "}
            {exits.map((e, i) => (
              <span key={i}>
                {i > 0 ? (i === exits.length - 1 ? " and " : ", ") : null}
                {e}
              </span>
            ))}
          </>
        ) : null}
        {opts.currentCollateral != null ? <>, leaving {h(current, myt)} held now.</> : "."}
        {opts.currentCollateral != null && !closes ? (
          f.returnedUnstated > 0 ? (
            <>
              {" "}
              The other {n(Math.abs(accounted - current), myt)} is the collateral the close returned to the holder,
              which no event states.
            </>
          ) : (
            <>
              {" "}
              The other {n(Math.abs(accounted - current), myt)} {accounted > current ? "left" : "came into"} the
              position in ways these events do not state.
            </>
          )
        ) : null}
      </>,
    );
  }

  if (f.minted.amount > 0) {
    const exits: ReactNode[] = [];
    if (f.burned.amount > 0) exits.push(<>{h(f.burned.amount, sym)} burned</>);
    if (f.debtCleared.amount > 0 && f.debtCreditUnresolved === 0)
      exits.push(
        <>
          {h(f.debtCleared.amount, sym)} cleared by repays paid with {n(f.repaidFromOutside.amount, myt)} from outside
          the collateral
        </>,
      );
    if (redeemedAll)
      exits.push(
        <>
          {h(r.cleared, sym)} cleared by {r.count} line {r.count === 1 ? "redemption" : "redemptions"}
        </>,
      );
    if (f.debtClosed.amount > 0) exits.push(<>{h(f.debtClosed.amount, sym)} paid off with collateral at the close</>);
    items.push(
      <>
        Debt started from {h(f.minted.amount, sym)} minted
        {exits.length > 0 ? (
          <>
            , then{" "}
            {exits.map((e, i) => (
              <span key={i}>
                {i > 0 ? (i === exits.length - 1 ? " and " : ", ") : null}
                {e}
              </span>
            ))}
          </>
        ) : null}
        {opts.currentDebt != null ? <>, leaving {h(opts.currentDebt, sym)} owed now.</> : "."} No interest was added to
        it.
      </>,
    );
  }

  if (redeemedAll) {
    items.push(
      <>
        Each line redemption is on the timeline, with what it cleared and took from this position; the row above sums
        them from those readings, not from the position&rsquo;s own events.
      </>,
    );
  }

  if (opts.gas && opts.gas.eth > 0) {
    items.push(
      <>
        Gas across this position&rsquo;s {opts.gas.transactions}{" "}
        {opts.gas.transactions === 1 ? "transaction" : "transactions"}: {opts.gas.eth.toFixed(4)} ETH.
      </>,
    );
  }

  if (items.length === 0) return null;
  return (
    <ProseExplainer paragraph="These figures total the position's own events over its whole life:" items={items} />
  );
}
