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
  snapOraclePriceProv,
  tickRebalanceHitProv,
  tickRebAmountProv,
  transferPartyProv,
  type FxCoords,
} from "@/lib/fx/event-provenance";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { fxExternalActor } from "@/lib/fx/external-actor";
import { formatNumber } from "@/lib/utils/format";

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
 *  The authority is f(x)'s own and must not be borrowed from a sibling
 *  explorer. `PoolManager.operate` forwards its caller into `BasePool.operate`,
 *  which checks ownership on ONE side only:
 *
 *      if (ownerOf(positionId) != owner && (newRawColl < 0 || newRawDebt > 0))
 *          revert ErrorNotPositionOwner();
 *
 *  So adding collateral or repaying debt on any position skips the check
 *  entirely, while taking value out is a strict equality against the NFT
 *  holder — with NO delegation path at all. Each pool is an ERC-721 and so has
 *  `approve` / `setApprovalForAll`, but the operate path never consults them;
 *  only an outright transfer of the position changes who passes. That is why
 *  this must never read "the owner approved them".
 *
 *  ⚠️ Which is also why there is no value-REMOVING branch. A marked row cannot
 *  be a withdraw or a borrow: the caller PoolManager forwards is the immediate
 *  caller (a router is itself the caller, not a proxy for its user), and an EOA
 *  can only be that caller by sending the transaction — so on a value-removing
 *  operate an EOA owner is necessarily the signer, and the verdict declines.
 *  A zero-delta operate is likewise left unexplained rather than guessed at. */
function permissionlessActorMechanic(ctx: FxContext): ClauseInput {
  if (!fxExternalActor(ctx)) return null;
  const coll = Number(ctx.collDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  if (!(coll > 0 || debt < 0)) return null;
  return clause(
    <>
      Someone other than the position&rsquo;s owner executed this. f(x) checks ownership only on the way out: adding
      collateral to, or repaying the debt of, any position is open to anyone, so this needed nothing from the owner.
      Taking value back out is the opposite — the pool compares the caller against the position&rsquo;s holder directly,
      and no approval can stand in for being that holder.
    </>,
  );
}

// ── the variant table ────────────────────────────────────────────────────────

export function fxEventSlots(ctx: FxContext, coords: FxCoords): EventProseSlots {
  const slots = fxEventSlotsBase(ctx, coords);
  const actor = permissionlessActorMechanic(ctx);
  if (!actor) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), actor] };
}

