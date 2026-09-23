// SparkLend plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// SparkLend is an Aave V3 fork with the same single-Pool account model, so this
// is the twin of lib/aave-v3/explainer-clauses.tsx: the same resulting-state
// keying, the same variant coverage, re-grounded in SparkLend's own provenance
// vocabulary and symbols (spTokens, the spark_* event fields). Every clause is
// keyed on the touched reserve's running balance AFTER this event, never on the
// event type alone.
//
// Figures render through <Prov>: an `echo` of the primary receipt the card
// already carries — deltas → the header's ChainTruthRow, after-balances → the
// detail grid, and the liquidation legs / premium → the detail's forensics
// block. SparkLend has no same-tx sibling case and no cross-scope figure, so
// every traced figure here is an echo (the highlight rule §5.6: bold only a
// figure the reader can also see on the card's chrome).
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items SparkLend cannot fill per event, each a data fact of its
// stream (identical to Aave V3, the fork parent):
//   • §5.1 (risk consequence with figures) on ordinary events: the stream
//     carries no per-event health factor — only the liquidation embeds the
//     account's fall below 1.0 — so a health-factor before→after at event time
//     cannot be shown. The after-balance of the touched reserve keys the
//     resulting-state clause instead.
//   • §5.2 (mechanic-why on fees): an ordinary supply/withdraw/borrow/repay
//     charges no per-event fee. The only fee-like figure is the liquidation
//     bonus, priced by the valued sentence (§5.4).
//   • §5.4 beyond liquidations: no per-event USD is carried for ordinary events
//     beyond the after-balance chip, so no other valued net-outcome figure
//     exists to derive in prose.
// Filled: risk mechanics (account-wide health factor) as meansNow clauses; the
// valued premium (§5.4) on liquidations; the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { SparkContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import {
  assetsDeltaProv,
  transferDeltaProv,
  seizedCollateralProv,
  debtRepaidProv,
  supplyAfterProv,
  debtAfterProv,
  liqLegUsdProv,
  liqPremiumProv,
  type SparkCoords,
} from "@/lib/spark/event-provenance";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import { MAINNET_CHAIN_ID, explorerUrl } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";

/** A leg reads as cleared when its replayed after-balance sits at or below this
 *  — the interest-blind residual a full repay or a full seizure can leave. */
const EPS = 1e-6;

// ── resulting state ──────────────────────────────────────────────────────────

export interface SparkResultingState {
  supplyAfter: number | null;
  debtAfter: number | null;
}

/** Parse an optional after-field to a finite number, or null when absent — the
 *  never-empty floor: an absent after-field simply drops its clause. */
const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function resultingState(ctx: SparkContext): SparkResultingState {
  return { supplyAfter: num(ctx.supplyAfter), debtAfter: num(ctx.debtAfter) };
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
    <Prov echo info={info} value={value} symbol={symbol}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

const fmtAmt = (s: string | undefined): string => formatNumber(Math.abs(Number(s ?? "0")));

// ── the variant table ────────────────────────────────────────────────────────

/** The third-party-actor clause — the prose half of the pink chip the header
 *  renders when the position owner was neither the transaction signer nor the
 *  Pool's own caller.
 *
 *  `txFrom`/`poolCaller` ship exactly where that two-fact verdict is decidable
 *  (see SparkContext), so their presence IS the verdict — which is what keeps
 *  this a pure function with no owner address in hand. No party is named here:
 *  a clause builder can't reach the ENS hook, and the header's chip directly
 *  above the prose already carries the identity.
 *
 *  ⚠️ The mechanism below is DELIBERATELY the same one lib/aave-v3 states, and
 *  that is not a copy-paste slip. SparkLend is a fork of aave/aave-v3-core with
 *  the permission model untouched, so the authority a third party acts on is
 *  literally the same code path. This is the one place in the roster where two
 *  explorers may say the same thing; anywhere else, matching prose would mean
 *  one of them had borrowed an authority it does not have.
 *
 *  Split by direction, because SparkLend's own split is by direction:
 *    • Adding value — `supply(asset, amount, onBehalfOf, referralCode)` and
 *      `repay(asset, amount, interestRateMode, onBehalfOf)` credit any
 *      `onBehalfOf` the caller names, and no consent is checked.
 *    • Taking value out — a third party may only borrow after the owner called
 *      `approveDelegation(delegatee, amount)` (or `delegationWithSig`) on that
 *      reserve's VARIABLE DEBT TOKEN, for an amount the owner caps.
 *
 *  ⚠️ There is no withdraw branch, and its absence is load-bearing: a
 *  third-party withdraw is not expressible on SparkLend at all. `withdraw`
 *  burns msg.sender's OWN spTokens and `to` is only a recipient, so the chip
 *  can reach supply, repay and borrow rows and no others. */
function delegatedActorMechanic(ctx: SparkContext): ClauseInput {
  if (!ctx.txFrom || !ctx.poolCaller) return null;
  if (ctx.eventType === "borrow")
    return clause(
      <>
        Another account executed this on the owner&rsquo;s behalf. SparkLend lets one account draw debt against
        another&rsquo;s collateral only once the owner has delegated credit to it on that reserve&rsquo;s debt token, up
        to an amount the owner sets — so that approval was already in place before this borrow.
      </>,
    );
  if (ctx.eventType === "supply" || ctx.eventType === "repay")
    return clause(
      <>
        Another account executed this on the owner&rsquo;s behalf. Adding to a SparkLend position asks nothing of its
        owner: supplying and repaying both name the account to credit as an argument, and any address may name any other
        — so this needed no approval from the owner.
      </>,
    );
  return null;
}

export function sparkEventSlots(ctx: SparkContext, coords: SparkCoords): EventProseSlots {
  const slots = sparkEventSlotsBase(ctx, coords);
  const delegated = delegatedActorMechanic(ctx);
  if (!delegated) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), delegated] };
}

