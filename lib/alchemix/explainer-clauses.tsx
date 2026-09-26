// Plain-words clauses for one Alchemist event.
// ----------------------------------------------------------------------------
// Third person, native units, one fact per bullet. The two things these clauses
// exist to say, which no other explorer has to:
//
//   • A LINE-WIDE row is not this holder's action. A redemption moves every
//     open position's debt at once and names none of them; the two batch rows
//     carry the hash of an account list. Each of those bullets says outright
//     that nobody here did it, because the row otherwise reads as an act the
//     holder performed.
//
//   • A REPAY'S AMOUNT IS NOT ITS DEBT. The log states the vault shares the
//     caller offered; the debt that bought is a separate figure, capped by both
//     the position's debt and the line's. The bullets keep them apart and name
//     which is which.

import type { AlchemixV3Context } from "@/lib/shared/types/event-shape";
import { clause, cont, type ClauseInput } from "@/lib/shared/explainer-prose";
import { shortAddr } from "@/lib/shared/format-event";
import { formatNumber } from "@/lib/utils/format";

const WAD = 1e18;

const amount = (raw: string | null | undefined): string | null => {
  if (raw == null) return null;
  const n = Number(raw.split(".")[0]);
  if (!Number.isFinite(n)) return null;
  return formatNumber(n / WAD);
};

const who = (addr: string | null | undefined): string => (addr ? shortAddr(addr) : "an address the log does not name");

/** The bullets for one event, in reading order. The first survives as the
 *  card's teaser; the rest fill the pane. */