function fxEventSlotsBase(ctx: FxContext, coords: FxCoords): EventProseSlots {
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

  // The event-implied debt caveat — the misleading-figure exception in plain
  // words (§2): the figure on the card is what the events add up to, not the
  // position's live debt.
  const impliedClauses = (): ClauseInput[] => [
    clause(<>The events so far imply {impliedFig()} of fxUSD debt.</>),
    clause(
      <>
        That is the running total of this position&rsquo;s own events, not its live debt: rebalances and socialized bad
        debt move the real debt between events with no per-position record.
      </>,
    ),
  ];

  switch (ctx.eventType) {
    case "operate": {
      if (isOpen) {
        const moves =
          coll !== 0 && debt !== 0 ? (
            <>
              It deposited {collFig()} and drew {debtFig()} of fxUSD debt against it.
            </>
          ) : coll !== 0 ? (
            <>It deposited {collFig()} of collateral.</>
          ) : debt !== 0 ? (
            <>It drew {debtFig()} of fxUSD debt.</>
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
          meansNow: [oracleClause(), ...impliedClauses()],
        };
      }

      if (isClose) {
        const moves =
          debt !== 0 && coll !== 0 ? (
            <>
              It repaid {debtFig()} of fxUSD debt and withdrew {collFig()} of collateral.
            </>
          ) : debt !== 0 ? (
            <>It repaid {debtFig()} of fxUSD debt.</>
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
                Borrowed {debtFig()} of fxUSD against {debtRef}.
              </>,
            )
          : debt < 0
            ? clause(<>Repaid {debtFig()} of the position&rsquo;s fxUSD debt.</>)
            : null;
      // The two-unit caveat only bites where the token and normalized symbols
      // differ (the wstETH pool: wstETH moved, stETH accounted); the WBTC pool
      // shares one symbol, so the clause is simply absent there.
      const unitCaveat: ClauseInput =
        coll !== 0 && sym !== normSym
          ? clause(
              <>
                The collateral amount is the {sym} as transferred; the pool holds it in its rate-adjusted unit (
                {normSym}
                ).
              </>,
            )
          : null;
      const feeClause: ClauseInput =
        ctx.protocolFees != null && Number(ctx.protocolFees) !== 0
          ? clause(
              <>
                The pool charged a protocol fee of{" "}
                <Fig info={protocolFeesProv(normSym, coords)} value={fmtVal(ctx.protocolFees)}>
                  {fmtVal(ctx.protocolFees)} {normSym}
                </Fig>{" "}
                on the operation.
              </>,
            )
          : null;
      return {
        happened: [collClause, debtClause],
        meansNow: [unitCaveat, feeClause, oracleClause(), ...impliedClauses()],
      };
    }

    case "liquidation": {
      const hasStable = ctx.liqStableDebts != null && Number(ctx.liqStableDebts) !== 0;
      const liqCollsFig = () => (
        <Fig info={liqCollsProv(normSym, coords)} value={fmtVal(ctx.liqColls)}>
          {fmtVal(ctx.liqColls)} {normSym}
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
      const seizure = hasStable ? (
        <>
          A liquidator repaid {liqFxusdFig()} of its fxUSD debt and {liqStableFig()} of stable-side debt, and seized{" "}
          {liqCollsFig()} of collateral.
        </>
      ) : (
        <>
          A liquidator repaid {liqFxusdFig()} of its fxUSD debt and seized {liqCollsFig()} of collateral.
        </>
      );
      const unitClause: ClauseInput =
        sym !== normSym
          ? clause(
              <>
                The seizure is quoted in the pool&rsquo;s rate-adjusted unit ({normSym}), not the {sym} the position
                deposited.
              </>,
            )
          : null;
      return {
        happened: [
          clause(
            <>
              Position #{id}&rsquo;s debt ratio crossed the {sym} pool&rsquo;s liquidation threshold.
            </>,
          ),
        ],
        changed: [clause(seizure), unitClause],
        meansNow: [
          empties ? clause(<>The liquidation emptied the position.</>) : null,
          empties
            ? clause(
                <>
                  If the collateral ran out before the debt, the remainder is written off against the protocol&rsquo;s
                  reserve.
                </>,
              )
            : null,
          oracleClause(),
        ],
      };
    }

    case "tickRebalance": {
      const tickFig = () => (
        <Fig info={tickRebalanceHitProv(ctx.rebalancedTick, coords)} value={`#${ctx.rebalancedTick}`}>
          #{ctx.rebalancedTick}
        </Fig>
      );
      const tickCollsFig = () => (
        <Fig info={tickRebAmountProv("colls", normSym, coords)} value={fmtVal(ctx.tickRebColls)}>
          {fmtVal(ctx.tickRebColls)} {normSym}
        </Fig>
      );
      const tickFxusdFig = () => (
        <Fig info={tickRebAmountProv("fxusd", "fxUSD", coords)} value={fmtVal(ctx.tickRebFxusdDebts)}>
          {fmtVal(ctx.tickRebFxusdDebts)} fxUSD
        </Fig>
      );
      const hasColls = ctx.tickRebColls != null && Number(ctx.tickRebColls) !== 0;
      const hasFxusd = ctx.tickRebFxusdDebts != null && Number(ctx.tickRebFxusdDebts) !== 0;
      const cleared =
        hasColls && hasFxusd ? (
          <>
            The rebalance cleared {tickFxusdFig()} of fxUSD debt against {tickCollsFig()} of collateral across the band.
          </>
        ) : hasFxusd ? (
          <>The rebalance cleared {tickFxusdFig()} of fxUSD debt across the band.</>
        ) : hasColls ? (
          <>The rebalance trimmed {tickCollsFig()} of collateral across the band.</>
        ) : null;
      return {
        happened: [clause(<>The pool rebalanced the price band this position&rsquo;s shares were in ({tickFig()}).</>)],
        changed: cleared ? [clause(cleared)] : [],
        meansNow: [clause(<>These are the whole band&rsquo;s totals, not this position&rsquo;s share of them.</>)],
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
