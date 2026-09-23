// Liquity-V2-fork plain-English authoring — the variant table for the prose
// explainer, SHARED by both forks (Ebisu, Asymmetry): the contract family is one
// V2 architecture, so only the protocol name, the stablecoin, and the per-fork
// provenance builders differ, and those arrive through props (the same shape the
// shared fork header already takes).
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the Trove looks
// like AFTER this event), never on the event type alone: a redemption that
// clears the debt reads differently from one that leaves a below-minimum stub,
// a close empties both sides, a rate change touches neither balance. The
// state-blind consequence morals the old bullets carried ("raising the Trove's
// collateral ratio") are gone — replaced by facts about THIS event's own
// figures, or by named forward paths.
//
// RATE AUTHORSHIP (the fork-specific care): on a batched Trove the interest rate
// is the batch MANAGER's, not a rate the owner set per Trove. Copy keys rate
// authorship on ctx.isBatched so a delegate's decision is never attributed to
// the holder — the same guard forkRateChangeLabel takes on the header.
//
// Figures render through <Prov echo>: every figure here already has a PRIMARY
// receipt on the open card (deltas → header, after-balances + interest rate →
// the detail grid, the liquidation legs → the forensics block), so each prose
// figure echoes that receipt (same builder + value + symbol → same entry key)
// and serves as a locator-pulse target only. There is no cross-scope sibling
// case for this family (batch acts are pre-collapsed single cards), so no figure
// here is a primary.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
//
// The checklist is filled PER DEPLOYMENT, because the forks do not all serve the
// same columns. Where a clause needs a figure the read path doesn't carry, the
// clause drops whole and the older, figure-free sentence stands — so this file
// reads correctly on a fork whose MV has not been widened. As of migs 165/166
// only Basedollar's has; widening Ebisu's and Asymmetry's the same way turns the
// same clauses on for them with no edit here.
//
// FILLED for every fork:
//   • §5.3 forward paths — collateral-only after a full redemption, the zombie
//     state, and the minimum-ratio liquidation door.
//   • §5.4 net outcome on liquidation — seized-vs-cleared and the premium landed
//     on the Trove's own ratio at fire.
//   • §5.5 batch context; §5.6 the highlight rule, via Fig.
//
// FILLED where the deployment carries the operation decomposition (ctx.operation):
//   • §5.2 mechanic-why on fees — the upfront borrowing fee is a FIGURE on opens
//     and debt-drawing adjusts, and the premature-rate-adjustment fee is a figure
//     on rate changes, which previously carried no figures at all. The protocol
//     emits the fee as its own field (TroveOperation _debtIncreaseFromUpfrontFee),
//     so the "about 7 days of average interest" claim is now checkable against the
//     debt and rate on the same card instead of asserted.
//   • Per-event accrued interest between touches — the Liquity V1 depth line,
//     previously recorded here as uncomputable "because this explainer is not
//     wired with the previous event". It never needed the previous event: the
//     contract emits every OTHER reason the debt moved, so the interest is the
//     residual of debtΔ − (borrower's move + fee + redistribution). Regular rows
//     only; a batched Trove's after-debt is share-derived, so its residual would
//     carry rounding as well as interest, and the transform withholds it.
//
// FILLED where the deployment carries the redemption join (ctx.redemption):
//   • §5.2 on redemptions — the fee the redeemer paid INTO this Trove, which is
//     the reason a redemption is not a penalty.
//   • §5.5 aggregate context — the branch-wide act this Trove was a slice of, and
//     whether the branch could fill what was asked.
//   • §5.4's price leg — the branch's own price, emitted in the Redemption log
//     beside the act rather than read back afterwards. Both figures now have
//     chrome twins on the detail grid, so they are bold, not muted.
//
// STILL UNFILLED, and each a data fact rather than an authoring gap:
//   • §5.1 risk consequence on operate events. Opens / adjusts / rate changes /
//     closes carry no price, so no collateral ratio can be stated at event time.
//     Only liquidate and redeem embed a price, and only for their own block — a
//     per-event ratio needs a price at EVERY block, which is a capture job (a
//     per-block PriceFeed filler), not a clause.
//   • The liquidation price leg on a chain with no such filler. The contract does
//     not emit the price on the Trove's own liquidation row the way it does on a
//     redemption, so that lane still depends on the capture. Basedollar has had no
//     liquidations, so nothing is currently withheld by it.
//   • Whether the forks carry a fixed liquidation reserve / gas-comp constant is
//     not asserted — the fork context does not surface one.
//   • Gas. The MV carries tx_gas_used and tx_gas_price, but on an L2 their product
//     is the execution fee ALONE and omits the L1 data fee, so a gas figure built
//     from them would understate the true cost. Stating it would be worse than
//     omitting it; it waits on capturing the receipt's l1Fee.

