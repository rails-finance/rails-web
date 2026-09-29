// Frankencoin plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the position looks
// like AFTER this event), never on the event type alone: a repay that clears the
// debt, a repay that leaves debt standing, a withdraw that empties the
// collateral all read differently though they share a kind. The state-blind
// morals the old bullets carried ("More collateral raises what the declared
// price can back" stays — it is a mechanic; but "keeps it clear of…" style
// consequence morals are gone) give way to facts about THIS event's own figures.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the open card — the moved amounts on the header (the
// MintingUpdate deltas, the challenge / forced-sale slice figures) and the
// after-absolutes + declared price on the detail grid. Frankencoin has NO
// same-transaction sibling seam (each position is its own contract, narrated by
// its own card), so there are no cross-scope primaries here — every figure has an
// on-card twin, so every bolded figure is an echo.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Frankencoin cannot fill, each a data fact of its pipeline:
//   • §5.1 (risk consequence per event): Frankencoin runs NO price oracle and no
//     health factor exists. The declared liquidation price is on the row, but the
//     mint ceiling / utilisation that would let a "distance to the line" be drawn
//     is a head-overlay figure, not carried on the event — so no per-event
//     ratio-vs-threshold is computed (stated as before→after figures only).
//   • §5.2 (mechanic-why on fees): stated where the event exhibits one — the
//     reserve contribution (held back at mint, released on repay) and interest
//     charged up front at minting. Frankencoin charges no ongoing accrual.
//   • §5.4 (derived net-outcome): only a succeeded challenge slice carries both a
//     ZCHF bid and the collateral acquired, so the effective price is derived
//     there; a forced sale emits only the collateral amount (no proceeds), so no
//     net-outcome figure exists to derive on it.
// Filled: forward paths (§5.3) on denied / expired-forced-sale / price-raise
// cooldown / collateral-only; the reserve + up-front-interest mechanic (§5.2);
// the challenge slice's effective price (§5.4); the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
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
  changeProv,
  mintedAfterProv,
  collateralAfterProv,
  liqPriceAfterProv,
  challengeFigureProv,
  forcedSaleProv,
  receiptLegProv,
  type FrankencoinCoords,
  type FrankencoinReceiptLeg,
} from "@/lib/frankencoin/event-provenance";
import { hubAddress, shortAddress } from "@/lib/frankencoin/asset-catalog";
import { fmtFcColl, fmtFcPct, fmtFcPrice, fmtZchf } from "@/lib/frankencoin/figures";
import type { FrankencoinZchfSplit } from "@/lib/frankencoin/use-event-read";
import { formatDate } from "@/lib/date";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { AmountText } from "@/components/shared/amount-text";

/** The dust epsilon — a balance below this is treated as zero. */
const FC_EPS = 1e-9;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

// ── resulting state ──────────────────────────────────────────────────────────

interface FrankencoinResultingState {
  colAfter: number;
  debtAfter: number;
  hasCol: boolean;
  hasDebt: boolean;
  collateralOnly: boolean;
  closed: boolean;
  debtCleared: boolean;
}

function resultingState(ctx: FrankencoinContext): FrankencoinResultingState {
  const colAfter = ctx.collateral != null ? num(ctx.collateral) : 0;
  const debtAfter = ctx.minted != null ? num(ctx.minted) : 0;
  const hasCol = colAfter > FC_EPS;
  const hasDebt = debtAfter > FC_EPS;
  return {
    colAfter,
    debtAfter,
    hasCol,
    hasDebt,
    collateralOnly: hasCol && !hasDebt,
    closed: !hasCol && !hasDebt,
    debtCleared: !hasDebt,
  };
}

// ── figure rendering ─────────────────────────────────────────────────────────

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

/** Etherscan address link, click-isolated from the card — a muted counterparty,
 *  never bolded (an address is not a chrome-mirrored figure). */
