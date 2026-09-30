// SparkLend plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// SparkLend is an Aave V3 fork with the same single-Pool account model, so this
// is the twin of lib/aave-v3/explainer-clauses.tsx, re-grounded in SparkLend's
// own provenance vocabulary and symbols (spTokens, the spark_* event fields).
//
// Figures render through <Prov>: an `echo` of the primary receipt the card
// already carries — deltas → the header's ChainTruthRow, after-balances → the
// detail grid, and the liquidation legs / premium → the detail's forensics
// block (the highlight rule §5.6: bold only a figure the reader can also see on
// the card's chrome). The account figures (health factor, loan-to-value,
// e-mode, the reserve's collateral switch and limits, a liquidation's bonus and
// fee) come from the chain read at blocks N−1 and N the open card makes
// (lib/spark/event-state); without it the prose keeps to the row's figures.

import type { ReactNode } from "react";
import type { SparkContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import {
  H,
  clause,
  eventClauses,
  splitLead,
  type ClauseInput,
  type EventProseSlots,
} from "@/lib/shared/explainer-prose";
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
import { AmountText } from "@/components/shared/amount-text";
import { externalActor } from "@/lib/shared/external-actor";
import { hfLabelV4 } from "@/lib/aave-v4/format";
import { formatDate } from "@/lib/date";
import { emodeLabel, type SparkEmodeRead, type SparkEventState } from "@/lib/spark/event-state";
import {
  isGatewayWithdrawal,
  isSparkTreasury,
  sparkFeeLiquidation,
  sparkLiquidationFee,
  type SparkTimelineEvent,
} from "@/lib/spark/liquidation-fee";

/** A leg reads as cleared when its replayed after-balance sits at or below this
 *  — the interest-blind residual a full repay or a full seizure can leave. */
const EPS = 1e-6;

/** A sentence clause whose fragment carries no terminal punctuation. */
const sentence = (node: ReactNode): ClauseInput => clause(<>{node}.</>);

/** Below this health factor the prose says the account is close to the
 *  liquidation line and states the fall that would reach it (Aave V3's
 *  CLOSE_LIQUIDATION_HF). */
const CLOSE_HF = 1.1;

// ── resulting state ──────────────────────────────────────────────────────────

export interface SparkResultingState {
  supplyAfter: number | null;
  debtAfter: number | null;
}

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
/** A token amount at two decimals ("462,428.11"), four below 1. */
const fmt2 = (n: number): string =>
  Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2,
    minimumFractionDigits: Math.abs(n) < 1 ? 0 : 2,
  });
/** An oracle price as the card's price chip states it ("$1,511.12"). */
const fmtPrice = (p: number): string =>
  `$${p.toLocaleString("en-US", { maximumFractionDigits: p < 10 ? 4 : 2, minimumFractionDigits: p < 10 ? 4 : 2 })}`;
const pct2 = (bps: number): string => `${(bps / 100).toFixed(2)}%`;
/** A bonus or share as the protocol states it: "5%", "4.5%". */
const pctPlain = (f: number): string => `${Number((f * 100).toFixed(2))}%`;

export interface SparkSlotOpts {
  owner?: string;
  /** This transaction's rows: a liquidation and its fee transfer. */
  siblings?: SparkTimelineEvent[];
  /** The account read around this transaction and the previous one. */
  state?: SparkEventState;
  /** The previous transaction's last row, to name it. */
  previousEvent?: SparkTimelineEvent;
}

// ── the account around the event ─────────────────────────────────────────────

/** The fall in the collateral's value against the debt that would take the
 *  health factor to 1. */
const fallTo1 = (hf: number): number => Math.round((1 - 1 / hf) * 1000) / 10;

/** What the event did to the health factor, and the room left under the max
 *  loan-to-value. */
