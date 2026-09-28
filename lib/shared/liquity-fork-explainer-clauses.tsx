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
//     residual of debtΔ − (borrower's move + fee + redistribution). On a batched
//     row the balances are share-derived against the same transaction's
//     BatchUpdated, so the residual also carries the batch's fees and the
//     clause names them.
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
// FILLED where every row is priced (Ebisu and Asymmetry: the filler prices
// each timeline block, server mig 342):
//   • §5.1 risk consequence on operate events — the collateral ratio before and
//     after at the branch price for the block, restated from the card's ratio
//     and price cells (`ratioClause`).
//
// FILLED for a batch manager's change (server mig 342's rows): the rate before
// and after, the premature-adjustment fee the Trove carried, and a year's
// interest at the new rate.
//
// STILL UNFILLED, and each a data fact rather than an authoring gap:
//   • §5.1 on Basedollar: only its redemption rows carry a price, so an operate
//     event states no ratio.
//   • The liquidation price leg on a chain with no such filler. The contract does
//     not emit the price on the Trove's own liquidation row the way it does on a
//     redemption, so that lane still depends on the capture. Basedollar has had no
//     liquidations, so nothing is currently withheld by it.
//   • The fixed liquidation reserve is stated only where it was read
//     (forkLiquidationReserve in lib/shared/liquity-fork-ops.ts): the fork
//     context does not carry it, so a fork with no reading states none.
//   • Gas on Basedollar. The MV carries tx_gas_used and tx_gas_price, but on an L2
//     their product is the execution fee ALONE and omits the L1 data fee, so a gas
//     figure built from them would understate the true cost. It waits on
//     capturing the receipt's l1Fee. The mainnet forks state gas as the pane's
//     last clause (liquity-fork-event-explainer.tsx), as Liquity V2 does.

import type { ReactNode } from "react";
import type { EbisuContext, AsymmetryContext, BasedollarContext, OriginEnvelope } from "@/lib/shared/types/event-shape";
import type { LiquityForkCoords, DeltaOps } from "@/lib/shared/liquity-fork-provenance";
import type { Provenance } from "@/components/shared/provenance";
import type { LiquityForkLearnMoreParams } from "@/lib/shared/learn-more-content";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import {
  FORK_RATE_PILL_EVENTS,
  forkDebtMove,
  forkDebtMoveOps,
  forkLiquidationReserve,
} from "@/lib/shared/liquity-fork-ops";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import { formatNumber, formatUsdValue, formatPrice, indefiniteArticle } from "@/lib/utils/format";
import { forkLiquidationCleared } from "@/components/protocol/liquity-fork/liquity-fork-forensics";
import {
  liquityForkStateFigures,
  forkCrText,
  forkRateText,
} from "@/components/protocol/liquity-fork/liquity-fork-state-stats";
import { getForkBatchManagerName } from "@/lib/shared/fork-batch-managers";
import { AmountText } from "@/components/shared/amount-text";

const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

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
  liqClearedFaceProv: (coords: LiquityForkCoords, vals: { amount: string; fromOperation?: boolean }) => Provenance;
  liquidationLegProv: (
    coords: LiquityForkCoords,
    vals: { leg: "offset" | "redistributed" | "surplus"; amount: string },
  ) => Provenance;
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
    vals: {
      interest: string;
      debtDelta: string;
      fromOperation: string;
      fee: string;
      redist: string;
      batched?: boolean;
    },
  ) => Provenance;
  redemptionFeeKeptProv: (coords: LiquityForkCoords, vals: { fee: string }) => Provenance;
  redemptionActProv: (coords: LiquityForkCoords, vals: { actual: string; attempted: string }) => Provenance;
  emittedRedemptionPriceProv: (coords: LiquityForkCoords, priceUsd: number) => Provenance;
  // The opened card's valued cells and a batch manager's change
  // (liquity-fork-state-stats.tsx registers the primaries).
  collRatioProv?: (
    coords: LiquityForkCoords,
    vals: { coll: string; debt: string; priceUsd: number; which: "before" | "after" },
  ) => Provenance;
  costPerYearProv?: (coords: LiquityForkCoords, vals: { debt: string; rate: string }) => Provenance;
  batchFeeShareProv?: (
    coords: LiquityForkCoords,
    vals: { fee?: string; batchFee: string; shares?: string; totalShares: string },
  ) => Provenance;
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
  const slots = eventSlots(ctx, coords, fork, b);
  const ratio = ratioClause(ctx, coords, b);
  return ratio ? { ...slots, meansNow: [...(slots.meansNow ?? []), ratio] } : slots;
}

