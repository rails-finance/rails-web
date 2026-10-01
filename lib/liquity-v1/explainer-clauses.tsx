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
// Figures the stream does not carry (the borrowing fee, the LUSD the owner
// received, the reserve burned on a close, where a liquidation's debt and ETH
// went, the ETH price at an operate's block, a full redemption's surplus and
// its claim) come from the event's receipt read and the CollSurplusPool read
// (lib/liquity-v1/use-event-read.ts). The LEAD sentence never depends on them:
// the card's teaser renders it before either read lands, and the pane renders
// the rest.

import { collFigure } from "@/lib/shared/coll-figure";
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
  eventPriceProv,
  ratioAtBlockProv,
  borrowingFeeProv,
  lusdReceivedProv,
  ownerRepaidProv,
  closeRepaidProv,
  liqSeizedUsdProv,
  liqClearedFaceProv,
  liqPremiumProv,
  liqRouteProv,
  redemptionLegProv,
  redemptionNetProv,
  type LiquityV1Coords,
} from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { formatUsdValue, formatPrice } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import {
  LIQUITY_V1_RESERVE,
  fmtEth as fmtEthAt4,
  fmtLusd,
  fmtPct,
  fmtUsd,
  fmtUsdSigned,
  ratioOf,
  redemptionSplit,
  sidesOf,
} from "@/lib/liquity-v1/event-figures";
/** Collateral at the card ledger's decimals where the build set them. */
const fmtEth = (n: number): string => collFigure(n, fmtEthAt4(n));
import type { LiquityV1EventRead, LiquityV1Surplus } from "@/lib/liquity-v1/use-event-read";
import type { LiquityV1LiquidationRead } from "@/lib/sources/chain/liquity-v1-event";
import type { LiquityV1NearLine, LiquityV1OwnerOutcome } from "@/lib/liquity-v1/owner-outcome";

/** A leg below this magnitude reads as empty — a full repay or a full sweep
 *  leaves the emitted absolute at (or a hair above) zero. */
export const LIQUITY_V1_EPS = 1e-9;
/** An ETH figure below this rounds to nothing at four places. */
const EPS_ETH = 5e-5;

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

// ── the variant table ────────────────────────────────────────────────────────

/** The reads the pane has in hand; every field optional, since the teaser
 *  renders the lead before any of them lands. */
export interface LiquityV1ClauseReads {
  read?: LiquityV1EventRead | null;
  surplus?: LiquityV1Surplus | null;
  /** The ETH price at the event's block (the row's capture, else the read's). */
  price?: number | null;
  /** The PriceFeed price now. */
  currentPrice?: number | null;
  /** The receipt read is still on its way: the liquidation's route waits for
   *  it rather than falling back to the general description. */
  readPending?: boolean;
  /** On a liquidation, what the Trove's life left its owner. */
  ownerOutcome?: LiquityV1OwnerOutcome | null;
}

const muted = (children: ReactNode) => <strong className="font-semibold text-foreground">{children}</strong>;

