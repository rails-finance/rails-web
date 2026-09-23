// Compound V2 plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the position looks
// like AFTER this event), never on the event type alone: a repay that clears the
// debt, a repay that leaves it standing, a liquidation the account survives and
// one that empties its debt all read differently. The state-blind morals the old
// bullets carried ("Withdrawing reduces the collateral backing any outstanding
// debt") are gone — replaced by facts about THIS event's own figures. Compound
// V2 is cross-market through one risk controller, so a single event carries only
// its own market's after-fields; when an after-field is absent the resulting-
// state clause simply drops (the never-empty floor).
//
// Figures render through <Prov echo>: every figure here already has a primary
// receipt on the same card — the spine token flank (the moved amount) and the
// detail grid (after-balances, the debt after, the seized collateral). There is
// no cross-card figure to register as a primary; the liquidation narrates its
// own two legs (it already carries both), and each seize leg only cross-
// references the transaction's liquidation in words.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Compound V2 cannot fill in the event pane, each a data fact:
//   • §5.1 (risk consequence with a ratio per event): the event stream carries
//     no per-event collateral factor or account-wide health — a single cToken
//     event only knows its own market's balances, not the cross-market ratio.
//     Stated on the position pane, where the live account read supplies it.
//   • §5.4 (derived valued net-outcome): a liquidation's valued two-leg premium
//     (seized vs cleared at the block's oracle price, landed on the incentive)
//     lives on the card's own forensics grid (chain reads scaled with the
//     collateral market's exchange rate). The pane states the premium
//     qualitatively — the seized collateral is worth the repaid debt plus the
//     incentive — rather than re-deriving that oracle math in copy, which would
//     be a second implementation free to drift.
// Filled: mechanic-why on the interest that grows debt (§5.2); forward context
// on the partial-liquidation survival state (§5.3); same-transaction sibling
// cross-references on the seize legs (§5.5); the highlight rule via Fig (§5.6).

import type { ReactNode } from "react";
import type { BaseActivityEvent, CompoundV2Context } from "@/lib/shared/types/event-shape";
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
  cTokensDeltaProv,
  transferAmountProv,
  seizeLegProv,
  accountBorrowsProv,
  liqDebtRepaidProv,
  seizeTokensProv,
  cTokensAfterProv,
  type CompoundV2Coords,
} from "@/lib/compound-v2/event-provenance";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const EPS = 1e-9;

export type CompoundV2Event = BaseActivityEvent & {
  context: { protocol: "compound-v2"; data: CompoundV2Context };
};

// ── resulting state ──────────────────────────────────────────────────────────

export interface CompoundV2ResultingState {
  supplyAfter: number | null;
  debtAfter: number | null;
  hasDebtAfter: boolean;
  debtCleared: boolean;
  supplyEmptied: boolean;
}

export function resultingState(ctx: CompoundV2Context): CompoundV2ResultingState {
  const supplyAfter = ctx.supplyAfter != null ? Number(ctx.supplyAfter) : null;
  const debtAfter = ctx.debtAfter != null ? Number(ctx.debtAfter) : null;
  return {
    supplyAfter,
    debtAfter,
    hasDebtAfter: debtAfter != null && debtAfter > EPS,
    debtCleared: debtAfter != null && debtAfter <= EPS,
    supplyEmptied: supplyAfter != null && supplyAfter <= EPS,
  };
}

// ── sibling predicate ────────────────────────────────────────────────────────

/** The same-transaction liquidation a seize leg pays down. A seize is never a
 *  standalone act — its debt repayment is a LiquidateBorrow in the same
 *  transaction, whose own market is the DEBT that was cleared. Used to name that
 *  debt market in the seize leg's cross-reference (phrased against the
 *  transaction, since the liquidation card may render on a different page). */
export function siblingLiquidation(siblings: CompoundV2Event[], self: CompoundV2Event): CompoundV2Event | undefined {
  return siblings.find((s) => s !== self && s.context.data.eventType === "liquidation");
}

// ── figure + link rendering ──────────────────────────────────────────────────

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
    <Prov echo info={info} value={value} symbol={symbol}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

