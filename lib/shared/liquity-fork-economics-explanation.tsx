// Shared economics Explanation + FAQ for the Liquity V2 fork trio (Asymmetry,
// Ebisu, Basedollar) — one grammar parameterised by name + debt symbol, so the
// three explorers narrate their towers identically rather than carrying three
// near-copies. See lib/liquity-v1/economics-explanation.tsx for the V1 sibling
// and components/protocol/liquity/trove-economics.tsx for the V2 benchmark.

import type { ReactNode } from "react";
import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompact, formatExact } from "@/lib/utils/format";
import { formatCompactUsd, formatUsdValue } from "@/components/shared/economics-chart-primitives";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { forkLiquidationReserve } from "@/lib/shared/liquity-fork-ops";

const DUST = 1e-9;

export interface LiquityForkEconomicsParams {
  /** Display name ("Asymmetry" | "Ebisu" | "Base Dollar"). */
  name: string;
  /** The fork's stablecoin symbol ("USDaf" | "ebUSD" | "BD"). */
  debtSymbol: string;
  /** Live-verified docs/site link(s) for the FAQ — question-level where the
   *  fork's docs were read (Ebisu, Asymmetry, 2026-09-28), else the single
   *  general link. */
  docsLinks?: LearnMoreLink[];
}

/** The Trove's redemptions as Liquity V2 states them: the debt they cleared at
 *  $1 face against the collateral they took, valued at the price each
 *  Redemption log emitted, and again at today's branch price. Set by each
 *  fork's economics only when the lifetime flows reconcile. */
export interface LiquityForkRedemptionOutcome {
  debtCleared: number;
  collTaken: number;
  /** Σ collateral taken × the price its redemption emitted; null when a
   *  redemption's price did not load, so no partial sum poses as the total. */
  collValueAtRedemption: number | null;
  /** The branch's price on this load; null when unpriced. */
  currentPrice: number | null;
}

export type LiquityForkTowerData = ChainTruthTowerData & { redemptionOutcome?: LiquityForkRedemptionOutcome };

const signedUsd = (n: number): string => `${n >= 0 ? "+" : "−"}${formatUsdValue(Math.abs(n))}`;

const sideSymbol = (side: TowerSideData, fallback: string): string =>
  side.current[0]?.symbol ?? side.exited[0]?.symbol ?? side.liquidated[0]?.symbol ?? fallback;

const fig = (amount: number, usd: number | null, valued: boolean, symbol: string): string =>
  valued && usd != null ? formatCompactUsd(usd) : `${formatCompact(amount)} ${symbol}`;

const exitedTotal = (side: TowerSideData, valued: boolean): { amount: number; usd: number | null } => {
  const amount = side.exited.reduce((sum, l) => sum + l.amount, 0);
  const usd = valued ? side.exited.reduce((sum, l) => sum + (l.usd ?? 0), 0) : null;
  return { amount, usd };
};

const redeemedLine = (side: TowerSideData) => side.liquidated.find((l) => l.flowKind === "redeemed");
const liquidatedLine = (side: TowerSideData) => side.liquidated.find((l) => l.flowKind !== "redeemed");

/** Explanation body for a Liquity V2 fork tower — a lead sentence plus bullets
 *  derived from `data`. Returns null when there's nothing to narrate. */