export function alchemixEventClauses(ctx: AlchemixV3Context): ClauseInput[] {
  const raw = ctx.raw;
  const sym = ctx.syntheticSymbol;
  const out: ClauseInput[] = [];

  switch (ctx.eventType) {
    case "deposit":
      out.push(clause(<>The position took in {amount(raw.amount)} vault shares as collateral.</>));
      out.push(cont(<>{" "}Collateral is held as shares in the vault, not as the asset underneath it.</>));
      break;

    case "withdraw":
      out.push(clause(<>{amount(raw.amount)} vault shares left the position.</>));
      out.push(cont(<>{" "}They went to {who(raw.recipient)}.</>));
      break;

    case "mint":
      out.push(
        clause(
          <>
            The position minted {amount(raw.amount)} {sym} against its collateral, which is what its debt is owed in.
          </>,
        ),
      );
      out.push(cont(<>{" "}The {sym} went to {who(raw.recipient)}.</>));
      break;

    case "burn":
      out.push(
        clause(
          <>
            {who(raw.sender)} burned {amount(raw.amount)} {sym} against this position, taking its debt down by that
            much.
          </>,
        ),
      );
      break;

    case "repay": {
      const credit = ctx.resolvedAtCapture?.debtCredit ?? null;
      out.push(
        clause(
          <>
            {who(raw.sender)} offered {amount(raw.amount)} vault shares against this position&rsquo;s debt.
          </>,
        ),
      );
      out.push(
        credit != null ? (
          cont(
            <>
              {" "}
              That cleared {amount(credit)} {sym} of debt — the shares are worth what they are worth at this moment, and
              the amount cleared stops at whichever is smaller, the position&rsquo;s debt or the line&rsquo;s.
            </>,
          )
        ) : (
          cont(
            <>
              {" "}
              How much debt that cleared is not stated here, so this card does not give a figure for it rather than give
              the wrong one.
            </>,
          )
        ),
      );
      if (ctx.resolvedAtCapture?.collateralFee) {
        out.push(
          clause(
            <>A fee of {amount(ctx.resolvedAtCapture.collateralFee)} vault shares was taken in the same transaction.</>,
          ),
        );
      }
      break;
    }

    case "force_repay":
      out.push(
        clause(
          <>
            {amount(raw.credit_to_yield)} vault shares were put against this position&rsquo;s debt without the holder
            asking.
          </>,
        ),
      );
      out.push(
        cont(
          <>
            {" "}
            A further {amount(raw.protocol_fee_total)} shares went to the protocol as its fee, so the collateral fell by
            both.
          </>,
        ),
      );
      break;

    case "self_liquidated":
      out.push(
        clause(
          <>The holder liquidated {amount(raw.amount_liquidated)} of their own vault shares to bring the debt down.</>,
        ),
      );
      out.push(cont(<>{" "}The debt this cleared is not in the log, so no figure for it is given.</>));
      break;

    case "liquidated":
      out.push(
        clause(
          <>
            {who(raw.liquidator)} liquidated this position, taking {amount(raw.amount)} vault shares from it.
          </>,
        ),
      );
      out.push(
        cont(
          <>
            {" "}
            The liquidator was paid {amount(raw.fee_in_yield)} shares and {amount(raw.fee_in_underlying)} of the asset
            underneath for doing it.
          </>,
        ),
      );
      break;

    case "repayment_fee":
      out.push(
        clause(
          <>
            A repayment fee went to {who(raw.fee_receiver)}: {amount(raw.fee_in_yield)} vault shares and{" "}
            {amount(raw.fee_in_underlying)} of the asset underneath.
          </>,
        ),
      );
      break;

    case "transfer": {
      const kind = ctx.transfer?.transferType;
      if (kind === "mint") {
        out.push(clause(<>The position was created and handed to {who(ctx.transfer?.toAddress)}.</>));
      } else if (kind === "burn") {
        out.push(clause(<>The position was destroyed; {who(ctx.transfer?.fromAddress)} held it until then.</>));
      } else {
        out.push(
          clause(
            <>
              The position changed hands, from {who(ctx.transfer?.fromAddress)} to {who(ctx.transfer?.toAddress)}.
            </>,
          ),
        );
        out.push(
          cont(<>{" "}Nothing about the debt or the collateral moved; only who owns them did.</>),
        );
      }
      break;
    }

    case "redemption": {
      const cleared = ctx.debtClearedFromReadings;
      out.push(
        clause(
          <>
            Nobody here did this: the whole line redeemed {amount(raw.amount)} {sym} at once, and every open position on
            it had its debt moved by the same ratio.
          </>,
        ),
      );
      out.push(
        cont(
          <>
            {" "}
            The event names no position and carries no share-out, so how much of it landed on this one cannot be read
            off it.
          </>,
        ),
      );
      // The figure the event cannot give, measured instead: this position's
      // debt either side of the redemption. A stated ZERO is an answer and says
      // so in its own words; an unavailable one adds no bullet at all, which is
      // the only thing that keeps the two apart.
      if (cleared?.status === "stated" && cleared.amountRaw != null) {
        out.push(
          cleared.amountRaw === "0"
            ? clause(
                <>
                  This position&rsquo;s debt was read from the contract on both sides of it and came out the same, so
                  this redemption cleared none of this one&rsquo;s.
                </>,
              )
            : clause(
                <>
                  This position&rsquo;s debt was read from the contract on both sides of it. The two readings are{" "}
                  {amount(cleared.amountRaw)} {sym} apart, and that is what this redemption cleared here.
                </>,
              ),
        );
      }
      out.push(
        raw.swept === "true" ? (
          clause(<>The figures for this position have since been taken from the contract past this point.</>)
        ) : (
          clause(
            <>
              No reading has been taken from the contract past this point yet, so the figures above do not cover this
              event.
            </>,
          )
        ),
      );
      break;
    }

    case "batch_liquidated":
      out.push(
        clause(
          <>
            Nobody here did this: {who(raw.liquidator)} liquidated a batch of positions at once, taking{" "}
            {amount(raw.amount)} vault shares across all of them.
          </>,
        ),
      );
      out.push(
        cont(
          <>
            {" "}
            The list of positions arrives as a single hash, so which of them were in it — and whether this one was —
            cannot be recovered from the event.
          </>,
        ),
      );
      break;

    case "fee_shortfall":
      out.push(
        clause(
          <>
            Nobody here did this: {who(raw.liquidator)} was owed {amount(raw.requested)} for a liquidation and was paid{" "}
            {amount(raw.paid)}.
          </>,
        ),
      );
      out.push(cont(<>{" "}It names no position, and sits here because it falls inside this one&rsquo;s life.</>));
      break;

    default:
      break;
  }

  return out;
}
