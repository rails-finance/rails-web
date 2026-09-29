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
  debtAfterProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  type MorphoCoords,
} from "@/lib/morpho/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import {
  fmtMorphoAmount,
  fmtMorphoPart,
  fmtMorphoHf,
  fmtMorphoPrice,
  morphoHealthMove,
  morphoLiquidationPrice,
  type MorphoAtBlock,
  type MorphoHealthMove,
} from "@/lib/morpho/use-market-at-block";

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
  /** What the position owed after the event: the chain debt (shares at the
   *  market's totals) where the row carries it, else the net borrowed PRINCIPAL
   *  (Σ borrow − repay − liquidation cover), which can read below zero on a
   *  full repay, where the payment settled principal plus its interest. */
  borrowedAfter: number;
  /** True when `borrowedAfter` is the chain debt. */
  debtIsChain: boolean;
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
  const debtIsChain = ctx.debtAfter != null;
  const borrRaw = Number(debtIsChain ? ctx.debtAfter : ctx.borrowedAfter);
  const collAfter = Number.isFinite(collRaw) ? collRaw : 0;
  const borrowedAfter = Number.isFinite(borrRaw) ? borrRaw : 0;
  const hasColl = collAfter > 0;
  const hasDebt = borrowedAfter > MORPHO_EPS;
  return {
    collAfter,
    borrowedAfter,
    debtIsChain,
    hasColl,
    hasDebt,
    debtCleared: !hasDebt,
    collateralOnly: hasColl && !hasDebt,
    emptied: !hasColl && !hasDebt,
    principalOvershoot: !debtIsChain && borrowedAfter < -MORPHO_EPS,
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

// ── the variant table ────────────────────────────────────────────────────────

function morphoEventSlotsBase(ctx: MorphoContext, coords: MorphoCoords, read?: MorphoAtBlock): EventProseSlots {
  // Every sentence below reads the position after the event. Without the
  // index's running state for this row there is nothing true to say about it.
  if (ctx.collateralAfter == null || ctx.borrowedAfter == null) {
    return { happened: [clause(<>The position&rsquo;s balances after this event are not loaded.</>)] };
  }
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const rs = resultingState(ctx);
  const delta = Number(ctx.assetsDelta) || 0;
  const movedSym = ctx.side === "collateral" ? collSym : loanSym;
  const amt = (n: number | string) => fmtMorphoAmount(n);

  // The moved amount echoes the event header's signed-delta receipt (same prov
  // vocabulary + coords + signed value → same entry key).
  const deltaFig = () => (
    <Fig
      echo
      info={assetsDeltaProv(movedSym, ctx.side, coords, ctx.eventType)}
      value={chainTruthDeltaValue(delta, false)}
      symbol={movedSym}
    >
      {amt(Math.abs(delta))} {movedSym}
    </Fig>
  );
  // After-balances echo the detail grid's Collateral / Debt stats. The shared
  // ChainTruthDetail registers those receipts with NO symbol (the ticker rides
  // an icon, not a `symbol` prop), so these echoes omit `symbol` too — the
  // entry key is label|value|"" on both sides, and the locator link resolves.
  const collAfterFig = () => (
    <Fig echo info={collateralAfterProv(collSym, coords)} value={formatNumber(Number(ctx.collateralAfter))}>
      {amt(ctx.collateralAfter ?? 0)} {collSym}
    </Fig>
  );
  const borrowedAfterFig = () => (
    <Fig
      echo
      info={rs.debtIsChain ? debtAfterProv(loanSym, coords) : borrowedAfterProv(loanSym, coords)}
      value={formatNumber(rs.borrowedAfter)}
    >
      {amt(rs.borrowedAfter)} {loanSym}
    </Fig>
  );
  const b = (text: string) => <strong className="font-semibold text-foreground">{text}</strong>;

  // The debt, reconciled from the previous event's figure: previous + interest
  // since = before; ± this event = after. Rows that carry the chain debt only.
  const interest = Number(ctx.interestSincePrevious ?? 0) || 0;
  const debtBefore = ctx.debtBefore != null ? Number(ctx.debtBefore) : null;
  const prevDebt = debtBefore != null ? debtBefore - interest : null;
  const debtLine = (verb: "borrowed" | "repaid"): ClauseInput => {
    if (!rs.debtIsChain || debtBefore == null || prevDebt == null) return null;
    const moved = Math.abs(Number(ctx.debtChange ?? delta));
    if (prevDebt <= 1e-6 && interest === 0) return null;
    const part = (n: number) => fmtMorphoPart(n, debtBefore);
    return clause(
      <>
        The debt reconciles: {part(prevDebt)} {loanSym} after the previous event
        {interest > 0 ? (
          <>
            , plus {part(interest)} of interest since, is {part(debtBefore)}
          </>
        ) : null}
        ; {verb === "borrowed" ? "plus" : "less"} the {part(moved)} {verb}, {part(rs.borrowedAfter)} {loanSym}.
      </>,
    );
  };

  // The health factor either side of the event, at the oracle price going
  // into the block — one sentence per event, graded near the line.
  const move = read ? morphoHealthMove(ctx, read) : null;
  const priceAt = move ? (
    <>
      at {collSym} {fmtMorphoPrice(move.price)} {loanSym} (the market oracle at block{" "}
      {move.priceBlock.toLocaleString("en-US")})
    </>
  ) : null;
  const grade = (hf: number): ReactNode =>
    hf < 1
      ? ", below 1, where the position can be liquidated"
      : hf < 1.1
        ? ", close to the liquidation line at 1"
        : hf < 1.2
          ? `; a ${Math.round((1 - 1 / hf) * 100)}% fall in the ${collSym} price would reach the liquidation line`
          : "";
  const hfSentence = (extra?: ReactNode): ClauseInput => {
    if (!move) return null;
    const { hfBefore, hfAfter } = move;
    if (hfBefore == null && hfAfter == null) return null;
    if (hfAfter == null)
      return clause(
        <>With no debt left, the position has no health factor and none of its collateral can be seized.</>,
      );
    // A dust debt puts the factor far past any meaningful reading.
    if (hfAfter >= 100 && (hfBefore == null || hfBefore >= 100))
      return clause(
        <>
          With {amt(move.debtAfter)} {loanSym} of debt the health factor is over 100: the collateral is nowhere near the
          liquidation line.
        </>,
      );
    if (hfBefore == null)
      return clause(
        <>
          {priceAt ? <>Priced {priceAt}, it</> : "It"} starts with a health factor of {b(fmtMorphoHf(hfAfter))}
          {grade(hfAfter)}.
        </>,
      );
    const dir = hfAfter < hfBefore ? "fell" : hfAfter > hfBefore ? "rose" : "stayed";
    return clause(
      <>
        {priceAt ? <>Priced {priceAt}, the</> : "The"} health factor {dir}{" "}
        {dir === "stayed" ? (
          <>at {b(fmtMorphoHf(hfAfter))}</>
        ) : (
          <>
            from {b(fmtMorphoHf(hfBefore))} to {b(fmtMorphoHf(hfAfter))}
          </>
        )}
        {extra}
        {grade(hfAfter)}.
      </>,
    );
  };
  const liqPriceMove = (): ReactNode =>
    move && move.liqPriceBefore != null && move.liqPriceAfter != null && move.hfAfter != null && move.hfAfter < 100 ? (
      <>
        {" "}
        and moved the liquidation price {move.liqPriceAfter > move.liqPriceBefore ? "closer" : "further away"}, from{" "}
        {fmtMorphoPrice(move.liqPriceBefore)} to {fmtMorphoPrice(move.liqPriceAfter)} {loanSym} per {collSym}
      </>
    ) : null;

  // The rate in force after the event and what it costs a year on this debt.
  const rateLine = (): ClauseInput => {
    if (!read || read.status !== "ok" || read.at.borrowApr == null || !rs.hasDebt || !rs.debtIsChain) return null;
    const apr = read.at.borrowApr;
    return clause(
      <>
        The market&rsquo;s borrow rate at the end of the block was {b(`${(apr * 100).toFixed(2)}%`)} APR, about{" "}
        {amt(rs.borrowedAfter * apr)} {loanSym} a year on this debt while it holds.
      </>,
    );
  };

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

  switch (ctx.eventType) {
    case "borrow": {
      const firstBorrow = (rs.debtIsChain ? Number(ctx.debtBefore) : rs.borrowedAfter - delta) <= MORPHO_EPS;
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
        changed: [firstBorrow ? null : debtLine("borrowed")],
        meansNow: [hfSentence(), rateLine()],
      };
    }

    case "repay": {
      const ending: ClauseInput = rs.debtCleared
        ? rs.emptied
          ? cont(<>, clearing the debt in full and closing the position.</>)
          : cont(<>, clearing the debt in full — the position now holds only collateral.</>)
        : rs.debtIsChain
          ? cont(<>, leaving {borrowedAfterFig()} owed.</>)
          : cont(<>, leaving {borrowedAfterFig()} of principal outstanding.</>);
      // A full repay: what the payment covered, owed before plus the interest
      // since. Morpho keeps no principal/interest split on a partial one — the
      // debt is one balance of shares — so a partial repay reconciles instead.
      const covered: ClauseInput =
        rs.debtCleared && rs.debtIsChain && prevDebt != null && interest > 0
          ? clause(
              <>
                The {fmtMorphoPart(Math.abs(delta), delta)} {loanSym} repaid is the {fmtMorphoPart(prevDebt, delta)}{" "}
                owed after the previous event plus {b(fmtMorphoPart(interest, delta))} {loanSym} of interest accrued
                since.
              </>,
            )
          : rs.debtCleared && rs.principalOvershoot
            ? clause(
                <>
                  Clearing the debt in full returned more {loanSym} than was ever drawn; the difference is the interest
                  paid.
                </>,
              )
            : rs.debtCleared
              ? null
              : debtLine("repaid");
      return {
        happened: [clause(<>Repaid {deltaFig()} of the position&rsquo;s debt</>), ending],
        changed: [covered],
        meansNow: [rs.debtCleared ? collateralOnlyPath() : hfSentence(), rs.debtCleared ? null : rateLine()],
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
        meansNow: [rs.hasDebt ? hfSentence(liqPriceMove()) : null, collateralOnlyPath()],
      };
    }

    case "withdraw_collateral": {
      const ending: ClauseInput = rs.emptied
        ? cont(<>, emptying the position&rsquo;s collateral.</>)
        : rs.collateralOnly
          ? cont(<>, leaving {collAfterFig()} in the market.</>)
          : cont(
              <>
                , leaving {collAfterFig()} behind its {borrowedAfterFig()} of debt.
              </>,
            );
      return {
        happened: [clause(<>Withdrew {deltaFig()} of collateral</>), ending],
        meansNow: [rs.hasDebt ? hfSentence(liqPriceMove()) : null, collateralOnlyPath()],
      };
    }

    case "liquidation":
      return liquidationSlots(ctx, coords, read, { move, amt, b, collAfterFig, borrowedAfterFig, rs });

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

/** A liquidation, told in the order a reader asks: what the liquidator did,
 *  why it could, at what price, what it cost the borrower, and what is left. */
function liquidationSlots(
  ctx: MorphoContext,
  coords: MorphoCoords,
  read: MorphoAtBlock | undefined,
  h: {
    move: MorphoHealthMove | null;
    amt: (n: number | string) => string;
    b: (t: string) => ReactNode;
    collAfterFig: () => ReactNode;
    borrowedAfterFig: () => ReactNode;
    rs: MorphoResultingState;
  },
): EventProseSlots {
  const { amt, b, rs } = h;
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  const seizedAmt = Math.abs(Number(ctx.assetsDelta));
  const clearedAmt = Number(ctx.loanRepaid);
  const legs = Number.isFinite(seizedAmt) && Number.isFinite(clearedAmt) && seizedAmt > 0 && clearedAmt > 0;
  const used = read ? morphoLiquidationPrice(ctx, read, coords.blockNumber) : null;

  const happened: ClauseInput = legs
    ? clause(
        <>
          A liquidator repaid {b(`${amt(clearedAmt)} ${loanSym}`)} of the position&rsquo;s debt and seized{" "}
          {b(`${amt(seizedAmt)} ${collSym}`)} of its collateral in exchange.
        </>,
      )
    : clause(<>A liquidator repaid part of the position&rsquo;s debt and seized collateral in exchange.</>);

  const changed: ClauseInput[] = [];
  if (used) {
    const priceText = `${collSym} ${fmtMorphoPrice(used.price)} ${loanSym}`;
    const hfBefore =
      h.move && ctx.debtBefore != null && used.price > 0 && read?.status === "ok"
        ? (h.move.collBefore * used.price * read.lltv) / Number(ctx.debtBefore)
        : null;
    changed.push(
      clause(
        <>
          It ran at {b(priceText)}, the market oracle at block{" "}
          {used.block != null ? used.block.toLocaleString("en-US") : "the liquidation"}
          {hfBefore != null ? (
            <>
              , where the position&rsquo;s health factor was {b(fmtMorphoHf(hfBefore))}: below 1, so anyone could
              liquidate it
            </>
          ) : null}
          .
        </>,
      ),
    );
    if (read?.status === "ok" && used.block != null && coords.blockNumber != null && used.block < coords.blockNumber)
      changed.push(
        clause(
          <>
            The oracle updated later in block {coords.blockNumber.toLocaleString("en-US")}, to{" "}
            {fmtMorphoPrice(read.at.price)} {loanSym}, after the liquidation had run.
          </>,
        ),
      );
    if (legs) {
      const seizedValue = seizedAmt * used.price;
      const premium = (seizedValue / clearedAmt - 1) * 100;
      const net = seizedValue - clearedAmt;
      changed.push(
        clause(
          <>
            At that price the seized collateral was worth{" "}
            <Fig
              echo
              info={liqSeizedValueProv(collSym, loanSym, coords, {
                amount: formatNumber(seizedAmt),
                price: used.price,
              })}
              value={`${formatNumber(seizedValue)} ${loanSym}`}
              symbol={collSym}
            >
              {amt(seizedValue)} {loanSym}
            </Fig>{" "}
            against{" "}
            <Fig
              echo
              info={liqClearedValueProv(loanSym, coords, { amount: formatNumber(clearedAmt) })}
              value={`${formatNumber(clearedAmt)} ${loanSym}`}
              symbol={loanSym}
            >
              {amt(clearedAmt)} {loanSym}
            </Fig>{" "}
            of debt cleared, a {b(`${premium >= 0 ? "+" : "−"}${Math.abs(premium).toFixed(2)}%`)} premium
            {used.lif != null ? <> (the market&rsquo;s incentive is {((used.lif - 1) * 100).toFixed(2)}%)</> : null},
            all of it to the liquidator.
          </>,
        ),
      );
      if (net > 0)
        changed.push(
          clause(
            <>
              The borrower&rsquo;s net cost: {amt(seizedValue)} − {amt(clearedAmt)} = {b(`${amt(net)} ${loanSym}`)} of
              collateral given up beyond the debt it cleared.
            </>,
          ),
        );
    }
  }

  const meansNow: ClauseInput[] = [];
  if (rs.emptied) {
    meansNow.push(clause(<>The seizure emptied the position&rsquo;s collateral and cleared its debt.</>));
  } else if (!rs.hasColl && rs.hasDebt) {
    meansNow.push(
      clause(
        <>
          The seizure took all the collateral and left {h.borrowedAfterFig()} of debt with nothing behind it; the
          shortfall is written off against this market&rsquo;s lenders as bad debt.
        </>,
      ),
    );
  } else {
    meansNow.push(
      clause(
        <>
          Left afterwards: {h.collAfterFig()} of collateral and{" "}
          {rs.hasDebt ? <>{h.borrowedAfterFig()} of debt</> : <>no debt</>}
          {rs.hasDebt && rs.borrowedAfter < 0.01
            ? ", a remainder the liquidator did not repay; the position stayed open and can keep borrowing"
            : ""}
          .
        </>,
      ),
    );
  }
  return { happened: [happened], changed, meansNow };
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

export function morphoEventSlots(ctx: MorphoContext, coords: MorphoCoords, read?: MorphoAtBlock): EventProseSlots {
  const slots = morphoEventSlotsBase(ctx, coords, read);
  const authorised = authorisedActorMechanic(ctx);
  if (!authorised) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), authorised] };
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function morphoExplainerTeaser(ctx: MorphoContext, coords: MorphoCoords): ReactNode | null {
  return splitLead(eventClauses(morphoEventSlots(ctx, coords))).lead;
}
