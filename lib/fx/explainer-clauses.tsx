// f(x) V2 plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on what THIS event carries, never on the event type
// alone: an operate that opens the first leg, one that only adjusts, one that
// empties (closes) the position, a liquidation that empties it, a tick
// rebalance, a mint vs a move all read differently. f(x) has a hard keying
// limit the other protocols don't: funding charges on collateral, and
// socialized rebalances and bad-debt write-offs on debt, move a position's
// real collateral and debt with NO per-position event, so an event can never assert what the position holds
// NOW — only what this event itself did and what the events so far imply.
// The variants say exactly that and nothing more (the never-empty floor drops
// any figure the event doesn't carry).
//
// Figures render through <Prov echo>: the same figure the card's header or
// detail grid already carries a primary receipt for (the moved deltas → header;
// the event-implied debt, protocol fee, liquidation legs, oracle price, tick
// amounts → detail grid). No cross-scope primaries here (f(x) has no sibling
// seam), so every Fig is an echo.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items f(x) cannot fill, each a data fact of its pipeline:
//   • §5.1 (risk consequence per event): the position's debt ratio is a read of
//     the pool's own view (settled), never carried in an event; collateral
//     (token units) and debt (fxUSD) live in two unit systems that never share
//     a price, so no per-event ratio is computable. Partly filled via the
//     per-event oracle price (USD per normalized unit) where the snapshot
//     carries one.
//   • §5.4 (derived net-outcome, a premium landed on a constant): a
//     liquidation seizes in normalized units and clears fxUSD debt; fxUSD is
//     not $1-pinned and the two never share a price, so a premium % cannot be
//     landed without equating fxUSD to USD (the chain-truth charter forbids
//     the pin). No net-outcome figure exists to derive.
//   • §5.3 (forward paths on named abnormal states): f(x) events carry no
//     recoverable per-event state a holder could act on next (no zombie, no
//     claimable surplus the event states); the only forward mechanic is the
//     write-off possibility on an emptying liquidation, stated there.
// Filled: mechanic-why (§5.2) on the protocol fee, the close's socialized
// reconciliation, and the liquidation write-off; aggregate context (§5.5) via the whole-band tick
// rebalance with its "not this position's share" caveat; the highlight rule
// (§5.6) via Fig echo.

