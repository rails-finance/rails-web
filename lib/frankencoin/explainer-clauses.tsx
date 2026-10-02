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
// Filled: forward paths (§5.3) on denied / expired-forced-sale / price-raise
// cooldown / collateral-only; the reserve + up-front-interest mechanic (§5.2);
// the net outcome (§5.4) of a challenge slice (its cleared price) and of a
// forced sale (its price on the expiry curve and where the payment went, from
// the receipt); the highlight rule (§5.6) via Fig.

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
  challengeReceiptProv,
  type FrankencoinCoords,
  type FrankencoinReceiptLeg,
  type FrankencoinChallengeLeg,
} from "@/lib/frankencoin/event-provenance";
import { hubAddress, shortAddress } from "@/lib/frankencoin/asset-catalog";
import { fmtFcColl, fmtFcPct, fmtFcPrice, fmtZchf, groupExact } from "@/lib/frankencoin/figures";
import type { FrankencoinEventRead, FrankencoinZchfSplit } from "@/lib/frankencoin/use-event-read";
import type { FrankencoinOpeningRead } from "@/lib/sources/chain/frankencoin-event";
import {
  challengeKey,
  dateTimeText,
  phaseText,
  spanText,
  type FrankencoinPageFacts,
} from "@/lib/frankencoin/page-facts";
import { fmtMultiple, forcedCurvePoint, gapText, periodAfterExpiry, termText } from "@/lib/frankencoin/figures";
import { formatDate } from "@/lib/date";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { AmountText } from "@/components/shared/amount-text";

/** Who holds the governance votes, glossed where a veto is named. */
const VOTES_GLOSS = (
  <>The votes come with FPS, Frankencoin&rsquo;s pool shares (its equity), and with FCS, which wraps FPS.</>
);

