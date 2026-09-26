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
// THE READING'S CAVEATS ARE BULLETS HERE, not a paragraph on the card face.
// `alchemixReadingClauses` at the foot of this file carries what the grid's
// note used to say out loud: that the figures are read rather than accumulated,
// how many events the one reading covers, which unit its collateral is in, and
// that an earmarked figure is true at its block and at no other. Every one of
// them is also on the receipt of the figure it governs.

import type {
  AlchemixStateAtBlockFromReading,
  AlchemixV3Context,
  BaseActivityEvent,
} from "@/lib/shared/types/event-shape";
import { clause, cont, type ClauseInput } from "@/lib/shared/explainer-prose";
import { shortAddr } from "@/lib/shared/format-event";
import { formatNumber } from "@/lib/utils/format";

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

const who = (addr: string | null | undefined): string => (addr ? shortAddr(addr) : "an address the log does not name");

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
      The position was handed to {who(path.via)} and back inside this one transaction, so nobody&rsquo;s ownership of it
      changed.
    </>,
  );
}

/** How a leg's bullets change when its card carries the whole transaction. */
export interface AlchemixClauseOptions {
  /** This leg shares its card with the other legs of its transaction, so a
   *  bullet pointing at one of them repeats what is already on the card. */
  combined?: boolean;
  /** The reading's own bullets say collateral is a share count, so the deposit
   *  bullet's continuation saying the same thing is dropped. */
  skipShareUnit?: boolean;
  /** This leg is a hop of a custody ROUND TRIP, which the card narrates once
   *  (`alchemixCustodyRoundTripClause`) rather than once per hop. */
  skipCustody?: boolean;
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
  const { combined = false, skipShareUnit = false, skipCustody = false, underlyingDecimals = null } = opts;
  const raw = ctx.raw;
  const sym = ctx.syntheticSymbol;
  const out: ClauseInput[] = [];