export function liquityV1EventSlots(
  ctx: LiquityV1Context,
  coords: LiquityV1Coords,
  reads: LiquityV1ClauseReads = {},
): EventProseSlots {
  const { read, surplus, price, currentPrice, readPending, ownerOutcome } = reads;
  const rs = resultingState(ctx);
  const s = sidesOf(ctx);
  const coll = s.collDelta;
  const debt = s.debtDelta;
  // The header shows a BARE magnitude on opens, owner adjusts and redemptions
  // (each axis or the redemption pill carries the direction) and a SIGNED figure on
  // liquidations and closes — so the delta echo must key its value the same way,
  // or it lands on no receipt.
  const labeled =
    ctx.eventType === "openTrove" ||
    ctx.eventType === "adjustTrove" ||
    ctx.eventType === "redemption" ||
    ctx.eventType === "liquidation";

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
      {fmtEth(Math.abs(coll))} {COLLATERAL_SYMBOL}
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
      {fmtLusd(Math.abs(debt))} {DEBT_SYMBOL}
    </Fig>
  );
  const collAfterFig = () => (
    <Fig info={collAfterProv(coords)} symbol={COLLATERAL_SYMBOL}>
      {fmtEth(s.collAfter)} {COLLATERAL_SYMBOL}
    </Fig>
  );
  const debtAfterFig = () => (
    <Fig info={debtAfterProv(coords)} symbol={DEBT_SYMBOL}>
      {fmtLusd(s.debtAfter)} {DEBT_SYMBOL}
    </Fig>
  );
  const priceFig = (p: number) => (
    <Fig info={eventPriceProv(coords, p)} symbol={COLLATERAL_SYMBOL}>
      {fmtUsd(p)}
    </Fig>
  );

  // The ratio either side of the event, both at this block's price.
  const ratioClause = (): ClauseInput => {
    if (price == null) return null;
    const before = ctx.eventType === "openTrove" ? null : ratioOf(s.collBefore, s.debtBefore, price);
    const after = rs.hasDebtAfter ? ratioOf(s.collAfter, s.debtAfter, price) : null;
    if (after == null && before == null) return null;
    const pct = (r: number, side: "before" | "after") => (
      <Fig
        info={ratioAtBlockProv(coords, {
          coll: side === "before" ? ctx.collBefore : ctx.collAfter,
          debt: side === "before" ? ctx.debtBefore : ctx.debtAfter,
          priceUsd: price,
          side,
        })}
      >
        {fmtPct(r)}
      </Fig>
    );
    if (after != null && (before == null || fmtPct(before) === fmtPct(after)))
      return clause(
        <>
          At the ETH price of {priceFig(price)} at this block, the collateral ratio is {pct(after, "after")}, against
          the 110% minimum.
        </>,
      );
    if (after != null && before != null)
      return clause(
        <>
          At the ETH price of {priceFig(price)} at this block, the collateral ratio went from {pct(before, "before")} to{" "}
          {pct(after, "after")}; the minimum is 110%.
        </>,
      );
    return null;
  };

  // What a draw added to the debt, where the receipt says.
  const drawClauses = (opening: boolean): ClauseInput[] => {
    const received = read ? Number(read.lusdMintedToOwner) : 0;
    const fee = read?.borrowingFee != null ? Number(read.borrowingFee) : null;
    if (!read || fee == null || !(received > 0)) {
      return [
        clause(
          opening ? (
            <>
              The debt is the LUSD the owner received plus a one-time borrowing fee and the 200 LUSD liquidation
              reserve.
            </>
          ) : (
            <>The debt added is the LUSD the owner received plus a one-time borrowing fee.</>
          ),
        ),
      ];
    }
    const feeFig = (
      <Fig info={borrowingFeeProv(coords, read.borrowingFee as string)} symbol={DEBT_SYMBOL}>
        {fmtLusd(fee)} {DEBT_SYMBOL}
      </Fig>
    );
    const recvFig = (
      <Fig info={lusdReceivedProv(coords, read.lusdMintedToOwner)} symbol={DEBT_SYMBOL}>
        {fmtLusd(received)} {DEBT_SYMBOL}
      </Fig>
    );
    return [
      clause(
        opening ? (
          <>
            The owner received {recvFig}. The rest of the debt is a {feeFig} borrowing fee ({fmtPct(fee / received)} of
            the amount received) and the {muted(`${LIQUITY_V1_RESERVE} ${DEBT_SYMBOL}`)} liquidation reserve.
          </>
        ) : fee > 0 ? (
          <>
            The owner received {recvFig}; the other {feeFig} is the one-time borrowing fee ({fmtPct(fee / received)} of
            the amount received).
          </>
        ) : (
          <>
            The owner received {recvFig}. No borrowing fee was charged: the system was in Recovery Mode, where the fee
            is zero.
          </>
        ),
      ),
    ];
  };

  switch (ctx.eventType) {
    case "openTrove":
      return {
        happened: [
          clause(
            <>
              Opened the Trove with {collDeltaFig()} of collateral and {debtDeltaFig()} of debt.
            </>,
          ),
        ],
        changed: [
          ...drawClauses(true),
          clause(
            <>
              The reserve stays part of the debt: closing repays the debt less 200 LUSD and the reserve is burned; if
              the Trove is liquidated, the reserve pays the liquidator.
            </>,
          ),
        ],
        meansNow: [ratioClause()],
      };

    case "adjustTrove": {
      const happened: ClauseInput[] = [];
      if (coll > 0) happened.push(clause(<>Added {collDeltaFig()} of collateral to the Trove.</>));
      else if (coll < 0) happened.push(clause(<>Withdrew {collDeltaFig()} of collateral from the Trove.</>));
      if (debt > 0) happened.push(clause(<>Borrowed more: the debt rose by {debtDeltaFig()}.</>));
      else if (debt < 0) happened.push(clause(<>Repaid {debtDeltaFig()} of debt.</>));
      return {
        happened,
        changed: debt > 0 ? drawClauses(false) : [],
        meansNow: [
          clause(
            <>
              The Trove now holds {collAfterFig()} against {debtAfterFig()} of debt.
            </>,
          ),
          ratioClause(),
        ],
      };
    }

    case "closeTrove": {
      const repaid = Math.max(0, Math.abs(debt) - LIQUITY_V1_RESERVE);
      const repaidFig = (
        <Fig
          echo
          info={closeRepaidProv(coords, ctx.debtBefore)}
          value={chainTruthDeltaValue(-repaid, false)}
          symbol={DEBT_SYMBOL}
        >
          {fmtLusd(repaid)} {DEBT_SYMBOL}
        </Fig>
      );
      const burned = read ? Number(read.lusdBurnedFromOwner) : null;
      return {
        happened: [
          clause(
            <>
              Closed the Trove: the owner repaid {repaidFig} and took back all {collDeltaFig()} of collateral.
            </>,
          ),
        ],
        changed: [
          clause(
            <>
              The debt was {muted(`${fmtLusd(Math.abs(debt))} ${DEBT_SYMBOL}`)}. The owner&rsquo;s LUSD cancelled all of
              it except the {LIQUITY_V1_RESERVE} LUSD liquidation reserve, which the reserve pool burned in the same
              transaction.
            </>,
          ),
          burned != null && Math.abs(burned - repaid) > 0.01
            ? clause(
                <>
                  The transaction burned{" "}
                  <Fig info={ownerRepaidProv(coords, read!.lusdBurnedFromOwner)} symbol={DEBT_SYMBOL}>
                    {fmtLusd(burned)} {DEBT_SYMBOL}
                  </Fig>{" "}
                  from the owner&rsquo;s wallet.
                </>,
              )
            : null,
        ],
        meansNow: [clause(<>Nothing remains on either side of the position.</>)],
      };
    }

    case "liquidation": {
      const l = read?.liquidation ?? null;
      const n = (v: string) => Number(v);
      const route: ClauseInput[] = l
        ? [
            l.recoveryMode
              ? clause(
                  <>
                    This was a Recovery Mode liquidation: the system&rsquo;s total collateral ratio was below 150%, and
                    in that state any Trove below the system ratio can be liquidated.
                    {n(l.surplusEth) > 0 && (
                      <>
                        {" "}
                        The Stability Pool took collateral worth 110% of the debt, and{" "}
                        <Fig info={liqRouteProv(coords, "surplus")} symbol={COLLATERAL_SYMBOL}>
                          {fmtEth(n(l.surplusEth))} {COLLATERAL_SYMBOL}
                        </Fig>{" "}
                        was left in the surplus pool for the owner
                        {surplus?.claimed ? <>, who has since claimed it</> : <> to claim</>}.
                      </>
                    )}
                  </>,
                )
              : null,
            n(l.stabilityPoolDebt) > 0
              ? clause(
                  <>
                    The Stability Pool burned{" "}
                    <Fig info={liqRouteProv(coords, "stability pool debt")} symbol={DEBT_SYMBOL}>
                      {fmtLusd(n(l.stabilityPoolDebt))} {DEBT_SYMBOL}
                    </Fig>{" "}
                    of its deposits to clear the debt and received{" "}
                    <Fig info={liqRouteProv(coords, "stability pool eth")} symbol={COLLATERAL_SYMBOL}>
                      {fmtEth(n(l.stabilityPoolEth))} {COLLATERAL_SYMBOL}
                    </Fig>
                    , shared among its depositors.
                  </>,
                )
              : null,
            n(l.redistributedDebt) > 0 || n(l.redistributedEth) > 0
              ? clause(
                  <>
                    The Stability Pool could not cover{" "}
                    <Fig info={liqRouteProv(coords, "redistributed")} symbol={DEBT_SYMBOL}>
                      {fmtLusd(n(l.redistributedDebt))} {DEBT_SYMBOL}
                    </Fig>{" "}
                    of the debt; that debt and {fmtEth(n(l.redistributedEth))} ETH were shared out to every other open
                    Trove in proportion to its collateral.
                  </>,
                )
              : null,
            clause(
              <>
                The liquidator was paid the{" "}
                <Fig info={liqRouteProv(coords, "liquidator")} symbol={DEBT_SYMBOL}>
                  {fmtLusd(n(l.liquidatorLusd))} {DEBT_SYMBOL}
                </Fig>{" "}
                reserve and {fmtEth(n(l.liquidatorEth))} ETH (0.5% of the collateral).
              </>,
            ),
            l.trovesInTx > 1
              ? clause(
                  <>
                    The transaction liquidated {l.trovesInTx} Troves at once, so these amounts are its totals across all
                    of them.
                  </>,
                )
              : null,
            l.recoveryMode ? null : clause(<>The system was not in Recovery Mode.</>),
          ]
        : readPending
          ? []
          : [
              clause(
                <>
                  The Stability Pool clears the debt with its LUSD deposits and receives the ETH; debt it cannot cover
                  is shared out to the other open Troves. The liquidator is paid the 200 LUSD reserve and 0.5% of the
                  ETH.
                </>,
              ),
            ];
      return {
        happened: [
          clause(
            <>
              The Trove was liquidated: {collDeltaFig()} of collateral was seized and {debtDeltaFig()} of debt cleared.
            </>,
          ),
        ],
        changed: [liquidationWhyClause(ctx), ...route],
        // This event's figures only: what the owner kept and lost over the
        // whole life is the position card's.
        meansNow: [
          valuedLiquidationSentence(ctx, coords),
          clause(<>The owner keeps the LUSD they borrowed and gets none of the seized ETH back.</>),
          ...(ownerOutcome
            ? [liquityV1NearLineSentence(ownerOutcome, muted)].filter((x) => x != null).map((x) => clause(x))
            : []),
        ],
      };
    }

    case "redemption": {
      const split = redemptionSplit(ctx);
      const legVals = split ? { debt: String(split.lusdRedeemed), priceUsd: split.price, coll: ctx.collBefore } : null;
      const redeemerFig =
        split && legVals ? (
          <Fig
            echo={split.full}
            info={redemptionLegProv(coords, "redeemer", legVals)}
            value={split.full ? chainTruthDeltaValue(-split.ethToRedeemer, true) : undefined}
            symbol={COLLATERAL_SYMBOL}
          >
            {fmtEth(split.ethToRedeemer)} {COLLATERAL_SYMBOL}
          </Fig>
        ) : null;

      // The queue is ordered across all open Troves, so a Trove well above
      // 110% is redeemed when it is among the lowest at the time.
      const ratioThen = ratioOf(s.collBefore, s.debtBefore, price);
      const happened = [
        clause(
          split?.full && redeemerFig ? (
            <>
              An LUSD holder redeemed against this Trove: {debtDeltaFig()} of debt was cancelled and {redeemerFig} went
              to the redeemer.
            </>
          ) : (
            <>
              An LUSD holder redeemed against this Trove: {collDeltaFig()} went to the redeemer and {debtDeltaFig()} of
              its debt was cancelled at $1 per LUSD.
            </>
          ),
        ),
        clause(
          <>
            Redemptions work up from the lowest collateral ratio across all open Troves, so a Trove is redeemed when it
            is among the lowest at the time, whatever its level
            {ratioThen != null && <>; this one stood at {fmtPct(ratioThen)}</>}.
          </>,
        ),
      ];

      const net: ClauseInput =
        split && split.lusdRedeemed > 0
          ? (() => {
              const atRedemption = split.lusdRedeemed - split.ethToRedeemer * split.price;
              const today =
                currentPrice != null && currentPrice > 0
                  ? split.lusdRedeemed - split.ethToRedeemer * currentPrice
                  : null;
              const netVals = { debt: String(split.lusdRedeemed), eth: String(split.ethToRedeemer) };
              return clause(
                <>
                  The owner&rsquo;s net outcome is the debt cancelled minus the value of the ETH given up:{" "}
                  {fmtUsd(split.lusdRedeemed)} &minus; {fmtEth(split.ethToRedeemer)} {COLLATERAL_SYMBOL} &times;{" "}
                  {fmtUsd(split.price)} ={" "}
                  <Fig info={redemptionNetProv(coords, { ...netVals, priceUsd: split.price, when: "redemption" })}>
                    {fmtUsdSigned(Math.abs(atRedemption) < 0.005 ? 0 : atRedemption)}
                  </Fig>{" "}
                  at the redemption price
                  {today != null && (
                    <>
                      , or{" "}
                      <Fig
                        info={redemptionNetProv(coords, {
                          ...netVals,
                          priceUsd: currentPrice as number,
                          when: "today",
                        })}
                      >
                        {fmtUsdSigned(today)}
                      </Fig>{" "}
                      at today&rsquo;s ETH price of {fmtUsd(currentPrice as number)}, the difference from having held
                      that ETH
                    </>
                  )}
                  .
                </>,
              );
            })()
          : null;

      if (split?.full && legVals) {
        const claimNote = surplus?.claimed ? (
          <>
            , which the owner claimed
            {surplus.claimed.timestamp != null && <> on {formatDate(surplus.claimed.timestamp)}</>}
          </>
        ) : surplus && surplus.claimable > 0 ? (
          <>, where the owner can still claim it</>
        ) : (
          <>, where the owner can claim it</>
        );
        return {
          happened,
          changed: [
            clause(
              <>
                The redeemer&rsquo;s {muted(`${fmtLusd(split.lusdRedeemed)} ${DEBT_SYMBOL}`)} bought that ETH at{" "}
                {priceFig(split.price)} per ETH. The last {LIQUITY_V1_RESERVE} LUSD of the debt was the liquidation
                reserve, which the reserve pool burned.
              </>,
            ),
            clause(
              <>
                The Trove closed, and the other{" "}
                <Fig
                  echo
                  info={redemptionLegProv(coords, "surplus", legVals)}
                  value={chainTruthDeltaValue(split.ethSurplus, true)}
                  symbol={COLLATERAL_SYMBOL}
                >
                  {fmtEth(split.ethSurplus)} {COLLATERAL_SYMBOL}
                </Fig>{" "}
                of collateral moved to the surplus pool{claimNote}.
              </>,
            ),
          ],
          meansNow: [net],
        };
      }

      return {
        happened,
        changed: [
          price != null
            ? (() => {
                const before = ratioOf(s.collBefore, s.debtBefore, price);
                const after = ratioOf(s.collAfter, s.debtAfter, price);
                return before != null && after != null
                  ? clause(
                      <>
                        At {priceFig(price)} per ETH the ETH taken was worth the debt cancelled, so the collateral ratio
                        rose from {fmtPct(before)} to {fmtPct(after)}.
                      </>,
                    )
                  : null;
              })()
            : null,
        ],
        meansNow: [
          clause(
            <>
              The Trove keeps {collAfterFig()} against {debtAfterFig()} of debt.
            </>,
          ),
          net,
        ],
      };
    }

    default:
      return { happened: [] };
  }
}