import type { ReactNode } from "react";
import type { EbisuContext, AsymmetryContext, BasedollarContext, OriginEnvelope } from "@/lib/shared/types/event-shape";
import type { LiquityForkCoords, DeltaOps } from "@/lib/shared/liquity-fork-provenance";
import type { Provenance } from "@/components/shared/provenance";
import type { LiquityForkLearnMoreParams } from "@/lib/shared/learn-more-content";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { FORK_RATE_PILL_EVENTS } from "@/lib/shared/liquity-fork-ops";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import { formatNumber, formatUsdValue, formatPrice } from "@/lib/utils/format";

/** The two fork contexts are structural twins; either drives the explainer. */
export type LiquityForkEventContext = EbisuContext | AsymmetryContext | BasedollarContext;

/** The per-deployment provenance builders the clauses echo — the fork
 *  vocabulary's own (lib/<fork>/event-provenance.ts). Same identities the card
 *  header / detail grid register their primaries with, so a prose echo built
 *  from them shares the receipt's entry key. */
export interface LiquityForkExplainerProvs {
  collDeltaProv: (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null) => Provenance;
  debtDeltaProv: (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null) => Provenance;
  collAfterProv: (coords: LiquityForkCoords, origin?: OriginEnvelope | null) => Provenance;
  debtAfterProv: (coords: LiquityForkCoords, origin?: OriginEnvelope | null) => Provenance;
  rateAtEventProv: (coords?: LiquityForkCoords) => Provenance;
  atBlockPriceProv: (coords: LiquityForkCoords, priceUsd: number) => Provenance;
  liqSeizedUsdProv: (coords: LiquityForkCoords, vals: { amount: string; priceUsd: number }) => Provenance;
  liqClearedFaceProv: (coords: LiquityForkCoords, vals: { amount: string }) => Provenance;
  liqPremiumProv: (
    coords: LiquityForkCoords,
    vals: { seizedUsd: string; clearedUsd: string; mcrPct?: number },
  ) => Provenance;
  // The mig-165/166 figures. Every fork's vocabulary exports these (they are the
  // contract family's own log params), but a clause only fires where the
  // deployment's read path actually carries the value — see ctx.operation /
  // ctx.redemption, both optional.
  upfrontFeeProv: (coords: LiquityForkCoords, vals: { fee: string }) => Provenance;
  accruedInterestProv: (
    coords: LiquityForkCoords,
    vals: { interest: string; debtDelta: string; fromOperation: string; fee: string; redist: string },
  ) => Provenance;
  redemptionFeeKeptProv: (coords: LiquityForkCoords, vals: { fee: string }) => Provenance;
  redemptionActProv: (coords: LiquityForkCoords, vals: { actual: string; attempted: string }) => Provenance;
  emittedRedemptionPriceProv: (coords: LiquityForkCoords, priceUsd: number) => Provenance;
}

/** The fork blanks the copy reads — the display name and the minted stablecoin. */
export type LiquityForkCopy = Pick<LiquityForkLearnMoreParams, "protocolName" | "stablecoin">;

// A debt leg reads as cleared at or below a cent (the 18-decimal stable's
// display dust); collateral clears at an exact zero (the 8-decimal branches make
// a native-unit epsilon unsafe — the same reason the no-change predicate demands
// an exact zero).
const DEBT_EPS = 0.01;
const COLL_EPS = 1e-9;

// ── figure rendering ─────────────────────────────────────────────────────────

/** Every fork figure is an echo (the primary lives on the header / detail /
 *  forensics of the same card); this only pulses it. `value` + `symbol` are the
 *  echo key — build them to match the primary exactly. */