function healthLine(state: SparkEventState | undefined, opts: { withdraw?: boolean } = {}): ClauseInput {
  if (!state) return null;
  const b = state.before.hf;
  const a = state.after.hf;
  if (a == null) {
    return b == null
      ? null
      : clause(<>With no debt left, the account has no health factor and cannot be liquidated.</>);
  }
  const close =
    a < CLOSE_HF && a > 1 ? (
      <>
        , close to the liquidation line at 1: a fall of about {fallTo1(a)}% in the collateral&rsquo;s value against the
        debt would make the account liquidatable
      </>
    ) : null;
  const allowed = opts.withdraw ? (
    <>. The Pool allows a withdrawal only while the health factor stays at or above 1</>
  ) : null;
  if (b == null)
    return clause(
      <>
        Starting from no debt, the health factor is now <H>{hfLabelV4(a)}</H>
        {close}
        {allowed}.
      </>,
    );
  const d = a - b;
  const verb = Math.abs(d) < 0.0005 ? null : d > 0 ? "rose" : "fell";
  return clause(
    verb ? (
      <>
        The health factor {verb} from <H>{hfLabelV4(b)}</H> to <H>{hfLabelV4(a)}</H>
        {close}
        {allowed}.
      </>
    ) : (
      <>
        The health factor stayed at <H>{hfLabelV4(a)}</H>
        {close}
        {allowed}.
      </>
    ),
  );
}

/** The room left to borrow, and where liquidation starts. */
function roomLine(state: SparkEventState | undefined): ClauseInput {
  if (!state || state.after.debtUsd <= 0 || state.after.maxLtvBps <= 0) return null;
  const { after } = state;
  return sentence(
    state.roomUsdAfter > 0.5 ? (
      <>
        The account can borrow {formatUsdValue(state.roomUsdAfter)} more before its loan-to-value reaches the{" "}
        <H>{pct2(after.maxLtvBps)}</H> maximum; liquidation starts at <H>{pct2(after.liquidationThresholdBps)}</H>
      </>
    ) : (
      <>
        The loan-to-value sits at or above the <H>{pct2(after.maxLtvBps)}</H> maximum, so the account cannot borrow
        more; liquidation starts at <H>{pct2(after.liquidationThresholdBps)}</H>
      </>
    ),
  );
}

const emodeWords = (e: SparkEmodeRead): ReactNode =>
  e.id === 0 ? (
    <>no e-mode category</>
  ) : (
    <>
      the {emodeLabel(e)} e-mode category
      {e.ltvBps != null && e.liquidationThresholdBps != null ? (
        <>
          {" "}
          (LTV {pct2(e.ltvBps)}, liquidation at {pct2(e.liquidationThresholdBps)})
        </>
      ) : null}
    </>
  );

/** An e-mode change: between the previous event and this one (a
 *  setUserEMode with no row of its own), or inside this transaction. */
function emodeChangeLine(state: SparkEventState | undefined): ClauseInput {
  if (!state) return null;
  const p = state.emodePrevious;
  if (p && p.id !== state.emodeBefore.id) {
    const moved =
      state.prevHf != null && state.before.hf != null && Math.abs(state.before.hf - state.prevHf) >= 0.005
        ? state.before.hf > state.prevHf
          ? "raising"
          : "lowering"
        : null;
    return sentence(
      <>
        Between the previous event and this one the account moved from {emodeWords(p)} to{" "}
        {emodeWords(state.emodeBefore)}, a change with no row of its own
        {moved && state.prevHf != null && state.before.hf != null ? (
          <>
            , {moved} the health factor from {hfLabelV4(state.prevHf)} to {hfLabelV4(state.before.hf)}
          </>
        ) : null}
      </>,
    );
  }
  if (state.emodeBefore.id !== state.emodeAfter.id)
    return sentence(
      <>
        In this transaction the account moved from {emodeWords(state.emodeBefore)} to {emodeWords(state.emodeAfter)}
      </>,
    );
  return null;
}

/** Whether a supplied reserve backs borrowing, from its collateral switch and
 *  its liquidation threshold at the block. */