  switch (ctx.eventType) {
    case "deposit":
      out.push(clause(<>The position took in {amount(raw.amount)} vault shares as collateral.</>));
      if (!skipShareUnit) {
        out.push(cont(<> Collateral is held as shares in the vault, not as the asset underneath it.</>));
      }
      // The cross-reference back to the narrator, so two SEPARATE cards read as
      // one act without either of them losing its own receipt. On one card the
      // mint is a bullet away and the sentence says nothing.
      if (!combined && openingInTx(siblings, ctx.tokenId)) {
        out.push(clause(<>This is the deposit that funded the position minted in this same transaction.</>));
      }
      break;

    case "withdraw":
      out.push(clause(<>{amount(raw.amount)} vault shares left the position.</>));
      out.push(cont(<> They went to {who(raw.recipient)}.</>));
      break;

    case "mint":
      out.push(
        clause(
          <>
            The position minted {amount(raw.amount)} {sym} against its collateral, which is what its debt is owed in.
          </>,
        ),
      );
      out.push(
        cont(
          <>
            {" "}
            The {sym} went to {who(raw.recipient)}.
          </>,
        ),
      );
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
        credit != null
          ? cont(
              <>
                {" "}
                That cleared {amount(credit)} {sym} of debt. The shares are worth what they are worth at this moment,
                and the amount cleared stops at whichever is smaller, the position&rsquo;s debt or the line&rsquo;s.
              </>,
            )
          : cont(
              <>
                {" "}
                How much debt that cleared is not stated here, so this card does not give a figure for it rather than
                give the wrong one.
              </>,
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
      out.push(cont(<> The debt this cleared is not in the log, so no figure for it is given.</>));
      break;

    case "liquidated":
      out.push(
        clause(
          <>
            {who(raw.liquidator)} liquidated this position, taking {amount(raw.amount)} vault shares from it.
          </>,
        ),
      );
      {
        const fee = underlying(raw.fee_in_underlying, underlyingDecimals);
        out.push(
          cont(
            fee != null ? (
              <>
                {" "}
                The liquidator was paid {amount(raw.fee_in_yield)} shares and {fee} of the asset underneath for doing
                it.
              </>
            ) : (
              <>
                {" "}
                The liquidator was paid {amount(raw.fee_in_yield)} shares for doing it, and a further amount of the
                asset underneath which is not stated here: what that asset is, and the decimals its figure is in, come
                from a reading of this position, and none has been taken.
              </>
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
              A repayment fee went to {who(raw.fee_receiver)}: {amount(raw.fee_in_yield)} vault shares and {fee} of the
              asset underneath.
            </>
          ) : (
            <>
              A repayment fee went to {who(raw.fee_receiver)}: {amount(raw.fee_in_yield)} vault shares, and an amount of
              the asset underneath which is not stated here — its decimals come from a reading of this position, and
              none has been taken.
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
            ? { node: <>funded with {amount(opening.depositRaw)} vault shares</> }
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
          <> That first address is a step inside the one transaction, not somebody who held the position.</>
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
              opening rather than a change of owner later on.
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
        out.push(cont(<> Nothing about the debt or the collateral moved; only who owns them did.</>));
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
        raw.swept === "true"
          ? clause(<>The figures for this position have since been taken from the contract past this point.</>)
          : clause(
              <>
                No reading has been taken from the contract past this point yet, so the figures above do not cover this
                event.
              </>,
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

/** What the card's reading is, said where a reader goes for an explanation
 *  rather than over the figures themselves.
 *
 *  FOUR FACTS, AND EACH IS ALSO ON A RECEIPT. Decision 0032 requires all of
 *  them wherever the reading is shown; none may be dropped, and none earns the
 *  loudest place on the card:
 *    • the figures are READ at a block, never accumulated from the timeline:
 *      a redemption moves debt line-wide and names no position, so the events
 *      cannot reach them;
 *    • one reading covers every one of this position's events in its block, so
 *      a reader can find out when it covers more than the card does;
 *    • collateral there is the MYT share count, while the panel above the
 *      timeline leads with the asset underneath;
 *    • earmarked is true at its block and at no other (point 6).
 *
 *  `legCount` is how many of this position's logs the card draws. Above the
 *  reading's own `positionEventsInBlock` it cannot go; below it, the block
 *  holds events this card does not cover and the bullet says so. */
export function alchemixReadingClauses(
  state: AlchemixStateAtBlockFromReading | undefined,
  legCount: number,
): ClauseInput[] {
  if (!state || state.status !== "stated" || state.blockNumber == null) return [];
  const at = state.blockNumber.toLocaleString("en-US");
  const inBlock = state.positionEventsInBlock;
  const out: ClauseInput[] = [];

  out.push(
    clause(
      <>The figures above are one reading of the Alchemist at block {at}, not the events on this page added up.</>,
    ),
  );
  // Instance-bound on purpose (the explanation-copy charter's register gate):
  // the sentence is about what THIS line's redemptions did to THIS position's
  // figures, not a rule about redemptions.
  out.push(
    cont(
      <>
        {" "}
        A redemption on this line moves every open position&rsquo;s debt at once and names none of them, so this
        position&rsquo;s own events cannot reach these figures.
      </>,
    ),
  );

  if (inBlock > legCount) {
    out.push(
      clause(
        <>
          {inBlock} of this position&rsquo;s events landed in that block, more than this card draws, so the reading is
          where it stood after the last of them.
        </>,
      ),
    );
  } else if (legCount > 1) {
    out.push(
      clause(
        <>
          The {legCount} logs on this card came in one transaction, and the one reading at its block covers all of them.
        </>,
      ),
    );
  }

  out.push(clause(<>Collateral in the reading is the vault share count.</>));
  out.push(
    cont(
      <>
        {" "}
        The panel above the timeline leads with the asset underneath instead, so the word carries two units on this
        page.
      </>,
    ),
  );

  if (state.earmarkedRaw != null) {
    out.push(
      clause(
        <>
          The amount set aside for repayment grows every block, so that figure is true at block {at} and at no other.
        </>,
      ),
    );
  }

  return out;
}
