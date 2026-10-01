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
//
// AND ONE SHAPE THAT TAKES THREE LOGS TO STATE. An opening emits the position
// NFT's mint from the Alchemist's NFT contract and the deposit from the
// Alchemist, and often a third log: a transfer passing the freshly minted NFT
// on to the address that asked for it, because a periphery contract took the
// deposit and was minted to first. Read one log at a time, that third address
// is the owner and the second is somebody who "was handed a position" — which
// is a sentence about a routing step.
//
// ONE TRANSACTION IS ONE CARD, so those logs arrive here together and each of
// them contributes its own bullets. `combined` is how a clause knows: the
// cross-references the separate cards needed ("this is the deposit that funded
// the position minted in this same transaction") say nothing when both facts
// are already on the card, so they are dropped, and the mint's narration drops
// the funding figure the deposit's own bullet states. The shape is still read
// off the data: one transaction hash, the transfer types, and whether the
// mint's recipient is the sender of a later transfer in the same transaction,
// never off an address anyone wrote down. A transfer in ANOTHER transaction is
// a change of owner and keeps its own card, unchanged.
//
// THE CAVEATS THAT HOLD FOR EVERY CARD ARE SAID ONCE, on the position card's
// Explanation pane and in its "About this position" modal: that the figures
// are readings and that collateral is a vault share count. Each is also on the
// receipt of the figure it governs. The bullets here are specific to the
// event. Two reading caveats are said on the card they concern:
// `alchemixReadingClauses` (a block holding more of this position's events
// than the card draws) and `alchemixBetweenReadingsClauses` (what set-aside
// and the share price did between the reading before and this block).

import type {
  AlchemixStateAtBlockFromReading,
  AlchemixV3Context,
  BaseActivityEvent,
} from "@/lib/shared/types/event-shape";
import type { ReactNode } from "react";
import { clause, cont, H, type ClauseInput } from "@/lib/shared/explainer-prose";
import { formatCompact, shortAddr } from "@/lib/shared/format-event";
import { formatNumber } from "@/lib/utils/format";
import type { RedemptionNet } from "@/lib/alchemix/redemption-net";
import { isLineRouter } from "@/lib/alchemix/lines";
import type { AlchemixReading } from "@/lib/alchemix/readings-before";
import { selfLiquidationSplit } from "@/lib/alchemix/self-liquidation";
import { AmountText } from "@/components/shared/amount-text";

// The synthetic and every MYT carry 18 decimals on every line, so every figure
// an Alchemist log emits in one of those two is scaled here (see the note on
// `AlchemixV3Context`). The asset UNDERNEATH the MYT is the exception: 6 on the
// two USDC lines, 18 on the WETH one, and it is read from the line rather than
// assumed — `underlying` below.
const WAD = 1e18;

const amount = (raw: string | null | undefined): string | null => {
  if (raw == null) return null;
  const n = Number(raw.split(".")[0]);
  if (!Number.isFinite(n)) return null;
  return formatNumber(n / WAD);
};

/** A figure denominated in the asset under the MYT, at that asset's own
 *  decimals. Null when the line's decimals are not in hand, and the caller then
 *  states no figure: reading 6-decimal wei at 18 renders a real fee as nothing,
 *  which is a wrong number rather than a missing one. */
const underlying = (raw: string | null | undefined, decimals: number | null | undefined): string | null => {
  if (raw == null || decimals == null) return null;
  const n = Number(raw.split(".")[0]);
  if (!Number.isFinite(n)) return null;
  return formatNumber(n / 10 ** decimals);
};

/** A figure the card's T1 row or T2 grid also shows, in the grid's format and
 *  the foreground tone (rails-ops standards/detail-page-anatomy.md, "Colour
 *  points back to T2"). A figure stated only in the bullets goes through
 *  `amount` and stays muted. */
const shown = (raw: string | null | undefined, unit: string): ReactNode => {
  if (raw == null) return null;
  const n = Number(raw.split(".")[0]);
  if (!Number.isFinite(n)) return null;
  return (
    <H>
      <AmountText value={n / WAD} format="compact" /> {unit}
    </H>
  );
};