function Fig({
  info,
  value,
  symbol,
  children,
}: {
  info: Provenance;
  value: string;
  symbol?: string;
  children: ReactNode;
}) {
  return (
    <Prov echo info={info} value={value} symbol={symbol}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

const fmtAbs = (h?: string): string => formatNumber(Math.abs(Number(h)));
const fmtNum = (h?: string): string => formatNumber(Number(h));

// ── the variant table ────────────────────────────────────────────────────────

export function liquityForkEventSlots(
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  fork: LiquityForkCopy,
  b: LiquityForkExplainerProvs,
): EventProseSlots {
  const coll = ctx.collateralSymbol;
  const debt = fork.stablecoin;
  const et = ctx.eventType;
  const collDelta = Number(ctx.collDelta) || 0;
  const debtDelta = Number(ctx.debtDelta) || 0;
  const collAfter = Number(ctx.collAfter);
  const debtAfter = Number(ctx.debtAfter);
  const hasDebtAfter = Number.isFinite(debtAfter) && debtAfter > DEBT_EPS;

  // Header deltas register a BARE magnitude on the per-axis (open / adjust) and
  // redemption grammars, a SIGNED value everywhere else — the echo value must
  // match byte-for-byte (chain-truth-event.chainTruthDeltaValue).
  const perAxis = et === "openTrove" || et === "openTroveAndJoinBatch" || et === "adjustTrove";
  const deltaLabeled = perAxis || et === "redeemCollateral";

  const collBefore = ctx.collAfter != null ? Number(ctx.collAfter) - collDelta : null;
  const debtBefore = ctx.debtAfter != null ? Number(ctx.debtAfter) - debtDelta : null;

  const collDeltaFig = () => (
    <Fig
      info={b.collDeltaProv(coords, { after: ctx.collAfter, before: collBefore }, ctx.origin?.coll)}
      value={chainTruthDeltaValue(collDelta, deltaLabeled)}
      symbol={coll}
    >
      {fmtAbs(ctx.collDelta)} {coll}
    </Fig>
  );
  const debtDeltaFig = () => (
    <Fig
      info={b.debtDeltaProv(coords, { after: ctx.debtAfter, before: debtBefore }, ctx.origin?.debt)}
      value={chainTruthDeltaValue(debtDelta, deltaLabeled)}
      symbol={debt}
    >
      {fmtAbs(ctx.debtDelta)} {debt}
    </Fig>
  );

  // After-balance echoes: the detail grid registers these with NO symbol prop
  // (the shared ChainTruthDetail tows the token as an icon), so the echo key's
  // symbol part is empty — build these WITHOUT a symbol.
  const collAfterFig = () => (
    <Fig info={b.collAfterProv(coords, ctx.origin?.coll)} value={fmtNum(ctx.collAfter)}>
      {fmtNum(ctx.collAfter)} {coll}
    </Fig>
  );
  const debtAfterFig = () => (
    <Fig info={b.debtAfterProv(coords, ctx.origin?.debt)} value={fmtNum(ctx.debtAfter)}>
      {fmtNum(ctx.debtAfter)} {debt}
    </Fig>
  );

  // The rate echoes the header pill + detail stat — both register the 2-dp
  // figure, and both render ONLY where the rate is the event's point.
  const rateFig = () => {
    const r = ctx.interestRate != null ? Number(ctx.interestRate) : NaN;
    if (!Number.isFinite(r) || !FORK_RATE_PILL_EVENTS.has(et)) return null;
    return (
      <Fig info={b.rateAtEventProv(coords)} value={`${r.toFixed(2)}%`}>
        {r.toFixed(2)}%
      </Fig>
    );
  };

  // ── The mig-165/166 figures ────────────────────────────────────────────────
  //
  // Each has a primary on the detail grid (basedollar-event-detail.tsx) and is
  // echoed here on the same value key — so the grid registers it and the prose
  // pulses it, one figure with one receipt. Each returns null where the read
  // path doesn't carry the value, and every clause below drops WHOLE when its
  // figure is null: an explainer that has no fee figure says what it has always
  // said, rather than a sentence with a hole in it.

  const feeAmount = ctx.operation?.debtUpfrontFee != null ? Number(ctx.operation.debtUpfrontFee) : 0;
  const hasFee = Number.isFinite(feeAmount) && feeAmount > 0;
  const feeFig = () =>
    hasFee ? (
      <Fig
        info={b.upfrontFeeProv(coords, { fee: ctx.operation!.debtUpfrontFee })}
        value={fmtNum(ctx.operation!.debtUpfrontFee)}
      >
        {fmtNum(ctx.operation!.debtUpfrontFee)} {debt}
      </Fig>
    ) : null;

  const accrued = ctx.operation?.accruedInterest;
  const interestFig = () =>
    accrued != null ? (
      <Fig
        info={b.accruedInterestProv(coords, {
          interest: accrued,
          debtDelta: ctx.debtDelta,
          fromOperation: ctx.operation!.debtFromOperation,
          fee: ctx.operation!.debtUpfrontFee,
          redist: ctx.operation!.debtFromRedist,
        })}
        value={fmtNum(accrued)}
      >
        {fmtNum(accrued)} {debt}
      </Fig>
    ) : null;

  const red = ctx.redemption;
  const redFeeFig = () =>
    red != null && Number(red.feeKeptColl) > 0 ? (
      <Fig info={b.redemptionFeeKeptProv(coords, { fee: red.feeKeptColl })} value={fmtNum(red.feeKeptColl)}>
        {fmtNum(red.feeKeptColl)} {coll}
      </Fig>
    ) : null;
  const redActFig = () =>
    red != null ? (
      <Fig
        info={b.redemptionActProv(coords, { actual: red.actual, attempted: red.attempted })}
        value={fmtNum(red.actual)}
      >
        {fmtNum(red.actual)} {debt}
      </Fig>
    ) : null;
  // The price leg reads ONLY the emitted route. A price the mig-113 filler read
  // back afterwards belongs to atBlockPriceProv and a different sentence; saying
  // "the branch priced it at" over a re-read would claim the log carried
  // something it didn't.
  const emittedPrice = ctx.priceAtBlock?.source === "redemption-event-price" ? ctx.priceAtBlock.usd : null;
  const redPriceFig = () =>
    emittedPrice != null ? (
      <Fig info={b.emittedRedemptionPriceProv(coords, emittedPrice)} value={formatUsdValue(emittedPrice)}>
        {formatUsdValue(emittedPrice)}
      </Fig>
    ) : null;

  switch (et) {
    case "openTrove":
    case "openTroveAndJoinBatch": {
      const batched = ctx.isBatched;
      const rate = rateFig();
      const happened = (
        <>
          Opened the Trove with {collDeltaFig()} of collateral, minting {debtDeltaFig()}
          {rate ? (
            batched ? (
              <> at its batch manager&rsquo;s {rate} rate</>
            ) : (
              <> at a self-chosen {rate} annual rate</>
            )
          ) : null}
          .
        </>
      );
      // The fee was always stated; with the decomposition it is stated as a
      // FIGURE, and the "about 7 days" claim becomes something the reader can
      // check against the debt and the rate on the same card rather than take
      // on trust. Without the decomposition the original worded clause stands.
      const feeNote = hasFee
        ? clause(
            <>
              Of the debt minted, {feeFig()} is {fork.protocolName}&rsquo;s one-time borrowing fee — about a week of the
              branch&rsquo;s average interest, added to what the Trove owes rather than paid out of pocket.
            </>,
          )
        : clause(
            <>
              The minted amount includes a one-time borrowing fee, about 7 days of the branch&rsquo;s average interest.
            </>,
          );
      const meansNow: ClauseInput[] = batched
        ? [
            clause(
              <>
                The batch manager sets one rate for every Trove in its batch and manages its place in the redemption
                queue.
              </>,
            ),
            clause(<>This Trove&rsquo;s debt is tracked as a share of the batch total.</>),
          ]
        : [
            clause(
              <>
                The chosen rate is also the Trove&rsquo;s place in the redemption queue, where redemptions clear the
                lowest rates first.
              </>,
            ),
          ];
      return { happened: [clause(happened)], changed: [feeNote], meansNow };
    }

    case "adjustTrove": {
      const collMoved = Math.abs(collDelta) > COLL_EPS;
      const debtMoved = Math.abs(debtDelta) > DEBT_EPS;
      const collPhrase = collMoved ? (
        collDelta > 0 ? (
          <>added {collDeltaFig()} of collateral</>
        ) : (
          <>withdrew {collDeltaFig()} of collateral</>
        )
      ) : null;
      const debtPhrase = debtMoved ? (
        debtDelta > 0 ? (
          <>drew {debtDeltaFig()} of new debt</>
        ) : (
          <>repaid {debtDeltaFig()} of debt</>
        )
      ) : null;
      // Subject-first lead; the phrases start lowercase and the sentence supplies
      // the verb slot, so the copy reads the same however many axes moved.
      let happened: ReactNode;
      if (collPhrase && debtPhrase) {
        happened = (
          <>
            This adjustment {collPhrase} and {debtPhrase}.
          </>
        );
      } else if (collPhrase) {
        happened = <>This adjustment {collPhrase}.</>;
      } else if (debtPhrase) {
        happened = <>This adjustment {debtPhrase}.</>;
      } else {
        happened = <>This adjustment left the Trove&rsquo;s balances unchanged.</>;
      }
      const changed = clause(
        <>
          The Trove now holds {collAfterFig()} against {debtAfterFig()}.
        </>,
      );
      const meansNow: ClauseInput[] = [
        // A drawn-debt fee, as a figure where the decomposition carries one.
        debtMoved && debtDelta > 0
          ? hasFee
            ? clause(
                <>
                  {feeFig()} of that is the one-time borrowing fee on the new debt — about a week of the branch&rsquo;s
                  average interest.
                </>,
              )
            : clause(
                <>
                  The new debt carries a one-time borrowing fee, about 7 days of the branch&rsquo;s average interest.
                </>,
              )
          : null,
        // The interest that built up while the Trove sat untouched. It is part
        // of the debt move above, so the sentence says so — a reader comparing
        // the delta to what they did needs to know the rest wasn't theirs.
        accrued != null
          ? clause(
              <>
                The debt figure also absorbed {interestFig()} of interest that accrued since this Trove was last touched
                — carried, not charged at this moment.
              </>,
            )
          : null,
      ];
      return { happened: [clause(happened)], changed: [changed], meansNow };
    }

    case "adjustTroveInterestRate": {
      const rate = rateFig();
      const rateNode = rate ?? <>a new value</>;
      const happened = ctx.isBatched ? (
        <>
          Changed the Trove&rsquo;s annual interest rate to {rateNode}, set by its batch manager rather than by the
          owner.
        </>
      ) : (
        <>Set the Trove&rsquo;s annual interest rate to {rateNode}, the rate the borrower chooses.</>
      );
      return {
        happened: [clause(happened)],
        changed: [
          // A rate change moves no balances, so this event used to carry no
          // figures at all. The decomposition gives it two, and they are the
          // ones that explain why the debt is not the number it was: the
          // premature-adjustment fee, and the interest since the last touch.
          //
          // The fee is the general re-adjustment rule made specific. The rule
          // itself ("changing the rate again soon after pays another fee") stays
          // Layer-2 material in the "?" modal; what belongs here is that it was
          // charged, and how much.
          hasFee
            ? clause(
                <>
                  This change came soon enough after the last one to cost {feeFig()} — the fee on adjusting a rate again
                  inside the protocol&rsquo;s window, added to the debt.
                </>,
              )
            : null,
          accrued != null
            ? clause(<>The debt also took on {interestFig()} of interest accrued since this Trove was last touched.</>)
            : null,
        ],
        meansNow: [
          clause(<>Interest accrues into the debt continuously at this rate.</>),
          clause(
            <>
              The rate is also the Trove&rsquo;s place in the redemption queue: a higher rate costs more to carry but is
              redeemed later, when {debt} holders redeem at $1 face.
            </>,
          ),
        ],
      };
    }

    case "setInterestBatchManager": {
      const rate = rateFig();
      const happened = (
        <>
          Delegated the Trove&rsquo;s interest rate to a batch manager
          {rate ? <>, now on the manager&rsquo;s {rate} rate</> : null}.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>The manager sets one rate for every Trove in its batch and manages its place in the redemption queue.</>,
          ),
          clause(
            <>
              The Trove&rsquo;s debt is tracked as a share of the batch total, and its collateral stays the
              owner&rsquo;s.
            </>,
          ),
        ],
      };
    }

    case "removeFromBatch": {
      const rate = rateFig();
      const happened = (
        <>
          Left the interest-rate batch — the Trove&rsquo;s rate{rate ? <> ({rate})</> : null} is the owner&rsquo;s to
          set again.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [clause(<>Its debt is recorded on its own again rather than as a share of a batch total.</>)],
      };
    }

    case "applyPendingDebt": {
      const changed = clause(
        <>
          Its recorded debt is now {debtAfterFig()} against {collAfterFig()} of collateral.
        </>,
      );
      return {
        happened: [
          clause(
            <>
              Booked the Trove&rsquo;s pending amounts into its recorded state: interest built up since its last change,
              plus any collateral and debt redistributed from liquidated neighbours in the branch.
            </>,
          ),
        ],
        changed: [changed],
        meansNow: [
          clause(<>Nothing entered or left the position beyond what had already accrued; this only records it.</>),
        ],
      };
    }

    case "closeTrove": {
      return {
        happened: [
          clause(
            <>
              Closed the Trove: repaid the last {debtDeltaFig()} of debt, accrued interest included, and withdrew all{" "}
              {collDeltaFig()} of collateral.
            </>,
          ),
        ],
        changed: [
          // "Accrued interest included" is the sentence above; this is how much
          // of it there was. On a close it is the last interest the Trove ever
          // carried, so it is worth a figure rather than a qualifier.
          accrued != null
            ? clause(<>{interestFig()} of what was repaid had accrued as interest since the Trove was last touched.</>)
            : null,
        ],
        meansNow: [clause(<>Nothing remains on either side; the position is fully settled.</>)],
      };
    }

    case "liquidate": {
      const happened = (
        <>
          The Trove&rsquo;s collateral ratio fell below the branch&rsquo;s minimum at the branch&rsquo;s own price, so
          anyone could liquidate it: {collDeltaFig()} of collateral was seized and {debtDeltaFig()} of debt cleared.
        </>
      );
      const changed = clause(
        <>{fork.protocolName} liquidates the whole Trove at once, so nothing remains on either side.</>,
      );
      // The disjunctive pool-or-redistribution rule is Layer-2 material (the
      // pane cannot say which route THIS liquidation took) — the "?" modal
      // (liquityForkLiquidationContent) carries it verbatim.
      const meansNow: ClauseInput[] = [liquidationValued(ctx, coords, coll, debt, b)];
      return { happened: [clause(happened)], changed: [changed], meansNow };
    }

    case "redeemCollateral": {
      const happened = (
        <>
          A {debt} holder redeemed against the branch, and this Trove — among the branch&rsquo;s lowest interest rates
          at the time — gave up {collDeltaFig()} of collateral while {debtDeltaFig()} of its debt was cancelled at $1
          face
          {emittedPrice != null ? (
            <>
              , with {coll} priced at {redPriceFig()} — the figure the branch emitted with the redemption itself
            </>
          ) : null}
          .
        </>
      );

      // The three facts a redeemed borrower is not told anywhere else on the
      // card: that the fee went to them and not to the protocol, how big the
      // whole act was, and whether it filled. Each drops on its own if its
      // figure is missing, so a read path without the redemption join renders
      // exactly what it rendered before.
      const redemptionContext: ClauseInput[] = [
        redFeeFig() != null
          ? clause(
              <>
                The redeemer also paid {redFeeFig()} in redemption fee, and it stayed with this Trove — added to its
                collateral, not taken by {fork.protocolName}.
              </>,
            )
          : null,
        red != null
          ? clause(
              <>
                This Trove was one slice of a {redActFig()} redemption against the {coll} branch
                {Number(red.attempted) - Number(red.actual) > DEBT_EPS ? (
                  <>
                    {" "}
                    — {fmtNum(red.attempted)} {debt} was put up, and the branch could fill that much of it
                  </>
                ) : (
                  <>, which the branch filled in full</>
                )}
                . Redemptions sweep the lowest-rate Troves in order until the ask is met.
              </>,
            )
          : null,
      ];
      if (!hasDebtAfter) {
        return {
          happened: [clause(happened)],
          changed: [
            clause(
              <>That cleared the Trove&rsquo;s debt entirely; it now holds only {collAfterFig()} of collateral.</>,
            ),
            ...redemptionContext,
          ],
          meansNow: [
            clause(
              <>
                With no debt the Trove accrues no interest; the remaining collateral can be withdrawn to close it, or
                left to back a new borrow.
              </>,
            ),
          ],
        };
      }
      return {
        happened: [clause(happened)],
        changed: [
          clause(
            <>
              The Trove now holds {collAfterFig()} against {debtAfterFig()}.
            </>,
          ),
          ...redemptionContext,
        ],
        meansNow: [
          clause(
            <>
              Redemption is a forced swap at the branch&rsquo;s price, not a penalty: the Trove sheds debt worth the
              collateral it gives up, so its collateral ratio rises.
            </>,
          ),
          clause(
            <>
              A redemption that leaves a Trove below the branch&rsquo;s minimum debt turns it into a zombie — dropped
              from the rate-ordered queue and redeemed first next time.
            </>,
          ),
        ],
      };
    }

    default:
      return {
        happened: [
          clause(
            <>
              {fork.protocolName} Trove event on the {coll} branch.
            </>,
          ),
        ],
      };
  }
}

