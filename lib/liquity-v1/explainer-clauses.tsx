// Liquity V1 plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the Trove looks like
// AFTER this event), never on the event type alone: a payback that clears the debt,
// a redemption that fully redeems, a close that empties both sides all read
// differently. The state-blind morals the old bullets carried ("raising the Trove's
// collateral ratio", "reduces the cover") are gone — replaced by facts about THIS
// event's own figures and the mechanic each event exhibits.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the open card — the signed deltas (spine / header), the
// after-balances (detail grid), and the liquidation forensics legs. Liquity V1
// carries NO same-tx sibling case (one Trove per address, one row per operation),
// so there is no primary-across-scope narrator here — every figure has its twin on
// this card.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Liquity V1 cannot fill, each a data fact of its pipeline:
//   • §5.1 (risk consequence per event) on open / adjust / close: the indexed
//     stream carries no per-event oracle price for these — only liquidation and
//     redemption rows embed priceAtBlock — so a collateral-ratio-vs-threshold read
//     at event time cannot be computed for an operate. Stated on liquidation
//     events, where the sweep itself carries the price (the seized/cleared/premium
//     legs ARE the ratio at fire).
//   • §5.2 (mechanic-why on fees): the one-time borrowing fee is named on open /
//     borrow, but V1 emits no fee AMOUNT in the stream, so it is described, not
//     figured. The 200 LUSD gas-compensation reserve is a fixed constant, named
//     plainly.
//   • §5.4 beyond liquidations: a redemption exposes no priced twin on its own card
//     (the forensics block is liquidation-only), so its net outcome stays
//     qualitative — the deltas are equal-value at the oracle price by construction.
// Filled: forward paths (§5.3) on a fully-redeemed Trove's claimable surplus and a
// closed position; the valued liquidation net-outcome (§5.4) with the premium
// landed on the seized/cleared legs; the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import {
  collDeltaProv,
  debtDeltaProv,
  collAfterProv,
  debtAfterProv,
  atBlockPriceProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
  type LiquityV1Coords,
} from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { formatNumber, formatUsdValue, formatPrice } from "@/lib/utils/format";

/** A leg below this magnitude reads as empty — a full repay or a full sweep
 *  leaves the emitted absolute at (or a hair above) zero. */
export const LIQUITY_V1_EPS = 1e-9;

// ── resulting state ──────────────────────────────────────────────────────────

export interface LiquityV1ResultingState {
  collAfter: number;
  debtAfter: number;
  hasDebtAfter: boolean;
  collateralOnly: boolean;
  closedPosition: boolean;
  debtCleared: boolean;
}

export function resultingState(ctx: LiquityV1Context): LiquityV1ResultingState {
  const collAfter = Number(ctx.collAfter) || 0;
  const debtAfter = Number(ctx.debtAfter) || 0;
  const collZero = collAfter <= LIQUITY_V1_EPS;
  const debtZero = debtAfter <= LIQUITY_V1_EPS;
  return {
    collAfter,
    debtAfter,
    hasDebtAfter: !debtZero,
    collateralOnly: !collZero && debtZero,
    closedPosition: collZero && debtZero,
    debtCleared: debtZero,
  };
}

// ── figure rendering ─────────────────────────────────────────────────────────