function sparkEventSlotsBase(ctx: SparkContext, coords: SparkCoords): EventProseSlots {
  const sym = ctx.reserveSymbol;
  const rs = resultingState(ctx);

  // The moved amount — echoes the header's ChainTruthRow delta receipt (same
  // prov builder + coords, the signed-string helper, the reserve symbol).
  const deltaFig = () => (
    <Fig
      info={assetsDeltaProv(sym, ctx.side, coords)}
      value={chainTruthDeltaValue(Number(ctx.assetsDelta), false)}
      symbol={sym}
    >
      {fmtAmt(ctx.assetsDelta)} {sym}
    </Fig>
  );
  // After-balances echo the detail grid's after-value receipt. The grid tows
  // the token glyph as an icon, not a `symbol`, so its receipt registers with a
  // null symbol — the echo omits `symbol` to key the same receipt. Value is
  // formatted exactly as the grid formats it (formatNumber over the string).
  const supplyAfterFig = () => (
    <Fig info={supplyAfterProv(sym, coords, ctx.raw?.supplyAfter)} value={formatNumber(Number(ctx.supplyAfter))}>
      {formatNumber(Number(ctx.supplyAfter))} {sym}
    </Fig>
  );
  const debtAfterFig = () => (
    <Fig info={debtAfterProv(sym, coords, ctx.raw?.debtAfter)} value={formatNumber(Number(ctx.debtAfter))}>
      {formatNumber(Number(ctx.debtAfter))} {sym}
    </Fig>
  );

  switch (ctx.eventType) {
    case "supply": {
      const happened =
        rs.supplyAfter != null ? (
          <>
            Supplied {deltaFig()} to SparkLend, bringing this position&rsquo;s supplied {sym} to {supplyAfterFig()}.
          </>
        ) : (
          <>Supplied {deltaFig()} to SparkLend.</>
        );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>
              The supplied {sym} earns SparkLend&rsquo;s variable supply rate, and any interest accrues into the balance
              itself so the supplied amount grows in place.
            </>,
          ),
          clause(<>Once enabled as collateral, the supplied {sym} also backs the account&rsquo;s borrowing.</>),
        ],
      };
    }

    case "withdraw": {
      const happened =
        rs.supplyAfter == null ? (
          <>Withdrew {deltaFig()} from SparkLend.</>
        ) : rs.supplyAfter <= EPS ? (
          <>
            Withdrew {deltaFig()} from SparkLend, emptying this position&rsquo;s supplied {sym}.
          </>
        ) : (
          <>
            Withdrew {deltaFig()} from SparkLend, leaving {supplyAfterFig()} supplied.
          </>
        );
      return {
        happened: [clause(happened)],
        meansNow: [],
      };
    }

    case "borrow": {
      const happened =
        rs.debtAfter != null ? (
          <>
            Borrowed {deltaFig()} against the account&rsquo;s collateral, taking this position&rsquo;s {sym} debt to{" "}
            {debtAfterFig()}.
          </>
        ) : (
          <>Borrowed {deltaFig()} against the account&rsquo;s collateral.</>
        );
      const ratePct = ctx.borrowRate ? (Number(ctx.borrowRate) / 1e27) * 100 : null;
      return {
        happened: [clause(happened)],
        meansNow: [
          ratePct != null && ratePct > 0
            ? clause(<>The variable borrow rate at the time was {ratePct.toFixed(2)}% a year.</>)
            : null,
        ],
      };
    }

    case "repay": {
      const usingSpTokens = ctx.useATokens ? " using spTokens" : "";
      const cleared = rs.debtAfter != null && rs.debtAfter <= EPS;
      const happened =
        rs.debtAfter == null ? (
          <>
            Repaid {deltaFig()} of the account&rsquo;s debt{usingSpTokens}.
          </>
        ) : cleared ? (
          <>
            Repaid {deltaFig()} of the account&rsquo;s debt{usingSpTokens}, clearing its {sym} debt in full.
          </>
        ) : (
          <>
            Repaid {deltaFig()} of the account&rsquo;s debt{usingSpTokens}, leaving {debtAfterFig()} outstanding.
          </>
        );
      return {
        happened: [clause(happened)],
        meansNow: [cleared ? clause(<>With the {sym} debt cleared, no further interest accrues on it.</>) : null],
      };
    }

    case "transfer_in": {
      const transferFig = (
        <Fig
          info={transferDeltaProv(sym, "in", coords)}
          value={chainTruthDeltaValue(Number(ctx.assetsDelta), false)}
          symbol={sym}
        >
          {fmtAmt(ctx.assetsDelta)} {sym}
        </Fig>
      );
      const named = getProtocolContract(ctx.counterparty, MAINNET_CHAIN_ID);
      const sender = named?.name ?? "another account";
      const happened =
        rs.supplyAfter != null ? (
          <>
            Received {transferFig} of supplied {sym} from {sender} as an spToken transfer, bringing this
            position&rsquo;s supplied {sym} to {supplyAfterFig()}.
          </>
        ) : (
          <>
            Received {transferFig} of supplied {sym} from {sender} as an spToken transfer.
          </>
        );
      return {
        happened: [clause(happened)],
        meansNow: [
          named ? clause(<>The sender is {named.role}.</>) : null,
          clause(
            <>
              This is a position move between accounts, not a fresh supply: the spTokens changed hands inside the Pool,
              so no new value entered the protocol.
            </>,
          ),
          clause(
            <>
              The received {sym} earns the supply rate like any supplied balance, and once enabled as collateral it
              backs the account&rsquo;s borrowing.
            </>,
          ),
        ],
      };
    }

    case "transfer_out": {
      const transferFig = (
        <Fig
          info={transferDeltaProv(sym, "out", coords)}
          value={chainTruthDeltaValue(Number(ctx.assetsDelta), false)}
          symbol={sym}
        >
          {fmtAmt(ctx.assetsDelta)} {sym}
        </Fig>
      );
      const emptied = rs.supplyAfter != null && rs.supplyAfter <= EPS;
      const named = getProtocolContract(ctx.counterparty, MAINNET_CHAIN_ID);
      const recipient = named?.name ?? "another account";
      const happened =
        rs.supplyAfter == null ? (
          <>
            Sent {transferFig} of supplied {sym} to {recipient} as an spToken transfer.
          </>
        ) : emptied ? (
          <>
            Sent {transferFig} of supplied {sym} to {recipient} as an spToken transfer, emptying this position&rsquo;s
            supplied {sym}.
          </>
        ) : (
          <>
            Sent {transferFig} of supplied {sym} to {recipient} as an spToken transfer, leaving {supplyAfterFig()}{" "}
            supplied.
          </>
        );
      return {
        happened: [clause(happened)],
        meansNow: [
          named ? clause(<>The recipient is {named.role}.</>) : null,
          clause(
            <>
              This is a position move between accounts, not a withdrawal to a wallet: custody moved to the receiving
              account and the tokens stayed inside the Pool.
            </>,
          ),
        ],
      };
    }

    case "liquidation":
      return liquidationSlots(ctx, coords, sym, rs);

    default:
      return { happened: [] };
  }
}

