// Moonwell plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the position looks
// like AFTER this event), never on the event type alone: a redeem that empties
// a market reads differently from one that trims it; a repay that clears the
// debt reads differently from one that leaves a balance; a borrow that opens the
// first debt reads differently from one that adds to it. The state-blind morals
// the old bullets carried ("Withdrawing reduces the collateral backing any
// outstanding debt") survive only where they are genuinely event-relevant
// mechanics (the enter-market rule on a supply, the 50% close factor on a
// liquidation), never as a moral tacked onto every event.
//
// Figures render through <Prov>: an `echo` of the figure's primary receipt on
// the open card — the delta echoes the spine flank (mint/redeem/borrow/repay
// underlying, or the transfer's mToken move); the after-balances, the emitted
// debt total, and the liquidation's repaid-debt / seized-collateral echo the
// detail grid ("Position state"). Moonwell carries no cross-scope sibling
// figure, so there is no primary rendered here.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Moonwell cannot fill per event, each a data fact of its
// stream:
//   • §5.1 (risk consequence per event): the indexed stream carries no
//     per-event health factor, collateral ratio, or oracle price — those live
//     on the position card's live read, not on each historical event — so a
//     ratio-vs-threshold read at event time cannot be shown. The debt TOTAL
//     after a borrow/repay (the emitted accountBorrows) is the one after-figure
//     the stream does carry, and it is stated.
//   • §5.4 (derived net-outcome): a Moonwell liquidation event carries the debt
//     repaid and the collateral seized, but NOT the remaining debt and no
//     per-event price, so no valued P/L or "premium landed on a constant" can be
//     derived. The incentive is named as a constant (muted), not computed.
//   • §5.5 (aggregate / sibling context): the stream maps one liquidation to one
//     self-contained event (debt repaid + seize both on it) and emits no
//     seize-leg or repay-leg sibling event, so there is no same-transaction
//     cross-reference to phrase. Compound V2's seize_out/seize_in/seize_burn
//     have no Moonwell counterpart.
// Filled: resulting-state keying on every event; the enter-market mechanic
// (§ mechanic-why) on supply; the close-factor mechanic on liquidation; the
// emitted debt total on borrow/repay; the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { MoonwellContext } from "@/lib/shared/types/event-shape";
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
  mTokensDeltaProv,
  transferAmountProv,
  accountBorrowsProv,
  mTokensAfterProv,
  liqDebtRepaidProv,
  seizeTokensProv,
  type MoonwellCoords,
} from "@/lib/moonwell/event-provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { formatNumber } from "@/lib/utils/format";

/** The dust epsilon — a balance at or below this reads as an emptied leg, not a
 *  real remaining position. */
export const MOONWELL_EPS = 1e-9;

const fmtAbs = (h?: string): string => formatNumber(Math.abs(Number(h)));
const fmtVal = (h?: string): string => formatNumber(Number(h));
const num = (h?: string): number => Number(h);

// ── resulting state ──────────────────────────────────────────────────────────

export interface MoonwellResultingState {
  /** Emitted total debt after a borrow/repay (accountBorrows), or null. */
  debtAfter: number | null;
  /** Exact mToken balance after a mint/redeem/transfer, or null. */
  mTokensAfter: number | null;
  /** A repay that cleared the debt in full. */
  debtCleared: boolean;
  /** A borrow that opened the position's first debt in this market. */
  firstBorrow: boolean;
  /** A mint that opened the position's first supply in this market. */
  firstSupply: boolean;
  /** A redeem / transfer_out that emptied the position's stake in this market. */
  marketEmptied: boolean;
}

/** Read the resulting state STRICTLY from the fields the stream provides — an
 *  absent after-field simply drops its clause (never-empty floor). No
 *  after-value is ever computed here (addendum: PARTIAL keying tier). */