const who = (addr: string | null | undefined): string => (addr ? shortAddr(addr) : "an address the log does not name");

/** An address, named as the line's router where it is one. */
const whoOn = (ctx: Pick<AlchemixV3Context, "chainId" | "lineKey">, addr: string | null | undefined): string =>
  addr && isLineRouter(ctx.chainId, ctx.lineKey, addr)
    ? `Alchemix's router for this line (${shortAddr(addr)})`
    : who(addr);

const sameAddr = (a: string | null | undefined, b: string | null | undefined): boolean =>
  a != null && b != null && a.toLowerCase() === b.toLowerCase();

/** One Alchemist row, as the timeline hands it over. */
export type AlchemistEvent = BaseActivityEvent & {
  context: { protocol: "alchemix-v3"; data: AlchemixV3Context };
};

/** The opening this transaction performed, read off the logs it carries. */
export interface AlchemixOpening {
  /** The address the position NFT was minted to. */
  mintedTo: string;
  /** Where the NFT ended the transaction, when a later transfer in the same one
   *  moved it on from the mint's recipient. Null when the mint's recipient kept
   *  it — a position minted straight to its owner. */
  forwardedTo: string | null;
  /** The transfers that did the forwarding, so each of them can tell that it is
   *  part of the opening rather than a change of owner later on. */
  forwardingMoves: AlchemistEvent[];
  /** The collateral the same transaction put behind the position, unscaled. */
  depositRaw: string | null;
  /** The synthetic the same transaction drew against it, unscaled. Used only
   *  where there is no deposit to lead with. */
  debtRaw: string | null;
}

/**
 * The opening, when these same-transaction siblings are one. Null when the
 * transaction carries no mint of this position's NFT, which is every
 * transaction but the first.
 */
export function openingInTx(siblings: AlchemistEvent[], tokenId: string | null): AlchemixOpening | null {
  if (tokenId == null) return null;
  const mine = siblings.filter((e) => e.context.data.tokenId === tokenId);
  const minted = mine.find(
    (e) => e.context.data.eventType === "transfer" && e.context.data.transfer?.transferType === "mint",
  );
  const mintedTo = minted?.context.data.transfer?.toAddress;
  if (!mintedTo) return null;

  // Follow the NFT out of the address it was minted to, one transfer at a time,
  // so a hop through two contracts reads as one forwarding and not as a sale.
  const moves = mine.filter(
    (e) => e.context.data.eventType === "transfer" && e.context.data.transfer?.transferType === "transfer",
  );
  const forwardingMoves: AlchemistEvent[] = [];
  let holder = mintedTo;
  for (let i = 0; i < moves.length; i++) {
    const next = moves.find(
      (m) => !forwardingMoves.includes(m) && sameAddr(m.context.data.transfer?.fromAddress, holder),
    );
    if (!next) break;
    forwardingMoves.push(next);
    holder = next.context.data.transfer!.toAddress;
  }

  return {
    mintedTo,
    forwardedTo: sameAddr(holder, mintedTo) ? null : holder,
    forwardingMoves,
    depositRaw: mine.find((e) => e.context.data.eventType === "deposit")?.context.data.raw.amount ?? null,
    debtRaw: mine.find((e) => e.context.data.eventType === "mint")?.context.data.raw.amount ?? null,
  };
}

/** Where the position NFT started and ended ONE transaction.
 *
 *  A ROUND TRIP IS NOT A CHANGE OF HANDS. Base position 8's withdrawals each
 *  emit three logs: the NFT out to a periphery contract, the withdrawal, the
 *  NFT back to the holder. Read one log at a time that is two changes of owner;
 *  read as a transaction it is a contract borrowing the position to act with
 *  and giving it back, and `moved` is what tells the two apart. */
export interface AlchemixCustodyPath {
  /** Where the NFT was before the first transfer; the zero address on a mint. */
  from: string;
  /** Where it was after the last one; the zero address on a burn. */
  to: string;
  /** The first address it reached, which on a round trip is the contract that
   *  held it. */
  via: string;
  /** It ended the transaction somewhere other than where it started. */
  moved: boolean;
  /** Set where the transaction destroyed the position. */
  burnedFrom: string | null;
  moves: AlchemistEvent[];
}