function liquidationSlots(
  ctx: SparkContext,
  coords: SparkCoords,
  debtSym: string,
  rs: SparkResultingState,
): EventProseSlots {
  const collSym = ctx.collateralSymbol ?? "the collateral";

  // Seized / cleared amounts echo the header's liquidation deltas (value keyed
  // to the header's signed source — seized from assetsDelta, cleared from
  // debtDelta, both negative there).
  const seizedFig = (
    <Fig
      info={seizedCollateralProv(collSym, coords)}
      value={chainTruthDeltaValue(Number(ctx.assetsDelta), false)}
      symbol={collSym}
    >
      {formatNumber(Number(ctx.liquidatedCollateralAmount ?? Math.abs(Number(ctx.assetsDelta))))} {collSym}
    </Fig>
  );
  const clearedFig = (
    <Fig
      info={debtRepaidProv(debtSym, coords)}
      value={chainTruthDeltaValue(Number(ctx.debtDelta), false)}
      symbol={debtSym}
    >
      {formatNumber(Number(ctx.debtToCover ?? Math.abs(Number(ctx.debtDelta))))} {debtSym}
    </Fig>
  );

  const happened = (
    <>
      The account&rsquo;s health factor fell below 1.0, so a liquidator repaid {clearedFig} of its debt and seized{" "}
      {seizedFig} of collateral in return.
    </>
  );

  // Resulting state of the touched reserves — echoes the detail grid's after
  // values (rendered only when both after-fields survive).
  const afterSupplyFig = (
    <Fig info={supplyAfterProv(collSym, coords, ctx.raw?.supplyAfter)} value={formatNumber(Number(ctx.supplyAfter))}>
      {formatNumber(Number(ctx.supplyAfter))} {collSym}
    </Fig>
  );
  const afterDebtFig = (
    <Fig info={debtAfterProv(debtSym, coords, ctx.raw?.debtAfter)} value={formatNumber(Number(ctx.debtAfter))}>
      {formatNumber(Number(ctx.debtAfter))} {debtSym}
    </Fig>
  );
  const changed: ClauseInput =
    rs.supplyAfter != null && rs.debtAfter != null
      ? clause(
          <>
            Afterward the position holds {afterSupplyFig} of collateral and owes {afterDebtFig} of debt on these
            reserves.
          </>,
        )
      : null;

  return {
    happened: [clause(happened)],
    changed: changed ? [changed] : [],
    meansNow: [
      valuedSentences(ctx, coords, collSym, debtSym),
      ctx.liquidator ? liquidatorClause(ctx.liquidator) : null,
    ],
  };
}