function Fig({
  info,
  value,
  symbol,
  echo,
  children,
}: {
  info: Provenance;
  value?: string;
  symbol?: string;
  echo?: boolean;
  children: ReactNode;
}) {
  return (
    <Prov info={info} value={value} symbol={symbol} echo={echo}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

const fmtAbs = (h?: string): string => formatNumber(Math.abs(Number(h)));
const fmtVal = (h?: string): string => formatNumber(Number(h));

// ── the variant table ────────────────────────────────────────────────────────

export function liquityV1EventSlots(ctx: LiquityV1Context, coords: LiquityV1Coords): EventProseSlots {
  const rs = resultingState(ctx);
  const coll = Number(ctx.collDelta) || 0;
  const debt = Number(ctx.debtDelta) || 0;
  // The header shows a BARE magnitude on opens, owner adjusts and redemptions
  // (each axis or the caution pill carries the direction) and a SIGNED figure on
  // liquidations and closes — so the delta echo must key its value the same way,
  // or it lands on no receipt.
  const labeled = ctx.eventType === "openTrove" || ctx.eventType === "adjustTrove" || ctx.eventType === "redemption";

  // Signed deltas echo the spine / header delta receipt (same prov vocabulary +
  // coords → same entry key). Display is the magnitude; the sign rides the value.
  const collDeltaFig = () => (
    <Fig
      echo
      info={collDeltaProv(coords, {
        after: ctx.collAfter,
        before: ctx.collAfter != null ? Number(ctx.collAfter) - coll : null,
      })}
      value={chainTruthDeltaValue(coll, labeled)}
      symbol={COLLATERAL_SYMBOL}
    >
      {fmtAbs(ctx.collDelta)} {COLLATERAL_SYMBOL}
    </Fig>
  );
  const debtDeltaFig = () => (
    <Fig
      echo
      info={debtDeltaProv(coords, {
        after: ctx.debtAfter,
        before: ctx.debtAfter != null ? Number(ctx.debtAfter) - debt : null,
      })}
      value={chainTruthDeltaValue(debt, labeled)}
      symbol={DEBT_SYMBOL}
    >
      {fmtAbs(ctx.debtDelta)} {DEBT_SYMBOL}
    </Fig>
  );
  // After-balance figures echo the detail grid's after-value receipt.
  const collAfterFig = () => (
    <Fig echo info={collAfterProv(coords)} value={fmtVal(ctx.collAfter)} symbol={COLLATERAL_SYMBOL}>
      {fmtVal(ctx.collAfter)} {COLLATERAL_SYMBOL}
    </Fig>
  );
  const debtAfterFig = () => (
    <Fig echo info={debtAfterProv(coords)} value={fmtVal(ctx.debtAfter)} symbol={DEBT_SYMBOL}>
      {fmtVal(ctx.debtAfter)} {DEBT_SYMBOL}
    </Fig>
  );

  switch (ctx.eventType) {
    case "openTrove":
      return {
        happened: [
          clause(
            <>
              Opened the Trove with {collDeltaFig()} of collateral and drew {debtDeltaFig()} of debt.
            </>,
          ),
        ],
        changed: [
          clause(<>The debt drawn includes a one-time borrowing fee and a 200 LUSD gas-compensation reserve.</>),
          clause(<>The reserve is returned when the Trove closes.</>),
        ],
        // The general no-ongoing-interest rule is Layer-2 material — the "?"
        // modal (liquityV1BorrowingContent) carries it verbatim; openTrove's
        // pane keeps its happened + changed slots (legal per charter §4).
      };

    case "adjustTrove": {
      const happened: ClauseInput[] = [];
      if (coll > 0) happened.push(clause(<>Added {collDeltaFig()} of collateral to the Trove.</>));
      else if (coll < 0) happened.push(clause(<>Withdrew {collDeltaFig()} of collateral from the Trove.</>));
      if (debt > 0) happened.push(clause(<>Drew {debtDeltaFig()} of new debt.</>));
      else if (debt < 0) happened.push(clause(<>Repaid {debtDeltaFig()} of debt.</>));
      const changed: ClauseInput[] =
        debt > 0 ? [clause(<>A one-time borrowing fee is included in the amount drawn.</>)] : [];
      return {
        happened,
        changed,
        meansNow: [
          clause(
            <>
              The Trove now holds {collAfterFig()} against {debtAfterFig()} of debt.
            </>,
          ),
          clause(<>It stays open while its collateral ratio holds above the 110% minimum.</>),
        ],
      };
    }

    case "closeTrove":
      return {
        happened: [
          clause(
            <>
              Closed the Trove: repaid the remaining {debtDeltaFig()} of debt and withdrew all {collDeltaFig()} of
              collateral.
            </>,
          ),
        ],
        changed: [clause(<>The 200 LUSD gas-compensation reserve was returned with the repayment.</>)],
        meansNow: [clause(<>Nothing remains on either side of the position.</>)],
      };

    case "liquidation":
      return {
        happened: [
          clause(
            <>
              This Trove&rsquo;s collateral ratio fell below the protocol&rsquo;s liquidation threshold, so it was
              liquidated.
            </>,
          ),
        ],
        changed: [
          clause(
            <>
              {collDeltaFig()} of collateral was seized and {debtDeltaFig()} of debt cleared.
            </>,
          ),
          clause(<>A V1 liquidation closes the whole Trove, not part of it.</>),
        ],
        // The disjunctive absorb-or-redistribute rule is Layer-2 material (the
        // pane cannot say which route THIS liquidation took) — the "?" modal
        // (liquityV1LiquidationContent steps 1–2) carries it verbatim.
        meansNow: [valuedLiquidationSentence(ctx, coords)],
      };

    case "redemption": {
      const meansNow: ClauseInput[] = rs.debtCleared
        ? [
            clause(<>This redemption cleared the Trove&rsquo;s debt in full.</>),
            rs.collAfter > LIQUITY_V1_EPS
              ? clause(<>The remaining collateral is left claimable by the owner.</>)
              : null,
          ]
        : [
            clause(
              <>
                The Trove keeps {collAfterFig()} against {debtAfterFig()} of debt, at a higher collateral ratio.
              </>,
            ),
            clause(
              <>
                At the oracle price the collateral given up is worth about the debt cancelled — a forced deleveraging,
                not a loss.
              </>,
            ),
          ];
      return {
        happened: [
          clause(
            <>
              An LUSD holder redeemed against this Trove, one of the lowest collateral ratios at the time: it gave up{" "}
              {collDeltaFig()} of collateral and {debtDeltaFig()} of its debt was cancelled at the $1 redemption face.
            </>,
          ),
        ],
        meansNow,
      };
    }

    default:
      return { happened: [] };
  }
}

/** The valued liquidation sentence — the protocol's own oracle price at the time,
 *  echoing the forensics block's three legs (seized value, cleared face, premium)
 *  and its price pill. LUSD counts at the $1 redemption face the protocol's own
 *  ratio math uses, so the premium is the Trove's collateral ratio at fire minus
 *  100% — what the Stability Pool depositors (or the redistributed Troves) gained.
 *  Drops WHOLE when the row is unpriced — the never-empty floor, and the same gate
 *  the forensics block uses. */
function valuedLiquidationSentence(ctx: LiquityV1Context, coords: LiquityV1Coords): ClauseInput {
  const price = ctx.priceAtBlock?.usd;
  const seizedAmt = Number(ctx.collBefore);
  const clearedUsd = Number(ctx.debtBefore); // LUSD at the $1 redemption face
  if (price == null || !Number.isFinite(seizedAmt) || seizedAmt <= 0 || !Number.isFinite(clearedUsd) || clearedUsd <= 0)
    return null;
  const seizedUsd = seizedAmt * price;
  const premium = seizedUsd / clearedUsd - 1;
  const premiumStr = `${premium >= 0 ? "+" : "−"}${(Math.abs(premium) * 100).toFixed(2)}%`;

  const priceFig = (
    <Fig echo info={atBlockPriceProv(coords, price)} value={formatPrice(price)} symbol={COLLATERAL_SYMBOL}>
      {formatPrice(price)}
    </Fig>
  );
  const seizedFig = (
    <Fig
      echo
      info={liqSeizedUsdProv(coords, { amount: `${ctx.collBefore} ${COLLATERAL_SYMBOL}`, priceUsd: price })}
      value={formatUsdValue(seizedUsd)}
      symbol={COLLATERAL_SYMBOL}
    >
      {formatUsdValue(seizedUsd)}
    </Fig>
  );
  const clearedFig = (
    <Fig
      echo
      info={liqClearedFaceProv(coords, { amount: `${ctx.debtBefore} ${DEBT_SYMBOL}` })}
      value={formatUsdValue(clearedUsd)}
      symbol={DEBT_SYMBOL}
    >
      {formatUsdValue(clearedUsd)}
    </Fig>
  );
  const premiumFig = (
    <Fig
      echo
      info={liqPremiumProv(coords, { seizedUsd: formatUsdValue(seizedUsd), clearedUsd: formatUsdValue(clearedUsd) })}
      value={premiumStr}
    >
      {premiumStr}
    </Fig>
  );
  return clause(
    <>
      At the protocol&rsquo;s own oracle price at the time ({priceFig} per ETH), the seized collateral was worth{" "}
      {seizedFig} against {clearedFig} of debt at its $1 redemption face — a {premiumFig} premium for whoever absorbed
      the debt.
    </>,
  );
}

/** The teaser = the lead of the composed arc (the first sentence plus any
 *  trailing continuations). */
export function liquityV1ExplainerTeaser(ctx: LiquityV1Context, coords: LiquityV1Coords): ReactNode | null {
  return splitLead(eventClauses(liquityV1EventSlots(ctx, coords))).lead;
}