/** Why the Trove could be liquidated: its ratio at the PriceFeed price at the
 *  time against the 110% minimum, or, at 110% or more, Recovery Mode. */
function liquidationWhyClause(ctx: LiquityV1Context): ClauseInput {
  const price = ctx.priceAtBlock?.usd;
  const r = ratioOf(Number(ctx.collBefore), Number(ctx.debtBefore), price);
  if (r == null) return null;
  return clause(
    r < 1.1 ? (
      <>Its collateral ratio at the time was {fmtPct(r)}, below the 110% minimum, so anyone could liquidate it.</>
    ) : (
      <>
        Its collateral ratio at the time was {fmtPct(r)}, above the 110% minimum: only Recovery Mode, where a Trove
        below the system&rsquo;s total ratio can be liquidated, made that possible.
      </>
    ),
  );
}

/** The valued liquidation sentence — the PriceFeed price at the time, echoing
 *  the forensics block's three legs (seized value, cleared face, premium) and
 *  its price pill. LUSD counts at $1, as the protocol's ratio math counts it,
 *  so the premium is the Trove's collateral ratio when it was liquidated minus
 *  100%. Drops whole when the row is unpriced, the same gate the forensics
 *  block uses. */
function valuedLiquidationSentence(ctx: LiquityV1Context, coords: LiquityV1Coords): ClauseInput {
  const price = ctx.priceAtBlock?.usd;
  const seizedAmt = Number(ctx.collBefore);
  const clearedUsd = Number(ctx.debtBefore);
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
      At the ETH price from Liquity&rsquo;s price feed at the time (${priceFig} per ETH), the seized collateral was
      worth {seizedFig} against {clearedFig} of debt counted at $1 per LUSD, a {premiumFig} premium for whoever absorbed
      the debt.
    </>,
  );
}