function collateralLine(state: SparkEventState | undefined, sym: string, received = false): ClauseInput {
  const r = state?.reserve;
  if (!state || !r?.collateral) return null;
  const what = received ? "The received" : "This";
  const lt = state.reserveLtBps ?? r.liquidationThresholdBps ?? 0;
  if (!r.collateral.after)
    return sentence(
      <>
        {what} {sym} does not back borrowing: its collateral switch is off, so it earns the supply rate only
      </>,
    );
  if (lt === 0)
    return sentence(
      <>
        {what} {sym} does not back borrowing: SparkLend gives {sym} a liquidation threshold of 0, so it earns the supply
        rate only
      </>,
    );
  if (lt < 100)
    return sentence(
      <>
        {what} {sym} backs almost nothing: SparkLend counts {sym} at {pct2(lt)} of its value
      </>,
    );
  const inEmode = r.inEmode && state.emodeAfter.id !== 0;
  return sentence(
    <>
      {what} {sym} counts as collateral: its collateral switch is on, it lends up to{" "}
      {pct2(state.reserveLtvBps ?? r.ltvBps ?? 0)} of its value, and its liquidation threshold is {pct2(lt)}
      {inEmode && r.ltvBps != null && r.liquidationThresholdBps != null ? (
        <>
          {" "}
          under the {emodeLabel(state.emodeAfter)} e-mode category ({pct2(r.ltvBps)} and{" "}
          {pct2(r.liquidationThresholdBps)} outside it)
        </>
      ) : null}
    </>,
  );
}

// ── the variant table ────────────────────────────────────────────────────────

