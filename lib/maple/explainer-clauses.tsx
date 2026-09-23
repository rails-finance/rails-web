// Maple plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on what the event's context carries about its RESULTING
// state (the share balance and queue escrow the wallet is left with), never on
// the event type alone: a withdraw that empties the position, a queue fill that
// clears the request, a cancel that returns the escrow all read differently.
// After-values are read from the context, never recomputed here (the keying is
// partial by design — the pane keys on what the log already knows).
//
// Figures render through <Prov>: a header DELTA echoes the header receipt (same
// prov builder + signed value → same entry key, WITH the token symbol the row
// registers); a detail after-value / rate echoes the detail-grid receipt (which
// the shared ChainTruthDetail registers WITHOUT a symbol prop, so these echoes
// omit `symbol` to key-match). An echo never forms its own receipt row — it is a
// locator only, resolving to the primary on click.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Maple's lender side cannot fill, each a data fact:
//   • §5.1 (risk consequence with figures): a Maple lender has no debt, no
//     collateral ratio and no liquidation of the position — nothing to price
//     against a threshold. The one risk figure the pool exposes (impairments on
//     the exit rate) is a pool-wide mark, not a per-event position figure, so it
//     is named as a mechanic on withdrawals, not shown as a before→after.
//   • §5.2 (mechanic-why on fees): Maple charges lenders no per-event fee — no
//     deposit fee, no withdrawal fee. The exit rate is the only price-like
//     figure, surfaced on withdrawals/fills (§5.4).
//   • §5.4 net-outcome: no USD feed (the assets are dollar stablecoins Rails
//     will not pin), so the only derived figure is the per-event exit rate.
// Filled: forward paths (§5.3) on a pending queue request (reduce / cancel);
// aggregate/act context (§5.5) via the same-transaction fill narration and the
// CCIP bridge escrow variants; the highlight rule (§5.6) via Fig echoes.

import type { ReactNode } from "react";
import type { MapleContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import { externalActor } from "@/lib/shared/external-actor";
import {
  assetsDeltaProv,
  sharesDeltaProv,
  requestSharesProv,
  requestCancelSharesProv,
  transferAmountProv,
  eventRateProv,
  sharesAfterProv,
  escrowAfterProv,
  type MapleCoords,
} from "@/lib/maple/event-provenance";
import { getCcipEscrow } from "@/lib/shared/known-infrastructure";
import { formatNumber } from "@/lib/utils/format";

/** Dust epsilon — a balance below this reads as zero (a fully-exited leg). */
export const MAPLE_EPS = 1e-9;

const fmtAbs = (h?: string): string => formatNumber(Math.abs(Number(h)));
const fmtVal = (h?: string): string => formatNumber(Number(h));
const num = (h?: string): number => {
  const n = Number(h);
  return Number.isFinite(n) ? n : NaN;
};

// ── figure rendering ─────────────────────────────────────────────────────────

function Fig({
  info,
  value,
  symbol,
  echo,
  children,
}: {
  info: Provenance;
  value?: string;
  symbol?: string;
  echo?: boolean;
  children: ReactNode;
}) {
  return (
    <Prov info={info} value={value} symbol={symbol} echo={echo}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

// ── the third-party actor clause ─────────────────────────────────────────────

/** The prose half of the pink chip the header renders when the account that
 *  holds the position was neither the signer nor the party the event itself
 *  names. Same verdict, same inputs as the card (maple-event-card.tsx), so the
 *  clause appears exactly where the chip does — including its one exclusion:
 *  a queue fill is `onlyRedeemer`, a registered redeemer or the pool delegate,
 *  which is the queue working as designed and not a third party at all.
 *
 *  The authority is Maple's own and splits three ways (PPM
 *  0xBe10aDcE8B6E3E02Db384E7FaDA5395DD113D8b3, bitmaps read on-chain
 *  2026-08-09; both syrup pools run permissionLevels = 1, function-level):
 *
 *  • A deposit names the account that receives the shares, and it need not be
 *    the account paying — so lending FOR someone is permissionless from the
 *    giver's side. It is not unconditional: every LP entry point runs
 *    `checkCall` → `MaplePoolManager.canCall`, which for `"P:deposit"` reads
 *    the RECEIVER out of the params and requires
 *    `poolPermissionManager.hasPermission(...)`, reverting "PM:CC:NOT_ALLOWED"
 *    otherwise. The entry gate is real (P:deposit bitmap = 16) and Maple's own
 *    deposit router — a PPM permissionAdmin — grants the bit inside the
 *    deposit transaction: gated in mechanism, permissionless in practice.
 *  • Share transfers run the same `checkCall`, but the transfer gate is set
 *    OPEN on both syrup pools (P:transfer bitmap = 0) — transfers settle for
 *    any wallet, and positions routinely live at addresses that were never
 *    individually permitted (holders with lenderBitmaps = 0 exist).
 *  • Shares leaving a position are an ERC-20 allowance spend, enforced in
 *    `MaplePool._burn`: `if (caller_ != owner_) _decreaseAllowance(owner_,
 *    caller_, shares_);` and pre-checked in `processRedeem`. The exit paths'
 *    permission bitmaps (WM:requestRedeem, P:redeem) are 0 as well.
 *
 *  ⚠️ Nothing here may call the plain ERC-4626 `withdraw` an entry point:
 *  `processWithdraw` is `require(false, "PM:PW:NOT_ENABLED")`, `requestWithdraw`
 *  reverts and `maxWithdraw` returns 0. Only the redeem/queue path works, so
 *  every exit is described as the queue. */
function permissionedActorMechanic(ctx: MapleContext, coords: MapleCoords): ClauseInput {
  if (ctx.eventType === "request_fill") return null;
  if (!coords.account) return null;
  if (!externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, coords.account)) return null;
  const opened = <>Another address executed this — the account holding the position neither signed the transaction </>;
  if (ctx.eventType === "deposit")
    return clause(
      <>
        {opened}
        nor was the caller the pool recorded. Maple lets anyone lend on someone else&rsquo;s behalf: a deposit names the
        account the shares go to, and it need not be the account paying. The deposit still passes the pool&rsquo;s entry
        check — the named account has to hold the pool&rsquo;s entry permission, which Maple&rsquo;s own deposit route
        grants inside the deposit transaction, and without it the deposit reverts.
      </>,
    );
  if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out")
    return clause(
      <>
        {opened}
        nor was it the wallet on the other side of the transfer. Pool shares move wallet-to-wallet as freely as any
        token: arriving shares ask nothing of the receiver, and shares leaving this way ride an ordinary ERC-20
        allowance the holder granted beforehand — revocable the same way.
      </>,
    );
  return clause(
    <>
      {opened}
      nor was the caller the pool recorded. Shares only leave a position through the withdrawal queue, and another
      address moves them by spending a share allowance the holder granted beforehand — the ordinary ERC-20 kind,
      revocable the same way.
    </>,
  );
}

// ── the variant table ────────────────────────────────────────────────────────

export function mapleEventSlots(ctx: MapleContext, coords: MapleCoords): EventProseSlots {
  const slots = mapleEventSlotsBase(ctx, coords);
  const actor = permissionedActorMechanic(ctx, coords);
  if (!actor) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), actor] };
}