/** Etherscan address link, click-isolated from the card. */
function Addr({ address }: { address: string }) {
  return (
    <a
      href={explorerUrl(MAINNET_CHAIN_ID, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {address.slice(0, 6)}…{address.slice(-4)}
    </a>
  );
}

const fmtAbs = (h?: string): string => formatNumber(Math.abs(Number(h)));
const fmtVal = (h?: string): string => formatNumber(Number(h));

// ── the variant table ────────────────────────────────────────────────────────

export function compoundV2EventSlots(
  ctx: CompoundV2Context,
  coords: CompoundV2Coords,
  siblings: CompoundV2Event[],
  self: CompoundV2Event,
  externalBy?: string,
): EventProseSlots {
  const sym = ctx.marketSymbol ?? "the asset";
  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  const cSym = market?.cSymbol ?? `c${sym}`;
  const rs = resultingState(ctx);

  // A moved amount echoes the spine flank / detail-grid change receipt (signed
  // exact value through chainTruthDeltaValue → the entry key matches).
  const deltaFig = (info: Provenance, signed: string | undefined, display: ReactNode, symbol?: string) => (
    <Fig info={info} value={chainTruthDeltaValue(Number(signed ?? 0), false)} symbol={symbol}>
      {display}
    </Fig>
  );
  // An after-balance echoes the detail grid's after-value receipt.
  const afterFig = (info: Provenance, human: string | undefined, symbol: string) => (
    <Fig info={info} value={fmtVal(human)} symbol={symbol}>
      {fmtVal(human)} {symbol}
    </Fig>
  );

  const underlyingDelta = (eventType: "mint" | "redeem" | "borrow" | "repay") =>
    deltaFig(
      assetsDeltaProv(sym, eventType, coords, ctx.raw?.amount),
      ctx.assetsDelta,
      <>
        {fmtAbs(ctx.assetsDelta)} {sym}
      </>,
      sym,
    );
  // The cToken leg echoes the header delta (symbol present) for the moves the
  // header emits — transfers and seize legs. On mint/redeem the header emits
  // only the UNDERLYING leg, so the cToken delta's only receipt is the detail
  // grid's transition change, which registers with NO symbol: pass `symbol`
  // undefined there so the echo key matches.
  const cTokenDelta = (info: Provenance, symbol?: string) =>
    deltaFig(
      info,
      ctx.cTokensDelta,
      <>
        {fmtAbs(ctx.cTokensDelta)} {cSym}
      </>,
      symbol,
    );
  const cTokensAfterFig = () => afterFig(cTokensAfterProv(cSym, coords, ctx.raw?.cTokensAfter), ctx.cTokensAfter, cSym);
  const debtAfterFig = (fromLiquidation?: boolean) =>
    afterFig(accountBorrowsProv(sym, coords, ctx.raw?.accountBorrows, fromLiquidation), ctx.debtAfter, sym);

  // The interest mechanic — the only "fee" Compound V2 charges is the interest
  // that grows the debt between events (§5.2), stated as what the figure means.
  const debtInterestNote = (): ClauseInput =>
    rs.hasDebtAfter
      ? clause(
          <>
            Interest accrues continuously, so the debt shown already includes what has built up to this point — it is
            the amount owed now, not just what was drawn.
          </>,
        )
      : null;

  switch (ctx.eventType) {
    case "mint": {
      const happened = (
        <>
          Supplied {underlyingDelta("mint")} to Compound&rsquo;s {sym} market, receiving{" "}
          {cTokenDelta(cTokensDeltaProv(cSym, "mint", coords, ctx.raw?.cTokens))}.
        </>
      );
      return {
        happened: [clause(happened)],
        changed: [
          ctx.cTokensAfter != null ? clause(<>The position now holds {cTokensAfterFig()} in this market.</>) : null,
        ],
        meansNow: [
          clause(
            <>
              The cToken is a transferable receipt — its balance times the market&rsquo;s exchange rate is the
              underlying claim. That claim grows as interest accrues.
            </>,
          ),
        ],
      };
    }

    case "redeem": {
      const happened = (
        <>
          Withdrew {underlyingDelta("redeem")} from the {sym} market, burning{" "}
          {cTokenDelta(cTokensDeltaProv(cSym, "redeem", coords, ctx.raw?.cTokens))}.
        </>
      );
      const changed: ClauseInput = rs.supplyEmptied
        ? clause(<>This withdrawal emptied the position&rsquo;s {sym} supply.</>)
        : ctx.cTokensAfter != null
          ? clause(<>The position now holds {cTokensAfterFig()} in this market.</>)
          : null;
      return { happened: [clause(happened)], changed: [changed] };
    }

    case "borrow": {
      const debtBefore =
        ctx.debtBefore != null
          ? Number(ctx.debtBefore)
          : rs.debtAfter != null && ctx.assetsDelta != null
            ? rs.debtAfter - Number(ctx.assetsDelta)
            : null;
      const firstBorrow = debtBefore != null && debtBefore <= EPS;
      const happened =
        rs.debtAfter == null ? (
          <>Borrowed {underlyingDelta("borrow")} against the account&rsquo;s supplied collateral.</>
        ) : firstBorrow ? (
          <>
            Borrowed {underlyingDelta("borrow")} against the account&rsquo;s supplied collateral — its first {sym} debt,
            at {debtAfterFig()}.
          </>
        ) : (
          <>
            Borrowed {underlyingDelta("borrow")} against the account&rsquo;s supplied collateral, taking its {sym} debt
            to {debtAfterFig()}.
          </>
        );
      return { happened: [clause(happened)], meansNow: [debtInterestNote()] };
    }

    case "repay": {
      const paidBy = externalBy ? ", paid by another address" : "";
      const ending: ClauseInput = rs.debtCleared
        ? cont(<>, clearing it in full.</>)
        : rs.hasDebtAfter
          ? cont(<>, leaving {debtAfterFig()} outstanding.</>)
          : null;
      const opener =
        ending == null ? (
          <>
            Repaid {underlyingDelta("repay")} of the position&rsquo;s {sym} debt{paidBy}.
          </>
        ) : (
          <>
            Repaid {underlyingDelta("repay")} of the position&rsquo;s {sym} debt{paidBy}
          </>
        );
      return {
        happened: [clause(opener), ending],
        meansNow: [
          rs.hasDebtAfter
            ? clause(
                <>
                  Interest accrues continuously, so any gap from the previous event&rsquo;s figure is that interest, not
                  new borrowing.
                </>,
              )
            : null,
        ],
      };
    }

    case "liquidation":
      return liquidationSlots(ctx, coords, sym, cSym, rs, debtAfterFig, deltaFig, afterFig);

    case "transfer_in":
      return {
        happened: [
          clause(
            <>
              Received {cTokenDelta(transferAmountProv(cSym, "in", coords, ctx.raw?.cTokens), cSym)} from another
              wallet.
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              cTokens are ordinary transferable tokens, so this moved the underlying {sym} claim — and its collateral
              role — into the position, with no supply or borrow event.
            </>,
          ),
        ],
      };

    case "transfer_out":
      return {
        happened: [
          clause(
            <>Sent {cTokenDelta(transferAmountProv(cSym, "out", coords, ctx.raw?.cTokens), cSym)} to another wallet.</>,
          ),
        ],
        meansNow: [
          clause(
            <>The underlying {sym} claim — and its collateral role — moved out of the position with the tokens.</>,
          ),
        ],
      };

    case "seize_out": {
      const takenBy = ctx.counterparty ? (
        <>
          {" "}
          — taken by liquidator <Addr address={ctx.counterparty} />
        </>
      ) : null;
      const sibSym = siblingLiquidation(siblings, self)?.context.data.marketSymbol;
      return {
        happened: [
          clause(
            <>
              A liquidation seized {cTokenDelta(seizeLegProv(cSym, "seize_out", coords, ctx.raw?.cTokens), cSym)} of
              this account&rsquo;s collateral{takenBy}, not sent by the account.
            </>,
          ),
        ],
        changed: [
          ctx.cTokensAfter != null ? clause(<>The position now holds {cTokensAfterFig()} of collateral here.</>) : null,
        ],
        meansNow: [
          clause(
            <>
              The seized receipt tokens carry the underlying {sym} claim; the debt they paid down is the{" "}
              {sibSym ? `${sibSym} ` : ""}liquidation in the same transaction.
            </>,
          ),
        ],
      };
    }

    case "seize_in": {
      const takenFrom = ctx.counterparty ? (
        <>
          {" "}
          — collateral taken from <Addr address={ctx.counterparty} />
        </>
      ) : null;
      const sibSym = siblingLiquidation(siblings, self)?.context.data.marketSymbol;
      return {
        happened: [
          clause(
            <>
              Received {cTokenDelta(seizeLegProv(cSym, "seize_in", coords, ctx.raw?.cTokens), cSym)} as the liquidator
              in a seizure{takenFrom}.
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              It is worth the repaid debt plus Compound&rsquo;s liquidation incentive, less the protocol&rsquo;s own
              burned cut. The debt repaid is the {sibSym ? `${sibSym} ` : ""}liquidation in the same transaction.
            </>,
          ),
        ],
      };
    }

    case "seize_burn":
      return {
        happened: [
          clause(
            <>
              Compound kept its own cut of this seizure:{" "}
              {cTokenDelta(seizeLegProv(cSym, "seize_burn", coords, ctx.raw?.cTokens), cSym)} moved out of the account
              and was burned — total supply drops and no wallet receives it.
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              This is the protocol&rsquo;s fixed share of every seizure (about 2.8%); together with the
              liquidator&rsquo;s share it is the whole seizure taken in this transaction.
            </>,
          ),
        ],
      };

    default:
      return { happened: [] };
  }
}

function liquidationSlots(
  ctx: CompoundV2Context,
  coords: CompoundV2Coords,
  sym: string,
  _cSym: string,
  rs: CompoundV2ResultingState,
  debtAfterFig: (fromLiquidation?: boolean) => ReactNode,
  deltaFig: (info: Provenance, signed: string | undefined, display: ReactNode, symbol?: string) => ReactNode,
  afterFig: (info: Provenance, human: string | undefined, symbol: string) => ReactNode,
): EventProseSlots {
  const collM = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
  const collCSym = collM?.cSymbol ?? (ctx.collateralSymbol ? `c${ctx.collateralSymbol}` : "");

  const repaidFig = deltaFig(
    liqDebtRepaidProv(sym, coords, ctx.raw?.amount),
    ctx.assetsDelta,
    <>
      {fmtAbs(ctx.assetsDelta)} {sym}
    </>,
    sym,
  );
  const seizedFig =
    ctx.seizeTokens != null && collCSym
      ? afterFig(seizeTokensProv(collCSym, coords, ctx.raw?.seizeTokens), ctx.seizeTokens, collCSym)
      : null;

  const happened = (
    <>
      The account&rsquo;s borrowed value outgrew what its collateral covers, so a liquidator repaid {repaidFig} of its{" "}
      {sym} debt{seizedFig ? <> and seized {seizedFig} of collateral</> : null}.
    </>
  );

  const changed: ClauseInput = rs.hasDebtAfter
    ? clause(
        <>
          The account survived — {debtAfterFig(true)} of {sym} debt remains.
        </>,
      )
    : rs.debtCleared
      ? clause(<>The liquidation cleared the account&rsquo;s {sym} debt in full.</>)
      : null;

  // The close-factor rule (partial liquidations, at most half of one market's
  // debt) is Layer-2 material — the "?" modal (compoundV2LiquidationContent)
  // carries it; the pane keeps only this event's own figures and relations.
  const meansNow: ClauseInput[] = [
    clause(<>The seized collateral is worth the repaid debt plus Compound&rsquo;s liquidation incentive.</>),
  ];
  if (ctx.liquidator) {
    meansNow.push(
      clause(
        <>
          Carried out by a third-party liquidator, usually an automated bot: <Addr address={ctx.liquidator} />.
        </>,
      ),
    );
  }

  return { happened: [clause(happened)], changed: [changed], meansNow };
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function compoundV2ExplainerTeaser(
  ctx: CompoundV2Context,
  coords: CompoundV2Coords,
  siblings: CompoundV2Event[],
  self: CompoundV2Event,
  externalBy?: string,
): ReactNode | null {
  return splitLead(eventClauses(compoundV2EventSlots(ctx, coords, siblings, self, externalBy))).lead;
}