/** The third-party-actor clause — the prose half of the pink chip the header
 *  renders when the position owner was neither the transaction signer nor the
 *  Pool's own caller.
 *
 *  Keyed on the header chip's own verdict (externalActor against the owner):
 *  the index ships `txFrom`/`poolCaller` on owner-sent rows too, so their
 *  presence is not the verdict. No party is named here:
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
function delegatedActorMechanic(ctx: SparkContext, owner: string | undefined): ClauseInput {
  if (!owner || !externalActor(ctx, owner)) return null;
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

export function sparkEventSlots(ctx: SparkContext, coords: SparkCoords, opts: SparkSlotOpts = {}): EventProseSlots {
  const slots = sparkEventSlotsBase(ctx, coords, opts);
  const delegated = delegatedActorMechanic(ctx, opts.owner);
  const emode = ctx.eventType === "liquidation" ? null : emodeChangeLine(opts.state);
  if (!emode && !delegated) return slots;
  // The e-mode change came before the event, so it leads what the event meant.
  return { ...slots, meansNow: [emode, ...(slots.meansNow ?? []), delegated] };
}

function sparkEventSlotsBase(ctx: SparkContext, coords: SparkCoords, opts: SparkSlotOpts): EventProseSlots {
  const sym = ctx.reserveSymbol;
  const rs = resultingState(ctx);
  const state = opts.state;

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
  // After-balances echo the detail grid's after-value receipt (null symbol:
  // the grid tows the glyph as an icon).
  const supplyAfterFig = () => (
    <Fig info={supplyAfterProv(sym, coords, ctx.raw?.supplyAfter)} value={formatNumber(Number(ctx.supplyAfter))}>
      <AmountText value={Number(ctx.supplyAfter)} /> {sym}
    </Fig>
  );
  const debtAfterFig = () => (
    <Fig info={debtAfterProv(sym, coords, ctx.raw?.debtAfter)} value={formatNumber(Number(ctx.debtAfter))}>
      <AmountText value={Number(ctx.debtAfter)} /> {sym}
    </Fig>
  );
  const transferFig = (dir: "in" | "out") => (
    <Fig
      info={transferDeltaProv(sym, dir, coords)}
      value={chainTruthDeltaValue(Number(ctx.assetsDelta), false)}
      symbol={sym}
    >
      {fmtAmt(ctx.assetsDelta)} {sym}
    </Fig>
  );
  const leaving = (): ReactNode =>
    rs.supplyAfter == null ? null : rs.supplyAfter <= EPS ? (
      <>, emptying this position&rsquo;s supplied {sym}</>
    ) : (
      <>, leaving {supplyAfterFig()} supplied</>
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
        meansNow: [collateralLine(state, sym), healthLine(state), roomLine(state)],
      };
    }

    case "withdraw":
      return {
        happened: [
          clause(
            <>
              Withdrew {deltaFig()} from SparkLend{leaving()}.
            </>,
          ),
        ],
        meansNow: [healthLine(state, { withdraw: true }), roomLine(state)],
      };

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
          healthLine(state),
          roomLine(state),
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
        meansNow: [
          cleared ? clause(<>With the {sym} debt cleared, no further interest accrues on it.</>) : null,
          healthLine(state),
          roomLine(state),
        ],
      };
    }

    case "transfer_in": {
      const happened = (
        <>
          Received {transferFig("in")} of supplied {sym} from another account as an spToken transfer
          {rs.supplyAfter != null ? (
            <>
              , bringing this position&rsquo;s supplied {sym} to {supplyAfterFig()}
            </>
          ) : null}
          .
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(<>The spTokens changed hands inside the Pool, so no new value entered the protocol.</>),
          collateralLine(state, sym, true),
          healthLine(state),
        ],
      };
    }

    case "transfer_out": {
      const liq = sparkFeeLiquidation(ctx, opts.siblings);
      if (liq) return feeSlots(ctx, coords, sym, liq);
      if (isGatewayWithdrawal(ctx))
        return {
          happened: [
            clause(
              <>
                Withdrew {transferFig("out")} as ETH through the Spark WETH gateway{leaving()}.
              </>,
            ),
          ],
          meansNow: [
            clause(
              <>
                On chain the spTokens moved to the gateway, the router Spark uses for ETH, which withdrew the WETH from
                the Pool and sent it to the wallet as ETH in the same transaction, so the Lifetime flows count it as
                withdrawn.
              </>,
            ),
            healthLine(state, { withdraw: true }),
            roomLine(state),
          ],
        };
      return {
        happened: [
          clause(
            <>
              Sent {transferFig("out")} of supplied {sym} to another account as an spToken transfer{leaving()}.
            </>,
          ),
        ],
        meansNow: [
          clause(<>The receiving account holds the spTokens now and earns on them; nothing left the Pool.</>),
          healthLine(state, { withdraw: true }),
        ],
      };
    }

    case "liquidation":
      return liquidationSlots(ctx, coords, sym, rs, opts);

    default:
      return { happened: [] };
  }
}

/** How a row's title names it, in running text: "withdrawal as ETH" for a
 *  gateway withdrawal, "liquidation fee" for the treasury's fee, else the act. */
export function sparkRowTitle(ctx: SparkContext): string {
  if (isGatewayWithdrawal(ctx)) return "withdrawal as ETH";
  if (ctx.eventType === "transfer_out" && isSparkTreasury(ctx.counterparty)) return "liquidation fee";
  const words: Record<string, string> = {
    supply: "supply",
    withdraw: "withdrawal",
    borrow: "borrow",
    repay: "repayment",
    liquidation: "liquidation",
    transfer_in: "transfer in",
    transfer_out: "transfer out",
  };
  return words[ctx.eventType] ?? ctx.eventType.replace("_", " ");
}

/** The bonus a liquidation paid, read off its own figures: the collateral that
 *  left (seized + fee) against the debt cleared at the block's prices, and the
 *  fee's share of the bonus. */