/** The collateral ratio before and after at the branch price for the block —
 *  the card's ratio and price cells restated (T3 of the Liquity V2 grid). Only
 *  where the row is priced; a liquidation's forensics already state its ratio
 *  at fire, and a batch change moves no balance. */
function ratioClause(
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  b: LiquityForkExplainerProvs,
): ClauseInput {
  if (!b.collRatioProv || ctx.eventType === "liquidate") return null;
  const f = liquityForkStateFigures(ctx);
  if (f.price == null || f.crAfter == null) return null;
  const emitted = ctx.priceAtBlock?.source === "redemption-event-price";
  const priceFig = (
    <Fig
      info={emitted ? b.emittedRedemptionPriceProv(coords, f.price) : b.atBlockPriceProv(coords, f.price)}
      value={formatUsdValue(f.price)}
    >
      {formatUsdValue(f.price)}
    </Fig>
  );
  const after = (
    <Fig
      info={b.collRatioProv(coords, { coll: ctx.collAfter, debt: ctx.debtAfter, priceUsd: f.price, which: "after" })}
      value={forkCrText(f.crAfter)}
    >
      {forkCrText(f.crAfter)}
    </Fig>
  );
  const moved = f.crBefore != null && Math.abs(f.crBefore - f.crAfter) >= 0.005;
  return clause(
    moved ? (
      <>
        At the branch&rsquo;s {ctx.collateralSymbol} price of {priceFig} for this block, the collateral ratio went from{" "}
        {forkCrText(f.crBefore!)} to {after}.
      </>
    ) : (
      <>
        At the branch&rsquo;s {ctx.collateralSymbol} price of {priceFig} for this block, the collateral ratio stands at{" "}
        {after}.
      </>
    ),
  );
}