import type { ReactNode } from "react";
import type { FxContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import {
  collDeltaProv,
  debtDeltaProv,
  protocolFeesProv,
  liqCollsProv,
  liqDebtRepaidProv,
  impliedDebtAfterProv,
  chainAfterProv,
  snapOraclePriceProv,
  tickRebalanceHitProv,
  tickRebAmountProv,
  transferPartyProv,
  rowStateProv,
  wstethRateProv,
  stethEquivalentProv,
  protocolShareProv,
  unpaidDebtProv,
  feeScheduleProv,
  debtEquationProv,
  inTxFundingProv,
  type FxCoords,
} from "@/lib/fx/event-provenance";
import type { FxSide } from "@/lib/fx/use-event-state";
import type { FxFeeSchedule } from "@/lib/sources/chain/fx-event-state";
import { fxRowFees, fxFeePct, fxScheduleFull, fxLiquidationMoved } from "@/lib/fx/row-figures";
import { fxCollMoved, fxFundingText, fxRowFunding } from "@/lib/fx/in-tx-funding";
import { FX_ADDRESSES, FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { fxExternalActor } from "@/lib/fx/external-actor";
import { formatExact, formatNumber, formatTinyNonZero } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";

/** What the row's read (getPosition at block − 1 and at the block) adds to the
 *  prose, once it has landed. */
export interface FxRowRead {
  before: FxSide | null;
  after: FxSide | null;
  fees?: FxFeeSchedule | null;
  expenseRatio?: number | null;
  /** Rebalance rows of this position sharing the block. */
  blockPeers?: number;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// ── figure rendering ─────────────────────────────────────────────────────────
// A Fig bolds a figure (semibold + foreground) ONLY when it is mirrored on the
// card's chrome (§3 highlight rule), and echoes that chrome receipt so the
// inspector pulses the two as one identity. `symbol` is passed only for the
// header-mirrored deltas (the header registers a token symbol); detail-grid
// primaries register no symbol, so their echoes omit it to match the key.

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

const fmtAmt = (h?: string): string => formatNumber(Math.abs(Number(h)));
const fmtVal = (h?: string): string => formatNumber(Number(h));
const shortAddr = (a?: string): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

// ── the third-party actor clause ─────────────────────────────────────────────

/** The prose half of the pink chip the header renders when the signer was not
 *  the position's (EOA) owner — the SAME verdict fxExternalActor() decides, so
 *  the clause appears exactly where the chip does.
 *
 *  The authority is f(x)'s own. `PoolManager.operate` forwards its caller into
 *  `BasePool.operate`, which checks ownership on ONE side only:
 *
 *      if (ownerOf(positionId) != owner && (newRawColl < 0 || newRawDebt > 0))
 *          revert ErrorNotPositionOwner();
 *
 *  Adding collateral or repaying debt skips the check; taking value out needs
 *  the manager's caller to hold the NFT at that moment. A contract the holder
 *  has approved on the pool's ERC-721 can move the NFT to itself for one
 *  transaction and hand it back: f(x)'s router does this for the holder who
 *  calls it, and its Limit Order Manager for an order the holder signed
 *  (LimitOrderManager.fillOrder, filled by anyone; wbtc-484's 6 Feb 2026
 *  borrow, tx 0x901105d7…). So a marked withdraw or borrow means the NFT
 *  passed through the manager's caller in the transaction; the row's read
 *  names that caller and any filled order. */
function permissionlessActorMechanic(ctx: FxContext, read?: FxRowRead): ClauseInput {
  const signer = fxExternalActor(ctx);
  if (!signer) return null;
  const coll = Number(ctx.collDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  const takesOut = coll < 0 || debt > 0;
  const fees = read?.fees;
  if (fees?.limitOrder && fees.limitOrder.maker === ctx.ownerAt) {
    return clause(
      <>
        {shortAddr(signer)} sent this transaction to fill a limit order the holder at the time (
        {shortAddr(fees.limitOrder.maker)}) had signed. The f(x) Limit Order Manager, which the holder had approved to
        move its position NFTs, took this NFT for the transaction, called the manager as its holder, and returned it;
        the filler ({shortAddr(fees.limitOrder.taker)}) supplied the {ctx.poolSymbol} and took the fxUSD the order
        named. The pool lets only the NFT&rsquo;s holder at the moment of the call withdraw or borrow, and here that was
        the Limit Order Manager.
      </>,
    );
  }
  if (takesOut) {
    return fees && fees.caller !== ctx.ownerAt
      ? clause(
          <>
            {shortAddr(signer)} sent this transaction, and {shortAddr(fees.caller)} called the manager. The pool lets
            only the NFT&rsquo;s holder at the moment of the call withdraw or borrow, so the NFT passed through{" "}
            {shortAddr(fees.caller)} in this transaction: a contract the holder has approved can take it for one
            transaction and return it.
          </>,
        )
      : null;
  }
  if (!(coll > 0 || debt < 0)) return null;
  return clause(
    <>
      Someone other than the position&rsquo;s owner executed this. Adding collateral to, or repaying the debt of, any
      position is open to anyone, so this needed nothing from the owner. Withdrawing or borrowing needs the
      manager&rsquo;s caller to hold the NFT at that moment.
    </>,
  );
}

// ── the variant table ────────────────────────────────────────────────────────

export function fxEventSlots(ctx: FxContext, coords: FxCoords, read?: FxRowRead): EventProseSlots {
  const slots = fxEventSlotsBase(ctx, coords, read ?? { before: null, after: null });
  const actor = permissionlessActorMechanic(ctx, read);
  if (!actor) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), actor] };
}

function fxEventSlotsBase(ctx: FxContext, coords: FxCoords, read: FxRowRead): EventProseSlots {
  const sym = ctx.poolSymbol;
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const normSym = meta?.normalizedSymbol ?? sym;
  const id = ctx.positionId;

  const coll = Number(ctx.collDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  const isOpen = ctx.isOpen === true;
  const empties = ctx.emptiesPosition === true;
  const isClose = empties && ctx.eventType === "operate";
  const labeled = !empties; // the header renders open/adjust deltas bare, a close signed

  // ── header-mirrored delta figures (echo the header's moved-amount receipt) ──
  const collFig = () => (
    <Fig info={collDeltaProv(sym, coords)} value={chainTruthDeltaValue(coll, labeled)} symbol={sym}>
      {fmtAmt(ctx.collDelta)} {sym}
    </Fig>
  );
  const debtFig = () => (
    <Fig info={debtDeltaProv(coords)} value={chainTruthDeltaValue(debt, labeled)} symbol="fxUSD">
      {fmtAmt(ctx.debtDelta)} fxUSD
    </Fig>
  );

  // ── detail-grid-mirrored figures (echo the detail receipt; no symbol key) ──
  const impliedFig = () => (
    <Fig info={impliedDebtAfterProv(coords)} value={fmtVal(ctx.impliedDebtAfter)}>
      {fmtVal(ctx.impliedDebtAfter)} fxUSD
    </Fig>
  );
  const oraclePriceFig = () => (
    <Fig info={snapOraclePriceProv(normSym, coords)} value={fmtVal(ctx.oraclePrice)}>
      ${fmtVal(ctx.oraclePrice)}
    </Fig>
  );

  // ── shared meansNow clauses ────────────────────────────────────────────────
  const oracleClause = (): ClauseInput =>
    ctx.oraclePrice != null
      ? clause(
          <>
            The pool&rsquo;s oracle priced {normSym} at {oraclePriceFig()} at the time.
          </>,
        )
      : null;

  const { before, after } = read;
  const rate = after?.rate ?? before?.rate ?? null;
  const pctOf = (r: number) => `${(r * 100).toFixed(1)}%`;
  const ratioFig = (side: FxSide | null, when: "before" | "after") =>
    side?.ratio != null ? (
      <Fig info={rowStateProv("ratio", when, normSym, coords)} value={formatExact(side.ratio * 100)}>
        {pctOf(side.ratio)}
      </Fig>
    ) : null;
  // "1.4667 wstETH is 1.7483 stETH at 1.1920 stETH per wstETH".
  const unitClause = (amount: number, verb: string): ClauseInput =>
    amount !== 0 && sym !== normSym
      ? clause(
          rate != null ? (
            <>
              The {fmtAmt(String(amount))} {sym} {verb} is{" "}
              <Prov
                echo
                info={stethEquivalentProv(`The ${sym} moved`, coords)}
                value={formatExact(Math.abs(amount) * rate)}
              >
                {formatNumber(Math.abs(amount) * rate)} {normSym}
              </Prov>{" "}
              at this block&rsquo;s rate of{" "}
              <Prov echo info={wstethRateProv(coords)} value={formatExact(rate)}>
                {rate.toFixed(4)}
              </Prov>{" "}
              {normSym} per {sym}, the unit the pool holds and the collateral figures use.
            </>
          ) : (
            <>
              The collateral amount is the {sym} as transferred; the pool holds it in its rate-adjusted unit ({normSym}
              ).
            </>
          ),
        )
      : null;
  const ratioMove = (): ClauseInput =>
    after?.ratio == null
      ? null
      : before?.ratio == null || before.ratio === 0
        ? clause(<>The debt ratio after it was {ratioFig(after, "after")}.</>)
        : pctOf(before.ratio) === pctOf(after.ratio)
          ? clause(<>The debt ratio stayed at {ratioFig(after, "after")}.</>)
          : clause(
              <>
                The debt ratio went from {ratioFig(before, "before")} to {ratioFig(after, "after")}.
              </>,
            );

  // The debt after the event: the chain's figure where the row carries its
  // getPosition read; otherwise the event-implied total, with its caveat in
  // plain words (§2).
  const impliedClauses = (): ClauseInput[] =>
    ctx.debtAfter != null
      ? [
          clause(
            <>
              After it the position owed{" "}
              <Fig info={chainAfterProv("debt", normSym, coords)} value={fmtVal(ctx.debtAfter)}>
                {fmtVal(ctx.debtAfter)} fxUSD
              </Fig>
              .
            </>,
          ),
        ]
      : [
          clause(<>The events so far imply {impliedFig()} of debt.</>),
          clause(
            <>
              That is the running total of this position&rsquo;s own events, not its live debt: rebalances and
              socialized bad debt move the real debt between events with no per-position record.
            </>,
          ),
        ];

  // The fee: the event's protocolFees where the old manager emitted one (token
  // units), else the caller's schedule at the block times this row's amounts.
  const feeClause = (): ClauseInput => {
    if (ctx.protocolFees != null && Number(ctx.protocolFees) !== 0)
      return clause(
        <>
          The pool charged a protocol fee of{" "}
          <Fig info={protocolFeesProv(sym, coords)} value={fmtVal(ctx.protocolFees)}>
            {fmtVal(ctx.protocolFees)} {sym}
          </Fig>
          .
        </>,
      );
    if (!read.fees) return null;
    const f = read.fees;
    const legs = fxRowFees(ctx, f);
    const charged = legs.filter((l) => l.amount > 0);
    const holder = ctx.ownerAt ? shortAddr(ctx.ownerAt) : null;
    // Who called the manager: the holder at the time, an f(x) router, the
    // Limit Order Manager, or another contract; and who called it in turn.
    const calledBy =
      f.signer && f.signer === ctx.ownerAt
        ? `, which the holder at the time (${holder}) called`
        : f.signer && f.signer !== f.caller
          ? `, which ${shortAddr(f.signer)} called`
          : "";
    const isRouter = f.caller === FX_ADDRESSES.ROUTER || f.caller === FX_ADDRESSES.ROUTER_2;
    const who =
      f.caller === ctx.ownerAt
        ? `the holder at the time (${shortAddr(f.caller)})${f.signer === f.caller ? ", who sent the transaction" : ""}`
        : f.limitOrder && f.caller === f.limitOrder.manager
          ? "the f(x) Limit Order Manager"
          : isRouter
            ? `the f(x) router (${shortAddr(f.caller)})${calledBy}`
            : `the contract that called the manager (${shortAddr(f.caller)})${calledBy}`;
    const schedule = `${f.custom ? "the schedule the pool sets for that caller" : "the pool's default schedule"} (${fxScheduleFull(f)})`;
    const legList = (
      <>
        {charged.map((l, i) => (
          <span key={l.leg}>
            {i > 0 ? " and " : ""}
            {fxFeePct(l.ratio)} {l.leg} (
            <Prov echo info={feeScheduleProv(f.caller, coords)} value={String(l.amount)}>
              {formatNumber(l.amount)} {l.symbol === "token" ? sym : "fxUSD"}
            </Prov>
            )
          </span>
        ))}
      </>
    );
    const d = f.defaults;
    const defaultNote =
      f.custom && d ? <> The pool&rsquo;s default at this block charges {fxScheduleFull(d)}.</> : null;
    return clause(
      <>
        The manager charges the account that calls it; here that was {who}, on {schedule}
        {charged.length === 0 ? <>, which charged nothing on this row.</> : <>: {legList}.</>}
        {defaultNote}
      </>,
    );
  };

  // How the fee sits in the debt (PoolManager _handleBorrow / _handleRepay): a
  // borrow adds the whole amount to the debt and the fee comes out of the fxUSD
  // minted; a repayment removes the amount and the fee is burned on top.
  const debtEquation = (): ClauseInput => {
    if (debt === 0 || !read.fees || (ctx.protocolFees != null && Number(ctx.protocolFees) !== 0)) return null;
    const leg = fxRowFees(ctx, read.fees).find((l) => l.symbol === "fxUSD");
    if (!leg) return null;
    const amt = Math.abs(debt);
    return debt > 0
      ? clause(
          <>
            <Prov echo info={debtEquationProv("borrow", coords)} value={String(amt)}>
              The debt rose by {formatNumber(amt)} fxUSD
            </Prov>
            , the whole amount borrowed; the {formatNumber(leg.amount)} fxUSD fee came out of the fxUSD minted, so the
            caller received {formatNumber(amt - leg.amount)}.
          </>,
        )
      : clause(
          <>
            <Prov echo info={debtEquationProv("repay", coords)} value={String(amt)}>
              The debt fell by {formatNumber(amt)} fxUSD
            </Prov>
            , the amount repaid; the {formatNumber(leg.amount)} fxUSD fee was paid on top, so the caller paid{" "}
            {formatNumber(amt + leg.amount)}.
          </>,
        );
  };
  // Funding the pool booked into its collateral index at the start of this
  // transaction, which lands in the row's before → after (lib/fx/in-tx-funding.ts).
  const fundingClause = (): ClauseInput => {
    if (ctx.eventType !== "operate" || isOpen || (read.blockPeers ?? 1) > 1) return null;
    const converts = sym !== normSym;
    const taken = fxRowFunding(fxCollMoved(ctx), converts ? rate : null, before?.colls ?? null, after?.colls ?? null);
    if (taken == null || taken <= 0 || (converts && rate == null)) return null;
    return clause(
      <>
        Funding of{" "}
        <Prov echo info={inTxFundingProv(normSym, coords)} value={String(taken)}>
          {fxFundingText(taken)} {normSym}
        </Prov>
        , accrued since the pool was last called, came off the position at the start of this transaction, so the
        collateral change above includes it.
      </>,
    );
  };

  // This position's change over the row's block (getPosition at block − 1 and
  // at the block): a rebalance's or pool-wide liquidation's only per-position
  // figure.
  const peers = read.blockPeers && read.blockPeers > 1 ? read.blockPeers : 0;
  const ownChange = (noun: string): ClauseInput =>
    before?.debts != null && after?.debts != null && before.colls != null && after.colls != null
      ? clause(
          <>
            {peers ? (
              <>
                Over this block, with its {peers} {noun}, this
              </>
            ) : (
              <>This</>
            )}{" "}
            position&rsquo;s debt went from{" "}
            <Fig info={rowStateProv("debt", "before", normSym, coords)} value={String(before.debts)}>
              {formatNumber(before.debts)}
            </Fig>{" "}
            to{" "}
            <Fig info={rowStateProv("debt", "after", normSym, coords)} value={String(after.debts)}>
              {formatNumber(after.debts)} fxUSD
            </Fig>{" "}
            and its collateral from{" "}
            <Fig info={rowStateProv("coll", "before", normSym, coords)} value={String(before.colls)}>
              {formatNumber(before.colls)}
            </Fig>{" "}
            to{" "}
            <Fig info={rowStateProv("coll", "after", normSym, coords)} value={String(after.colls)}>
              {formatNumber(after.colls)} {normSym}
            </Fig>
            {before.ratio != null && after.ratio != null && after.colls > 0 ? (
              pctOf(before.ratio) === pctOf(after.ratio) ? (
                <>; its debt ratio stayed at {ratioFig(after, "after")}</>
              ) : (
                <>
                  ; its debt ratio went from {ratioFig(before, "before")} to {ratioFig(after, "after")}
                </>
              )
            ) : null}
            .
          </>,
        )
      : null;
  // Which price the pool judged the row at: the oracle's min leg (BasePool
  // rebalance / liquidate), where the row's ratios are read at the anchor.
  const usd = (n: number) => formatUsd(n);
  const judgedClause = (what: "rebalance" | "liquidate"): ClauseInput => {
    const line = what === "rebalance" ? before?.rebalanceLine : before?.liquidateLine;
    return clause(
      <>
        The pool judged the tick at the oracle&rsquo;s min price
        {before?.minPrice != null ? <>, {usd(before.minPrice)} at the block before</> : null}
        {line != null ? (
          <>
            : it {what === "rebalance" ? "rebalances" : "liquidates"} a tick whose debt ratio there is{" "}
            {pctOf(line).replace(".0%", "%")} or more
          </>
        ) : null}
        {what === "rebalance" ? <>, and a rebalance brings the tick back toward that line at that price</> : null}. The
        debt ratios on this row are read at the anchor price
        {before?.anchorPrice != null ? <> ({usd(before.anchorPrice)})</> : null}, at or above the min, so they can show
        below the line.
      </>,
    );
  };

  switch (ctx.eventType) {
    case "operate": {
      if (isOpen) {
        const moves =
          coll !== 0 && debt !== 0 ? (
            <>
              It deposited {collFig()} and drew {debtFig()} of debt against it.
            </>
          ) : coll !== 0 ? (
            <>It deposited {collFig()} of collateral.</>
          ) : debt !== 0 ? (
            <>It drew {debtFig()} of debt.</>
          ) : null;
        return {
          happened: [
            clause(
              <>
                This transaction opened position #{id} in the {sym} pool.
              </>,
            ),
            moves ? clause(moves) : null,
          ],
          // The general form of the position (a leveraged holding kept as an
          // ERC-721) is Layer-2 material — the "?" modal
          // (fxOperateContent("open")) carries it.
          meansNow: [
            unitClause(coll, "deposited"),
            feeClause(),
            debtEquation(),
            oracleClause(),
            ratioMove(),
            ...impliedClauses(),
          ],
        };
      }

      if (ctx.reopens) {
        const moves =
          coll !== 0 && debt !== 0 ? (
            <>
              It deposited {collFig()} and drew {debtFig()} of debt against it.
            </>
          ) : coll !== 0 ? (
            <>It deposited {collFig()} of collateral.</>
          ) : debt !== 0 ? (
            <>It drew {debtFig()} of debt.</>
          ) : null;
        return {
          happened: [
            clause(
              <>
                Position #{id} had been emptied; this transaction funded the same NFT again, starting loan{" "}
                {ctx.loanNumber ?? 2} on it.
              </>,
            ),
            moves ? clause(moves) : null,
          ],
          meansNow: [
            clause(<>Closing or liquidating a position leaves its NFT with the owner, who can use it again.</>),
            unitClause(coll, "deposited"),
            feeClause(),
            debtEquation(),
            fundingClause(),
            oracleClause(),
            ratioMove(),
            ...impliedClauses(),
          ],
        };
      }

      if (isClose) {
        const moves =
          debt !== 0 && coll !== 0 ? (
            <>
              It repaid {debtFig()} of debt and withdrew {collFig()} of collateral.
            </>
          ) : debt !== 0 ? (
            <>It repaid {debtFig()} of debt.</>
          ) : coll !== 0 ? (
            <>It withdrew {collFig()} of collateral.</>
          ) : null;
        return {
          happened: [clause(<>Closed position #{id}.</>), moves ? clause(moves) : null],
          meansNow: [
            clause(
              <>
                Closing repays the position&rsquo;s whole fxUSD debt as the pool reckons it, rebalances and socialized
                bad debt since its last event included.
              </>,
            ),
            feeClause(),
            debtEquation(),
            fundingClause(),
            oracleClause(),
          ],
        };
      }

      // Plain adjust — keyed on each axis' own direction.
      const collClause: ClauseInput =
        coll > 0
          ? clause(
              <>
                Deposited {collFig()} of collateral into position #{id}.
              </>,
            )
          : coll < 0
            ? clause(
                <>
                  Withdrew {collFig()} of collateral from position #{id}.
                </>,
              )
            : null;
      const debtRef: ReactNode = collClause ? <>the position</> : <>position #{id}</>;
      const debtClause: ClauseInput =
        debt > 0
          ? clause(
              <>
                Borrowed {debtFig()} against {debtRef}.
              </>,
            )
          : debt < 0
            ? clause(<>Repaid {debtFig()} of the position&rsquo;s debt.</>)
            : null;
      return {
        happened: [collClause, debtClause],
        meansNow: [
          unitClause(coll, coll > 0 ? "deposited" : "withdrawn"),
          feeClause(),
          debtEquation(),
          fundingClause(),
          oracleClause(),
          ratioMove(),
          ...impliedClauses(),
        ],
      };
    }

    case "liquidation": {
      if (ctx.poolWide === true) {
        // The run repaid what its keeper paid across the whole pool; where this
        // position's debt fell by more, the tick's collateral ran out and the
        // pool wrote the rest off onto everyone else (BasePool._liquidateTick:
        // debtIndex += unpaid ÷ remaining debt shares).
        const writeOffClause = (): ClauseInput => {
          if (before?.debts == null || after?.debts == null) return null;
          const fell = before.debts - after.debts;
          const repaid = Number(ctx.tickRebFxusdDebts ?? "0") || 0;
          if (fell - repaid <= 0.001) return null;
          return clause(
            <>
              Its keeper repaid {fmtVal(ctx.tickRebFxusdDebts)} fxUSD across the whole pool, and this position&rsquo;s
              debt fell by {formatNumber(fell)} fxUSD: the collateral in its tick could not cover the tick&rsquo;s debt,
              so the pool wrote the rest off and added it to every other position&rsquo;s debt through its debt index.
            </>,
          );
        };
        const tickFig = () => (
          <Fig info={tickRebalanceHitProv(ctx.rebalancedTick, coords, true)} value={`#${ctx.rebalancedTick}`}>
            #{ctx.rebalancedTick}
          </Fig>
        );
        const runCollsFig = () => (
          <Fig info={tickRebAmountProv("colls", sym, coords, undefined, true, true)} value={fmtVal(ctx.tickRebColls)}>
            {fmtVal(ctx.tickRebColls)} {sym}
          </Fig>
        );
        const runFxusdFig = () => (
          <Fig
            info={tickRebAmountProv("fxusd", "fxUSD", coords, undefined, true, true)}
            value={fmtVal(ctx.tickRebFxusdDebts)}
          >
            {fmtVal(ctx.tickRebFxusdDebts)} fxUSD
          </Fig>
        );
        const keeper = ctx.txFrom ? ` (${shortAddr(ctx.txFrom)})` : "";
        return {
          happened: [
            clause(
              <>
                A keeper{keeper} ran a liquidation of the {sym} pool from its top tick down, including tick {tickFig()}{" "}
                where this position&rsquo;s shares sat: across the pool it repaid {runFxusdFig()} of debt and took{" "}
                {runCollsFig()} of collateral. The manager logs one event for the whole run and none for this position.
              </>,
            ),
          ],
          changed: [ownChange("liquidations")],
          meansNow: [
            writeOffClause(),
            clause(
              empties ? (
                <>
                  The run liquidated the whole tick, so the position was emptied. The owner keeps the fxUSD they
                  borrowed; the NFT stays with them and can be funded again.
                </>
              ) : (
                <>
                  The run liquidated part of the tick; the position stays open with what is left, and the owner keeps
                  the fxUSD they borrowed.
                </>
              ),
            ),
            judgedClause("liquidate"),
          ],
        };
      }
      const hasStable = ctx.liqStableDebts != null && Number(ctx.liqStableDebts) !== 0;
      const sent = Number(ctx.liqColls ?? "0") || 0;
      if (!fxLiquidationMoved(ctx)) {
        // A keeper's call that reached the position after it was emptied (or
        // with a wei of collateral left): the manager logs it all the same.
        const keeperAddr = ctx.txFrom ? ` (${shortAddr(ctx.txFrom)})` : "";
        return {
          happened: [
            clause(
              <>
                A keeper&rsquo;s liquidation call{keeperAddr} reached position #{id} with nothing left to take: the log
                records {fmtVal(ctx.liqColls ?? "0")} {sym} taken and{" "}
                {Number(ctx.liqFxusdDebts ?? "0") > 0 ? formatNumber(Number(ctx.liqFxusdDebts)) : "0"} fxUSD repaid.
              </>,
            ),
          ],
          meansNow: [
            after?.debts != null && after.debts > 0.0005
              ? clause(
                  <>
                    Its debt of{" "}
                    <Fig info={rowStateProv("debt", "after", normSym, coords)} value={String(after.debts)}>
                      {formatNumber(after.debts)} fxUSD
                    </Fig>{" "}
                    stayed on the position.
                  </>,
                )
              : null,
            clause(<>The position card does not count it among the liquidations.</>),
          ],
        };
      }
      const liqCollsFig = () => (
        <Fig info={liqCollsProv(sym, coords)} value={fmtVal(ctx.liqColls)}>
          {fmtVal(ctx.liqColls)} {sym}
        </Fig>
      );
      const liqFxusdFig = () => (
        <Fig info={liqDebtRepaidProv("fxusd", coords)} value={fmtVal(ctx.liqFxusdDebts)}>
          {fmtVal(ctx.liqFxusdDebts)} fxUSD
        </Fig>
      );
      const liqStableFig = () => (
        <Fig info={liqDebtRepaidProv("stable", coords)} value={fmtVal(ctx.liqStableDebts)}>
          {fmtVal(ctx.liqStableDebts)} USDC
        </Fig>
      );
      const sentNorm = sym === normSym ? sent : rate != null ? sent * rate : null;
      const keeper = ctx.txFrom ? ` (${shortAddr(ctx.txFrom)})` : "";
      const seizure = (
        <>
          A keeper{keeper} repaid {liqFxusdFig()} of its debt
          {hasStable ? <> and {liqStableFig()} of stable-side debt</> : null} and received {liqCollsFig()}
          {sym !== normSym && sentNorm != null ? (
            <>
              {" "}
              (
              <Prov
                echo
                info={stethEquivalentProv("Collateral to the liquidator", coords)}
                value={formatExact(sentNorm)}
              >
                {formatNumber(sentNorm)} {normSym}
              </Prov>{" "}
              at this block&rsquo;s rate)
            </>
          ) : null}{" "}
          of its collateral.
        </>
      );
      const kept =
        before?.colls != null && after?.colls != null && sentNorm != null
          ? before.colls - after.colls - sentNorm
          : null;
      const keptClause: ClauseInput =
        kept != null && kept > 1e-12
          ? clause(
              <>
                The protocol kept{" "}
                <Fig info={protocolShareProv(normSym, coords)} value={String(kept)}>
                  {formatTinyNonZero(kept)} {normSym}
                </Fig>
                {read.expenseRatio != null ? (
                  <>, its {Math.round(read.expenseRatio * 100)}% share of the liquidation bonus</>
                ) : null}
                , so the collateral the keeper received and the protocol&rsquo;s share add up to what the position lost.
              </>,
            )
          : null;
      const debtBefore = before?.debts ?? (ctx.debtBefore != null ? Number(ctx.debtBefore) : null);
      const repaid = (Number(ctx.liqFxusdDebts ?? "0") || 0) + (Number(ctx.liqStableDebts ?? "0") || 0);
      const unpaid = empties && debtBefore != null ? debtBefore - repaid : 0;
      const unpaidClause: ClauseInput =
        unpaid > 1e-9
          ? clause(
              <>
                The collateral did not cover the last{" "}
                <Fig info={unpaidDebtProv(coords)} value={String(unpaid)}>
                  {formatNumber(unpaid)} fxUSD
                </Fig>{" "}
                of debt; the pool removed it from the position and added it to every other position&rsquo;s debt.
              </>,
            )
          : null;
      return {
        happened: [
          clause(
            before?.ratio != null && before.liquidateLine != null ? (
              <>
                Position #{id}&rsquo;s debt ratio stood at {ratioFig(before, "before")} at the block before; the {sym}{" "}
                pool liquidates from {pctOf(before.liquidateLine).replace(".0%", "%")}
                {before.ratio < before.liquidateLine ? (
                  <>, a line the ratio crossed within this block as the price moved</>
                ) : null}
                .
              </>
            ) : before?.ratio != null ? (
              <>
                Position #{id}&rsquo;s debt ratio stood at {ratioFig(before, "before")} at the block before, high enough
                for the {sym} pool to allow its liquidation.
              </>
            ) : (
              <>
                Position #{id}&rsquo;s debt ratio crossed the {sym} pool&rsquo;s liquidation line.
              </>
            ),
          ),
        ],
        changed: [clause(seizure), keptClause, unpaidClause],
        meansNow: [
          empties
            ? clause(
                <>
                  The liquidation emptied the position. The owner keeps the fxUSD they borrowed; collateral beyond the
                  repaid debt and the bonus would have stayed in the position, and none did.
                </>,
              )
            : clause(
                <>
                  Collateral beyond the repaid debt and the bonus stays in the position for the owner, who keeps the
                  fxUSD they borrowed.
                </>,
              ),
          oracleClause(),
        ],
      };
    }

    case "tickRebalance": {
      const pool = ctx.poolWide === true;
      const tickFig = () => (
        <Fig info={tickRebalanceHitProv(ctx.rebalancedTick, coords, pool)} value={`#${ctx.rebalancedTick}`}>
          #{ctx.rebalancedTick}
        </Fig>
      );
      const redeem = ctx.redemption === true;
      const tickCollsFig = () => (
        <Fig
          info={tickRebAmountProv("colls", sym, coords, undefined, pool, false, redeem)}
          value={fmtVal(ctx.tickRebColls)}
        >
          {fmtVal(ctx.tickRebColls)} {sym}
        </Fig>
      );
      const tickFxusdFig = () => (
        <Fig
          info={tickRebAmountProv("fxusd", "fxUSD", coords, undefined, pool, false, redeem)}
          value={fmtVal(ctx.tickRebFxusdDebts)}
        >
          {fmtVal(ctx.tickRebFxusdDebts)} fxUSD
        </Fig>
      );
      const keeper = ctx.txFrom ? ` (${shortAddr(ctx.txFrom)})` : "";
      if (redeem) {
        return {
          happened: [
            clause(
              <>
                {ctx.txFrom ? shortAddr(ctx.txFrom) : "Someone"} redeemed {tickFxusdFig()} for {tickCollsFig()} from the{" "}
                {sym} pool, taking from its highest-ratio ticks first, including tick {tickFig()} where this
                position&rsquo;s shares sat.
              </>,
            ),
          ],
          changed: [ownChange("redemptions")],
          meansNow: [
            clause(
              <>
                A redemption swaps fxUSD for collateral at the oracle&rsquo;s max price, at most 20% of a tick per pass;
                today the manager opens it only while fxUSD trades below its peg. The position gave up debt and
                collateral worth the same at that price, and stays open; the owner did not act.
              </>,
            ),
          ],
        };
      }
      const happened = pool ? (
        <>
          A keeper{keeper} rebalanced the {sym} pool from its top tick down, including tick {tickFig()} where this
          position&rsquo;s shares sat: across the pool it repaid {tickFxusdFig()} of debt and took {tickCollsFig()} of
          collateral.
        </>
      ) : (
        <>
          A keeper{keeper} rebalanced tick {tickFig()}, where this position&rsquo;s shares sat: it repaid{" "}
          {tickFxusdFig()} of the tick&rsquo;s debt and took {tickCollsFig()} of its collateral.
        </>
      );
      const own = ownChange("rebalances");
      return {
        happened: [clause(happened)],
        changed: own ? [own] : [],
        meansNow: [
          clause(
            <>
              The keeper is paid by the rebalance bonus
              {read.expenseRatio != null ? (
                <>, of which the protocol keeps {Math.round(read.expenseRatio * 100)}%</>
              ) : null}
              . The position stays open.
            </>,
          ),
          judgedClause("rebalance"),
        ],
      };
    }

    case "transfer": {
      const isMint = ctx.transferFrom === ZERO_ADDR;
      const toFig = () => (
        <Fig info={transferPartyProv("to", coords)} value={shortAddr(ctx.transferTo)}>
          {shortAddr(ctx.transferTo)}
        </Fig>
      );
      const fromFig = () => (
        <Fig info={transferPartyProv("from", coords)} value={shortAddr(ctx.transferFrom)}>
          {shortAddr(ctx.transferFrom)}
        </Fig>
      );
      if (isMint) {
        return {
          happened: [
            clause(
              <>
                The {sym} pool minted position #{id} to {toFig()}.
              </>,
            ),
          ],
          // The general NFT-contract rule (the pool contract is the position
          // NFT) is Layer-2 material — the "?" modal (fxTransferContent)
          // carries it.
          meansNow: [
            clause(
              <>
                The recipient is the position&rsquo;s first owner. A transfer records only who holds the position; it
                moves no collateral or debt.
              </>,
            ),
          ],
        };
      }
      return {
        happened: [
          clause(
            <>
              Position #{id} changed hands: it moved from {fromFig()} to {toFig()}.
            </>,
          ),
        ],
        // The header names the destination on a party chip — a neutral
        // counterparty of the event, not a third-party actor. This says what
        // that address IS to the position, which the chip alone cannot.
        meansNow: [
          clause(
            <>
              The address it moved to is the position&rsquo;s new owner, and from here the only one the pool will let
              withdraw its collateral or draw more debt against it.
            </>,
          ),
          clause(<>The position&rsquo;s collateral and debt are unchanged; only the holder moved.</>),
        ],
      };
    }

    default:
      return { happened: [] };
  }
}

/** The teaser = the lead of the composed arc (the first sentence plus any
 *  trailing continuations). */
export function fxExplainerTeaser(ctx: FxContext, coords: FxCoords): ReactNode | null {
  return splitLead(eventClauses(fxEventSlots(ctx, coords))).lead;
}