function bonusOf(liq: SparkContext, fee: SparkContext | undefined) {
  const cp = liq.collateralPrice?.usd;
  const dp = liq.debtPrice?.usd;
  const seized = Number(liq.liquidatedCollateralAmount);
  const cleared = Number(liq.debtToCover);
  const feeAmt = fee ? Math.abs(Number(fee.assetsDelta)) || 0 : 0;
  if (!cp || !dp || !(seized > 0) || !(cleared > 0)) return null;
  const base = (cleared * dp) / cp; // collateral worth the debt cleared
  const total = seized + feeAmt;
  const bonusPart = total - base;
  return {
    total,
    feeAmt,
    bonus: total / base - 1,
    feeShare: feeAmt > 0 && bonusPart > 0 ? feeAmt / bonusPart : null,
    premium: seized / base - 1,
    collUsd: total * cp,
    clearedUsd: cleared * dp,
  };
}

/** The liquidation's protocol fee: an spToken transfer to the Spark treasury
 *  in the liquidation's transaction. */
function feeSlots(ctx: SparkContext, coords: SparkCoords, sym: string, liq: SparkContext): EventProseSlots {
  const b = bonusOf(liq, ctx);
  const seized = Number(liq.liquidatedCollateralAmount);
  return {
    happened: [
      clause(
        <>
          Paid {transferFig(ctx, coords, sym)} of this position&rsquo;s collateral to the Spark treasury as the
          liquidation&rsquo;s protocol fee.
        </>,
      ),
    ],
    meansNow: [
      b
        ? clause(
            <>
              This row and the Liquidated row are one transaction: the Pool took {fmt2(b.total)} {sym} of collateral,{" "}
              {fmt2(seized)} {sym} to the liquidator first and {fmt2(b.feeAmt)} {sym} here after it
              {b.feeShare != null ? (
                <>, SparkLend&rsquo;s {pctPlain(b.feeShare)} share of the liquidation bonus</>
              ) : null}
              . The liquidation&rsquo;s card sets out the rest.
            </>,
          )
        : clause(<>The liquidation&rsquo;s card in this transaction sets out the rest.</>),
    ],
  };
}

const transferFig = (ctx: SparkContext, coords: SparkCoords, sym: string) => (
  <Fig
    info={transferDeltaProv(sym, "out", coords)}
    value={chainTruthDeltaValue(Number(ctx.assetsDelta), false)}
    symbol={sym}
  >
    {fmtAmt(ctx.assetsDelta)} {sym}
  </Fig>
);