export function liquityForkEconomicsExplanation(
  data: LiquityForkTowerData,
  { name, debtSymbol }: LiquityForkEconomicsParams,
): ReactNode {
  const { collateral, debt, valued } = data;
  const collSym = sideSymbol(collateral, "collateral");
  const debtSym = sideSymbol(debt, debtSymbol);
  const bullets: ReactNode[] = [];

  if (collateral.lifetimeInflow > DUST || exitedTotal(collateral, valued).amount > DUST) {
    const { amount: withdrawnAmt, usd: withdrawnUsd } = exitedTotal(collateral, valued);
    bullets.push(
      <span key="coll-flow">
        {collateral.lifetimeInflow > DUST && (
          <>{fig(collateral.lifetimeInflow, valued ? collateral.lifetimeInflow : null, valued, collSym)} deposited</>
        )}
        {withdrawnAmt > DUST && (
          <>
            {collateral.lifetimeInflow > DUST ? ", " : ""}
            {fig(withdrawnAmt, withdrawnUsd, valued, collSym)} withdrawn
          </>
        )}
        {" over the trove's life."}
      </span>,
    );
  }

  if (debt.lifetimeInflow > DUST || exitedTotal(debt, valued).amount > DUST) {
    const { amount: repaidAmt, usd: repaidUsd } = exitedTotal(debt, valued);
    bullets.push(
      <span key="debt-flow">
        {debt.lifetimeInflow > DUST && (
          <>{fig(debt.lifetimeInflow, valued ? debt.lifetimeInflow : null, valued, debtSym)} borrowed</>
        )}
        {repaidAmt > DUST && (
          <>
            {debt.lifetimeInflow > DUST ? ", " : ""}
            {fig(repaidAmt, repaidUsd, valued, debtSym)} repaid
          </>
        )}
        {` over the trove's life, including interest and any upfront fees applied at each touch.`}
      </span>,
    );
  }

  const redeemedDebt = redeemedLine(debt);
  const redeemedColl = redeemedLine(collateral);
  const outcome = data.redemptionOutcome;
  if (outcome) {
    const strong = (t: string) => <span className="font-semibold text-foreground tabular-nums">{t}</span>;
    const collText = `${formatCompact(outcome.collTaken)} ${collSym}`;
    const atToday = outcome.currentPrice != null ? outcome.collTaken * outcome.currentPrice : null;
    bullets.push(
      <span key="redeemed">
        Redemptions cleared {strong(`${formatCompact(outcome.debtCleared)} ${debtSym}`)} of debt at face value and took{" "}
        {strong(collText)}
        {outcome.collValueAtRedemption != null ? (
          <>
            , worth {strong(formatUsdValue(outcome.collValueAtRedemption))} at {name}&apos;s price when each redemption
            happened — a net {strong(signedUsd(outcome.debtCleared - outcome.collValueAtRedemption))} to the borrower.
          </>
        ) : (
          <>.</>
        )}
        {atToday != null && outcome.currentPrice != null && (
          <>
            {" "}
            The same {collSym} repriced at today&apos;s {strong(formatUsdValue(outcome.currentPrice))} is worth{" "}
            {strong(formatUsdValue(atToday))}, which makes it {strong(signedUsd(outcome.debtCleared - atToday))} at
            today&apos;s value.
          </>
        )}
      </span>,
    );
  } else if (redeemedDebt) {
    bullets.push(
      <span key="redeemed">
        The trove has been redeemed against: {fig(redeemedDebt.amount, redeemedDebt.usd, valued, debtSym)} of debt was
        cleared this way
        {redeemedColl && <>, taking {fig(redeemedColl.amount, redeemedColl.usd, valued, collSym)} collateral</>}.
      </span>,
    );
  }

  const liquidatedDebt = liquidatedLine(debt);
  const liquidatedColl = liquidatedLine(collateral);
  if (liquidatedDebt) {
    bullets.push(
      <span key="liquidated">
        {fig(liquidatedDebt.amount, liquidatedDebt.usd, valued, debtSym)} of debt was cleared in liquidation
        {liquidatedColl && <>, seizing {fig(liquidatedColl.amount, liquidatedColl.usd, valued, collSym)} collateral</>}.
      </span>,
    );
  }

  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  const reserve = forkLiquidationReserve(name);
  if (collNow || debtNow) {
    bullets.push(
      <span key="current">
        The trove currently holds {collNow ? fig(collNow.amount, collNow.usd, valued, collSym) : `no ${collSym}`}{" "}
        backing {debtNow ? fig(debtNow.amount, debtNow.usd, valued, debtSym) : "no debt"}.
      </span>,
    );
    if (reserve) {
      bullets.push(<span key="liq-reserve">{reserve} is held in reserve and refunded when the trove is closed.</span>);
    }
  } else if (bullets.length > 0) {
    bullets.push(<span key="closed">The trove is closed — no collateral or debt remain.</span>);
  }

  bullets.push(
    <span key="mechanic">
      {name} is a Liquity V2 fork: this trove carries an interest rate — set by its owner or delegated to a batch
      manager — that accrues into the debt, and redemptions sweep the branch&apos;s lowest rates first.
    </span>,
  );

  if (!valued) {
    bullets.push(
      <span key="unvalued">
        Amounts are shown in token units — the branch&apos;s own oracle price wasn&apos;t available on this load, so no
        dollar total is shown.
      </span>,
    );
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this trove&apos;s lifetime flows on {name} across every event in its captured history.
      </p>
      {bullets.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

/** The redemption net outcome, a bullet of the Lifetime flows Explanation's
 *  Totals — the fork mirror of Liquity V2's `liquityRedemptionOutcome`: the net at each
 *  redemption's own price and, with a price on this load, at today's. */
export function liquityForkRedemptionOutcome(
  data: LiquityForkTowerData,
  { name, debtSymbol }: LiquityForkEconomicsParams,
): ReactNode {
  const o = data.redemptionOutcome;
  if (!o || o.collValueAtRedemption == null) return undefined;
  const atRedemption = o.debtCleared - o.collValueAtRedemption;
  const realizedProv: Provenance = {
    kind: "derived",
    summary: `Redemption net outcome — the ${debtSymbol} debt that redemptions cleared, counted at $1 each, minus the dollar value of the collateral they took at the price ${name}'s branch emitted in each Redemption log.`,
    via: "added up across the trove's redemptions",
    formula: "debt cleared − collateral value at redemption",
    inputs: [
      { label: "debt cleared", value: formatExact(o.debtCleared), kind: "derived", note: "Σ redemption debt changes" },
      {
        label: "collateral value at redemption",
        value: formatExact(o.collValueAtRedemption),
        kind: "derived",
        note: "Σ collateral taken × price at each redemption",
        pclass: "oracle",
      },
    ],
  };
  const today = o.currentPrice != null ? o.debtCleared - o.collTaken * o.currentPrice : null;
  const todayProv: Provenance | null =
    o.currentPrice != null
      ? {
          kind: "derived",
          summary: `Redemption net outcome at today's value — the ${debtSymbol} debt that redemptions cleared, counted at $1 each, minus the collateral they took valued at the branch's current price.`,
          via: "added up across the trove's redemptions",
          formula: "debt cleared − collateral taken × current price",
          inputs: [
            {
              label: "debt cleared",
              value: formatExact(o.debtCleared),
              kind: "derived",
              note: "Σ redemption debt changes",
            },
            {
              label: "collateral taken",
              value: formatExact(o.collTaken),
              kind: "derived",
              note: "Σ collateral sent to redeemers",
            },
            {
              label: "current price",
              value: formatExact(o.currentPrice),
              kind: "chain-derived",
              pclass: "oracle",
              note: "the branch's own PriceFeed on this load",
            },
          ],
        }
      : null;
  return (
    // A bullet of the Lifetime flows Explanation's Totals.
    <li className="flex items-start gap-2" data-anatomy="F13·liquity" data-flows-outcome="">
      <span aria-hidden className="select-none">
        •
      </span>
      <span className="min-w-0">
        Redemptions:{" "}
        <Prov info={realizedProv} value={formatExact(atRedemption)}>
          <span className="font-medium tabular-nums">{signedUsd(atRedemption)}</span>
        </Prov>{" "}
        at the time
        {today != null && todayProv && (
          <>
            ,{" "}
            <Prov info={todayProv} value={formatExact(today)}>
              <span className="font-medium tabular-nums">{signedUsd(today)}</span>
            </Prov>{" "}
            at today&apos;s value
          </>
        )}
      </span>
    </li>
  );
}

/** The tower's "?" FAQ for a Liquity V2 fork. */
export function liquityForkEconomicsContent({
  name,
  debtSymbol,
  docsLinks,
}: LiquityForkEconomicsParams): LearnMoreContent {
  return {
    title: "About the Economics",
    intro: `This panel replays the trove's own events on ${name} into lifetime flows. Its current collateral and ${debtSymbol} debt are the balances the trove's last event recorded; the position card above reads the live figures from the chain.`,
    stepsHeading: "How the tower is built:",
    steps: [
      "Deposited, withdrawn, borrowed and repaid are summed from the trove's own signed balance deltas, event by event.",
      'Debt increases counted as "borrowed" include new draws, the one-time upfront fee, and interest applied whenever an operation touched the trove.',
      "Redemptions and liquidations are kept apart from voluntary flows — each is its own bar.",
      `USD values use the branch's own oracle price for collateral and ${debtSymbol}'s $1 redemption face for debt, and appear only once that on-chain price has loaded.`,
      "The borrower's net outcome from redemptions sets the debt they cleared against the collateral they took, valued at the price each Redemption log emitted, and again at today's price.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "User-set (or delegated) interest",
        text: "each trove carries its own annual rate — set by the borrower or a batch manager they delegate to — accruing continuously into the debt.",
      },
      {
        bold: "Redemption queue",
        text: `${debtSymbol} holders can redeem at $1 face against the branch's lowest-rate troves first — a peg mechanism, not a penalty.`,
      },
    ],
    links: docsLinks && docsLinks.length > 0 ? docsLinks : undefined,
  };
}
