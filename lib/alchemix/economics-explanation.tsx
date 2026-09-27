// The Lifetime flows Explanation pane on an Alchemist position (T3 of the
// tower's ladder, rails-ops standards/detail-page-anatomy.md). Liquity V2's
// `liquityEconomicsExplanation` is the model: what each side sums, from this
// position's own figures, and where the gap between the flows and the reading
// now comes from.
//
// The tower sums the position's own events only (lib/alchemix/economics.ts).
// Redemptions are the line's events, so this pane adds what they cleared and
// took, each a difference of two readings (rails-ops decisions/0032), and only
// where every redemption on the timeline states its figure.

import type { ReactNode } from "react";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatNumber } from "@/lib/utils/format";
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
  const n = (v: number, unit: string) => (
    <span className="tabular-nums">
      {formatNumber(v)} {unit}
    </span>
  );
  const redeemedAll = r.count > 0 && r.stated === r.count && r.cleared > 0;
  const items: ReactNode[] = [];

  if (f.deposited.amount > 0) {
    const exits: ReactNode[] = [];
    if (f.withdrawn.amount > 0) exits.push(<>{n(f.withdrawn.amount, myt)} withdrawn</>);
    if (f.spentRepaying.amount > 0) exits.push(<>{n(f.spentRepaying.amount, myt)} offered against the debt</>);
    if (f.repayFeeShares > 0) exits.push(<>{n(f.repayFeeShares, myt)} taken as repay fees</>);
    if (f.closedWith.amount > 0) exits.push(<>{n(f.closedWith.amount, myt)} used to close the position</>);
    if (f.liquidated.amount > 0) exits.push(<>{n(f.liquidated.amount, myt)} taken by liquidation</>);
    if (redeemedAll && r.taken != null && r.taken > 0)
      exits.push(
        <>
          {n(r.taken, myt)} taken by {r.count} line {r.count === 1 ? "redemption" : "redemptions"}
        </>,
      );
    const accounted =
      f.deposited.amount -
      f.withdrawn.amount -
      f.spentRepaying.amount -
      f.repayFeeShares -
      f.closedWith.amount -
      f.liquidated.amount -
      (redeemedAll && r.taken != null ? r.taken : 0);
    const current = opts.currentCollateral ?? 0;
    const closes = Math.abs(accounted - current) < RECONCILE_TOLERANCE;
    items.push(
      <>
        Collateral started from{" "}
        <H>
          {formatNumber(f.deposited.amount)} {myt}
        </H>{" "}
        deposited
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
        {opts.currentCollateral != null ? (
          <>
            , leaving{" "}
            <H>
              {formatNumber(current)} {myt}
            </H>{" "}
            held now.
          </>
        ) : (
          "."
        )}
        {opts.currentCollateral != null && !closes ? (
          <>
            {" "}
            The other {n(Math.abs(accounted - current), myt)} {accounted > current ? "left" : "came into"} the position
            in ways these events do not state.
          </>
        ) : null}
      </>,
    );
  }

  if (f.minted.amount > 0) {
    const exits: ReactNode[] = [];
    if (f.burned.amount > 0) exits.push(<>{n(f.burned.amount, sym)} burned</>);
    if (f.debtCleared.amount > 0 && f.debtCreditUnresolved === 0)
      exits.push(<>{n(f.debtCleared.amount, sym)} cleared by repays</>);
    if (redeemedAll)
      exits.push(
        <>
          {n(r.cleared, sym)} cleared by {r.count} line {r.count === 1 ? "redemption" : "redemptions"}
        </>,
      );
    items.push(
      <>
        Debt started from{" "}
        <H>
          {formatNumber(f.minted.amount)} {sym}
        </H>{" "}
        minted
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
        {opts.currentDebt != null ? (
          <>
            , leaving{" "}
            <H>
              {formatNumber(opts.currentDebt)} {sym}
            </H>{" "}
            owed now.
          </>
        ) : (
          "."
        )}{" "}
        No interest was added to it.
      </>,
    );
  }

  if (redeemedAll) {
    items.push(
      <>
        The tower draws the position&rsquo;s own events, so the redemptions above are in neither side&rsquo;s bars: each
        is on the timeline, with what it cleared and took from this position.
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