/** The path, when these same-transaction rows carry one. Null when the
 *  transaction moved no position NFT. */
export function custodyPathInTx(siblings: AlchemistEvent[], tokenId: string | null): AlchemixCustodyPath | null {
  if (tokenId == null) return null;
  const moves = siblings.filter((e) => e.context.data.eventType === "transfer" && e.context.data.tokenId === tokenId);
  if (moves.length === 0) return null;
  const first = moves[0].context.data.transfer;
  const last = moves[moves.length - 1].context.data.transfer;
  if (!first || !last) return null;
  const burn = moves.find((e) => e.context.data.transfer?.transferType === "burn");
  return {
    from: first.fromAddress,
    to: last.toAddress,
    via: first.toAddress,
    moved: !sameAddr(first.fromAddress, last.toAddress),
    burnedFrom: burn?.context.data.transfer?.fromAddress ?? null,
    moves,
  };
}

/** The one bullet a round trip earns, in place of the two changes of owner its
 *  legs would each narrate. */
export function alchemixCustodyRoundTripClause(path: AlchemixCustodyPath): ClauseInput {
  return clause(
    <>
      The position was handed to {whoOn(path.moves[0].context.data, path.via)} and back inside this one transaction, so
      nobody&rsquo;s ownership of it changed.
    </>,
  );
}

/** How a leg's bullets change when its card carries the whole transaction. */
export interface AlchemixClauseOptions {
  /** This leg shares its card with the other legs of its transaction, so a
   *  bullet pointing at one of them repeats what is already on the card. */
  combined?: boolean;
  /** The vault share ticker for this line, so a bullet names the unit
   *  ("mixUSDC") beside the figure. */
  mytSymbol?: string;
  /** What this redemption took from this position's collateral, in share wei:
   *  the reading before it less the reading at it (lib/alchemix/readings-before).
   *  Null where the two readings are not in hand. */
  collateralTakenRaw?: string | null;
  /** The line's protocol fee in basis points, for the repay fee's rate. */
  protocolFeeBps?: number | null;
  /** A redemption's net for this position (lib/alchemix/redemption-net), and
   *  the underlying it is in. */
  redemptionNet?: RedemptionNet | null;
  underlyingSymbol?: string | null;
  /** This leg is a hop of a custody ROUND TRIP, which the card narrates once
   *  (`alchemixCustodyRoundTripClause`) rather than once per hop. */
  skipCustody?: boolean;
  /** The reading before this card's block (lib/alchemix/readings-before), which
   *  a close's returned collateral is measured from. */
  readingBefore?: AlchemixReading | null;
  /** The decimals of the asset under this line's MYT, from the position's own
   *  row — 6 on the USDC lines, 18 on the WETH one. The events do not carry it
   *  and it is not guessed from the line key. Null leaves the two fees that are
   *  paid in that asset unstated rather than scaled at the wrong power. */
  underlyingDecimals?: number | null;
}

/** The bullets for one event, in reading order. The first survives as the
 *  card's teaser; the rest fill the pane.
 *
 *  `siblings` are the rows sharing this event's transaction hash, and `self` is
 *  this row among them. Both are optional: with neither, every card says what
 *  its own log states and the opening reads as a bare mint. */