/** The teaser = the lead of the composed arc (the first sentence plus any
 *  trailing continuations). */
export function liquityV1ExplainerTeaser(ctx: LiquityV1Context, coords: LiquityV1Coords): ReactNode | null {
  return splitLead(eventClauses(liquityV1EventSlots(ctx, coords))).lead;
}

// ── a liquidated life's outcome for its owner ────────────────────────────────
//
// The closed Trove's card states the whole outcome; the liquidation's opened
// card keeps only the near-line pair. Figures only: what the owner kept, withdrew and
// lost, where the debt and ETH went, and, where the owner's last act took the
// ratio to the line, the two ratios side by side.

type Hl = (children: ReactNode) => ReactNode;

const andJoin = (parts: ReactNode[]): ReactNode =>
  parts.map((p, i) => (
    <span key={i}>
      {i > 0 && (i === parts.length - 1 ? (parts.length > 2 ? ", and " : " and ") : ", ")}
      {p}
    </span>
  ));

const actNoun = (kinds: LiquityV1NearLine["kinds"]): string =>
  kinds.includes("withdraw") && kinds.includes("borrow")
    ? "withdrawal and borrow"
    : kinds.includes("withdraw")
      ? "withdrawal"
      : "borrow";

/** What the owner kept, withdrew and lost, and the near-line pair when there
 *  is one: one sentence each. */
