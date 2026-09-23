// Morpho Blue plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the position looks
// like AFTER this event), never on the event type alone: a repay that clears the
// debt, a withdraw that empties the collateral, and a borrow that opens the first
// debt all read differently though they share a kind. The state-blind sentences
// the old bullets carried are gone — replaced by facts about THIS event's own
// figures, at Fluid's register and the Liquity V2 depth bar.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the card (the moved amount → the event header's signed
// delta; after-balances → the detail grid's Collateral / Borrowed stats; the
// liquidation legs → the forensics block). Morpho prices collateral IN THE LOAN
// TOKEN and has no USD anywhere, so every valued figure is loan-token denominated.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Morpho cannot fill on an event, each a data fact of its stream:
//   • §5.1 (risk consequence per event: ratio/health before → after, distance to
//     the line) on operate events: the captured event carries no per-event oracle
//     price and no health factor — only liquidations embed a block price — so a
//     ratio-vs-LLTV read at event time cannot be computed. Distance-to-the-line
//     lives on the position pane (the live health factor), not on events.
//   • §5.2 (mechanic-why on fees): a Morpho borrow, repay, or collateral move
//     charges no per-event fee. The one mechanic-why that survives is the
//     interest-bearing-shares note on repay; the liquidation discount is priced
//     by the valued sentence (§5.4).
//   • §5.4 beyond liquidations: no USD feed and no per-event price on operates →
//     no other valued net-outcome figure exists to derive.
//   • §5.5 (aggregate / act context): Morpho has no sibling seam — each borrow,
//     repay, or collateral move is its own event on its own market, not a leg of
//     a larger multi-part operation the stream splits. No same-transaction
//     cross-reference exists to phrase.
// Filled: forward paths (§5.3) on collateral-only, emptied-by-liquidation and
// bad debt; mechanic-why (§5.2) via the interest-shares note on repay; valued
// net-outcome (§5.4) on liquidations; the highlight rule (§5.6) via Fig echoes.