function liquidationSlots(
  ctx: SparkContext,
  coords: SparkCoords,
  debtSym: string,
  rs: SparkResultingState,
  opts: SparkSlotOpts,
): EventProseSlots {
  const collSym = ctx.collateralSymbol ?? "the collateral";
  const state = opts.state;
  const fee = sparkLiquidationFee(ctx, opts.siblings);
  const b = bonusOf(ctx, fee);

  // Seized / cleared amounts echo the header's liquidation deltas.
  const seizedFig = (
    <Fig
      info={seizedCollateralProv(collSym, coords)}
      value={chainTruthDeltaValue(Number(ctx.assetsDelta), false)}
      symbol={collSym}
    >
      <AmountText value={Number(ctx.liquidatedCollateralAmount ?? Math.abs(Number(ctx.assetsDelta)))} /> {collSym}
    </Fig>
  );
  const clearedFig = (
    <Fig
      info={debtRepaidProv(debtSym, coords)}
      value={chainTruthDeltaValue(Number(ctx.debtDelta), false)}
      symbol={debtSym}
    >
      <AmountText value={Number(ctx.debtToCover ?? Math.abs(Number(ctx.debtDelta)))} /> {debtSym}
    </Fig>
  );

  // One statement of what left: the liquidator's share + the treasury's fee.
  const happened =
    b && b.feeAmt > 0 ? (
      <>
        A liquidator repaid {clearedFig} of the account&rsquo;s debt and took {fmt2(b.total)} {collSym} of its
        collateral: {seizedFig} to the liquidator + {fmt2(b.feeAmt)} {collSym} to the Spark treasury. The fee is the
        Liquidation fee row, in this same transaction; the Pool paid it after the seizure.
      </>
    ) : (
      <>
        A liquidator repaid {clearedFig} of the account&rsquo;s debt and took {seizedFig} of its collateral.
      </>
    );

  // How the account got there: the move since the previous event, then the
  // oracle update inside this block ahead of the call.
  const hfCall = state?.liqHfAtCall ?? state?.before.hf ?? null;
  const prevName = opts.previousEvent
    ? `the ${sparkRowTitle(opts.previousEvent.context.data)} on ${formatDate(opts.previousEvent.timestamp)}`
    : "the previous event";
  const collBefore = num(ctx.supplyBefore);
  const debtBeforeAmt = num(ctx.debtBefore);
  const heldBefore =
    collBefore != null && debtBeforeAmt != null ? (
      <>
        : the {fmt2(collBefore)} {collSym} and {fmt2(debtBeforeAmt)} {debtSym} held before the call, valued at that
        price
      </>
    ) : null;
  const pathLine: ClauseInput =
    state && hfCall != null
      ? sentence(
          <>
            {state.prevHf != null && state.priceMove ? (
              <>
                Since {prevName}, {state.priceMove.symbol}&rsquo;s oracle price{" "}
                {(state.liqPriceMove?.from ?? state.priceMove.to) < state.priceMove.from ? "fell" : "rose"} from{" "}
                {fmtPrice(state.priceMove.from)} to {fmtPrice(state.liqPriceMove?.from ?? state.priceMove.to)} and the
                health factor from {hfLabelV4(state.prevHf)} to {hfLabelV4(state.before.hf)} by the end of the block
                before the liquidation.{" "}
              </>
            ) : null}
            {state.liqPriceMove && state.before.hf != null && state.liqHfAtCall != null ? (
              <>
                In the liquidation&rsquo;s block the oracle moved {state.liqPriceMove.symbol} to{" "}
                <H>{fmtPrice(state.liqPriceMove.to)}</H> before the call ran, which took the health factor to{" "}
                <H>{hfLabelV4(hfCall)}</H>, below 1{heldBefore}
              </>
            ) : (
              <>
                The health factor stood at <H>{hfLabelV4(hfCall)}</H> when the liquidator called, below 1
              </>
            )}
          </>,
        )
      : sentence(<>The account&rsquo;s health factor had fallen below 1, so anyone could liquidate it</>);

  // The close factor (Aave V3 LiquidationLogic before v3.3, which SparkLend
  // runs): half the debt in the asset repaid while the health factor is above
  // 0.95, all of it at or below.
  const debtBefore = num(ctx.debtBefore);
  const cleared = Number(ctx.debtToCover);
  const half = debtBefore != null && debtBefore > 0 ? Math.abs(cleared / debtBefore - 0.5) < 0.001 : false;
  const closeLine: ClauseInput = sentence(
    <>
      One liquidation may repay at most half of the debt in the asset it repays while the health factor is between 0.95
      and 1, and all of it at 0.95 or below
      {half && debtBefore != null ? (
        <>
          : the {fmt2(cleared)} {debtSym} repaid here is half of the {fmt2(debtBefore)} {debtSym} owed
        </>
      ) : null}
    </>,
  );

  // The bonus: the collateral reserve's (or its e-mode category's) at the end
  // of the block before, and the treasury's share of it.
  const r = state?.reserve;
  const configured =
    r && r.inEmode && state && state.emodeBefore.id !== 0 && state.emodeBefore.liquidationBonusBps != null
      ? state.emodeBefore.liquidationBonusBps
      : (r?.liquidationBonusBps ?? null);
  const feeBps = r?.liquidationProtocolFeeBps ?? null;
  const premiumPct = b ? `${b.premium >= 0 ? "+" : "−"}${(Math.abs(b.premium) * 100).toFixed(2)}%` : null;
  const premiumFig =
    b && premiumPct ? (
      <Fig
        info={liqPremiumProv(coords, {
          seizedUsd: formatUsdValue(Number(ctx.liquidatedCollateralAmount) * (ctx.collateralPrice?.usd ?? 0)),
          clearedUsd: formatUsdValue(b.clearedUsd),
        })}
        value={premiumPct}
      >
        {premiumPct}
      </Fig>
    ) : null;
  const bonusLine: ClauseInput =
    configured != null && configured > 10000 && b
      ? sentence(
          <>
            The liquidation bonus on {collSym} was {pctPlain((configured - 10000) / 10000)}: the collateral taken was
            worth that much more than the debt repaid
            {feeBps != null && feeBps > 0 && b.feeAmt > 0 ? (
              <>
                , and SparkLend keeps {pctPlain(feeBps / 10000)} of the bonus as its fee, so the liquidator&rsquo;s
                premium was {premiumFig}
              </>
            ) : (
              <>, the liquidator&rsquo;s premium {premiumFig}</>
            )}
          </>,
        )
      : b && premiumFig
        ? sentence(<>The collateral the liquidator took was worth {premiumFig} more than the debt it repaid</>)
        : null;

  // The borrower's net: every unit of collateral that left, valued against the
  // debt cleared, at the block's prices.
  const cp = ctx.collateralPrice;
  const dp = ctx.debtPrice;
  const netLine: ClauseInput =
    b && cp && dp
      ? sentence(
          <>
            At the prices in that block the account gave up {formatUsdValue(b.collUsd)} of collateral for{" "}
            <Fig
              info={liqLegUsdProv("cleared debt", debtSym, coords, {
                amount: `${ctx.debtToCover} ${debtSym}`,
                priceUsd: dp.usd,
              })}
              value={formatUsdValue(b.clearedUsd)}
              symbol={debtSym}
            >
              {formatUsdValue(b.clearedUsd)}
            </Fig>{" "}
            of debt cleared: a net {b.clearedUsd - b.collUsd < 0 ? "−" : "+"}
            {formatUsdValue(Math.abs(b.clearedUsd - b.collUsd))} to the borrower
          </>,
        )
      : null;

  // What the account kept: after the fee, where the transaction paid one.
  const finalColl = fee?.supplyAfter
    ? { amount: fee.supplyAfter, raw: fee.raw?.supplyAfter }
    : { amount: ctx.supplyAfter, raw: ctx.raw?.supplyAfter };
  const afterLine: ClauseInput =
    rs.supplyAfter != null && rs.debtAfter != null
      ? sentence(
          <>
            {state?.after.hf != null && hfCall != null ? (
              <>
                The health factor went from <H>{hfLabelV4(hfCall)}</H> to <H>{hfLabelV4(state.after.hf)}</H>, and the
                account stays open with{" "}
              </>
            ) : (
              <>The account stays open with </>
            )}
            <Fig
              info={supplyAfterProv(collSym, coords, finalColl.raw)}
              value={formatNumber(Number(finalColl.amount))}
            >
              <AmountText value={Number(finalColl.amount)} /> {collSym}
            </Fig>{" "}
            supplied against{" "}
            <Fig info={debtAfterProv(debtSym, coords, ctx.raw?.debtAfter)} value={formatNumber(Number(ctx.debtAfter))}>
              <AmountText value={Number(ctx.debtAfter)} /> {debtSym}
            </Fig>{" "}
            owed; it can be liquidated again if the health factor falls below 1
          </>,
        )
      : null;

  return {
    happened: [clause(happened)],
    meansNow: [
      pathLine,
      closeLine,
      bonusLine,
      netLine,
      afterLine,
      ctx.liquidator ? liquidatorClause(ctx.liquidator) : null,
    ],
  };
}

const liquidatorClause = (liquidator: string): ClauseInput =>
  clause(
    <>
      Sent by liquidator{" "}
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
 *  trailing continuations). It reads no account state, so the lead never
 *  depends on it. */
export function sparkExplainerTeaser(
  ctx: SparkContext,
  coords: SparkCoords,
  opts: SparkSlotOpts = {},
): ReactNode | null {
  return splitLead(eventClauses(sparkEventSlots(ctx, coords, { owner: opts.owner, siblings: opts.siblings }))).lead;
}