/** The valued pair — SparkLend's own oracle prices at the event's block value
 *  both legs, and their ratio is the liquidator's realized premium. Echoes the
 *  detail's forensics block. Drops WHOLE when either leg is unpriced (the
 *  never-empty floor). Two sentences: the two valued legs, then the premium. */
function valuedSentences(ctx: SparkContext, coords: SparkCoords, collSym: string, debtSym: string): ClauseInput {
  const cp = ctx.collateralPrice;
  const dp = ctx.debtPrice;
  const seizedAmt = Number(ctx.liquidatedCollateralAmount);
  const clearedAmt = Number(ctx.debtToCover);
  if (!cp || !dp || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || clearedAmt <= 0) return null;
  const seizedUsd = seizedAmt * cp.usd;
  const clearedUsd = clearedAmt * dp.usd;
  const premium = seizedUsd / clearedUsd - 1;
  const sign = premium >= 0 ? "+" : "−";
  const premiumPct = `${sign}${(Math.abs(premium) * 100).toFixed(2)}%`;

  const seizedUsdFig = (
    <Fig
      info={liqLegUsdProv("seized collateral", collSym, coords, {
        amount: `${ctx.liquidatedCollateralAmount} ${collSym}`,
        priceUsd: cp.usd,
      })}
      value={formatUsdValue(seizedUsd)}
      symbol={collSym}
    >
      {formatUsdValue(seizedUsd)}
    </Fig>
  );
  const clearedUsdFig = (
    <Fig
      info={liqLegUsdProv("cleared debt", debtSym, coords, {
        amount: `${ctx.debtToCover} ${debtSym}`,
        priceUsd: dp.usd,
      })}
      value={formatUsdValue(clearedUsd)}
      symbol={debtSym}
    >
      {formatUsdValue(clearedUsd)}
    </Fig>
  );
  const premiumFig = (
    <Fig
      info={liqPremiumProv(coords, { seizedUsd: formatUsdValue(seizedUsd), clearedUsd: formatUsdValue(clearedUsd) })}
      value={premiumPct}
    >
      {premiumPct}
    </Fig>
  );

  return clause(
    <>
      At SparkLend&rsquo;s own prices at the time, the seized collateral was worth {seizedUsdFig} against{" "}
      {clearedUsdFig} of debt cleared. That is a {premiumFig} premium to the liquidator.
    </>,
  );
}

const liquidatorClause = (liquidator: string): ClauseInput =>
  clause(
    <>
      Cleared by a third-party liquidator (typically an automated bot):{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", liquidator)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {liquidator.slice(0, 6)}…{liquidator.slice(-4)}
      </a>
      .
    </>,
  );

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations — the after-balance rides along on operate events). */
export function sparkExplainerTeaser(ctx: SparkContext, coords: SparkCoords): ReactNode | null {
  return splitLead(eventClauses(sparkEventSlots(ctx, coords))).lead;
}