function eventSlots(
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  fork: LiquityForkCopy,
  b: LiquityForkExplainerProvs,
): EventProseSlots {
  const coll = ctx.collateralSymbol;
  const debt = fork.stablecoin;
  const et = ctx.eventType;
  const collDelta = Number(ctx.collDelta) || 0;
  // What the act moved (TroveOperation's figure), which the header's debt axis
  // states too. The net change also carries accrued interest, the upfront fee
  // and redistributed debt, each stated as its own figure below.
  const debtMove = forkDebtMove(ctx).value;
  const collAfter = Number(ctx.collAfter);
  const debtAfter = Number(ctx.debtAfter);
  const hasDebtAfter = Number.isFinite(debtAfter) && debtAfter > DEBT_EPS;

  // Header deltas register a BARE magnitude on the per-axis (open / adjust) and
  // redemption grammars, a SIGNED value everywhere else — the echo value must
  // match byte-for-byte (chain-truth-event.chainTruthDeltaValue).
  const perAxis = et === "openTrove" || et === "openTroveAndJoinBatch" || et === "adjustTrove";
  const deltaLabeled = perAxis || et === "redeemCollateral";

  const collBefore = ctx.collAfter != null ? Number(ctx.collAfter) - collDelta : null;
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
      info={b.debtDeltaProv(coords, forkDebtMoveOps(ctx), ctx.origin?.debt)}
      value={chainTruthDeltaValue(debtMove, deltaLabeled)}
      symbol={debt}
    >
      <AmountText value={Math.abs(debtMove)} /> {debt}
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
          batched: ctx.operation!.accruedIncludesBatchFees,
        })}
        value={fmtNum(accrued)}
      >
        {fmtNum(accrued)} {debt}
      </Fig>
    ) : null;
  const interestClause = (): ClauseInput =>
    clause(
      ctx.operation?.accruedIncludesBatchFees ? (
        <>
          {interestFig()} of interest and batch fees built up since the Trove was last touched is now part of its debt.
        </>
      ) : (
        <>{interestFig()} of interest accrued since the Trove was last touched is now part of its debt.</>
      ),
    );

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
          Opened the Trove with {collDeltaFig()} of collateral and borrowed {debtDeltaFig()}
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
              {fork.protocolName} added its one-time borrowing fee of {feeFig()} to the debt — about a week of the
              branch&rsquo;s average interest, owed rather than paid out of pocket.
            </>,
          )
        : clause(
            <>The debt also carries a one-time borrowing fee, about 7 days of the branch&rsquo;s average interest.</>,
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
      const reserve = forkLiquidationReserve(fork.protocolName);
      const reserveNote = reserve
        ? [
            clause(
              <>
                The owner also paid a {reserve} liquidation reserve, apart from the collateral; it pays a liquidator if
                the Trove is liquidated and is refunded when the Trove closes.
              </>,
            ),
          ]
        : [];
      return { happened: [clause(happened)], changed: [feeNote, ...reserveNote], meansNow };
    }

    case "adjustTrove": {
      const collMoved = Math.abs(collDelta) > COLL_EPS;
      const debtMoved = Math.abs(debtMove) > DEBT_EPS;
      const collPhrase = collMoved ? (
        collDelta > 0 ? (
          <>added {collDeltaFig()} of collateral</>
        ) : (
          <>withdrew {collDeltaFig()} of collateral</>
        )
      ) : null;
      const debtPhrase = debtMoved ? (
        debtMove > 0 ? (
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
        debtMoved && debtMove > 0
          ? hasFee
            ? clause(
                <>
                  The new debt also carries a one-time borrowing fee of {feeFig()}, about a week of the branch&rsquo;s
                  average interest, added to what the Trove owes.
                </>,
              )
            : clause(
                <>
                  The new debt carries a one-time borrowing fee, about 7 days of the branch&rsquo;s average interest.
                </>,
              )
          : null,
        // The interest that built up while the Trove sat untouched: its own
        // figure, because the act's figure above leaves it out.
        accrued != null ? interestClause() : null,
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
      // The minimum in force at this block: governance can have moved it since.
      const mcrText = ctx.mcrAtEvent != null ? `${Math.round(ctx.mcrAtEvent * 1000) / 10}%` : null;
      const happened = (
        <>
          The Trove&rsquo;s collateral ratio fell below the branch&rsquo;s minimum
          {mcrText ? <> of {mcrText} at the time</> : null} at the branch&rsquo;s own price, so anyone could liquidate
          it: {collDeltaFig()} of collateral was seized and {debtDeltaFig()} of debt cleared.
        </>
      );
      const changed: ClauseInput[] = [
        clause(<>{fork.protocolName} liquidates the whole Trove at once, so nothing remains on either side.</>),
        liquidationRoute(ctx, coords, debt, b),
      ];
      const meansNow: ClauseInput[] = [
        liquidationValued(ctx, coords, coll, debt, b),
        ...liquidationSurplus(ctx, coords, coll, b),
      ];
      return { happened: [clause(happened)], changed, meansNow };
    }

    case "redeemCollateral": {
      const happened = (
        <>
          {indefiniteArticle(debt)} {debt} holder redeemed against the branch, and this Trove — among the branch&rsquo;s
          lowest interest rates at the time — gave up {collDeltaFig()} of collateral while {debtDeltaFig()} of its debt
          was cancelled at $1 face
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
        red != null && Math.abs(Math.abs(debtMove) - Number(red.actual)) <= DEBT_EPS
          ? clause(
              <>
                That was the whole of a {redActFig()} redemption against the {coll} branch
                {Number(red.attempted) - Number(red.actual) > DEBT_EPS ? (
                  <>
                    {" "}
                    — {fmtNum(red.attempted)} {debt} was put up, and the branch could fill that much of it
                  </>
                ) : null}
                . Redemptions take from the lowest-rate Troves first, and this one covered it alone.
              </>,
            )
          : red != null
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
            accrued != null ? interestClause() : null,
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
          accrued != null ? interestClause() : null,
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

    case "setBatchManagerAnnualInterestRate":
    case "lowerBatchManagerAnnualFee": {
      const br = ctx.batchRate;
      const manager = ctx.batchManager
        ? (getForkBatchManagerName(ctx.batchManager) ?? shortAddress(ctx.batchManager))
        : "The batch manager";
      const f = liquityForkStateFigures(ctx);
      const rateNow =
        f.rate != null ? (
          <Fig info={b.rateAtEventProv(coords)} value={forkRateText(f.rate)}>
            {forkRateText(f.rate)}
          </Fig>
        ) : null;
      const happened =
        ctx.eventType === "lowerBatchManagerAnnualFee" && br ? (
          <>
            {manager}, the Trove&rsquo;s batch manager, lowered the batch&rsquo;s annual management fee
            {br.managementFeeBefore != null ? <> from {forkRateText(Number(br.managementFeeBefore))}</> : null} to{" "}
            {forkRateText(Number(br.managementFee))}.
          </>
        ) : (
          <>
            {manager}, the Trove&rsquo;s batch manager, changed the batch&rsquo;s annual interest rate
            {f.rateBefore != null ? <> from {forkRateText(f.rateBefore)}</> : null}
            {rateNow ? <> to {rateNow}</> : null}. The owner did not act: every Trove in the batch pays the rate its
            manager sets.
          </>
        );
      const troveFee = br?.troveFee != null ? Number(br.troveFee) : 0;
      const changed: ClauseInput[] = [
        br && troveFee > 0 && b.batchFeeShareProv
          ? clause(
              <>
                The change came inside the cooldown after the manager&rsquo;s previous change, so {fork.protocolName}{" "}
                added a premature-adjustment fee of {fmtNum(br.batchFee)} {debt} to the batch&rsquo;s debt. This Trove
                carries{" "}
                <Fig
                  info={b.batchFeeShareProv(coords, {
                    fee: br.troveFee,
                    batchFee: br.batchFee,
                    shares: br.troveShares,
                    totalShares: br.totalShares,
                  })}
                  value={fmtNum(br.troveFee)}
                >
                  {fmtNum(br.troveFee)} {debt}
                </Fig>{" "}
                of it, in proportion to its shares of the batch.
              </>,
            )
          : null,
      ];
      const meansNow: ClauseInput[] = [
        f.costPerYear != null && f.costDebt != null && b.costPerYearProv
          ? clause(
              <>
                On its {fmtNum(f.costDebt)} {debt} of debt, a year at this rate costs about{" "}
                <Fig
                  info={b.costPerYearProv(coords, { debt: f.costDebt, rate: String(f.rate) })}
                  value={formatNumber(f.costPerYear)}
                >
                  <AmountText value={f.costPerYear} /> {debt}
                </Fig>
                , before the manager&rsquo;s management fee.
              </>,
            )
          : null,
      ];
      return { happened: [clause(happened)], changed, meansNow };
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

/** The seized collateral valued at the branch's price at the block, against
 *  the cleared debt at $1 face. Shared by the premium, surplus and loss
 *  sentences so they all compute from one pair. Null when the block is unpriced
 *  or a leg does not resolve. */
function liquidationValues(ctx: LiquityForkEventContext) {
  const price = ctx.priceAtBlock?.usd;
  const seizedAmt = Number(ctx.collBefore);
  const cleared = forkLiquidationCleared(ctx);
  if (
    price == null ||
    !Number.isFinite(seizedAmt) ||
    seizedAmt <= 0 ||
    !Number.isFinite(cleared.amount) ||
    cleared.amount <= 0
  )
    return null;
  return { price, seizedUsd: seizedAmt * price, clearedUsd: cleared.amount, cleared };
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
  const v = liquidationValues(ctx);
  if (!v) return null;
  const { price, seizedUsd, clearedUsd, cleared } = v;
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
      info={b.liqClearedFaceProv(coords, {
        amount: `${cleared.amountText} ${debt}`,
        fromOperation: cleared.fromOperation,
      })}
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
  // Where the Liquidation log is carried, the surplus sentence says how much of
  // the premium came back to the owner, so this one stops at the ratio.
  return clause(
    <>
      At the branch&rsquo;s own price at the time ({priceFig} per {coll}) the seized collateral was worth {seizedFig}{" "}
      against {clearedFig} of debt counted at $1 face — a {premiumFig} premium, the Trove&rsquo;s collateral ratio at
      fire minus 100%
      {ctx.liquidation
        ? null
        : ". It is the most the Stability Pool’s depositors (or the surviving Troves) could realize for absorbing the debt"}
      .
    </>,
  );
}

/** Where the liquidated debt went: the Stability Pool, the branch's other
 *  Troves, or both — the Liquidation log's legs, echoing the detail grid. Drops
 *  where the read path carries no Liquidation log. */
function liquidationRoute(
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  debt: string,
  b: LiquityForkExplainerProvs,
): ClauseInput {
  const liq = ctx.liquidation;
  if (!liq) return null;
  const sp = Number(liq.debtOffsetBySP);
  const redist = Number(liq.debtRedistributed);
  const spFig = (
    <Fig
      info={b.liquidationLegProv(coords, { leg: "offset", amount: liq.debtOffsetBySP })}
      value={fmtNum(liq.debtOffsetBySP)}
    >
      {fmtNum(liq.debtOffsetBySP)} {debt}
    </Fig>
  );
  const redistFig = (
    <Fig
      info={b.liquidationLegProv(coords, { leg: "redistributed", amount: liq.debtRedistributed })}
      value={fmtNum(liq.debtRedistributed)}
    >
      {fmtNum(liq.debtRedistributed)} {debt}
    </Fig>
  );
  if (sp > 0 && redist > 0)
    return clause(
      <>
        The Stability Pool absorbed {spFig} of the debt, taking the matching collateral; it could not cover the rest, so{" "}
        {redistFig} was redistributed, with its collateral, to the branch&rsquo;s other Troves.
      </>,
    );
  if (sp > 0) return clause(<>The Stability Pool absorbed all {spFig} of the debt, taking the matching collateral.</>);
  if (redist > 0)
    return clause(
      <>
        The Stability Pool held nothing to absorb it, so all {redistFig} of the debt was redistributed, with its
        collateral, to the branch&rsquo;s other Troves.
      </>,
    );
  return null;
}

/** The collateral surplus the owner can claim, and the owner's loss after it —
 *  Liquity V2's forward path (lib/liquity/explainer-clauses.tsx, the
 *  destructive liquidation's meansNow). The surplus figure echoes the detail
 *  grid; its dollar value and the loss need the priced block. */
function liquidationSurplus(
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  coll: string,
  b: LiquityForkExplainerProvs,
): ClauseInput[] {
  const liq = ctx.liquidation;
  if (!liq) return [];
  const surplus = Number(liq.collSurplus);
  const v = liquidationValues(ctx);
  const out: ClauseInput[] = [];
  if (surplus > 0) {
    const surplusUsd = v ? surplus * v.price : null;
    out.push(
      clause(
        <>
          {
            <Fig
              info={b.liquidationLegProv(coords, { leg: "surplus", amount: liq.collSurplus })}
              value={fmtNum(liq.collSurplus)}
            >
              {fmtNum(liq.collSurplus)} {coll}
            </Fig>
          }
          {surplusUsd != null ? <> ({formatUsdValue(surplusUsd)} at that price)</> : null} of the collateral was left
          after the debt and the liquidation penalty, and the contract credited it to the owner to claim from the
          branch&rsquo;s CollSurplusPool.
        </>,
      ),
    );
  }
  if (v) {
    const equity = v.seizedUsd - v.clearedUsd;
    const loss = equity - (surplus > 0 ? surplus * v.price : 0);
    if (loss > 0)
      out.push(
        clause(
          <>
            {surplus > 0 ? "After that surplus, the" : "The"} owner&rsquo;s loss was about {formatUsdValue(loss)}.
          </>,
        ),
      );
  }
  return out;
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