import type { ReactNode } from "react";
import type { MorphoContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import {
  clause,
  cont,
  eventClauses,
  splitLead,
  type ClauseInput,
  type EventProseSlots,
} from "@/lib/shared/explainer-prose";
import {
  assetsDeltaProv,
  collateralAfterProv,
  borrowedAfterProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  type MorphoCoords,
} from "@/lib/morpho/event-provenance";
import { formatNumber } from "@/lib/utils/format";

/** A magnitude below this is a rounding leftover, not a real balance.
 *
 *  It guards the PRINCIPAL leg and the two "was this the first one?" reads,
 *  which are differences of display floats. It does NOT guard collateral: that
 *  figure is an exact clamped sum (`mig 045`) and the server words the position's
 *  status off `collateral_final > 0`, so any collateral at all is collateral —
 *  an epsilon there is a second rule, and a page narrating under one while the
 *  filter selected it under another is what §46 was (`chain-truth-charter.md` §2).
 *  Principal keeps its epsilon for the reason the charter gives: a principal flow
 *  is not a balance, and a full repay leaves it reading through zero. */
export const MORPHO_EPS = 1e-9;

// ── resulting state ──────────────────────────────────────────────────────────

export interface MorphoResultingState {
  collAfter: number;
  /** Net borrowed PRINCIPAL after (Σ borrow − repay − liquidation cover). Can
   *  read below zero on a full repay, where the payment settled principal plus
   *  the interest built up on it. */
  borrowedAfter: number;
  hasColl: boolean;
  hasDebt: boolean;
  debtCleared: boolean;
  collateralOnly: boolean;
  emptied: boolean;
  /** Principal reads below zero — a full repay returned more than was drawn. */
  principalOvershoot: boolean;
}

export function resultingState(ctx: MorphoContext): MorphoResultingState {
  const collRaw = Number(ctx.collateralAfter);
  const borrRaw = Number(ctx.borrowedAfter);
  const collAfter = Number.isFinite(collRaw) ? collRaw : 0;
  const borrowedAfter = Number.isFinite(borrRaw) ? borrRaw : 0;
  const hasColl = collAfter > 0;
  const hasDebt = borrowedAfter > MORPHO_EPS;
  return {
    collAfter,
    borrowedAfter,
    hasColl,
    hasDebt,
    debtCleared: !hasDebt,
    collateralOnly: hasColl && !hasDebt,
    emptied: !hasColl && !hasDebt,
    principalOvershoot: borrowedAfter < -MORPHO_EPS,
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

// ── the variant table ────────────────────────────────────────────────────────

function morphoEventSlotsBase(ctx: MorphoContext, coords: MorphoCoords): EventProseSlots {
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const rs = resultingState(ctx);
  const delta = Number(ctx.assetsDelta) || 0;
  const movedSym = ctx.side === "collateral" ? collSym : loanSym;

  // The moved amount echoes the event header's signed-delta receipt (same prov
  // vocabulary + coords + signed value → same entry key).
  const deltaFig = () => (
    <Fig
      echo
      info={assetsDeltaProv(movedSym, ctx.side, coords, ctx.eventType)}
      value={chainTruthDeltaValue(delta, false)}
      symbol={movedSym}
    >
      {fmtAbs(ctx.assetsDelta)} {movedSym}
    </Fig>
  );
  // After-balances echo the detail grid's Collateral / Borrowed stats. The
  // shared ChainTruthDetail registers those receipts with NO symbol (the ticker
  // rides an icon, not a `symbol` prop), so these echoes omit `symbol` too — the
  // entry key is label|value|"" on both sides, and the locator link resolves.
  const collAfterFig = () => (
    <Fig echo info={collateralAfterProv(collSym, coords)} value={formatNumber(Number(ctx.collateralAfter))}>
      {formatNumber(Number(ctx.collateralAfter))} {collSym}
    </Fig>
  );
  const borrowedAfterFig = () => (
    <Fig echo info={borrowedAfterProv(loanSym, coords)} value={formatNumber(Number(ctx.borrowedAfter))}>
      {formatNumber(Number(ctx.borrowedAfter))} {loanSym}
    </Fig>
  );

  // Forward paths (charter §5.3) — the possibility space of a named state, never
  // advice. Collateral with no debt: the doors are withdraw or borrow again.
  const collateralOnlyPath = (): ClauseInput =>
    rs.collateralOnly
      ? clause(
          <>
            With nothing borrowed against it, none of the collateral can be seized; it can be withdrawn at any time or
            left to back a future borrow.
          </>,
        )
      : null;

  // Morpho's isolation and its single LLTV line — event-relevant mechanics kept
  // as plain meansNow clauses (charter §7 morals triage).
  const isolationMechanic = clause(
    <>
      Morpho collateral earns nothing and backs only this market&rsquo;s {loanSym} loan; nothing outside the market can
      touch it.
    </>,
  );

  switch (ctx.eventType) {
    case "borrow": {
      const firstBorrow = rs.borrowedAfter - delta <= MORPHO_EPS;
      const happened = firstBorrow ? (
        <>
          Borrowed {deltaFig()} against the position&rsquo;s {collSym} collateral — its first debt, at{" "}
          {borrowedAfterFig()}.
        </>
      ) : (
        <>
          Borrowed {deltaFig()} against the position&rsquo;s {collSym} collateral, taking the debt to{" "}
          {borrowedAfterFig()}.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [],
      };
    }

    case "repay": {
      const ending: ClauseInput = rs.debtCleared
        ? rs.emptied
          ? cont(<>, clearing the debt in full and closing the position.</>)
          : cont(<>, clearing the debt in full — the position now holds only collateral.</>)
        : cont(<>, leaving {borrowedAfterFig()} of principal outstanding.</>);
      // The general debt-as-shares rule is Layer-2 material — the "?" modal
      // (morphoMarketContent's "Debt as shares") carries it verbatim; the
      // state-gated overshoot caveat below stays (§2 misleading-figure).
      const meansNow: ClauseInput[] = [];
      // §2 misleading-figure exception, in plain words: a full repay can return
      // more of the loan token than was ever drawn — the excess is the interest.
      if (rs.debtCleared && rs.principalOvershoot) {
        meansNow.push(
          clause(
            <>
              Clearing the debt in full returned more {loanSym} than was ever drawn; the difference is the interest
              paid.
            </>,
          ),
        );
      }
      meansNow.push(collateralOnlyPath());
      return {
        happened: [clause(<>Repaid {deltaFig()} of the position&rsquo;s debt</>), ending],
        meansNow,
      };
    }

    case "supply_collateral": {
      const opensColl = rs.collAfter - delta <= MORPHO_EPS;
      const to = opensColl ? (
        <>
          from <strong className="font-semibold text-foreground">0</strong> to {collAfterFig()}
        </>
      ) : (
        <>to {collAfterFig()}</>
      );
      const happened = rs.hasDebt ? (
        <>
          Added {deltaFig()} of collateral, taking the position {to}, raising the cover behind its {borrowedAfterFig()}{" "}
          of debt.
        </>
      ) : (
        <>
          Added {deltaFig()} of collateral, taking the position {to}.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [isolationMechanic, collateralOnlyPath()],
      };
    }

    case "withdraw_collateral": {
      const ending: ClauseInput = rs.emptied
        ? cont(<>, emptying the position&rsquo;s collateral.</>)
        : rs.collateralOnly
          ? cont(<>, leaving {collAfterFig()} in the market.</>)
          : cont(<>, reducing the cover behind its {borrowedAfterFig()} of debt.</>);
      const meansNow: ClauseInput[] = [collateralOnlyPath()];
      return {
        happened: [clause(<>Withdrew {deltaFig()} of collateral</>), ending],
        meansNow,
      };
    }

    case "liquidation": {
      const changed: ClauseInput = rs.emptied
        ? clause(<>The seizure emptied the position&rsquo;s collateral.</>)
        : clause(<>The position keeps {collAfterFig()} of collateral.</>);
      const meansNow: ClauseInput[] = [liquidationValued(ctx, coords, collSym, loanSym)];
      if (rs.emptied) {
        meansNow.push(
          clause(
            <>
              When a seizure doesn&rsquo;t cover the whole debt, the shortfall is written off against this
              market&rsquo;s lenders as bad debt.
            </>,
          ),
        );
      }
      return {
        happened: [
          clause(
            <>
              The debt crossed the market&rsquo;s LLTV line and a liquidator repaid debt and seized collateral in
              exchange, at the market&rsquo;s fixed liquidation discount.
            </>,
          ),
        ],
        changed: [changed],
        meansNow,
      };
    }

    case "supply":
    case "withdraw": {
      // Lender-side events — outside the borrower spine, kept as a floor. The
      // one state-gated fact worth adding: a withdrawal can return more of the
      // loan token than was ever supplied, and the running supplied figure
      // (where the feeding lane replays it) then reads below zero. That
      // excess is the interest earned, and the figure is a puzzle unless said.
      const suppliedRaw = ctx.suppliedAfter != null ? Number(ctx.suppliedAfter) : NaN;
      const lenderOvershoot = ctx.eventType === "withdraw" && Number.isFinite(suppliedRaw) && suppliedRaw < -MORPHO_EPS;
      return {
        happened: [
          clause(
            <>
              Moved {deltaFig()} {ctx.eventType === "supply" ? "into" : "out of"} the market&rsquo;s lending pool.
            </>,
          ),
        ],
        meansNow: lenderOvershoot
          ? [
              clause(
                <>
                  Withdrawals have now returned more {loanSym} than was ever supplied; the difference is the interest
                  the supply earned.
                </>,
              ),
            ]
          : [],
      };
    }

    default:
      return { happened: [] };
  }
}

/** Third-party execution as a mechanic clause — the protocol fact behind the
 *  header's "by …" chip and the spine's pink badge.
 *
 *  Morpho splits its calls in two, and the split is the thing worth teaching:
 *  the value-ADDING ones (supply, supplyCollateral, repay) take an `onBehalf`
 *  with no authorisation check at all, while the value-REMOVING ones (borrow,
 *  withdraw, withdrawCollateral) test `isAuthorized[onBehalf][msg.sender]`,
 *  which only the owner can set. So a third-party borrow row is evidence the
 *  owner granted a mandate; a third-party repay row is evidence of nothing but
 *  someone paying.
 *
 *  Deliberately Morpho-only: Aave's credit delegation, Comet's `allow` and
 *  Morpho's `setAuthorization` are different mechanisms, and one shared
 *  sentence would assert the wrong one somewhere.
 *
 *  No name is interpolated here — this stays a pure function (it cannot call
 *  the ENS hook), and the chip directly above already carries the identity. */
function authorisedActorMechanic(ctx: MorphoContext): ClauseInput {
  // `txFrom`/`caller` ship ONLY where on_behalf differs from BOTH the signer
  // and the caller (see MorphoContext), so their presence IS the third-party
  // verdict — which is what lets this be judged without the owner in hand.
  if (!ctx.txFrom || !ctx.caller) return null;
  const removesValue =
    ctx.eventType === "borrow" || ctx.eventType === "withdraw" || ctx.eventType === "withdraw_collateral";
  return clause(
    removesValue ? (
      <>
        Another account executed this on the owner&rsquo;s behalf. Morpho checks authorisation on chain before letting
        anyone borrow or withdraw against a position they don&rsquo;t own, so the owner had granted that account
        permission beforehand.
      </>
    ) : (
      <>
        Another account executed this on the owner&rsquo;s behalf. Morpho asks for no permission to add to a position —
        supplying and repaying can be done by anyone, for anyone — so this needed nothing from the owner.
      </>
    ),
  );
}

export function morphoEventSlots(ctx: MorphoContext, coords: MorphoCoords): EventProseSlots {
  const slots = morphoEventSlotsBase(ctx, coords);
  const authorised = authorisedActorMechanic(ctx);
  if (!authorised) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), authorised] };
}