export function liquityV1OutcomeSentences(o: LiquityV1OwnerOutcome, hl: Hl): ReactNode[] {
  const out: ReactNode[] = [];
  const kept = o.lusdReceived - o.lusdRepaid;
  const lusd = (n: number) => hl(`${fmtLusd(n)} ${DEBT_SYMBOL}`);
  const eth = (n: number) => hl(`${fmtEth(n)} ${COLLATERAL_SYMBOL}`);
  out.push(
    kept > 0.005 && o.lusdRepaid > 0.005 ? (
      <>
        The owner kept {lusd(kept)}: {fmtLusd(o.lusdReceived)} received over the Trove&rsquo;s life less{" "}
        {fmtLusd(o.lusdRepaid)} repaid.
      </>
    ) : kept > 0.005 ? (
      <>The owner kept the {lusd(o.lusdReceived)} received over the Trove&rsquo;s life.</>
    ) : (
      <>
        The owner received {lusd(o.lusdReceived)} over the Trove&rsquo;s life and repaid {lusd(o.lusdRepaid)}.
      </>
    ),
  );
  const lost = (
    <>
      {eth(o.ethLost)}, worth {hl(fmtUsd(o.ethLost * o.liquidationPrice))} at the liquidation price of{" "}
      {fmtUsd(o.liquidationPrice)}
    </>
  );
  const parts: ReactNode[] = [];
  if (o.ethWithdrawn > EPS_ETH) parts.push(<>the owner withdrew {eth(o.ethWithdrawn)}</>);
  if (o.ethRedeemed > EPS_ETH) parts.push(<>redemptions took {eth(o.ethRedeemed)}</>);
  parts.push(<>the liquidation took {lost}</>);
  out.push(
    parts.length > 1 ? (
      <>Over its life {andJoin(parts)}.</>
    ) : (
      <>The owner withdrew no ETH over the Trove&rsquo;s life, and the liquidation took {lost}.</>
    ),
  );
  const near = liquityV1NearLineSentence(o, hl);
  if (near) out.push(near);
  return out;
}