export function alchemixEventClauses(
  ctx: AlchemixV3Context,
  siblings: AlchemistEvent[] = [],
  self?: AlchemistEvent,
  opts: AlchemixClauseOptions = {},
): ClauseInput[] {
  const {
    combined = false,
    skipCustody = false,
    underlyingDecimals = null,
    mytSymbol = "vault shares",
    collateralTakenRaw = null,
    protocolFeeBps = null,
  } = opts;
  const myt = mytSymbol;
  const raw = ctx.raw;
  const sym = ctx.syntheticSymbol;
  const out: ClauseInput[] = [];

  switch (ctx.eventType) {
    case "deposit":
      out.push(clause(<>The position took in {shown(raw.amount, myt)} as collateral.</>));
      // The cross-reference back to the narrator, so two SEPARATE cards read as
      // one act without either of them losing its own receipt. On one card the
      // mint is a bullet away and the sentence says nothing.
      if (!combined && openingInTx(siblings, ctx.tokenId)) {
        out.push(clause(<>This is the deposit that funded the position minted in this same transaction.</>));
      }
      break;

    case "withdraw":
      out.push(clause(<>{shown(raw.amount, myt)} of collateral left the position.</>));
      out.push(cont(<> They went to {whoOn(ctx, raw.recipient)}.</>));
      break;

    case "mint":
      out.push(
        clause(<>The position minted {shown(raw.amount, sym)} against its collateral, adding that much to its debt.</>),
      );
      out.push(
        cont(
          <>
            {" "}
            The {sym} went to {whoOn(ctx, raw.recipient)}.
          </>,
        ),
      );
      break;

    case "burn":
      out.push(
        clause(
          <>
            {who(raw.sender)} burned {shown(raw.amount, sym)} against this position, taking its debt down by that much.
          </>,
        ),
      );
      break;

    case "repay": {
      const credit = ctx.resolvedAtCapture?.debtCredit ?? null;
      out.push(
        clause(
          <>
            {who(raw.sender)} repaid this position&rsquo;s debt with {shown(raw.amount, myt)}.
          </>,
        ),
      );
      if (credit != null) {
        out.push(
          cont(
            <>
              {" "}
              That cleared {shown(credit, sym)}: each share counts at its value in the asset underneath at this block,
              one {sym} per unit, up to whichever is smaller, the position&rsquo;s debt or the line&rsquo;s.
            </>,
          ),
        );
      }
      if (ctx.resolvedAtCapture?.collateralFee) {
        out.push(
          clause(
            protocolFeeBps != null ? (
              <>
                A protocol fee of {shown(ctx.resolvedAtCapture.collateralFee, myt)} left the collateral for
                Alchemix&rsquo;s fee receiver: {(protocolFeeBps / 100).toLocaleString("en-US")}% of the shares that paid
                off debt set aside for repayment.
              </>
            ) : (
              <>
                A protocol fee of {shown(ctx.resolvedAtCapture.collateralFee, myt)} left the collateral for
                Alchemix&rsquo;s fee receiver, charged on the shares that paid off debt set aside for repayment.
              </>
            ),
          ),
        );
      }
      break;
    }

    case "force_repay": {
      const inClose = siblings.some((e) => e.txHash === self?.txHash && e.context.data.eventType === "self_liquidated");
      out.push(
        clause(
          <>
            {shown(raw.credit_to_yield, myt)} of collateral paid off this position&rsquo;s debt set aside for repayment
            {inClose ? ", the first step of closing it" : ""}.
          </>,
        ),
      );
      if (raw.protocol_fee_total && raw.protocol_fee_total !== "0") {
        out.push(
          clause(
            <>
              Alchemix took a protocol fee of {shown(raw.protocol_fee_total, myt)} from the collateral
              {protocolFeeBps != null ? (
                <>, {(protocolFeeBps / 100).toLocaleString("en-US")}% of those shares,</>
              ) : null}{" "}
              and paid it to its fee receiver.
            </>,
          ),
        );
      }
      break;
    }

    case "self_liquidated": {
      const split = self ? selfLiquidationSplit(self, siblings, opts.readingBefore ?? null) : null;
      const rest = split && split.setAsideRaw > BigInt(0) ? split.restRaw.toString() : null;
      out.push(
        clause(
          rest != null ? (
            <>
              The holder chose to close the position: {shown(rest, myt)} of its collateral paid off the rest of its
              debt.
            </>
          ) : (
            <>
              The holder chose to close the position: {shown(raw.amount_liquidated, myt)} of its collateral paid off its
              debt.
            </>
          ),
        ),
      );
      if (split?.returnedRaw != null && split.returnedRaw > BigInt(0)) {
        out.push(
          clause(
            <>
              The remaining {shown(split.returnedRaw.toString(), myt)} of collateral went back to an address the holder
              chose. No event states it: it is the collateral read before the close, less the shares that paid debt and
              the fee.
            </>,
          ),
        );
      }
      out.push(
        clause(
          split && split.feeRaw > BigInt(0) ? (
            <>That protocol fee is the only charge for closing this way: a close with collateral pays no liquidator.</>
          ) : (
            <>
              No fee was charged: the protocol fee applies only to debt set aside for repayment, and a close with
              collateral pays no liquidator.
            </>
          ),
        ),
      );
      break;
    }

    case "liquidated":
      out.push(
        clause(
          <>
            {who(raw.liquidator)} liquidated this position, taking {shown(raw.amount, myt)} from it.
          </>,
        ),
      );
      {
        // The Alchemist pays the liquidator from one source: shares from the
        // position's collateral, or, where the collateral no longer covers the
        // debt, the asset underneath from the line's fee vault.
        const fee = underlying(raw.fee_in_underlying, underlyingDecimals);
        const inShares = raw.fee_in_yield != null && raw.fee_in_yield !== "0";
        const inVault = raw.fee_in_underlying != null && raw.fee_in_underlying !== "0";
        out.push(
          cont(
            inShares ? (
              <>
                {" "}
                The liquidator was paid {shown(raw.fee_in_yield, myt)} of it, taken from this position&rsquo;s
                collateral.
              </>
            ) : inVault ? (
              fee != null ? (
                <>
                  {" "}
                  The liquidator was paid {fee} of the asset underneath from the line&rsquo;s fee vault, outside this
                  position.
                </>
              ) : (
                <>
                  {" "}
                  The liquidator was paid in the asset underneath from the line&rsquo;s fee vault, outside this
                  position; its decimals come from a reading of this position and none has been taken, so no figure is
                  given.
                </>
              )
            ) : (
              <> The liquidator was paid no fee.</>
            ),
          ),
        );
      }
      break;

    case "repayment_fee": {
      const fee = underlying(raw.fee_in_underlying, underlyingDecimals);
      out.push(
        clause(
          fee != null ? (
            <>
              A repayment fee went to {who(raw.fee_receiver)}: {shown(raw.fee_in_yield, myt)} and {fee} of the asset
              underneath.
            </>
          ) : (
            <>
              A repayment fee went to {who(raw.fee_receiver)}: {shown(raw.fee_in_yield, myt)}, and an amount of the
              asset underneath with no figure here, because its decimals come from a reading of this position and none
              has been taken.
            </>
          ),
        ),
      );
      break;
    }

    case "transfer": {
      const kind = ctx.transfer?.transferType;
      // A hop of a round trip: the card says once that the position went out
      // and came back, so the hop says nothing.
      if (skipCustody && kind === "transfer") break;
      const opening = openingInTx(siblings, ctx.tokenId);

      if (kind === "mint") {
        // The narrator. What the mint alone can say is that an address was
        // given an NFT; what the transaction says is that a position was made,
        // funded, and in some openings handed on — and where it was handed on,
        // the address in the middle is a step in the routing, so the card names
        // it as that rather than as somebody who was given a position.
        // On one card the deposit and the mint of debt have bullets of their
        // own, so the narration names the position's creation and leaves the
        // figures to them.
        const funding = combined
          ? null
          : opening?.depositRaw
            ? {
                node: (
                  <>
                    funded with {amount(opening.depositRaw)} {myt}
                  </>
                ),
              }
            : opening?.debtRaw
              ? {
                  node: (
                    <>
                      drew {amount(opening.debtRaw)} {sym} against it
                    </>
                  ),
                }
              : null;
        const routed = opening?.forwardedTo ? (
          isLineRouter(ctx.chainId, ctx.lineKey, opening.mintedTo) ? (
            <> That first address is Alchemix&rsquo;s router for this line, which the transaction went through.</>
          ) : (
            <> That first address is a contract the transaction routed through.</>
          )
        ) : null;

        if (opening && opening.forwardedTo && funding) {
          out.push(
            clause(
              <>
                The position was created in this transaction: minted to {who(opening.mintedTo)}, {funding.node}, and
                passed on to {who(opening.forwardedTo)} before the transaction ended.
              </>,
            ),
          );
        } else if (opening && opening.forwardedTo) {
          out.push(
            clause(
              <>
                The position was created in this transaction: minted to {who(opening.mintedTo)} and passed on to{" "}
                {who(opening.forwardedTo)} before the transaction ended.
              </>,
            ),
          );
        } else if (opening && funding) {
          out.push(
            clause(
              <>
                The position was created in this transaction: minted to {who(opening.mintedTo)} and {funding.node}.
              </>,
            ),
          );
        } else {
          out.push(clause(<>The position was created and handed to {who(ctx.transfer?.toAddress)}.</>));
        }
        if (routed) out.push(cont(routed));
      } else if (kind === "burn") {
        out.push(clause(<>The position was destroyed; {who(ctx.transfer?.fromAddress)} held it until then.</>));
      } else if (self && opening?.forwardingMoves.includes(self)) {
        // The forwarding leg of an opening. A transfer in any OTHER transaction
        // is a change of owner and falls through to the clause below. On one
        // card the narration above already ends at the address this leg reached,
        // so the leg adds nothing.
        if (combined) break;
        out.push(
          clause(
            <>The position reached {who(ctx.transfer?.toAddress)} here, in the same transaction that minted it.</>,
          ),
        );
        out.push(
          cont(
            <>
              {" "}
              The address it came from is the one it was minted to in that transaction, so this is the last step of the
              opening.
            </>,
          ),
        );
      } else {
        out.push(
          clause(
            <>
              The position changed hands, from {who(ctx.transfer?.fromAddress)} to {who(ctx.transfer?.toAddress)}.
            </>,
          ),
        );
        out.push(cont(<> The debt and the collateral stayed as they were.</>));
      }
      break;
    }

    case "redemption": {
      const cleared = ctx.debtClearedFromReadings;
      out.push(
        clause(
          <>
            The line&rsquo;s Transmuter redeemed {shown(raw.amount, sym)} across every open position at once, when a
            staker claimed a matured deposit; nobody holding this position acted.
          </>,
        ),
      );
      // What it did HERE: this position's readings either side of it,
      // subtracted (rails-ops decisions/0032). A stated ZERO says so in its own
      // words; an unavailable figure adds no bullet at all, which is the only
      // thing that keeps the two apart.
      if (cleared?.status === "stated" && cleared.amountRaw != null) {
        if (cleared.amountRaw === "0") {
          out.push(
            clause(
              <>
                It cleared none of this position&rsquo;s debt and took none of its collateral: the readings either side
                of it match.
              </>,
            ),
          );
        } else if (collateralTakenRaw != null && collateralTakenRaw !== "0") {
          out.push(
            clause(
              <>
                Here it cleared {shown(cleared.amountRaw, sym)} of debt set aside for repayment and took{" "}
                {shown(collateralTakenRaw, myt)} of collateral, measured from this position&rsquo;s readings either side
                of it.
              </>,
            ),
          );
          const net = opts.redemptionNet;
          const fee = net && net.status === "stated" ? net.fee : null;
          const pct = fee ? `${(fee.bps / 100).toLocaleString("en-US")}%` : null;
          out.push(
            clause(
              fee ? (
                <>
                  {shown(fee.sharesRaw, myt)} of those are the line&rsquo;s {pct} redemption fee, which the Alchemist
                  charges on every redemption on top of the shares the Transmuter gets and pays to Alchemix&rsquo;s fee
                  receiver. The rest went to the Transmuter, which pays its stakers in them.
                </>
              ) : (
                <>Those {myt} went to the Transmuter, which pays its stakers in them.</>
              ),
            ),
          );
          if (net && net.status === "stated" && opts.underlyingSymbol) {
            const under = opts.underlyingSymbol;
            const netN = Number(net.netRaw) / WAD;
            const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNumber(Math.abs(v))}`;
            const feeN = fee ? Number(fee.valueRaw) / WAD : null;
            const restN = net.restRaw != null ? Number(net.restRaw) / WAD : null;
            // The averaging remainder is named only above the share price's
            // own rounding: a tenth of a basis point of the debt cleared.
            const clearedN = Number(net.clearedRaw) / WAD;
            const restShows = restN != null && Math.abs(restN) >= clearedN * 1e-5;
            out.push(
              clause(
                <>
                  At this block&rsquo;s share price the shares taken were worth{" "}
                  {(Number(net.takenValueRaw) / WAD).toLocaleString("en-US", { maximumSignificantDigits: 6 })} {under},
                  so the net for this position, the debt cleared (one {under} per {sym}) less that value, is{" "}
                  <H>
                    {signed(netN)} {under}
                  </H>
                  .
                  {feeN != null && pct ? (
                    restShows && restN != null ? (
                      <>
                        {" "}
                        The {pct} fee is {signed(-feeN)} {under} of it. The other {signed(restN)} {under} is how the
                        Alchemist charges a position: at the line&rsquo;s average shares per unit of debt across every
                        redemption since this position&rsquo;s own last event, while the share price moved between them.
                      </>
                    ) : (
                      <> That is the {pct} fee.</>
                    )
                  ) : null}
                </>,
              ),
            );
          }
        } else {
          out.push(
            clause(
              <>
                Here it cleared {shown(cleared.amountRaw, sym)} of debt set aside for repayment, measured from this
                position&rsquo;s readings either side of it, and took {myt} from the collateral for it, including the
                line&rsquo;s redemption fee.
              </>,
            ),
          );
        }
      }
      // Set aside also grows every block, so this redemption's own clearing is
      // rarely the whole story behind its before/after move (rails-ops
      // decisions/0032). Stated once here, with both figures, rather than left
      // to the position card's general caveat.
      if (cleared?.status === "stated" && cleared.amountRaw != null && cleared.amountRaw !== "0") {
        const before = opts.readingBefore;
        const at = ctx.stateAtBlockFromReading;
        if (before?.earmarkedRaw != null && at?.status === "stated" && at.earmarkedRaw != null) {
          const grew = BigInt(at.earmarkedRaw) - BigInt(before.earmarkedRaw) + BigInt(cleared.amountRaw);
          if (grew > BigInt(1)) {
            out.push(
              clause(
                <>
                  Set aside for repayment moved by more than the {shown(cleared.amountRaw, sym)} cleared here: another{" "}
                  {amount(grew.toString())} {sym} matured into it since the reading before this one.
                </>,
              ),
            );
          }
        }
      }
      if (raw.swept !== "true") {
        out.push(
          clause(
            <>
              No reading has been taken from the contract past this point yet, so the figures above do not cover this
              event.
            </>,
          ),
        );
      }
      break;
    }

    case "batch_liquidated":
      out.push(
        clause(
          <>
            Nobody here did this: {who(raw.liquidator)} liquidated a batch of positions at once, taking{" "}
            {shown(raw.amount, myt)} across all of them.
          </>,
        ),
      );
      out.push(
        cont(
          <>
            {" "}
            The list of positions arrives as a single hash, so which of them were in it, and whether this one was,
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
      out.push(cont(<> It names no position, and sits here because it falls inside this one&rsquo;s life.</>));
      break;

    default:
      break;
  }

  return out;
}

/** The one reading caveat that belongs to a single card: its block holds more
 *  of this position's events than the card draws, so the reading is where the
 *  position stood after all of them. The caveats that hold for every card
 *  (the figures are readings, collateral is a share count, set-aside grows
 *  between readings) are said once, on the position card's Explanation pane
 *  and in its "About this position" modal, and on each figure's receipt.
 *
 *  `legCount` is how many of this position's logs the card draws. */
export function alchemixReadingClauses(
  state: AlchemixStateAtBlockFromReading | undefined,
  legCount: number,
): ClauseInput[] {
  if (!state || state.status !== "stated" || state.blockNumber == null) return [];
  const inBlock = state.positionEventsInBlock;
  if (inBlock <= legCount) return [];
  return [
    clause(
      <>
        {inBlock} of this position&rsquo;s events landed in that block, more than this card draws, so the figures are
        where it stood after the last of them.
      </>,
    ),
  ];
}

/** The kinds that leave set-aside where `_earmark` put it: what a card made of
 *  these alone shows moving there built up between the two readings. */
const LEAVES_SET_ASIDE = new Set(["deposit", "mint", "withdraw", "transfer"]);

/** "4 days and 21 hours", "3 hours", "2 seconds": the span between two block
 *  times, in its largest whole unit, with the hours beside a day count under
 *  ten so a span just short of a day boundary is not rounded away. */
function spanWords(seconds: number): string {
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (seconds < 60) return unit(Math.max(0, Math.round(seconds)), "second");
  if (seconds < 3600) return unit(Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return unit(Math.floor(seconds / 3600), "hour");
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days < 10 && hours > 0 ? `${unit(days, "day")} and ${unit(hours, "hour")}` : unit(days, "day");
}

/** What moved between the reading before this card and the reading at its
 *  block that the transaction did not move: set-aside, as Transmuter stakes
 *  matured, and the vault's share price, where it moved collateralisation. Only
 *  on a card whose legs leave set-aside alone; a redemption states its own. */
export function alchemixBetweenReadingsClauses(
  legs: AlchemistEvent[],
  before: AlchemixReading | null | undefined,
  unit: { symbol: string | null; decimals: number | null },
): ClauseInput[] {
  if (!before || legs.length === 0) return [];
  if (!legs.every((l) => LEAVES_SET_ASIDE.has(l.context.data.eventType))) return [];
  const at = legs.find((l) => l.context.data.stateAtBlockFromReading?.status === "stated")?.context.data
    .stateAtBlockFromReading;
  if (!at || at.status !== "stated" || at.blockNumber == null || at.blockNumber <= before.blockNumber) return [];
  const lead = legs[0];
  const sym = lead.context.data.syntheticSymbol;
  const span = before.timestamp != null ? spanWords(lead.timestamp - before.timestamp) : null;
  const kinds = new Set(legs.map((l) => l.context.data.eventType).filter((k) => k !== "transfer"));
  const act =
    kinds.size === 1 && kinds.has("deposit")
      ? "this deposit"
      : kinds.size === 1 && kinds.has("mint")
        ? "this mint"
        : kinds.size === 1 && kinds.has("withdraw")
          ? "this withdrawal"
          : "this transaction";
  const out: ClauseInput[] = [];
  if (at.earmarkedRaw != null && before.earmarkedRaw != null) {
    const grew = BigInt(at.earmarkedRaw) - BigInt(before.earmarkedRaw);
    if (grew > BigInt(1)) {
      out.push(
        clause(
          <>
            Set aside rose {formatCompact(Number(grew) / WAD).display} {sym}{" "}
            {span ? <>in the {span} since the previous card</> : <>since the previous card</>}, as Transmuter stakes
            matured; {act} did not move it.
          </>,
        ),
      );
    }
  }
  // The share price's part of the collateralisation move: the collateral
  // before, revalued at this block's price, over the debt before.
  const dec = unit.decimals;
  if (
    dec != null &&
    before.sharePriceRaw != null &&
    at.sharePriceRaw != null &&
    before.collateralRaw != null &&
    before.debtRaw != null &&
    BigInt(before.debtRaw) > BigInt(0) &&
    before.sharePriceRaw !== at.sharePriceRaw
  ) {
    const p0 = Number(before.sharePriceRaw) / 10 ** dec;
    const p1 = Number(at.sharePriceRaw) / 10 ** dec;
    const points = ((Number(before.collateralRaw) / WAD) * (p1 - p0) * 100) / (Number(before.debtRaw) / WAD);
    if (Math.abs(points) >= 0.005) {
      const digits = Math.min(dec, 6);
      const price = (p: number) =>
        p.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
      out.push(
        clause(
          <>
            {span ? <>Over the same {span}</> : <>Since the previous card</>} the vault&rsquo;s share price{" "}
            {p1 > p0 ? "rose" : "fell"} from {price(p0)} to {price(p1)} {unit.symbol ?? "in the asset underneath"},
            which moved collateralisation {points > 0 ? "up" : "down"} by about{" "}
            {Math.abs(points).toLocaleString("en-US", { maximumFractionDigits: 2 })} points.
          </>,
        ),
      );
    }
  }
  return out;
}