function Addr({ address }: { address: string }) {
  return (
    <a
      href={explorerUrl(MAINNET_CHAIN_ID, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {shortAddress(address)}
    </a>
  );
}

// ── the variant table ────────────────────────────────────────────────────────

/** What the explainer knows beyond the row: the receipt's ZCHF split, once
 *  read. Absent while it loads (the lead never needs it). */
export interface FrankencoinExplainerExtras {
  split?: FrankencoinZchfSplit | null;
  /** The event's unix time, for the dates a price raise sets. */
  timestamp?: number;
}

export function frankencoinEventSlots(
  ctx: FrankencoinContext,
  coords: FrankencoinCoords,
  extras: FrankencoinExplainerExtras = {},
): EventProseSlots {
  const sym = ctx.collateralSymbol;
  const dec = ctx.collateralDecimals;
  const rs = resultingState(ctx);
  const showColl = !ctx.collateralUnderstated && ctx.collateral != null;
  const split = extras.split ?? null;

  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : null;
  const dColl =
    !ctx.collateralUnderstated && ctx.collateral != null && ctx.collateralBefore != null
      ? num(ctx.collateral) - num(ctx.collateralBefore)
      : null;
  const priceBefore = ctx.liqPriceBefore != null ? num(ctx.liqPriceBefore) : null;
  const priceAfter = ctx.liqPrice != null ? num(ctx.liqPrice) : null;
  const priceMoved = priceBefore != null && priceAfter != null && priceBefore !== priceAfter;
  const raised = priceMoved && (priceAfter as number) > (priceBefore as number);
  const isClone = ctx.original != null && ctx.original !== ctx.position;

  // Delta figures echo the header's per-axis receipt (changeProv + the header's
  // own value key: a BARE magnitude on the labeled open/adjust axes, a SIGNED one
  // on a close's unlabeled deltas).
  const mintDeltaFig = (value: number, labeled: boolean) => (
    <Fig info={changeProv("minted", sym, coords)} value={chainTruthDeltaValue(value, labeled)} symbol="ZCHF">
      {fmtZchf(value)} ZCHF
    </Fig>
  );
  const collDeltaFig = (value: number, labeled: boolean) => (
    <Fig info={changeProv("collateral", sym, coords)} value={chainTruthDeltaValue(value, labeled)} symbol={sym}>
      {fmtFcColl(value)} {sym}
    </Fig>
  );
  // After-absolutes echo the detail grid's after-value receipt: the grid states
  // each lane at its unit's precision (lib/frankencoin/figures.ts) and passes no
  // symbol, so these echoes use the same formatter and omit `symbol` too — the
  // key matches byte-for-byte and the figure pulse-links to its grid twin.
  const mintAfterFig = () => (
    <Fig info={mintedAfterProv(coords, ctx.raw?.minted)} value={fmtZchf(num(ctx.minted))}>
      {fmtZchf(num(ctx.minted))} ZCHF
    </Fig>
  );
  const collAfterFig = () => (
    <Fig info={collateralAfterProv(sym, coords, ctx.raw?.collateral)} value={fmtFcColl(num(ctx.collateral))}>
      {fmtFcColl(num(ctx.collateral))} {sym}
    </Fig>
  );
  const liqPriceAfterFig = () => (
    <Fig info={liqPriceAfterProv(sym, dec, coords, ctx.raw?.price)} value={fmtFcPrice(num(ctx.liqPrice))}>
      {fmtFcPrice(num(ctx.liqPrice))} ZCHF/{sym}
    </Fig>
  );
  // A receipt figure: muted like any figure without an on-card twin.
  const legFig = (leg: FrankencoinReceiptLeg, n: number) => (
    <Prov info={receiptLegProv(leg, coords, String(n))} value={fmtZchf(n)} symbol="ZCHF">
      <strong className="font-semibold text-foreground">{fmtZchf(n)} ZCHF</strong>
    </Prov>
  );
  const who = (addr: string | null | undefined): ReactNode =>
    addr && ctx.txFrom && addr === ctx.txFrom ? "The owner" : addr ? <Addr address={addr} /> : "The wallet";

  // The V1 clone-creation caveat (charter §2 misleading-figure exception): the
  // recorded collateral figure understates reality, so no amount is shown — said
  // in plain words, naming no machinery.
  const understatedCaveat = (): ClauseInput =>
    ctx.collateralUnderstated
      ? clause(
          <>
            The collateral figure recorded for this event understates the real balance — a known quirk of V1 clone
            creation — so no collateral amount is shown for it. The current balance at the top of the page is correct.
          </>,
        )
      : null;

  // What a mint paid out, from the receipt; the mechanic in words while the
  // receipt is not read.
  const mintSplit = (): ClauseInput =>
    split?.received != null
      ? clause(
          <>
            {who(split.receivedBy)} received {legFig("received", split.received)}
            {split.reserveShare != null && dMint != null && dMint > 0 && (
              <>
                ; {legFig("reserveShare", split.reserveShare)} ({fmtFcPct(split.reserveShare / dMint)}) stayed in the
                system reserve as this position&rsquo;s reserve share
              </>
            )}
            {split.interest != null && (
              <>
                {split.reserveShare != null ? ", and " : "; "}
                {legFig("interest", split.interest)} paid the interest for the remaining term up front
              </>
            )}
            .
          </>,
        )
      : clause(
          <>
            The wallet receives the minted amount less the position&rsquo;s reserve share and the interest for the
            remaining term, both taken at minting.
          </>,
        );

  // What a repayment cost the payer, from the receipt; the release rule in
  // words while it is not read.
  const repaySplit = (): ClauseInput =>
    split?.paid != null
      ? clause(
          <>
            {who(split.payer)} paid {legFig("paid", split.paid)}
            {split.reserveReturned != null && split.reserveReturned > 0 && (
              <>
                ; the other {legFig("reserveReturned", split.reserveReturned)} was this position&rsquo;s reserve share,
                which the system reserve released
              </>
            )}
            .
          </>,
        )
      : clause(
          <>
            Repaying releases the position&rsquo;s reserve share for the amount repaid: in full while the system reserve
            covers every position&rsquo;s share, in proportion when losses have drawn it down.
          </>,
        );

  // What the declared price allows now: collateral × price is the most debt
  // the position may carry.
  const ceilingClause = (): ClauseInput => {
    if (!showColl || priceAfter == null || ctx.minted == null) return null;
    const ceiling = num(ctx.collateral) * priceAfter;
    const debt = num(ctx.minted);
    const exact = Math.abs(ceiling - debt) < 0.005;
    return clause(
      <>
        At that price {collAfterFig()} backs up to {fmtZchf(ceiling)} ZCHF of debt
        {exact ? (
          <>, exactly the debt it carries.</>
        ) : ceiling > debt ? (
          <>
            , {fmtZchf(ceiling - debt)} ZCHF more than the {mintAfterFig()} it carries.
          </>
        ) : (
          <>, against the {mintAfterFig()} it carries.</>
        )}
      </>,
    );
  };

  // The price move's consequence: a raise pauses minting three days, a cut
  // applies at once.
  const priceRule = (): ClauseInput =>
    !priceMoved
      ? null
      : raised
        ? clause(
            <>
              A raise pauses minting for three days,{" "}
              {extras.timestamp != null && <>here until {formatDate(extras.timestamp + 3 * 86400)}, </>}so the new price
              can be challenged before it backs new ZCHF.
            </>,
          )
        : clause(<>The lower price took effect at once; no cooldown started.</>);

  switch (ctx.eventType) {
    case "open":
    case "clone": {
      const cloneRow = ctx.eventType === "clone";
      const openColl = showColl ? num(ctx.collateral) : 0;
      const openMint = num(ctx.minted);
      const lede = cloneRow ? (
        <>
          This position was cloned from {ctx.original ? <Addr address={ctx.original} /> : "an existing position"}: a new
          position contract with its own collateral and debt
        </>
      ) : (
        <>This position opened</>
      );
      const opening =
        openColl > 0 && openMint > 0 ? (
          <>
            {lede}, with {collDeltaFig(openColl, true)} of collateral, minting {mintDeltaFig(openMint, true)}.
          </>
        ) : openColl > 0 ? (
          <>
            {lede}, with {collDeltaFig(openColl, true)} of collateral.
          </>
        ) : openMint > 0 ? (
          <>
            {lede}, minting {mintDeltaFig(openMint, true)}.
          </>
        ) : (
          <>{lede}.</>
        );
      const declaredPrice: ClauseInput =
        ctx.liqPrice != null ? clause(<>The owner declared a liquidation price of {liqPriceAfterFig()}.</>) : null;
      const lifecycleMechanic = cloneRow
        ? clause(
            <>
              It uses the original&rsquo;s terms (interest rate, reserve share, challenge period, an expiry no later
              than the original&rsquo;s) and shares its minting limit. An original waits out a veto window before it can
              mint; a clone skips it.
            </>,
          )
        : clause(
            <>
              As a new original position it first waits out a veto window of at least three days, chosen by the owner,
              in which holders of more than 1% of the governance votes (FCS, or the FPS it wraps) can deny it.
            </>,
          );
      return {
        happened: [clause(opening)],
        changed: [declaredPrice],
        meansNow: [
          lifecycleMechanic,
          clause(
            <>
              Frankencoin runs no price oracle: the liquidation price is the owner&rsquo;s declaration, and a challenge
              auction is what tests it.
            </>,
          ),
          openMint > 0 ? mintSplit() : null,
          understatedCaveat(),
        ],
      };
    }

    case "mint": {
      const delta = dMint ?? num(ctx.minted);
      const firstDebt = dMint != null && Math.abs(num(ctx.minted) - dMint) <= FC_EPS;
      const happened = firstDebt ? (
        <>Minted {mintDeltaFig(delta, true)}, the position&rsquo;s first debt.</>
      ) : (
        <>
          Minted {mintDeltaFig(delta, true)}, taking its debt to {mintAfterFig()}.
        </>
      );
      return { happened: [clause(happened)], meansNow: [mintSplit()] };
    }

    case "repay": {
      const delta = dMint ?? 0;
      const ending: ClauseInput =
        rs.debtCleared && !rs.hasCol
          ? cont(<>, clearing the debt in full and closing the position.</>)
          : rs.debtCleared
            ? cont(<>, clearing the debt in full; the position now holds only collateral.</>)
            : cont(<>, leaving {mintAfterFig()} of debt.</>);
      const collateralOnlyPath: ClauseInput =
        rs.debtCleared && rs.hasCol
          ? clause(<>With no debt left, the collateral can be withdrawn or left to back a future mint.</>)
          : null;
      return {
        happened: [clause(<>Repaid {mintDeltaFig(delta, true)}</>), ending],
        meansNow: [repaySplit(), collateralOnlyPath],
      };
    }

    case "add_collateral": {
      const delta = dColl ?? 0;
      return {
        happened: [
          clause(
            <>
              Added {collDeltaFig(delta, true)} of collateral, taking the position to {collAfterFig()}.
            </>,
          ),
        ],
        meansNow: [understatedCaveat()],
      };
    }

    case "withdraw_collateral": {
      const delta = dColl ?? 0;
      const changed: ClauseInput = rs.closed
        ? clause(<>That empties the position — nothing remains on either side.</>)
        : rs.collateralOnly
          ? clause(<>The position now holds {collAfterFig()} and owes nothing.</>)
          : rs.hasDebt && showColl
            ? clause(
                <>
                  That leaves {collAfterFig()} behind {mintAfterFig()} of debt.
                </>,
              )
            : null;
      return {
        happened: [clause(<>Withdrew {collDeltaFig(delta, true)} of collateral.</>)],
        changed: [changed],
        meansNow: [understatedCaveat()],
      };
    }

    case "adjust_price": {
      const happened = priceMoved ? (
        <>
          {raised ? "Raised" : "Lowered"} the declared liquidation price from {fmtFcPrice(priceBefore as number)} to{" "}
          {liqPriceAfterFig()}.
        </>
      ) : (
        <>Set the declared liquidation price to {liqPriceAfterFig()}.</>
      );
      return { happened: [clause(happened)], changed: [ceilingClause()], meansNow: [priceRule()] };
    }

    case "adjust": {
      // The contract applies an adjust in a fixed order: repay, withdraw, mint,
      // then the price. Named in that order, each axis with its own verb.
      const parts: { verb: string; rest: ReactNode }[] = [];
      if (dColl != null && dColl > 0) parts.push({ verb: "deposited", rest: collDeltaFig(dColl, true) });
      if (dMint != null && dMint < 0) parts.push({ verb: "repaid", rest: <>{mintDeltaFig(dMint, true)} of debt</> });
      if (dColl != null && dColl < 0) parts.push({ verb: "withdrew", rest: collDeltaFig(dColl, true) });
      if (dMint != null && dMint > 0) parts.push({ verb: "minted", rest: mintDeltaFig(dMint, true) });
      if (priceMoved)
        parts.push({
          verb: raised ? "raised" : "lowered",
          rest: (
            <>
              the declared liquidation price from {fmtFcPrice(priceBefore as number)} to {liqPriceAfterFig()}
            </>
          ),
        });
      const joined = parts.map((p, i) => (
        <span key={i}>
          {i === 0 ? "" : i === parts.length - 1 ? " and " : ", "}
          {i === 0 ? p.verb[0].toUpperCase() + p.verb.slice(1) : p.verb} {p.rest}
        </span>
      ));
      const first = ctx.firstState === true;
      const happened: ReactNode =
        parts.length === 0 ? (
          <>Updated the position without changing its collateral, debt or price.</>
        ) : first ? (
          <>{joined}: the position&rsquo;s first collateral and debt.</>
        ) : (
          <>{joined}, in one transaction.</>
        );
      const firstPrice: ClauseInput =
        first && ctx.liqPrice != null
          ? isClone
            ? clause(<>It started at the original&rsquo;s declared price, {liqPriceAfterFig()}.</>)
            : clause(<>The owner declared a liquidation price of {liqPriceAfterFig()}.</>)
          : null;
      const state: ClauseInput =
        !first && dMint != null && dMint !== 0 && ctx.minted != null
          ? clause(<>Its debt now stands at {mintAfterFig()}.</>)
          : null;
      const mintBeforeRaise: ClauseInput =
        dMint != null && dMint > 0 && raised
          ? clause(<>The mint came before the price change, so the old price backed it.</>)
          : null;
      return {
        happened: [clause(happened)],
        changed: [firstPrice, state, priceMoved ? ceilingClause() : null],
        meansNow: [
          dMint != null && dMint > 0 ? mintSplit() : dMint != null && dMint < 0 ? repaySplit() : null,
          priceRule(),
          mintBeforeRaise,
          understatedCaveat(),
        ],
      };
    }

    case "auction_settlement": {
      const tookColl = showColl && dColl != null && dColl < 0;
      const clearedDebt = dMint != null && dMint < 0;
      const tail: ReactNode =
        tookColl && clearedDebt ? (
          <>
            , taking {collDeltaFig(dColl as number, true)} of collateral and clearing{" "}
            {mintDeltaFig(dMint as number, true)} of debt.
          </>
        ) : tookColl ? (
          <>, taking {collDeltaFig(dColl as number, true)} of collateral.</>
        ) : clearedDebt ? (
          <>, clearing {mintDeltaFig(dMint as number, true)} of debt.</>
        ) : (
          <>.</>
        );
      const happened = <>The protocol wrote this position down as an auction settled{tail}</>;
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>
              This was the protocol&rsquo;s write-down, not an act of the owner — a challenge slice or forced sale
              settled in the same transaction.
            </>,
          ),
          understatedCaveat(),
        ],
      };
    }

    case "close":
      return {
        happened: [clause(<>Closed the position — collateral and its ZCHF debt both returned to zero.</>)],
        meansNow: [dMint != null && dMint < 0 ? repaySplit() : null],
      };

    case "denied": {
      const happened = (
        <>
          This position was denied
          {ctx.deniedBy ? (
            <>
              {" "}
              by <Addr address={ctx.deniedBy} />
            </>
          ) : null}
          {ctx.deniedMessage ? <> (&ldquo;{ctx.deniedMessage}&rdquo;)</> : null}.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>
              A veto needs more than 1% of the governance votes (FCS, or the FPS it wraps, with delegations) and is open
              only during a new original position&rsquo;s veto window.
            </>,
          ),
          clause(<>Denial disables minting permanently. The collateral stays withdrawable by the owner.</>),
        ],
      };
    }

    case "challenge_started": {
      const size = num(ctx.challengeSize);
      const happened = (
        <>
          {ctx.challenger ? <Addr address={ctx.challenger} /> : "A challenger"} challenged{" "}
          <Fig
            info={challengeFigureProv("size", "started", sym, coords, ctx.raw?.size)}
            value={chainTruthDeltaValue(size, true)}
            symbol={sym}
          >
            <AmountText value={size} /> {sym}
          </Fig>{" "}
          of this position&rsquo;s collateral.
        </>
      );
      return {
        happened: [clause(happened)],
        // The general framing (a challenge bets the declared price is too
        // high) is Layer-2 material — the "?" modal
        // (frankencoinChallengeContent) carries it.
        meansNow: [
          clause(<>The challenger posts their own {sym}, not ZCHF.</>),
          clause(
            <>
              Phase one offers that collateral at the declared price; only if nobody buys it does the position&rsquo;s
              own collateral go to a declining auction.
            </>,
          ),
        ],
      };
    }

    case "challenge_averted": {
      const size = num(ctx.challengeSize);
      const happened = (
        <>
          The challenge over{" "}
          <Fig
            info={challengeFigureProv("size", "averted", sym, coords, ctx.raw?.size)}
            value={chainTruthDeltaValue(size, true)}
            symbol={sym}
          >
            <AmountText value={size} /> {sym}
          </Fig>{" "}
          was averted.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>
              Someone bought the challenger&rsquo;s posted collateral at the declared price — the market judging the
              price fair.
            </>,
          ),
          clause(<>The position survived untouched; the challenger&rsquo;s bet lost.</>),
        ],
      };
    }

    case "challenge_succeeded": {
      const bid = num(ctx.bid);
      const acquired = num(ctx.acquiredCollateral);
      const bidFig = (
        <Fig
          info={challengeFigureProv("bid", "succeeded", sym, coords, ctx.raw?.bid)}
          value={chainTruthDeltaValue(bid, true)}
          symbol="ZCHF"
        >
          <AmountText value={bid} /> ZCHF
        </Fig>
      );
      const acquiredFig = (
        <Fig
          info={challengeFigureProv("acquiredCollateral", "succeeded", sym, coords, ctx.raw?.acquiredCollateral)}
          value={chainTruthDeltaValue(acquired, true)}
          symbol={sym}
        >
          <AmountText value={acquired} /> {sym}
        </Fig>
      );
      // §5.4 derived net-outcome: the effective price the slice cleared at (ZCHF
      // per collateral). Muted — no on-card twin, and rendered inline so the dev
      // coverage tripwire (whole-token spans only) never sees a bare figure.
      const effectivePrice: ClauseInput =
        bid > 0 && acquired > FC_EPS
          ? clause(
              <>
                That is an effective <AmountText value={bid / acquired} /> ZCHF per {sym}.
              </>,
            )
          : null;
      return {
        happened: [
          clause(
            <>
              A challenge slice succeeded: a bidder paid {bidFig} and took {acquiredFig} of the position&rsquo;s
              collateral.
            </>,
          ),
        ],
        changed: [effectivePrice],
        meansNow: [
          clause(
            <>
              The ZCHF repays the position&rsquo;s debt, the challenger earns the protocol&rsquo;s reward, and any
              shortfall is covered by the reserve.
            </>,
          ),
          // The general slicing rule ("one challenge can settle in several
          // slices") is Layer-2 material — the "?" modal
          // (frankencoinChallengeContent step 3) carries it verbatim.
          clause(
            <>
              A partial sale can leave the position standing: a challenge is an event in its life, not necessarily its
              end.
            </>,
          ),
        ],
      };
    }

    case "forced_sale": {
      const amt = num(ctx.forcedSaleAmount);
      const happened = (
        <>
          <Fig info={forcedSaleProv(sym, coords, ctx.raw?.size)} value={chainTruthDeltaValue(amt, true)} symbol={sym}>
            <AmountText value={amt} /> {sym}
          </Fig>{" "}
          of the position&rsquo;s collateral was sold in a forced sale.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>
              The position&rsquo;s expiration had passed, so anyone could clear it through the hub at a declining price;
              the proceeds repay the debt.
            </>,
          ),
          clause(<>The sale was the hub&rsquo;s clearing on the expiry clock, not an act of the owner.</>),
        ],
      };
    }

    case "ownership_transferred": {
      if (ctx.initialization) {
        const step = ctx.handoverStep;
        const steps = ctx.handoverSteps;
        const stepped = step != null && steps != null && steps > 1;
        const last = !stepped || step === steps;
        const to = ctx.newOwner;
        const isHub = to != null && to === hubAddress(ctx.hub).toLowerCase();
        const lead = stepped ? `Step ${step} of ${steps} of the position's creation: ` : "";
        const happened: ReactNode = !stepped ? (
          <>
            At creation the position contract was handed to {to ? <Addr address={to} /> : "its owner"}
            {isHub ? ", the MintingHub" : ", the owner the position was created for"}.
          </>
        ) : ctx.previousOwner === ZERO_ADDR || !ctx.previousOwner ? (
          <>
            {lead}the new position contract starts out owned by{" "}
            {isHub ? <>the MintingHub ({to ? <Addr address={to} /> : null}), which creates it</> : null}
            {!isHub && to ? <Addr address={to} /> : null}.
          </>
        ) : last ? (
          <>
            {lead}ownership reached {to ? <Addr address={to} /> : "the owner"}, the owner the position was created for
            {to && ctx.txFrom === to ? ", who sent this transaction" : ""}.
          </>
        ) : (
          <>
            {lead}ownership passed to {to ? <Addr address={to} /> : "an intermediate owner"}, which held it within the
            creation transaction.
          </>
        );
        return {
          happened: [clause(happened)],
          meansNow: [
            !last && ctx.handoverOwner
              ? clause(
                  <>
                    The position ends this transaction owned by <Addr address={ctx.handoverOwner} />.
                  </>,
                )
              : null,
            clause(
              <>
                {stepped ? "These handovers are" : "This handover is"} part of creating the position, not a sale or a
                transfer between holders.
              </>,
            ),
          ],
        };
      }
      return {
        happened: [
          clause(
            <>
              The position changed owners
              {ctx.previousOwner ? (
                <>
                  {" "}
                  from <Addr address={ctx.previousOwner} />
                </>
              ) : null}
              {ctx.newOwner ? (
                <>
                  {" "}
                  to <Addr address={ctx.newOwner} />
                </>
              ) : null}
              .
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              A position is a contract of its own, so ownership is a transferable fact this explorer follows through
              every transfer.
            </>,
          ),
        ],
      };
    }

    default:
      return { happened: [] };
  }
}

/** The teaser = the lead of the composed arc (the first sentence plus any
 *  trailing continuations). */
export function frankencoinExplainerTeaser(
  ctx: FrankencoinContext,
  coords: FrankencoinCoords,
  timestamp?: number,
): ReactNode | null {
  return splitLead(eventClauses(frankencoinEventSlots(ctx, coords, { timestamp }))).lead;
}