const NO_ORACLE = clause(
  <>
    Frankencoin runs no price oracle: the liquidation price is the owner&rsquo;s declaration, and a challenge auction is
    what tests it.
  </>,
);

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
  /** The whole receipt read (a challenge's buyer, bidder and ZCHF legs; the
   *  other positions a roll touched; a new owner's kind). */
  read?: FrankencoinEventRead | null;
  /** What the rest of the page knows: challenge starts, the phase length, the
   *  family's original, what else each transaction recorded. */
  facts?: FrankencoinPageFacts | null;
  /** The event's unix time, for the dates a price raise sets. */
  timestamp?: number;
  /** The event's id: which transaction's other rows are its siblings. */
  txHash?: string;
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
  const read = extras.read ?? null;
  const facts = extras.facts ?? null;
  const ts = extras.timestamp;

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
  const chFig = (leg: FrankencoinChallengeLeg, value: string, text: ReactNode, symbol?: string) => (
    <Prov info={challengeReceiptProv(leg, sym, coords, value)} value={value} symbol={symbol}>
      <strong className="font-semibold text-foreground">{text}</strong>
    </Prov>
  );
  const scaled = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;
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
  const mintGross = dMint != null && dMint > 0 ? dMint : num(ctx.minted);
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
                {legFig("interest", split.interest)} paid the interest up front
                {split.ratePct != null ? (
                  <>
                    : {split.ratePct.toFixed(2)}% a year, the rate in force at this block
                    {split.minimumTerm ? (
                      <>, for 28 days: Hub V1 charges at least 4 weeks, and fewer were left to expiry</>
                    ) : split.termDays != null ? (
                      <>, for the {termText(split.termDays)} left to expiry</>
                    ) : null}
                    {mintGross > 0 ? <>, {((split.interest / mintGross) * 100).toFixed(2)}% of the mint</> : null}
                  </>
                ) : (
                  <> for the remaining term</>
                )}
              </>
            )}
            .
            {split.interest != null && split.interest > 0 && (
              <> The interest went to the system reserve as equity, owned by FPS holders.</>
            )}
          </>,
        )
      : clause(
          <>
            The wallet receives the minted amount less the position&rsquo;s reserve share and the interest for the
            remaining term, both taken at minting.
          </>,
        );

  // A roll: the same transaction emptied another position through the hub's
  // roller, which the mint paid for.
  const rollClause = (): ClauseInput => {
    const emptied = read?.otherPositions.filter((o) => o.emptied) ?? [];
    if (!read || emptied.length !== 1) return null;
    return clause(
      <>
        The same transaction {read.viaRoller ? "ran through the hub’s roller and " : ""}repaid and emptied position{" "}
        <Addr address={emptied[0].position} />: a roll of that position into this one, paid for with this mint.
      </>,
    );
  };

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
        {debt <= FC_EPS ? (
          <>; it carries no debt.</>
        ) : exact ? (
          <>, the debt it carries.</>
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

  // The latest raise before this event and the end of its pause (PositionV1/V2
  // `adjustPrice`: a raise pushes `cooldown` three days out; a lower never
  // shortens it; minting and withdrawals revert while it runs).
  const RAISE_PAUSE = 3 * 86400;
  const lastRaise = ts != null ? [...(facts?.priceRaises ?? [])].reverse().find((r) => r < ts) : undefined;
  const raisePauseEnd = lastRaise != null ? lastRaise + RAISE_PAUSE : null;

  // The price move's consequence: a raise pauses minting and withdrawals three
  // days, a cut applies at once and leaves a running pause in place.
  const priceRule = (): ClauseInput =>
    !priceMoved
      ? null
      : raised
        ? clause(
            <>
              A raise pauses minting and collateral withdrawals for three days,{" "}
              {ts != null && <>here until {dateTimeText(ts + RAISE_PAUSE)}, </>}so the new price can be challenged
              before it backs new ZCHF.
            </>,
          )
        : lastRaise != null && raisePauseEnd != null && ts != null && raisePauseEnd > ts
          ? clause(
              <>
                The lower price took effect at once and started no new pause. The pause from the raise on{" "}
                {formatDate(lastRaise)} still runs to {dateTimeText(raisePauseEnd)}; lowering the price does not end it.
              </>,
            )
          : clause(<>The lower price took effect at once; no cooldown started.</>);

  // A withdrawal that came after a raise's pause: the first one since the
  // raise names when the pause ended.
  const pauseEndedClause = (): ClauseInput => {
    if (dColl == null || dColl >= 0 || lastRaise == null || raisePauseEnd == null || ts == null) return null;
    if (raisePauseEnd > ts) return null;
    if ((facts?.withdrawals ?? []).some((w) => w > lastRaise && w < ts)) return null;
    return clause(
      <>
        The pause from the raise on {formatDate(lastRaise)} ended on {dateTimeText(raisePauseEnd)}, before this
        withdrawal.
      </>,
    );
  };

  // An original's opening, from its receipt and the terms read at its block.
  const openingSlots = (o: FrankencoinOpeningRead, deposited: number): EventProseSlots => {
    const price = o.priceRaw != null ? Number(o.priceRaw) / 10 ** (36 - dec) : null;
    const minimum = o.minimumCollateralRaw != null ? Number(o.minimumCollateralRaw) / 10 ** dec : null;
    const priceFig =
      price != null && o.priceRaw != null
        ? chFig(
            "openTerms",
            o.priceRaw,
            <>
              {fmtFcPrice(price)} ZCHF/{sym}
            </>,
          )
        : null;
    const opened: ReactNode =
      deposited > 0 ? (
        <>
          This position opened with {collDeltaFig(deposited, true)} of collateral
          {minimum != null && Math.abs(minimum - deposited) < FC_EPS ? (
            <>, the minimum it must hold{priceFig ? "," : ""}</>
          ) : minimum != null ? (
            <>
              {" "}
              (its minimum is {fmtFcColl(minimum)} {sym})
            </>
          ) : null}
          {priceFig ? <> and a declared liquidation price of {priceFig}</> : null}.
        </>
      ) : priceFig ? (
        <>This position opened with a declared liquidation price of {priceFig} and no collateral yet.</>
      ) : (
        <>This position opened.</>
      );
    const fee = Number(o.fee);
    const feeClause: ClauseInput =
      fee > 0
        ? clause(
            <>
              {o.feePayer && (o.feePayer === ctx.txFrom || o.feePayer === facts?.createdFor) ? (
                "The owner"
              ) : o.feePayer ? (
                <Addr address={o.feePayer} />
              ) : (
                "The opener"
              )}{" "}
              paid the {chFig("openFee", o.fee, <>{fmtZchf(fee)} ZCHF</>, "ZCHF")} opening fee into the system reserve.
            </>,
          )
        : null;
    const deniedAt = facts?.deniedAt ?? null;
    const veto: ClauseInput =
      o.start != null && ts != null && o.start > ts
        ? clause(
            <>
              Its veto window ran {spanText(o.start - ts)}
              {Math.abs(o.start - ts - 3 * 86400) < 60 ? ", the shortest allowed" : ""}, from {dateTimeText(ts)} to{" "}
              {dateTimeText(o.start)}. Holders of more than 1% of the governance votes could deny it in that time, and{" "}
              {deniedAt != null && deniedAt < o.start ? <>one did, on {formatDate(deniedAt)}</> : <>nobody did</>}.{" "}
              {VOTES_GLOSS}
            </>,
          )
        : null;
    const fixed: string[] = [];
    if (minimum != null) fixed.push(`the ${fmtFcColl(minimum)} ${sym} minimum`);
    if (o.limit != null) fixed.push(`the ${groupExact(o.limit)} ZCHF minting limit it shares with its clones`);
    if (o.challengePeriod != null) fixed.push(`the challenge period of ${phaseText(o.challengePeriod)}`);
    if (o.reservePPM != null) fixed.push(`the ${fmtFcPct(o.reservePPM / 1_000_000)} reserve share`);
    if (o.riskPremiumPPM != null) fixed.push(`the ${(o.riskPremiumPPM / 10_000).toFixed(2)}% risk premium`);
    if (o.expiration != null) fixed.push(`the expiry, ${dateTimeText(o.expiration)}`);
    const terms: ClauseInput =
      ctx.hub === "v2" && fixed.length > 0
        ? clause(
            <>
              Fixed for the position&rsquo;s life: the collateral token, {fixed.slice(0, -1).join(", ")} and{" "}
              {fixed[fixed.length - 1]}. The owner can change the declared price, the collateral and the debt.
              {o.annualInterestPPM != null ? (
                <>
                  {" "}
                  The {(o.annualInterestPPM / 10_000).toFixed(2)}% interest rate is the base rate governance sets plus
                  the risk premium, so it moves with the base rate.
                </>
              ) : null}
            </>,
          )
        : null;
    return {
      happened: [clause(opened), feeClause],
      meansNow: [veto, terms, NO_ORACLE],
    };
  };

  switch (ctx.eventType) {
    case "open":
    case "clone": {
      const cloneRow = ctx.eventType === "clone";
      const openColl = showColl ? num(ctx.collateral) : 0;
      const openMint = num(ctx.minted);
      const root = facts?.familyOriginal ?? null;
      const lede = cloneRow ? (
        <>
          This position was cloned from {ctx.original ? <Addr address={ctx.original} /> : "an existing position"}
          {root && ctx.original && root !== ctx.original ? (
            <>
              , a clone of the family&rsquo;s original <Addr address={root} />
            </>
          ) : null}
          : a new position contract with its own collateral and debt
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
      const o = !cloneRow ? (facts?.opening ?? null) : null;
      if (o) return openingSlots(o, openColl);
      const declaredPrice: ClauseInput =
        ctx.liqPrice != null ? clause(<>The owner declared a liquidation price of {liqPriceAfterFig()}.</>) : null;
      const viaParent = root != null && ctx.original != null && root !== ctx.original;
      const lifecycleMechanic = cloneRow
        ? clause(
            viaParent ? (
              <>
                It took its starting declared price from <Addr address={ctx.original as string} /> and its other terms
                (interest rate, reserve share, challenge period, an expiry no later than the original&rsquo;s) from the
                family&rsquo;s original, and shares the family&rsquo;s minting limit. An original waits out a veto
                window before it can mint; a clone skips it.
              </>
            ) : (
              <>
                It uses the original&rsquo;s terms (interest rate, reserve share, challenge period, an expiry no later
                than the original&rsquo;s) and shares its minting limit. An original waits out a veto window before it
                can mint; a clone skips it.
              </>
            ),
          )
        : clause(
            <>
              As a new original position it first waits out a veto window of at least three days, chosen by the owner,
              in which holders of more than 1% of the governance votes can deny it. {VOTES_GLOSS}
            </>,
          );
      return {
        happened: [clause(opening)],
        changed: [declaredPrice],
        meansNow: [
          lifecycleMechanic,
          NO_ORACLE,
          openMint > 0 ? mintSplit() : null,
          openMint > 0 ? rollClause() : null,
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
      return { happened: [clause(happened)], meansNow: [mintSplit(), rollClause()] };
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
      // Where the withdrawal stopped against the declared price's limit.
      const atLimit =
        rs.hasDebt && showColl && priceAfter != null && Math.abs(rs.colAfter * priceAfter - rs.debtAfter) < 0.005;
      const limitClause: ClauseInput = atLimit
        ? clause(
            <>
              At the declared {liqPriceAfterFig()} that is the least collateral the debt allows (
              {fmtFcColl(rs.colAfter)} × {fmtFcPrice(priceAfter as number)} = {fmtZchf(rs.debtAfter)} ZCHF): the
              withdrawal stopped at the limit.
            </>,
          )
        : rs.hasDebt
          ? ceilingClause()
          : null;
      return {
        happened: [clause(<>Withdrew {collDeltaFig(delta, true)} of collateral.</>)],
        changed: [changed, limitClause],
        meansNow: [pauseEndedClause(), understatedCaveat()],
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
            ? clause(
                <>
                  It started at the declared price of <Addr address={ctx.original as string} />, the position it was
                  cloned from: {liqPriceAfterFig()}.
                </>,
              )
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
          dMint != null && dMint > 0 ? rollClause() : null,
          priceRule(),
          mintBeforeRaise,
          pauseEndedClause(),
          understatedCaveat(),
        ],
      };
    }

    case "auction_settlement": {
      const tookColl = showColl && dColl != null && dColl < 0;
      const clearedDebt = dMint != null && dMint < 0;
      const siblings = extras.txHash ? (facts?.txKinds[extras.txHash] ?? []) : [];
      const bySale = siblings.includes("challenge_succeeded")
        ? "challenge"
        : siblings.includes("forced_sale")
          ? "forced"
          : null;
      const soldHere = extras.txHash ? (facts?.txSold[extras.txHash] ?? 0) : 0;
      const saleName =
        bySale === "challenge" ? "The challenge sale" : bySale === "forced" ? "The forced sale" : "The sale";
      const tail: ReactNode =
        tookColl && clearedDebt ? (
          <>
            {" "}
            took {collDeltaFig(dColl as number, true)} of collateral and cleared {mintDeltaFig(dMint as number, true)}{" "}
            of debt.
          </>
        ) : tookColl ? (
          <> took {collDeltaFig(dColl as number, true)} of collateral.</>
        ) : clearedDebt ? (
          <> cleared {mintDeltaFig(dMint as number, true)} of debt.</>
        ) : bySale != null && rs.closed && soldHere > FC_EPS ? (
          <>
            {" "}
            sold {fmtFcColl(soldHere)} {sym} that the position&rsquo;s recorded collateral never showed, so this
            row&rsquo;s figures stay at zero.
          </>
        ) : bySale === "forced" && rs.closed ? (
          <> found nothing to sell: the position&rsquo;s collateral and debt were already zero.</>
        ) : (
          <> left the position&rsquo;s collateral and debt unchanged.</>
        );
      return {
        happened: [
          clause(
            <>
              {saleName}
              {tail}
            </>,
          ),
        ],
        changed: [
          rs.closed && (tookColl || clearedDebt)
            ? clause(<>Nothing is left on either side, so the position is closed.</>)
            : null,
        ],
        meansNow: [
          clause(
            bySale === "challenge" ? (
              <>
                This row records the sale&rsquo;s effect on the position. The Challenge Succeeded row that follows it in
                the same transaction records the bid, the reward and where the ZCHF went.
              </>
            ) : bySale === "forced" ? (
              <>
                This row records the sale&rsquo;s effect on the position. The Forced Sale row that follows it in the
                same transaction names the buyer, the price and where the ZCHF went.
              </>
            ) : (
              <>This row records a sale&rsquo;s effect on the position, written by the hub in the same transaction.</>
            ),
          ),
          understatedCaveat(),
        ],
      };
    }

    case "close":
      return {
        happened: [clause(<>Closed the position — collateral and its ZCHF debt both returned to zero.</>)],
        meansNow: [dMint != null && dMint < 0 ? repaySplit() : null, pauseEndedClause()],
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
              A veto needs more than 1% of the governance votes, counting delegations, and is open only during a new
              original position&rsquo;s veto window. {VOTES_GLOSS}
            </>,
          ),
          clause(<>Denial disables minting permanently. The collateral stays withdrawable by the owner.</>),
        ],
      };
    }

    case "challenge_started": {
      const size = num(ctx.challengeSize);
      const phase = facts?.challengePeriod ?? null;
      const happened = (
        <>
          {ctx.challenger ? <Addr address={ctx.challenger} /> : "A challenger"} challenged{" "}
          <Fig
            info={challengeFigureProv("size", "started", sym, coords, ctx.raw?.size)}
            value={chainTruthDeltaValue(size, true)}
            symbol={sym}
          >
            {fmtFcColl(size)} {sym}
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
          clause(
            <>
              The challenger posts {fmtFcColl(size)} of its own {sym}, not ZCHF.
            </>,
          ),
          clause(
            phase === 0 ? (
              <>
                This position&rsquo;s challenge period is 0 seconds, so both phases ended the moment the challenge
                started and the position&rsquo;s collateral could be bid for at once.
              </>
            ) : phase != null && ts != null ? (
              <>
                Phase 1 runs {phaseText(phase)}, to {dateTimeText(ts + phase)}: anyone, the owner included, can buy that
                collateral at the declared price. If nobody does, phase 2 runs {phaseText(phase)} more and sells the
                position&rsquo;s collateral at a price falling from the declared price to zero.
              </>
            ) : (
              <>
                Phase 1 offers that collateral at the declared price, to anyone, the owner included; only if nobody buys
                it does the position&rsquo;s collateral go to a falling-price auction.
              </>
            ),
          ),
        ],
      };
    }

    case "challenge_averted": {
      const size = num(ctx.challengeSize);
      const a = read?.challenge?.kind === "averted" ? read.challenge : null;
      const started = facts?.challenges[challengeKey(ctx)];
      const sizeFig = (
        <Fig
          info={challengeFigureProv("size", "averted", sym, coords, ctx.raw?.size)}
          value={chainTruthDeltaValue(size, true)}
          symbol={sym}
        >
          {fmtFcColl(size)} {sym}
        </Fig>
      );
      const startAt = a?.challengeStart ?? started?.start ?? null;
      const happened = (
        <>
          The challenge over {sizeFig} was averted in phase 1
          {startAt != null && ts != null && ts > startAt ? <>, {spanText(ts - startAt)} after it started</> : null}.
        </>
      );
      const paid = a ? Number(a.paid) : 0;
      const bought = a ? scaled(a.boughtRaw, dec) : 0;
      const liq = a?.liqPriceRaw != null ? scaled(a.liqPriceRaw, 36 - dec) : null;
      const unit = paid > 0 && bought > 0 ? paid / bought : null;
      const buyerIsOwner = a?.buyer != null && a.owner != null && a.buyer === a.owner;
      const withdrawn = a?.buyer != null && a.challenger != null && a.buyer === a.challenger;
      const buyerLine: ClauseInput = !a
        ? clause(
            <>
              Someone bought the challenger&rsquo;s posted collateral at the declared price, which ends the challenge.
            </>,
          )
        : withdrawn
          ? clause(<>The challenger withdrew its own challenge and took back its collateral; nobody paid anything.</>)
          : clause(
              <>
                {a.buyer ? <Addr address={a.buyer} /> : "The buyer"}
                {buyerIsOwner
                  ? ", the owner,"
                  : a.buyerIsContract === true
                    ? ", a contract and not the owner,"
                    : a.buyerIsContract === false
                      ? ", a wallet and not the owner,"
                      : ""}{" "}
                paid {a.challenger ? <Addr address={a.challenger} /> : "the challenger"}{" "}
                {chFig("paidChallenger", a.paid, <>{fmtZchf(paid)} ZCHF</>, "ZCHF")} for its {fmtFcColl(bought)} {sym}
                {unit != null ? (
                  <>
                    : {fmtFcPrice(unit)} ZCHF per {sym}
                    {liq != null && Math.abs(unit - liq) < 0.01 ? ", the declared price" : null}
                  </>
                ) : null}
                .
              </>,
            );
      const sender: ClauseInput =
        a && a.buyer && read && read.sender !== a.buyer && !withdrawn
          ? clause(
              <>
                The transaction was sent by <Addr address={read.sender} />.
              </>,
            )
          : null;
      const cooldown: ClauseInput =
        a?.cooldownUntil != null && ts != null && a.cooldownUntil > ts
          ? clause(
              <>
                The position&rsquo;s collateral and debt did not move. Averting paused its minting for{" "}
                {spanText(a.cooldownUntil - ts)}, to {dateTimeText(a.cooldownUntil)}, so the same challenge can be
                repeated before the owner mints more.
              </>,
            )
          : clause(<>The position&rsquo;s collateral and debt did not move.</>);
      return {
        happened: [clause(happened)],
        changed: [buyerLine, sender],
        meansNow: [cooldown],
      };
    }

    case "challenge_succeeded": {
      const bid = num(ctx.bid);
      const acquired = num(ctx.acquiredCollateral);
      const c = read?.challenge?.kind === "succeeded" ? read.challenge : null;
      const bidFig = (
        <Fig
          info={challengeFigureProv("bid", "succeeded", sym, coords, ctx.raw?.bid)}
          value={chainTruthDeltaValue(bid, true)}
          symbol="ZCHF"
        >
          {fmtZchf(bid)} ZCHF
        </Fig>
      );
      const acquiredFig = (
        <Fig
          info={challengeFigureProv("acquiredCollateral", "succeeded", sym, coords, ctx.raw?.acquiredCollateral)}
          value={chainTruthDeltaValue(acquired, true)}
          symbol={sym}
        >
          {fmtFcColl(acquired)} {sym}
        </Fig>
      );
      const started = facts?.challenges[challengeKey(ctx)];
      const start = c?.challengeStart ?? started?.start ?? null;
      const phase = c?.phase ?? facts?.challengePeriod ?? null;
      const liq = c?.liqPriceRaw != null ? scaled(c.liqPriceRaw, 36 - dec) : null;
      const unit = bid > 0 && acquired > FC_EPS ? bid / acquired : null;
      const into = start != null && phase != null && ts != null ? ts - (start + phase) : null;
      // §5.4 derived net-outcome: the price the sale cleared at, against the
      // declared price, and when in phase 2 the bid came.
      const cleared: ClauseInput =
        unit != null
          ? clause(
              <>
                That is{" "}
                {c
                  ? chFig(
                      "clearedPrice",
                      String(unit),
                      <>
                        {fmtFcPrice(unit)} ZCHF per {sym}
                      </>,
                    )
                  : `${fmtFcPrice(unit)} ZCHF per ${sym}`}
                {liq != null && liq > 0 ? (
                  <>
                    , {fmtFcPct(unit / liq)} of the declared {fmtFcPrice(liq)}
                  </>
                ) : null}
                {into != null && into >= 0 && phase != null ? (
                  <>
                    , {spanText(into)} into phase 2, after nobody bought the challenger&rsquo;s collateral in phase
                    1&rsquo;s {phaseText(phase)}
                  </>
                ) : null}
                .
              </>,
            )
          : null;
      const zeroPeriod: ClauseInput =
        phase === 0 && bid === 0
          ? clause(<>The bid was zero: with a 0-second challenge period the falling price had already reached zero.</>)
          : null;
      if (!c)
        return {
          happened: [
            clause(
              <>
                Phase 2 sold {acquiredFig} of the position&rsquo;s collateral for {bidFig}.
              </>,
            ),
          ],
          changed: [cleared, zeroPeriod],
          meansNow: [
            clause(
              <>
                The bid, less the challenger&rsquo;s reward, goes against the debt; a shortfall is covered from the
                reserve, and an excess is shared between the reserve and the owner.
              </>,
            ),
          ],
        };
      const reward = Number(c.reward);
      const back = scaled(c.challengerReturnedRaw, dec);
      const cleared$ = Number(c.debtCleared);
      const shortfall = Number(c.shortfall);
      const released = c.reserveReleased != null ? Number(c.reserveReleased) : null;
      const ownerGot = Number(c.ownerReceived);
      const excessKept = Number(c.excessToReserve);
      const rewardLine = clause(
        <>
          Of the bid, {chFig("reward", c.reward, <>{fmtZchf(reward)} ZCHF</>, "ZCHF")}
          {bid > 0 ? <> ({fmtFcPct(reward / bid)})</> : null} went to the challenger
          {c.challenger ? (
            <>
              {" "}
              <Addr address={c.challenger} />
            </>
          ) : null}
          {back > 0 ? (
            <>
              , which {c.challengerReturnPostponed ? "can also collect" : "also got back"} the{" "}
              {chFig(
                "challengerReturned",
                c.challengerReturnedRaw,
                <>
                  {fmtFcColl(back)} {sym}
                </>,
              )}{" "}
              it posted
            </>
          ) : null}
          .
        </>,
      );
      const debtLine: ClauseInput =
        shortfall > 0
          ? clause(
              <>
                Clearing the {chFig("debtCleared", c.debtCleared, <>{fmtZchf(cleared$)} ZCHF</>, "ZCHF")} debt took{" "}
                {chFig("shortfall", c.shortfall, <>{fmtZchf(shortfall)} ZCHF</>, "ZCHF")} more than the rest of the bid,
                which the reserve paid
                {released != null && released > 0 ? (
                  <>
                    . The sale also released this position&rsquo;s{" "}
                    {chFig("reserveReleased", c.reserveReleased as string, <>{fmtZchf(released)} ZCHF</>, "ZCHF")}{" "}
                    reserve share, so the shortfall came out of that share
                    {released > shortfall ? (
                      <> and the other {fmtZchf(released - shortfall)} ZCHF stayed with the reserve</>
                    ) : null}
                  </>
                ) : null}
                .
              </>,
            )
          : ownerGot > 0 || excessKept > 0
            ? clause(
                cleared$ > 0 ? (
                  <>
                    The rest of the bid cleared the{" "}
                    {chFig("debtCleared", c.debtCleared, <>{fmtZchf(cleared$)} ZCHF</>, "ZCHF")} debt with{" "}
                    {fmtZchf(ownerGot + excessKept)} ZCHF over: the reserve kept {fmtZchf(excessKept)} ZCHF (
                    {fmtFcPct(excessKept / (ownerGot + excessKept))}) and the owner received{" "}
                    {chFig("ownerReceived", c.ownerReceived, <>{fmtZchf(ownerGot)} ZCHF</>, "ZCHF")}.
                  </>
                ) : (
                  <>
                    The position had no debt, so the other {fmtZchf(ownerGot + excessKept)} ZCHF of the bid was excess:
                    the reserve kept {fmtZchf(excessKept)} ZCHF ({fmtFcPct(excessKept / (ownerGot + excessKept))}) and
                    the owner received {chFig("ownerReceived", c.ownerReceived, <>{fmtZchf(ownerGot)} ZCHF</>, "ZCHF")}.
                  </>
                ),
              )
            : clause(
                <>
                  The rest of the bid cleared the{" "}
                  {chFig("debtCleared", c.debtCleared, <>{fmtZchf(cleared$)} ZCHF</>, "ZCHF")} debt.
                </>,
              );
      const endsWith = clause(
        <>
          Who ends up with what: the bidder
          {c.bidder ? (
            <>
              {" "}
              <Addr address={c.bidder} />
            </>
          ) : null}{" "}
          has the {fmtFcColl(acquired)} {sym} for {fmtZchf(bid)} ZCHF; the challenger has
          {back > 0 ? <> its {sym} back and</> : null} {fmtZchf(reward)} ZCHF; the owner received {fmtZchf(ownerGot)}{" "}
          ZCHF here
          {cleared$ > 0 ? <>, keeps the ZCHF minted earlier and no longer owes the {fmtZchf(cleared$)} ZCHF</> : null}
          {shortfall > 0 ? (
            <>
              ; the reserve paid {fmtZchf(shortfall)} ZCHF
              {released != null && released > 0 ? (
                <> out of the {fmtZchf(released)} ZCHF held for this position</>
              ) : null}
            </>
          ) : excessKept > 0 ? (
            <>; the reserve gained {fmtZchf(excessKept)} ZCHF</>
          ) : null}
          .
        </>,
      );
      return {
        happened: [
          clause(
            <>
              Phase 2 sold {acquiredFig} of the position&rsquo;s collateral for {bidFig}
              {c.bidder ? (
                <>
                  {" "}
                  to <Addr address={c.bidder} />
                  {c.bidderIsContract === true ? ", a contract" : c.bidderIsContract === false ? ", a wallet" : ""}
                </>
              ) : null}
              .
            </>,
          ),
        ],
        changed: [cleared],
        meansNow: [rewardLine, debtLine, endsWith],
      };
    }

    case "forced_sale": {
      const amt = num(ctx.forcedSaleAmount);
      const f = read?.forced ?? null;
      const mechanic = clause(
        <>
          The position&rsquo;s expiration had passed, so anyone could buy its collateral through the hub; the owner did
          not need to act.
        </>,
      );
      if (amt <= FC_EPS) {
        // A call that found the collateral gone: name the caller and the sale
        // that took it.
        const block = coords.blockNumber;
        const prev =
          facts && block != null
            ? [...facts.forcedSales].reverse().find((s) => s.blockNumber < block && s.amount > FC_EPS)
            : undefined;
        const caller = f?.buyer ?? ctx.txFrom ?? null;
        if (prev && ts != null && caller) {
          const blocks = block != null ? block - prev.blockNumber : null;
          const same = prev.caller != null && prev.caller === caller;
          return {
            happened: [
              clause(
                <>
                  This forced sale sold nothing: <Addr address={caller} /> called it {gapText(ts - prev.timestamp)}
                  {blocks != null ? <> ({blocks === 1 ? "one block" : `${blocks} blocks`})</> : null} after{" "}
                  {same ? (
                    "its own"
                  ) : prev.caller ? (
                    <>
                      <Addr address={prev.caller} />
                      &rsquo;s
                    </>
                  ) : (
                    "an earlier"
                  )}{" "}
                  sale had bought all {fmtFcColl(prev.amount)} {sym} of the collateral.
                </>,
              ),
            ],
            meansNow: [clause(<>The position held nothing by then, so the call moved no collateral and no ZCHF.</>)],
          };
        }
        return {
          happened: [clause(<>This forced sale sold no collateral: the position held none by then.</>)],
          meansNow: [
            clause(
              <>
                The position&rsquo;s expiration had passed, so anyone could call the hub&rsquo;s forced sale on it; this
                call found nothing left to sell.
              </>,
            ),
          ],
        };
      }
      const amtFig = (
        <Fig info={forcedSaleProv(sym, coords, ctx.raw?.size)} value={chainTruthDeltaValue(amt, true)} symbol={sym}>
          {fmtFcColl(amt)} {sym}
        </Fig>
      );
      if (!f)
        return {
          happened: [clause(<>{amtFig} of the position&rsquo;s collateral was sold in a forced sale.</>)],
          meansNow: [
            clause(
              <>
                The position&rsquo;s expiration had passed, so anyone could buy its collateral through the hub at a
                price that falls with time; the payment repays the debt first.
              </>,
            ),
            mechanic,
          ],
        };
      const cost = Number(f.cost);
      const unit = scaled(f.priceRaw, 36 - dec);
      const liq = f.liqPriceRaw != null ? scaled(f.liqPriceRaw, 36 - dec) : null;
      const debt = Number(f.debtCleared);
      const owed = f.mintedBefore != null ? Number(f.mintedBefore) : null;
      const toOwner = Number(f.ownerReceived);
      const reserveBack = Number(f.reserveToBuyer);
      const loss = Number(f.loss);
      const released = f.reserveReleased != null ? Number(f.reserveReleased) : null;
      const zchf = (leg: FrankencoinChallengeLeg, value: string, n: number) =>
        chFig(leg, value, <>{fmtZchf(n)} ZCHF</>, "ZCHF");
      const buyerIsOwner = f.buyer != null && f.owner != null && f.buyer === f.owner;
      const happened = (
        <>
          {f.buyer ? <Addr address={f.buyer} /> : "A buyer"}
          {buyerIsOwner
            ? ", the owner,"
            : f.buyerIsContract === true
              ? ", a contract and not the owner,"
              : f.buyerIsContract === false
                ? ", a wallet and not the owner,"
                : ""}{" "}
          bought {amtFig} of the position&rsquo;s collateral in a forced sale
          {cost > 0 ? <> for {zchf("forcedCost", f.cost, cost)}</> : <> and paid nothing</>}.
        </>
      );
      const curve =
        f.expiration != null && f.challengePeriod != null && ts != null
          ? forcedCurvePoint(ts, f.expiration, f.challengePeriod, unit, liq)
          : null;
      const priceLine: ClauseInput =
        curve == null
          ? null
          : curve.stage === "zero" || unit === 0
            ? clause(
                <>
                  The price was zero: the sale came {spanText(curve.since)} after the position expired on{" "}
                  {dateTimeText(f.expiration as number)}, past the two challenge periods ({phaseText(curve.period)}{" "}
                  each) over which the price falls to nothing.
                </>,
              )
            : clause(
                <>
                  That is{" "}
                  {chFig(
                    "forcedPrice",
                    f.priceRaw,
                    <>
                      {fmtFcPrice(unit)} ZCHF per {sym}
                    </>,
                  )}
                  {curve.multiple != null && liq != null ? (
                    <>
                      , {fmtMultiple(curve.multiple)} the declared {fmtFcPrice(liq)}
                    </>
                  ) : null}
                  : the sale came {spanText(curve.since)} after the position expired on{" "}
                  {dateTimeText(f.expiration as number)},{" "}
                  {curve.stage === "first" ? (
                    <>
                      in the {periodAfterExpiry("first", curve.period)} after expiry, when the price falls from 10× the
                      declared price to 1×
                    </>
                  ) : (
                    <>
                      in the {periodAfterExpiry("second", curve.period)} after expiry, when the price falls from the
                      declared price to zero
                    </>
                  )}
                  .
                </>,
              );
      const sender: ClauseInput =
        read && f.buyer && read.sender !== f.buyer
          ? clause(
              <>
                The transaction was sent by <Addr address={read.sender} />.
              </>,
            )
          : null;
      const ownerAddr = f.owner ? (
        <>
          {" "}
          <Addr address={f.owner} />
        </>
      ) : null;
      let money: ClauseInput = null;
      let ends: ReactNode = null;
      const has = (
        <>
          the buyer has the {fmtFcColl(amt)} {sym}
          {cost > 0 ? <> for {fmtZchf(cost)} ZCHF</> : <> for nothing</>}
        </>
      );
      if (f.branch === "full") {
        money = clause(
          <>
            The hub burned {zchf("forcedDebt", f.debtCleared, debt)} from the buyer, clearing the debt in full.
            {reserveBack > 0 ? (
              <>
                {" "}
                The reserve sent the buyer this position&rsquo;s{" "}
                {zchf("forcedReserveToBuyer", f.reserveToBuyer, reserveBack)} reserve share toward it, so{" "}
                {fmtZchf(debt - reserveBack)} ZCHF of the debt came from the buyer&rsquo;s own ZCHF, and the remaining{" "}
                {zchf("forcedOwner", f.ownerReceived, toOwner)} of the price went to the owner{ownerAddr}.
              </>
            ) : (
              <>
                {" "}
                The remaining {zchf("forcedOwner", f.ownerReceived, toOwner)} of the price went to the owner
                {ownerAddr}.
              </>
            )}
          </>,
        );
        ends = (
          <>
            {has}; the owner received {fmtZchf(toOwner)} ZCHF here, keeps the ZCHF minted earlier and no longer owes the{" "}
            {fmtZchf(debt)} ZCHF
            {reserveBack > 0 ? (
              <>
                ; the reserve paid out the {fmtZchf(reserveBack)} ZCHF it held for this position, which the cleared debt
                no longer needs
              </>
            ) : null}
            .
          </>
        );
      } else if (f.branch === "shortfall") {
        money = clause(
          <>
            The price did not cover the {owed != null ? <>{fmtZchf(owed)} ZCHF </> : null}debt: the buyer&rsquo;s{" "}
            {fmtZchf(Number(f.toPosition))} ZCHF went against it and the reserve paid the other{" "}
            {zchf("forcedShortfall", f.loss, loss)}
            {Number(f.lossMinted) > 0 ? <> ({fmtZchf(Number(f.lossMinted))} ZCHF of it newly minted)</> : null}, and the
            hub burned {zchf("forcedDebt", f.debtCleared, debt)}, clearing the debt in full
            {released != null && released > 0 ? (
              <>
                . That also released this position&rsquo;s {fmtZchf(released)} ZCHF reserve share, so the shortfall came
                out of that share
                {released > loss ? (
                  <> and the other {fmtZchf(released - loss)} ZCHF stayed with the reserve</>
                ) : released < loss ? (
                  <> and the other {fmtZchf(loss - released)} ZCHF out of equity</>
                ) : null}
              </>
            ) : null}
            . The owner received nothing.
          </>,
        );
        ends = (
          <>
            {has}; the owner received nothing, keeps the ZCHF minted earlier and no longer owes the {fmtZchf(debt)}{" "}
            ZCHF; the reserve paid {fmtZchf(loss)} ZCHF
            {released != null && released > 0 ? (
              <> against the {fmtZchf(released)} ZCHF it held for this position</>
            ) : null}
            .
          </>
        );
      } else if (f.branch === "partial") {
        const freed = Number(f.reserveFreed);
        money = clause(
          <>
            The price did not cover the {owed != null ? <>{fmtZchf(owed)} ZCHF </> : null}debt and collateral remains,
            so the buyer&rsquo;s {fmtZchf(Number(f.toPosition))} ZCHF went to the position
            {freed > 0 ? <> and, with {fmtZchf(freed)} ZCHF of its reserve share,</> : null} cleared{" "}
            {zchf("forcedDebt", f.debtCleared, debt)} of debt. The owner received nothing.
          </>,
        );
        ends = (
          <>
            {has}; the owner received nothing
            {owed != null ? <> and still owes {fmtZchf(Math.max(0, owed - debt))} ZCHF</> : null}.
          </>
        );
      } else {
        money = clause(
          cost > 0 ? (
            <>
              The position had no debt, so the whole price, {zchf("forcedOwner", f.ownerReceived, toOwner)}, went to the
              owner{ownerAddr}.
            </>
          ) : (
            <>The position had no debt and the price had reached zero, so no ZCHF moved.</>
          ),
        );
        ends = (
          <>
            {has}; the owner received {toOwner > 0 ? <>{fmtZchf(toOwner)} ZCHF</> : "nothing"}.
          </>
        );
      }
      return {
        happened: [clause(happened)],
        changed: [priceLine, sender],
        meansNow: [money, clause(<>Who ends up with what: {ends}</>), mechanic],
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
            {isHub
              ? ", the MintingHub"
              : read?.newOwnerIsContract === true
                ? ", a contract, the owner the position was created for"
                : read?.newOwnerIsContract === false
                  ? ", a wallet (no contract code), the owner the position was created for"
                  : ", the owner the position was created for"}
            .
          </>
        ) : ctx.previousOwner === ZERO_ADDR || !ctx.previousOwner ? (
          <>
            {lead}the new position contract starts out owned by{" "}
            {isHub ? <>the MintingHub ({to ? <Addr address={to} /> : null}), which creates it</> : null}
            {!isHub && to ? <Addr address={to} /> : null}.
          </>
        ) : last ? (
          <>
            {lead}ownership reached {to ? <Addr address={to} /> : "the owner"}
            {read?.newOwnerIsContract === true
              ? ", a contract,"
              : read?.newOwnerIsContract === false
                ? ", a wallet (no contract code),"
                : ","}{" "}
            the owner the position was created for
            {to && ctx.txFrom === to ? ", who sent this transaction" : ""}.
          </>
        ) : (
          <>
            {lead}ownership passed to {to ? <Addr address={to} /> : "an intermediate owner"}
            {read?.newOwnerIsContract === true ? ", a contract," : ""} which held it within the creation transaction.
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
                  {read?.newOwnerIsContract === true
                    ? ", a contract"
                    : read?.newOwnerIsContract === false
                      ? ", a wallet"
                      : ""}
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
  facts?: FrankencoinPageFacts | null,
  txHash?: string,
  read?: FrankencoinEventRead | null,
): ReactNode | null {
  return splitLead(eventClauses(frankencoinEventSlots(ctx, coords, { timestamp, facts, txHash, read }))).lead;
}