export function moonwellResultingState(ctx: MoonwellContext): MoonwellResultingState {
  const debtAfter = ctx.debtAfter != null ? num(ctx.debtAfter) : null;
  const mTokensAfter = ctx.mTokensAfter != null ? num(ctx.mTokensAfter) : null;
  const debtBefore = ctx.debtBefore != null ? num(ctx.debtBefore) : null;
  const mTokensBefore = ctx.mTokensBefore != null ? num(ctx.mTokensBefore) : null;
  return {
    debtAfter,
    mTokensAfter,
    debtCleared: debtAfter != null && debtAfter <= MOONWELL_EPS,
    firstBorrow: debtBefore != null && debtBefore <= MOONWELL_EPS,
    firstSupply: mTokensBefore != null && mTokensBefore <= MOONWELL_EPS,
    marketEmptied: mTokensAfter != null && mTokensAfter <= MOONWELL_EPS,
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
  value?: string;
  symbol?: string;
  children: ReactNode;
}) {
  return (
    <Prov info={info} value={value} symbol={symbol} echo>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

// ── the variant table ────────────────────────────────────────────────────────

export function moonwellEventSlots(
  ctx: MoonwellContext,
  coords: MoonwellCoords,
  opts?: { externalBy?: string },
): EventProseSlots {
  const sym = ctx.marketSymbol ?? "the asset";
  const mSym = coords.marketLabel ?? `m${sym}`;
  const rs = moonwellResultingState(ctx);

  // Delta figures echo the spine flank (the underlying amount for
  // mint/redeem/borrow/repay; the mToken move for transfers).
  const assetsDeltaFig = () => (
    <Fig
      info={assetsDeltaProv(sym, ctx.eventType as "mint" | "redeem" | "borrow" | "repay", coords, ctx.raw?.amount)}
      value={chainTruthDeltaValue(num(ctx.assetsDelta), false)}
      symbol={sym}
    >
      {fmtAbs(ctx.assetsDelta)} {sym}
    </Fig>
  );
  const mintDeltaFig = () => (
    <Fig
      info={mTokensDeltaProv(mSym, ctx.eventType as "mint" | "redeem", coords, ctx.raw?.mTokens)}
      value={chainTruthDeltaValue(num(ctx.mTokensDelta), false)}
      symbol={mSym}
    >
      {fmtAbs(ctx.mTokensDelta)} {mSym}
    </Fig>
  );
  const transferDeltaFig = (dir: "in" | "out") => (
    <Fig
      info={transferAmountProv(mSym, dir, coords, ctx.raw?.mTokens)}
      value={chainTruthDeltaValue(num(ctx.mTokensDelta), false)}
      symbol={mSym}
    >
      {fmtAbs(ctx.mTokensDelta)} {mSym}
    </Fig>
  );
  // After-balances echo the detail grid.
  const debtAfterFig = () => (
    <Fig info={accountBorrowsProv(sym, coords, ctx.raw?.accountBorrows)} value={fmtVal(ctx.debtAfter)} symbol={sym}>
      {fmtVal(ctx.debtAfter)} {sym}
    </Fig>
  );
  const mTokensAfterFig = () => (
    <Fig info={mTokensAfterProv(mSym, coords, ctx.raw?.mTokensAfter)} value={fmtVal(ctx.mTokensAfter)} symbol={mSym}>
      {fmtVal(ctx.mTokensAfter)} {mSym}
    </Fig>
  );

  switch (ctx.eventType) {
    case "mint": {
      const happened = (
        <>
          Supplied {assetsDeltaFig()} to Moonwell&rsquo;s {sym} market, minting {mintDeltaFig()} in return.
        </>
      );
      // The running receipt-token balance is worth stating only when this mint
      // adds to an existing stake — on a first supply the minted amount is the
      // balance.
      const changed: ClauseInput =
        !rs.firstSupply && rs.mTokensAfter != null
          ? clause(<>That takes the position&rsquo;s receipt-token balance to {mTokensAfterFig()}.</>)
          : null;
      // The general exchange-rate rule (receipt balance × rate = the deposit's
      // value) is Layer-2 material — the "?" modal (moonwellSupplyWithdrawContent's
      // "mTokens & the exchange rate") carries it verbatim.
      const meansNow: ClauseInput[] = [
        clause(
          <>
            Supplying and entering the market are separate steps: the deposit backs borrowing, and becomes seizable in a
            liquidation, only once it is entered.
          </>,
        ),
      ];
      if (ctx.routerProxied) {
        meansNow.push(
          clause(<>The deposit came in as native ETH through Moonwell&rsquo;s WETH Router, which wraps it to WETH.</>),
        );
      }
      return { happened: [clause(happened)], changed: changed ? [changed] : [], meansNow };
    }

    case "redeem": {
      const happened = (
        <>
          Withdrew {assetsDeltaFig()} from the {sym} market, burning {mintDeltaFig()} of the receipt token.
        </>
      );
      const changed: ClauseInput = rs.marketEmptied
        ? cont(<>, emptying the position&rsquo;s stake in this market.</>)
        : rs.mTokensAfter != null
          ? cont(<>, leaving {mTokensAfterFig()} in the market.</>)
          : null;
      return {
        happened: [clause(happened), changed].filter(Boolean) as ClauseInput[],
        meansNow: [],
      };
    }

    case "borrow": {
      const happened = rs.firstBorrow ? (
        <>
          Borrowed {assetsDeltaFig()} against the account&rsquo;s supplied collateral — the position&rsquo;s first debt
          in this market.
        </>
      ) : (
        <>Borrowed {assetsDeltaFig()} against the account&rsquo;s supplied collateral.</>
      );
      const changed: ClauseInput =
        rs.debtAfter != null
          ? clause(
              <>
                That brings the total {sym} debt to {debtAfterFig()}.
              </>,
            )
          : null;
      return {
        happened: [clause(happened)],
        changed: changed ? [changed] : [],
        meansNow: [
          clause(
            <>
              Moonwell accrues interest every second, so this total already carries the interest owed up to this moment.
            </>,
          ),
        ],
      };
    }

    case "repay": {
      const happened = (
        <>
          Repaid {assetsDeltaFig()} of the {sym} debt{opts?.externalBy ? <>, paid by another address</> : null}.
        </>
      );
      const changed: ClauseInput = rs.debtCleared
        ? clause(<>That clears the {sym} debt in full.</>)
        : rs.debtAfter != null
          ? clause(
              <>
                That brings the remaining {sym} debt to {debtAfterFig()}.
              </>,
            )
          : null;
      const meansNow: ClauseInput =
        !rs.debtCleared && rs.debtAfter != null
          ? clause(
              <>
                Any gap between this total and the debt after the previous event is interest that accrued between them.
              </>,
            )
          : null;
      return {
        happened: [clause(happened)],
        changed: changed ? [changed] : [],
        meansNow: meansNow ? [meansNow] : [],
      };
    }

    case "liquidation": {
      // The collateral market's receipt-token label is "m" + its symbol on
      // every deployment, so it needs no catalog.
      const collMSym = ctx.collateralSymbol ? `m${ctx.collateralSymbol}` : "";
      const debtRepaidFig = () => (
        <Fig
          info={liqDebtRepaidProv(sym, coords, ctx.raw?.amount)}
          value={fmtVal(String(Math.abs(num(ctx.assetsDelta))))}
          symbol={sym}
        >
          {fmtAbs(ctx.assetsDelta)} {sym}
        </Fig>
      );
      const seizeFig = () =>
        ctx.seizeTokens != null && collMSym ? (
          <Fig
            info={seizeTokensProv(collMSym, coords, ctx.raw?.seizeTokens)}
            value={fmtVal(ctx.seizeTokens)}
            symbol={collMSym}
          >
            {fmtVal(ctx.seizeTokens)} {collMSym}
          </Fig>
        ) : null;
      const seize = seizeFig();
      const happened = seize ? (
        <>
          The account&rsquo;s debt outgrew what its collateral covers, so a liquidator repaid {debtRepaidFig()} of its{" "}
          {sym} debt and seized {seize} of collateral.
        </>
      ) : (
        <>
          The account&rsquo;s debt outgrew what its collateral covers, so a liquidator repaid {debtRepaidFig()} of its{" "}
          {sym} debt.
        </>
      );
      const meansNow: ClauseInput[] = [
        clause(
          <>
            The collateral taken is worth the repaid debt plus the market&rsquo;s liquidation incentive, a bonus paid to
            the liquidator.
          </>,
        ),
        // The close-factor rule (partial liquidation, at most half a market's
        // debt) is Layer-2 material — the "?" modal (moonwellLiquidationContent)
        // carries it verbatim.
      ];
      if (ctx.liquidator) {
        meansNow.push(
          clause(
            <>
              Cleared by a third-party liquidator, typically an automated bot:{" "}
              <a
                href={explorerUrl(coords.chainId ?? MAINNET_CHAIN_ID, "address", ctx.liquidator)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {ctx.liquidator.slice(0, 6)}…{ctx.liquidator.slice(-4)}
              </a>
              .
            </>,
          ),
        );
      }
      return { happened: [clause(happened)], meansNow };
    }

    case "transfer_in": {
      const happened = <>Received {transferDeltaFig("in")} of the receipt token from another wallet.</>;
      const changed: ClauseInput =
        rs.mTokensAfter != null ? clause(<>That takes the position&rsquo;s balance to {mTokensAfterFig()}.</>) : null;
      return {
        happened: [clause(happened)],
        changed: changed ? [changed] : [],
        meansNow: [
          clause(
            <>
              Receipt tokens are ordinary ERC-20s, so the transfer carried the underlying {sym} claim and its collateral
              role into this position, with no supply event of its own.
            </>,
          ),
        ],
      };
    }

    case "transfer_out": {
      // A transfer to the market's own contract only happens as the
      // protocol's cut of a liquidation seize (the swept lane keeps it so
      // the balance stays exact); it is not a wallet the tokens went to.
      const toMarket = coords.mtoken != null && ctx.counterparty === coords.mtoken;
      const happened = toMarket ? (
        <>
          {transferDeltaFig("out")} of the receipt token was taken by the market itself — the protocol&rsquo;s share of
          a liquidation, split off from what the liquidator seized.
        </>
      ) : (
        <>Sent {transferDeltaFig("out")} of the receipt token to another wallet.</>
      );
      const changed: ClauseInput = rs.marketEmptied
        ? clause(<>That empties the position&rsquo;s stake in this market.</>)
        : rs.mTokensAfter != null
          ? clause(<>That leaves {mTokensAfterFig()} in the position.</>)
          : null;
      return {
        happened: [clause(happened)],
        changed: changed ? [changed] : [],
        meansNow: [clause(<>The underlying {sym} claim and its collateral role moved out with the tokens.</>)],
      };
    }

    default:
      return { happened: [] };
  }
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function moonwellExplainerTeaser(
  ctx: MoonwellContext,
  coords: MoonwellCoords,
  externalBy?: string,
): ReactNode | null {
  return splitLead(eventClauses(moonwellEventSlots(ctx, coords, { externalBy }))).lead;
}