/** Where the owner's last act took the ratio to the line: the ratio it left
 *  and the ratio at liquidation, side by side. Null when no act did. */
export function liquityV1NearLineSentence(o: LiquityV1OwnerOutcome, hl: Hl): ReactNode | null {
  const n = o.nearLine;
  if (!n) return null;
  const act = formatDate(n.timestamp);
  const at = formatDate(n.liquidationTimestamp);
  return (
    <>
      The {actNoun(n.kinds)} on {act} left the ratio at {hl(fmtPct(n.ratioAfter))}; the Trove was liquidated at{" "}
      {hl(fmtPct(n.liquidationRatio))} {act === at ? "the same day" : <>on {at}</>}.
    </>
  );
}

/** Where a liquidation's debt and ETH went, and whether the system was in
 *  Recovery Mode: one sentence each. */
export function liquityV1RouteSentences(l: LiquityV1LiquidationRead, hl: Hl): ReactNode[] {
  const n = (v: string) => Number(v);
  const out: ReactNode[] = [];
  const spDebt = n(l.stabilityPoolDebt);
  const rdDebt = n(l.redistributedDebt);
  const rdEth = n(l.redistributedEth);
  if (spDebt > 0)
    out.push(
      <>
        The Stability Pool burned {hl(`${fmtLusd(spDebt)} ${DEBT_SYMBOL}`)} to clear the debt and received{" "}
        {hl(`${fmtEth(n(l.stabilityPoolEth))} ${COLLATERAL_SYMBOL}`)}.
      </>,
    );
  if (rdDebt > 0 || rdEth > 0)
    out.push(
      <>
        {spDebt > 0 ? "What the Stability Pool could not cover" : "The Stability Pool covered none of it"},{" "}
        {hl(`${fmtLusd(rdDebt)} ${DEBT_SYMBOL}`)} of debt and {hl(`${fmtEth(rdEth)} ${COLLATERAL_SYMBOL}`)}, was shared
        out to the other open Troves.
      </>,
    );
  out.push(
    <>
      The liquidator was paid {fmtLusd(n(l.liquidatorLusd))} {DEBT_SYMBOL} and {fmtEth(n(l.liquidatorEth))}{" "}
      {COLLATERAL_SYMBOL}.
    </>,
  );
  if (l.trovesInTx > 1)
    out.push(
      <>
        The transaction liquidated {l.trovesInTx} Troves at once, so these amounts are its totals across all of them.
      </>,
    );
  out.push(
    l.recoveryMode ? (
      <>The system was in Recovery Mode: its total collateral ratio was below 150%.</>
    ) : (
      <>The system was not in Recovery Mode.</>
    ),
  );
  return out;
}