/** The valued sentence — the market's own oracle at the block, in the loan token
 *  (Morpho runs no USD feed). Drops WHOLE when the block is unpriced or a leg's
 *  figures don't resolve — the never-empty floor. Both legs echo the forensics
 *  block's Seized / Cleared receipts. */
function liquidationValued(ctx: MorphoContext, coords: MorphoCoords, collSym: string, loanSym: string): ClauseInput {
  const price = ctx.oraclePriceAtBlock?.loanPerCollateral;
  if (price == null) return null;
  const seizedAmt = Math.abs(Number(ctx.assetsDelta));
  const clearedAmt = Number(ctx.loanRepaid);
  if (!Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0) return null;
  const seizedValue = seizedAmt * price;
  const inLoan = (n: number) => `${formatNumber(n)} ${loanSym}`;
  const seizedFig = (
    <Fig
      echo
      info={liqSeizedValueProv(collSym, loanSym, coords, { amount: formatNumber(seizedAmt), price })}
      value={inLoan(seizedValue)}
      symbol={collSym}
    >
      {inLoan(seizedValue)}
    </Fig>
  );
  const clearedFig = (
    <Fig
      echo
      info={liqClearedValueProv(loanSym, coords, { amount: formatNumber(clearedAmt) })}
      value={inLoan(clearedAmt)}
      symbol={loanSym}
    >
      {inLoan(clearedAmt)}
    </Fig>
  );
  const premium = (seizedValue / clearedAmt - 1) * 100;
  const premiumStr = `${premium >= 0 ? "+" : "−"}${Math.abs(premium).toFixed(2)}%`;
  return clause(
    <>
      At the market&rsquo;s own oracle price at the time, the seized collateral was worth {seizedFig} against{" "}
      {clearedFig} cleared — a <strong className="font-semibold text-foreground">{premiumStr}</strong> premium to the
      liquidator. Morpho quotes everything in the loan token — it uses no dollar prices.
    </>,
  );
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function morphoExplainerTeaser(ctx: MorphoContext, coords: MorphoCoords): ReactNode | null {
  return splitLead(eventClauses(morphoEventSlots(ctx, coords))).lead;
}