/** The liquidation valued sentence — the branch's own price at the block, the
 *  seized collateral and cleared debt at $1 face, and the premium (= the Trove's
 *  ratio at fire minus 100%). Echoes the card's forensics block; drops WHOLE
 *  when the block is unpriced or a leg doesn't resolve (the never-empty floor). */
function liquidationValued(
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  coll: string,
  debt: string,
  b: LiquityForkExplainerProvs,
): ClauseInput {
  const price = ctx.priceAtBlock?.usd;
  const seizedAmt = Number(ctx.collBefore);
  const clearedAmt = Number(ctx.debtBefore);
  if (price == null || !Number.isFinite(seizedAmt) || seizedAmt <= 0 || !Number.isFinite(clearedAmt) || clearedAmt <= 0)
    return null;
  const seizedUsd = seizedAmt * price;
  const clearedUsd = clearedAmt; // $1 redemption face
  const premium = seizedUsd / clearedUsd - 1;
  const premiumPct = `${premium >= 0 ? "+" : "−"}${(Math.abs(premium) * 100).toFixed(2)}%`;
  const priceFig = (
    <Fig info={b.atBlockPriceProv(coords, price)} value={formatPrice(price)} symbol={coll}>
      {formatPrice(price)}
    </Fig>
  );
  const seizedFig = (
    <Fig
      info={b.liqSeizedUsdProv(coords, { amount: `${ctx.collBefore} ${coll}`, priceUsd: price })}
      value={formatUsdValue(seizedUsd)}
      symbol={coll}
    >
      {formatUsdValue(seizedUsd)}
    </Fig>
  );
  const clearedFig = (
    <Fig
      info={b.liqClearedFaceProv(coords, { amount: `${ctx.debtBefore} ${debt}` })}
      value={formatUsdValue(clearedUsd)}
      symbol={debt}
    >
      {formatUsdValue(clearedUsd)}
    </Fig>
  );
  const premiumFig = (
    <Fig
      info={b.liqPremiumProv(coords, { seizedUsd: formatUsdValue(seizedUsd), clearedUsd: formatUsdValue(clearedUsd) })}
      value={premiumPct}
    >
      {premiumPct}
    </Fig>
  );
  return clause(
    <>
      At the branch&rsquo;s own price at the time ({priceFig} per {coll}) the seized collateral was worth {seizedFig}{" "}
      against {clearedFig} of debt counted at $1 face — a {premiumFig} premium. That premium is the Trove&rsquo;s
      collateral ratio at fire minus 100%, the cushion the Stability Pool&rsquo;s depositors (or the surviving Troves)
      realized for absorbing the debt.
    </>,
  );
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function liquityForkExplainerTeaser(
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  fork: LiquityForkCopy,
  b: LiquityForkExplainerProvs,
): ReactNode | null {
  return splitLead(eventClauses(liquityForkEventSlots(ctx, coords, fork, b))).lead;
}