function mapleEventSlotsBase(ctx: MapleContext, coords: MapleCoords): EventProseSlots {
  const asset = ctx.assetSymbol;
  const poolSym = ctx.poolSymbol;

  // Resulting-state reads (from the context, never recomputed). `known` gates
  // any assertion: a missing after-field means the clause is simply absent, not
  // a claim of zero.
  const sharesKnown = ctx.sharesAfter != null;
  const escrowKnown = ctx.escrowAfter != null;
  const hasShares = sharesKnown && num(ctx.sharesAfter) > MAPLE_EPS;
  const hasEscrow = escrowKnown && num(ctx.escrowAfter) > MAPLE_EPS;

  // Header-delta echoes — WITH the token symbol the ChainTruthRow receipt keys
  // on, and the signed value it registers (chainTruthDeltaValue).
  const assetDeltaFig = (et: "deposit" | "withdraw" | "request_fill") => (
    <Fig
      echo
      info={assetsDeltaProv(asset, et, coords, ctx.raw?.assets)}
      value={chainTruthDeltaValue(Number(ctx.assetsDelta ?? 0), false)}
      symbol={asset}
    >
      {fmtAbs(ctx.assetsDelta)} {asset}
    </Fig>
  );
  const shareDeltaFig = (et: "deposit" | "withdraw") => (
    <Fig
      echo
      info={sharesDeltaProv(poolSym, et, coords, ctx.raw?.shares)}
      value={chainTruthDeltaValue(Number(ctx.sharesDelta ?? 0), false)}
      symbol={poolSym}
    >
      {fmtAbs(ctx.sharesDelta)} {poolSym}
    </Fig>
  );
  const requestSharesFig = (et: "request" | "request_decrease") => {
    const s = Number(ctx.requestShares ?? 0) || 0;
    return (
      <Fig
        echo
        info={requestSharesProv(poolSym, et, coords, ctx.raw?.shares)}
        value={chainTruthDeltaValue(et === "request" ? -s : s, false)}
        symbol={poolSym}
      >
        {fmtAbs(ctx.requestShares)} {poolSym}
      </Fig>
    );
  };
  const requestCancelFig = () => (
    <Fig
      echo
      info={requestCancelSharesProv(poolSym, coords, ctx.raw?.shares)}
      value={chainTruthDeltaValue(Number(ctx.requestShares ?? 0) || 0, false)}
      symbol={poolSym}
    >
      {fmtAbs(ctx.requestShares)} {poolSym}
    </Fig>
  );
  const transferShareFig = (dir: "in" | "out") => (
    <Fig
      echo
      info={transferAmountProv(poolSym, dir, coords, ctx.raw?.shares)}
      value={chainTruthDeltaValue(Number(ctx.sharesDelta ?? 0), false)}
      symbol={poolSym}
    >
      {fmtAbs(ctx.sharesDelta)} {poolSym}
    </Fig>
  );
  // The shares a fill redeemed — echoes the detail's escrow transition (a queue
  // fill's own shares field is 0, so the escrow leg carries this figure). The
  // detail's DeltaToggle registers it signed-negative and WITHOUT a symbol.
  const fillSharesFig = () => (
    <Fig
      echo
      info={requestSharesProv(poolSym, "request_fill", coords, ctx.raw?.shares)}
      value={chainTruthDeltaValue(-(Number(ctx.requestShares ?? 0) || 0), false)}
    >
      {fmtAbs(ctx.requestShares)} {poolSym}
    </Fig>
  );

  // Detail after-value / rate echoes — the shared detail grid registers these
  // WITHOUT a symbol prop, so these echoes omit `symbol` to key-match.
  const sharesAfterFig = () =>
    ctx.sharesAfter == null ? null : (
      <Fig echo info={sharesAfterProv(poolSym, coords, ctx.raw?.sharesAfter)} value={fmtVal(ctx.sharesAfter)}>
        {fmtVal(ctx.sharesAfter)} {poolSym}
      </Fig>
    );
  const escrowAfterFig = () =>
    ctx.escrowAfter == null ? null : (
      <Fig echo info={escrowAfterProv(poolSym, coords, ctx.raw?.escrowAfter)} value={fmtVal(ctx.escrowAfter)}>
        {fmtVal(ctx.escrowAfter)} {poolSym}
      </Fig>
    );
  // The exit rate this operation settled at — two emitted amounts of its own
  // log. Rendered only where the detail grid shows the rate cell (both amounts
  // non-zero), matching that cell's value (assets ÷ shares to 6 places).
  const rateFig = (et: "deposit" | "withdraw" | "request_fill"): ReactNode | null => {
    const assets = Math.abs(Number(ctx.assetsDelta ?? 0));
    const shares = Math.abs(Number((et === "request_fill" ? ctx.requestShares : ctx.sharesDelta) ?? 0));
    if (!(assets > 0 && shares > 0)) return null;
    const rate = assets / shares;
    return (
      <Fig echo info={eventRateProv(asset, poolSym, et, coords)} value={rate.toFixed(6)}>
        {rate.toFixed(4)} {asset} per share
      </Fig>
    );
  };

  switch (ctx.eventType) {
    case "deposit": {
      const happened = ctx.isOpen ? (
        <>
          Opened the position by lending {assetDeltaFig("deposit")} to the {poolSym} pool, receiving{" "}
          {shareDeltaFig("deposit")} in return.
        </>
      ) : (
        <>
          Lent {assetDeltaFig("deposit")} to the {poolSym} pool, receiving {shareDeltaFig("deposit")} in return.
        </>
      );
      const rate = rateFig("deposit");
      return {
        happened: [clause(happened)],
        changed: [rate ? clause(<>The shares were priced at {rate} at this deposit.</>) : null],
        meansNow: [
          clause(<>The {poolSym} share is a transferable claim whose value tracks the pool&rsquo;s loan book.</>),
          clause(
            <>
              That book lends to Maple&rsquo;s institutional borrowers against collateral held off-chain, so the
              share&rsquo;s value is the pool&rsquo;s own accounting of it rather than a figure the chain can prove on
              its own.
            </>,
          ),
        ],
      };
    }

    case "withdraw": {
      const rate = rateFig("withdraw");
      const changed = hasShares
        ? clause(<>The position keeps {sharesAfterFig()} in the pool.</>)
        : sharesKnown && !hasEscrow
          ? clause(<>This emptied the position&rsquo;s stake in the pool.</>)
          : null;
      return {
        happened: [
          clause(
            <>
              Withdrew {assetDeltaFig("withdraw")} from the {poolSym} pool by burning {shareDeltaFig("withdraw")}.
            </>,
          ),
        ],
        changed: [changed],
        meansNow: [
          rate ? clause(<>The pool paid out at its exit rate of {rate}.</>) : null,
          clause(<>When the pool marks an impairment, the lenders exiting first take it.</>),
        ],
      };
    }

    case "request": {
      return {
        happened: [
          clause(
            <>Requested to withdraw {requestSharesFig("request")}, moving the shares into the queue&rsquo;s escrow.</>,
          ),
        ],
        changed: [hasEscrow ? clause(<>The queue now holds {escrowAfterFig()} for this position.</>) : null],
        meansNow: [
          clause(
            <>
              The request takes its place in line and fills first-in, first-out as the pool has cash — typically within
              minutes, though the queue allows up to 30 days.
            </>,
          ),
          clause(
            <>
              Escrowed shares are still the position&rsquo;s, and they price at the exit rate when the request fills,
              not now.
            </>,
          ),
          clause(<>The request can be reduced or cancelled before it fills, returning the shares to the wallet.</>),
        ],
      };
    }

    case "request_decrease": {
      return {
        happened: [
          clause(
            <>
              Reduced the pending withdrawal request, returning {requestSharesFig("request_decrease")} from the
              queue&rsquo;s escrow to the wallet.
            </>,
          ),
        ],
        changed: [
          hasEscrow
            ? clause(<>The queue still holds {escrowAfterFig()} for this position.</>)
            : escrowKnown
              ? clause(<>The queue&rsquo;s escrow for this position is now empty.</>)
              : null,
        ],
      };
    }

    case "request_cancel": {
      return {
        happened: [
          clause(
            <>
              Cancelled the withdrawal request, returning {requestCancelFig()} from the queue&rsquo;s escrow to the
              wallet.
            </>,
          ),
        ],
        meansNow: [
          clause(<>The queue position is gone.</>),
          clause(<>A new request would join the back of the line.</>),
        ],
      };
    }

    case "request_fill": {
      const rate = rateFig("request_fill");
      return {
        happened: [
          clause(
            <>
              The queue filled the withdrawal: {fillSharesFig()} redeemed for {assetDeltaFig("request_fill")}, paid to
              the wallet in the same transaction.
            </>,
          ),
        ],
        changed: [
          hasEscrow
            ? clause(<>The queue still holds {escrowAfterFig()} for this position.</>)
            : escrowKnown
              ? clause(<>That cleared the request from the queue.</>)
              : null,
        ],
        meansNow: [rate ? clause(<>It redeemed at the exit rate the moment it filled, {rate}.</>) : null],
      };
    }

    case "transfer_in": {
      const bridge = Boolean(getCcipEscrow(ctx.counterparty));
      return bridge
        ? {
            happened: [
              clause(
                <>
                  Received {transferShareFig("in")}, released from Chainlink&rsquo;s CCIP bridge escrow as a bridged
                  balance returned to Ethereum.
                </>,
              ),
            ],
            meansNow: [
              clause(
                <>
                  The shares had been locked in that escrow to back the position&rsquo;s balance on another network, and
                  the claim on the pool&rsquo;s {asset} returned with them — no pool event records it.
                </>,
              ),
            ],
          }
        : {
            happened: [clause(<>Received {transferShareFig("in")} from another wallet.</>)],
            meansNow: [
              clause(
                <>
                  Pool shares are ordinary ERC-20s, so the transfer moved the claim on the pool&rsquo;s {asset} into
                  this position with no pool event.
                </>,
              ),
            ],
          };
    }

    case "transfer_out": {
      const bridge = Boolean(getCcipEscrow(ctx.counterparty));
      return bridge
        ? {
            happened: [
              clause(
                <>
                  Sent {transferShareFig("out")} into Chainlink&rsquo;s CCIP bridge escrow, locked there to back a
                  bridged balance on another network.
                </>,
              ),
            ],
            meansNow: [
              clause(
                <>
                  The claim on the pool&rsquo;s {asset} travels with the bridged shares, and the escrow holds custody
                  rather than a position of its own.
                </>,
              ),
            ],
          }
        : {
            happened: [clause(<>Sent {transferShareFig("out")} to another wallet.</>)],
            meansNow: [
              clause(
                <>
                  Pool shares are ordinary ERC-20s, so the claim on the pool&rsquo;s {asset} moved with them and no pool
                  event records it.
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
export function mapleExplainerTeaser(ctx: MapleContext, coords: MapleCoords): ReactNode | null {
  return splitLead(eventClauses(mapleEventSlots(ctx, coords))).lead;
}
