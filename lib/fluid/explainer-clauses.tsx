// Fluid plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the position looks
// like AFTER this event), never on the event type alone: a withdraw that closes
// the position, a payback that clears the debt, a deposit that opens the first
// leg all read differently though they share a kind. The state-blind morals the
// old bullets carried ("keeps it clear of the liquidation bands", "reduces the
// cover behind any outstanding debt") are gone — replaced by facts about THIS
// event's own figures.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the open card (deltas → spine/header, after-balances +
// liquidation reads → the detail grid), a plain primary only for a figure with
// no on-card twin (the split-open case: the mint card narrates the SIBLING
// deposit's figure, whose primary lives in another card's registry — an echo
// cannot cross a ProvReceiptsScope boundary, so it registers here as a primary).
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Fluid cannot fill, each a data fact of its pipeline:
//   • §5.1 (risk consequence per event) on operate events: the indexed stream
//     carries no per-event oracle price for operates — only liquidations embed
//     oraclePriceAtBlock — so a ratio-vs-threshold read at event time cannot
//     be computed. Stated on liquidation events only, where the sweep itself
//     carries the price.
//   • §5.2 (mechanic-why on fees): Fluid operates charge no per-event fee (no
//     borrow fee, no close fee). The only fee-like figures are the liquidation
//     penalty / absorption margin, priced by the valued sentence (§5.4).
//   • §5.4 beyond liquidations: no USD feed and no per-event price → no other
//     valued net-outcome figure exists to derive.
// Filled: forward paths (§5.3) on collateral-only, debt-without-collateral and
// dust; aggregate context (§5.5) via composite operates + the split-open mint
// narrator / cross-reference pair; the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { BaseActivityEvent, FluidContext } from "@/lib/shared/types/event-shape";
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
  colDeltaProv,
  debtDeltaProv,
  colAfterProv,
  debtAfterProv,
  liqSettledProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  ownerProv,
  type FluidCoords,
} from "@/lib/fluid/event-provenance";
import { pairLabel, shortAddress } from "@/lib/fluid/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

/** The dust epsilon. Mirrors the DUST constant in lib/fluid/economics.ts — a
 *  balance whose magnitude sits below this is rounding dust from the vault's
 *  exchange-rate arithmetic, not a real position. */
export const FLUID_EPS = 1e-9;

export type FluidEvent = BaseActivityEvent & { context: { protocol: "fluid"; data: FluidContext } };

const OPERATE_KINDS = new Set<FluidContext["eventType"]>([
  "deposit",
  "withdraw",
  "borrow",
  "payback",
  "deposit_borrow",
  "withdraw_payback",
  "deposit_payback",
  "withdraw_borrow",
]);

const isOperate = (e: FluidEvent): boolean => OPERATE_KINDS.has(e.context.data.eventType);

// ── resulting state ──────────────────────────────────────────────────────────

export interface FluidResultingState {
  colAfter: number;
  debtAfter: number;
  hasDebtAfter: boolean;
  collateralOnly: boolean;
  closedPosition: boolean;
  debtCleared: boolean;
  colDust: number | null;
  debtDust: number | null;
}

/** Does a leg hold anything? One rule for the card's pill, the pane's prose and
 *  the status verdict behind both — a position that "owes nothing" in words must
 *  not wear the Borrowing pill above them.
 *
 *  The threshold is per-lane, and that is the point of the function. A CHAIN
 *  figure — the live resolver read, or the worker's stamped settled overlay — is
 *  a balance: a wei is a wei, and the server files the position open at `> 0`
 *  (api/src/routes/fluid.ts:333), so agreeing at `> 0` is what keeps the served
 *  status and the rendered word one claim rather than two. The Σ replay keeps ε,
 *  because its last digits are exchange-rate arithmetic rather than a balance —
 *  and because it is a principal-flow number that lands BELOW zero on a position
 *  that has paid out the interest its collateral earned. */
export function fluidLegHolds(value: number | string | null | undefined, basis: "chain" | "flows"): boolean {
  const n = Number(value ?? NaN);
  if (!Number.isFinite(n)) return false;
  return basis === "chain" ? n > 0 : n > FLUID_EPS;
}

/** A leg reads as dust when its magnitude is non-zero but at or below ε — the
 *  tiny exchange-rate residual a closed position leaves behind. The bound
 *  matches `colZero`/`debtZero` below: every leg that collapses to zero and is
 *  not zero is dust, so a collapsed leg can never print without its caveat. */
const dustOf = (n: number): number | null => (n !== 0 && Math.abs(n) <= FLUID_EPS ? n : null);

export function resultingState(ctx: FluidContext): FluidResultingState {
  const isLiq = ctx.eventType === "liquidated" || ctx.eventType === "absorbed";
  const colRaw = Number((isLiq ? ctx.liqSupplyAfter : ctx.colAfter) ?? NaN);
  const debtRaw = Number((isLiq ? ctx.liqBorrowAfter : ctx.debtAfter) ?? NaN);
  const colAfter = Number.isFinite(colRaw) ? colRaw : 0;
  const debtAfter = Number.isFinite(debtRaw) ? debtRaw : 0;
  // A leg is "collapsed" when it sits at or below ε — dust and the interest-
  // blind negative Σ residual a full repay leaves both count as zero here.
  const colZero = colAfter <= FLUID_EPS;
  const debtZero = debtAfter <= FLUID_EPS;
  return {
    colAfter,
    debtAfter,
    hasDebtAfter: debtAfter > FLUID_EPS,
    collateralOnly: !colZero && debtZero,
    closedPosition: colZero && debtZero,
    debtCleared: debtZero,
    colDust: dustOf(colAfter),
    debtDust: dustOf(debtAfter),
  };
}

// ── sibling predicates ───────────────────────────────────────────────────────

export function economicSiblings(siblings: FluidEvent[], self: FluidEvent): FluidEvent[] {
  const nft = self.context.data.nftId;
  return siblings.filter((s) => s !== self && s.context.data.nftId === nft && isOperate(s));
}

export function isOpeningTx(siblings: FluidEvent[], self: FluidEvent): boolean {
  const nft = self.context.data.nftId;
  return siblings.some((s) => s.context.data.eventType === "mint" && s.context.data.nftId === nft);
}

/** This operate mints its own position in the same transaction — the split-open
 *  case, where the mint card is the narrator and this card carries one
 *  cross-reference back to it. */
export function fundedSameTx(siblings: FluidEvent[], self: FluidEvent): boolean {
  return isOperate(self) && isOpeningTx(siblings, self);
}

export function coordsFor(e: FluidEvent): FluidCoords {
  const c = e.context.data;
  return {
    txHash: e.txHash,
    blockNumber: e.blockNumber,
    vault: c.vault,
    pairLabel: pairLabel(c.supplySymbol, c.borrowSymbol),
    nftId: c.nftId,
    owner: c.ownerAt ?? e.wallet,
  };
}

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

const fmtAbs = (h?: string): string => formatNumber(Math.abs(Number(h)));
const fmtVal = (h?: string): string => formatNumber(Number(h));

// ── the variant table ────────────────────────────────────────────────────────

/** The third-party-actor clause — the prose half of the pink chip the header
 *  renders when the position's owner AT this event was neither the signer nor
 *  the operate's initiator.
 *
 *  `txFrom`/`initiator` ship exactly where the two-fact verdict is decidable,
 *  so their presence IS the verdict — which is what lets this stay a pure
 *  function with no owner in hand, matching the card's own gate.
 *
 *  The authority is protocol-specific and the obvious answer is WRONG here.
 *  Fluid's single entry point is
 *  `operate(uint256 nftId_, int256 newCol_, int256 newDebt_, address to_)`, and
 *  its owner check fires only when value LEAVES:
 *
 *      // checking owner only in case of withdraw or borrow
 *      if ((newCol_ < 0 || newDebt_ > 0) && (VAULT_FACTORY.ownerOf(temp_) != msg.sender))
 *          revert FluidVaultError(ErrorTypes.Vault__NotAnOwner);
 *
 *  So `newCol_ > 0` (add collateral) and `newDebt_ < 0` (repay) on ANY nftId_
 *  are permissionless — anyone may top up or pay down anyone's position.
 *
 *  ⚠️ For removing value there is NO delegation path at all. The check is a
 *  strict `ownerOf(nftId_) == msg.sender` equality: `isApprovedForAll`,
 *  `getApproved` and `approve` appear nowhere in the vault core module. The
 *  position IS an ERC-721 and those functions do exist on the Vault Factory,
 *  but `operate` never consults them, so an ERC-721-approved operator still
 *  reverts with `Vault__NotAnOwner`. The only way a third party withdraws or
 *  borrows is to be handed the NFT outright — at which point it is the owner,
 *  not a delegate. Nothing below says "the owner approved them": on Fluid
 *  there is nothing to approve.
 *
 *  A consequence read off that source (not off live data, so the copy is
 *  written not to depend on it): a value-REMOVING row should be structurally
 *  incapable of marking, leaving `deposit`, `payback` and `deposit_payback` as
 *  the reachable kinds. The second branch states the rule rather than a verdict
 *  about the sender, so it stays true if one ever turns up. */
function permissionlessActorMechanic(ctx: FluidContext): ClauseInput {
  if (!ctx.txFrom || !ctx.initiator) return null;
  const addsOnly = ctx.eventType === "deposit" || ctx.eventType === "payback" || ctx.eventType === "deposit_payback";
  if (addsOnly)
    return clause(
      <>
        A third-party address executed this on the owner&rsquo;s behalf, and on Fluid it needed no permission to. The
        vault asks who is calling only when value leaves a position — adding collateral or repaying debt against any
        position is open to anyone — so this needed nothing from the owner, and nothing left the position in return.
      </>,
    );
  return clause(
    <>
      A third-party address executed this, and it moved value out of the position. Fluid has no delegation to grant for
      that: the vault requires the caller to be the address currently holding the position&rsquo;s NFT, and an ERC-721
      approval does not stand in for it — the right to take value out moves only when the NFT itself changes hands.
    </>,
  );
}

export function fluidEventSlots(
  ctx: FluidContext,
  coords: FluidCoords,
  siblings: FluidEvent[],
  self: FluidEvent,
): EventProseSlots {
  const slots = fluidEventSlotsBase(ctx, coords, siblings, self);
  const actor = permissionlessActorMechanic(ctx);
  if (!actor) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), actor] };
}

function fluidEventSlotsBase(
  ctx: FluidContext,
  coords: FluidCoords,
  siblings: FluidEvent[],
  self: FluidEvent,
): EventProseSlots {
  const supplySym = ctx.supplySymbol ?? "DEX shares";
  const borrowSym = ctx.borrowSymbol ?? "DEX shares";
  const rs = resultingState(ctx);
  const funded = fundedSameTx(siblings, self);

  // Delta figures echo the spine / detail-grid delta receipt (signed exact
  // value, same prov vocabulary + coords → same entry key).
  const colDeltaFig = () => (
    <Fig
      echo
      info={colDeltaProv(supplySym, coords, ctx.raw?.colAmt)}
      value={chainTruthDeltaValue(Number(ctx.colDelta ?? 0), false)}
      symbol={supplySym}
    >
      {fmtAbs(ctx.colDelta)} {supplySym}
    </Fig>
  );
  const debtDeltaFig = () => (
    <Fig
      echo
      info={debtDeltaProv(borrowSym, coords, ctx.raw?.debtAmt)}
      value={chainTruthDeltaValue(Number(ctx.debtDelta ?? 0), false)}
      symbol={borrowSym}
    >
      {fmtAbs(ctx.debtDelta)} {borrowSym}
    </Fig>
  );
  // After-balance figures echo the detail grid's after-value receipt.
  const colAfterFig = () => (
    <Fig echo info={colAfterProv(supplySym, coords, ctx.raw?.colAfter)} value={fmtVal(ctx.colAfter)} symbol={supplySym}>
      {fmtVal(ctx.colAfter)} {supplySym}
    </Fig>
  );
  const debtAfterFig = () => (
    <Fig
      echo
      info={debtAfterProv(borrowSym, coords, ctx.raw?.debtAfter)}
      value={fmtVal(ctx.debtAfter)}
      symbol={borrowSym}
    >
      {fmtVal(ctx.debtAfter)} {borrowSym}
    </Fig>
  );

  // The dust figure (the tiny residual a closed position leaves) is the after-
  // value itself, Prov-echoed against the same after receipt.
  const dustFig = () => (rs.colDust != null ? colAfterFig() : rs.debtDust != null ? debtAfterFig() : null);
  const dustTail = () =>
    dustFig() != null ? (
      <>
        . The {dustFig()} shown is rounding dust — a leftover from the vault&rsquo;s internal arithmetic, not a real
        balance.
      </>
    ) : (
      <>.</>
    );

  const crossRef = (sentence: React.ReactNode): ClauseInput => (funded ? clause(sentence) : null);

  // Forward paths (charter §5.3) — the possibility space of a named state,
  // never advice. Collateral-only: the doors are withdraw or borrow again.
  // Debt with no collateral left: interest keeps building on the open debt.
  const collateralOnlyPath = (): ClauseInput =>
    rs.collateralOnly
      ? clause(
          <>
            With no debt, the position accrues no interest; the remaining collateral can be withdrawn at any time or
            left to back a future borrow.
          </>,
        )
      : null;
  const debtNoCoverPath = (): ClauseInput =>
    rs.hasDebtAfter && rs.colAfter <= FLUID_EPS
      ? clause(<>The remaining debt keeps accruing interest until it is repaid.</>)
      : null;

  switch (ctx.eventType) {
    case "deposit": {
      const colBefore = rs.colAfter - Number(ctx.colDelta ?? 0);
      const opensLeg = Math.abs(colBefore) <= FLUID_EPS;
      const to = opensLeg ? (
        <>
          from <strong className="font-semibold text-foreground">0</strong> to {colAfterFig()}
        </>
      ) : (
        <>to {colAfterFig()}</>
      );
      const happened = rs.hasDebtAfter ? (
        <>
          Deposited {colDeltaFig()} of collateral, taking the position {to}, raising the cover behind its{" "}
          {debtAfterFig()} of debt.
        </>
      ) : (
        <>
          Deposited {colDeltaFig()} of collateral, taking the position {to}.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [crossRef(<>The deposit funds the position minted in this same transaction.</>)],
      };
    }

    case "withdraw": {
      const ending: ClauseInput = rs.closedPosition
        ? cont(<>, closing the position — nothing remains on either side{dustTail()}</>)
        : rs.collateralOnly
          ? cont(<>, leaving {colAfterFig()} in the vault.</>)
          : rs.hasDebtAfter && rs.colAfter <= FLUID_EPS
            ? cont(<>, emptying the collateral while its {debtAfterFig()} of debt still stands.</>)
            : cont(<>, reducing the cover behind its {debtAfterFig()} of debt.</>);
      return {
        happened: [clause(<>Withdrew {colDeltaFig()} of collateral</>), ending],
        meansNow: [collateralOnlyPath(), debtNoCoverPath()],
      };
    }

    case "borrow": {
      const debtBefore = rs.debtAfter - Number(ctx.debtDelta ?? 0);
      const firstBorrow = debtBefore <= FLUID_EPS;
      const happened = firstBorrow ? (
        <>
          Borrowed {debtDeltaFig()} against the position&rsquo;s collateral — its first debt, at {debtAfterFig()}.
        </>
      ) : (
        <>
          Borrowed {debtDeltaFig()} against the position&rsquo;s collateral, taking the debt to {debtAfterFig()}.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [crossRef(<>The borrow draws against the position minted in this same transaction.</>)],
      };
    }

    case "payback": {
      const ending: ClauseInput =
        rs.debtCleared && rs.closedPosition
          ? cont(<>, clearing the debt in full and closing the position{dustTail()}</>)
          : rs.debtCleared
            ? cont(<>, clearing the debt in full — the position now holds only collateral.</>)
            : cont(<>, leaving {debtAfterFig()} outstanding.</>);
      return {
        happened: [clause(<>Repaid {debtDeltaFig()} of the position&rsquo;s debt</>), ending],
        meansNow: [collateralOnlyPath()],
      };
    }

    // The four composite cases below no longer carry the general "one Fluid
    // transaction can move collateral and debt together" rule — Layer-2
    // material, covered by the "?" modal (fluidOperateContent("composite")).
    case "deposit_borrow": {
      const happened = (
        <>
          Deposited {colDeltaFig()} of collateral and borrowed {debtDeltaFig()} in one operation, taking the position to{" "}
          {colAfterFig()} against {debtAfterFig()} of debt.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [crossRef(<>This operation funds the position minted in this same transaction.</>)],
      };
    }

    case "withdraw_payback": {
      const tail = rs.closedPosition ? (
        <>, closing the position — nothing remains on either side{dustTail()}</>
      ) : (
        <>
          , leaving {colAfterFig()} against {debtAfterFig()} of debt.
        </>
      );
      const happened = (
        <>
          Withdrew {colDeltaFig()} of collateral and repaid {debtDeltaFig()} of debt in one operation{tail}
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [crossRef(<>This operation funds the position minted in this same transaction.</>)],
      };
    }

    case "deposit_payback": {
      const tail = rs.hasDebtAfter ? (
        <> against {debtAfterFig()} of debt.</>
      ) : rs.debtCleared ? (
        <>, clearing the debt in full.</>
      ) : (
        <>.</>
      );
      const happened = (
        <>
          Deposited {colDeltaFig()} of collateral and repaid {debtDeltaFig()} of debt in one operation, taking the
          position to {colAfterFig()}
          {tail}
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          crossRef(<>This operation funds the position minted in this same transaction.</>),
          collateralOnlyPath(),
        ],
      };
    }

    case "withdraw_borrow": {
      const happened = (
        <>
          Withdrew {colDeltaFig()} of collateral and borrowed {debtDeltaFig()} in one operation, taking the debt to{" "}
          {debtAfterFig()} against {colAfterFig()} of remaining collateral.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [crossRef(<>This operation funds the position minted in this same transaction.</>)],
      };
    }

    case "liquidated":
    case "absorbed":
      return liquidationSlots(ctx, coords, supplySym, borrowSym, rs);

    case "mint":
      return mintSlots(ctx, coords, siblings, self);

    case "transfer": {
      const from = ctx.transferFrom;
      const to = ctx.transferTo;
      const move =
        from && to ? (
          <>
            {" "}
            — from{" "}
            <Fig echo info={ownerProv(coords, from)} value={shortAddress(from)}>
              {shortAddress(from)}
            </Fig>{" "}
            to{" "}
            <Fig echo info={ownerProv(coords, to)} value={shortAddress(to)}>
              {shortAddress(to)}
            </Fig>
          </>
        ) : null;
      return {
        happened: [clause(<>The position NFT moved wallets{move}.</>)],
        meansNow: [
          clause(
            <>The whole position — collateral, debt, liquidation exposure — went with it; balances are untouched.</>,
          ),
        ],
      };
    }

    default:
      return { happened: [] };
  }
}

function liquidationSlots(
  ctx: FluidContext,
  coords: FluidCoords,
  supplySym: string,
  borrowSym: string,
  rs: FluidResultingState,
): EventProseSlots {
  const isAbsorb = ctx.eventType === "absorbed";
  const liqColAfterFig = () => (
    <Fig
      echo
      info={liqSettledProv("collateral", "after", supplySym, coords)}
      value={fmtVal(ctx.liqSupplyAfter)}
      symbol={supplySym}
    >
      {fmtVal(ctx.liqSupplyAfter)} {supplySym}
    </Fig>
  );
  const liqDebtAfterFig = () => (
    <Fig
      echo
      info={liqSettledProv("debt", "after", borrowSym, coords)}
      value={fmtVal(ctx.liqBorrowAfter)}
      symbol={borrowSym}
    >
      {fmtVal(ctx.liqBorrowAfter)} {borrowSym}
    </Fig>
  );

  const happened = isAbsorb ? (
    <>
      This position fell beyond the vault&rsquo;s maximum liquidation limit, so Fluid absorbed what remained of its
      collateral and debt.
    </>
  ) : (
    <>
      A liquidation swept the price band this position sits in — Fluid liquidates whole price bands (ticks), not
      individual positions.
    </>
  );

  const changed: ClauseInput = ctx.fullyLiquidated
    ? clause(<>The sweep emptied the position — nothing remains on either side.</>)
    : clause(
        <>
          The sweep was partial — the position keeps {liqColAfterFig()} of collateral against {liqDebtAfterFig()} of
          debt.
        </>,
      );

  const meansNow: ClauseInput[] = [valuedSentence(ctx, coords, supplySym, borrowSym, isAbsorb)];
  if (!isAbsorb && ctx.liquidator) {
    meansNow.push(
      clause(
        <>
          Executed by a third-party liquidator:{" "}
          <a
            href={explorerUrl(MAINNET_CHAIN_ID, "address", ctx.liquidator)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {shortAddress(ctx.liquidator)}
          </a>
          .
        </>,
      ),
    );
  }
  return { happened: [clause(happened)], changed: [changed], meansNow };
}

/** The valued sentence — the vault's own oracle at the block, in the debt token
 *  (Fluid runs no USD feed). Drops WHOLE when the block is unpriced or a leg's
 *  figures don't resolve — the never-empty floor. */
function valuedSentence(
  ctx: FluidContext,
  coords: FluidCoords,
  colSym: string,
  debtSym: string,
  isAbsorb: boolean,
): ClauseInput {
  const price = ctx.oraclePriceAtBlock;
  if (!price || !ctx.supplySymbol || !ctx.borrowSymbol) return null;
  const seizedAmt = Number(ctx.liqSupplyBefore) - Number(ctx.liqSupplyAfter);
  const clearedAmt = Number(ctx.liqBorrowBefore) - Number(ctx.liqBorrowAfter);
  if (!Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0) return null;
  const seizedValue = seizedAmt * price.debtPerCol;
  const inDebt = (n: number) => `${formatNumber(n)} ${debtSym}`;
  const seizedFig = (
    <Fig
      echo
      info={liqSeizedValueProv(colSym, debtSym, coords, { amount: String(seizedAmt), price: price.debtPerCol })}
      value={inDebt(seizedValue)}
      symbol={colSym}
    >
      {inDebt(seizedValue)}
    </Fig>
  );
  const clearedFig = (
    <Fig
      echo
      info={liqClearedValueProv(debtSym, coords, { amount: String(clearedAmt) })}
      value={inDebt(clearedAmt)}
      symbol={debtSym}
    >
      {inDebt(clearedAmt)}
    </Fig>
  );
  const premium = (seizedValue / clearedAmt - 1) * 100;
  const premiumStr = `${premium >= 0 ? "+" : "−"}${Math.abs(premium).toFixed(2)}%`;
  return clause(
    <>
      At the vault&rsquo;s oracle price at the time, the {isAbsorb ? "absorbed" : "seized"} collateral was worth{" "}
      {seizedFig} against {clearedFig} cleared — a{" "}
      <strong className="font-semibold text-foreground">{premiumStr}</strong>{" "}
      {isAbsorb ? "margin kept by the vault" : "premium to the liquidator"}. Fluid quotes everything in the debt token —
      it uses no dollar prices.
    </>,
  );
}

function mintSlots(ctx: FluidContext, coords: FluidCoords, siblings: FluidEvent[], self: FluidEvent): EventProseSlots {
  const nftFig = <strong className="font-semibold text-foreground">#{ctx.nftId}</strong>;
  const ownerFig = ctx.transferTo ? (
    <Fig echo info={ownerProv(coords, ctx.transferTo)} value={shortAddress(ctx.transferTo)}>
      {shortAddress(ctx.transferTo)}
    </Fig>
  ) : null;
  const mechanics = clause(<>Fluid positions are ERC-721s — the NFT is the position, and it can change wallets.</>);

  // The narrator: when this mint has economic siblings in the same tx, it owns
  // the opening act's whole narrative, including the sibling's funding figure
  // (registered here as a PRIMARY — an echo can't cross the sibling card's
  // scope boundary).
  const sibs = economicSiblings(siblings, self);
  const firstDeposit = sibs.find((s) => Number(s.context.data.colDelta ?? 0) > 0);
  const firstBorrow = sibs.find((s) => Number(s.context.data.debtDelta ?? 0) > 0);
  const fundingSib = firstDeposit ?? firstBorrow;

  if (fundingSib) {
    const sc = fundingSib.context.data;
    const sCoords = coordsFor(fundingSib);
    const isDep = fundingSib === firstDeposit;
    const sym = (isDep ? sc.supplySymbol : sc.borrowSymbol) ?? "DEX shares";
    const amt = isDep ? sc.colDelta : sc.debtDelta;
    const fundFig = (
      <Fig
        info={isDep ? colDeltaProv(sym, sCoords, sc.raw?.colAmt) : debtDeltaProv(sym, sCoords, sc.raw?.debtAmt)}
        value={chainTruthDeltaValue(Number(amt ?? 0), false)}
        symbol={sym}
      >
        {fmtAbs(amt)} {sym}
      </Fig>
    );
    const funding = isDep ? (
      <>, and its first deposit put {fundFig} of collateral behind it</>
    ) : (
      <>, and its first borrow drew {fundFig} against it</>
    );
    return {
      happened: [
        clause(
          <>
            The position opened in this transaction: the vault factory minted NFT {nftFig}
            {ownerFig ? <> to {ownerFig}</> : null}
            {funding}.
          </>,
        ),
      ],
      meansNow: [mechanics],
    };
  }

  return {
    happened: [
      clause(
        <>
          The position opened: the vault factory minted NFT {nftFig}
          {ownerFig ? <> to {ownerFig}</> : null}.
        </>,
      ),
    ],
    meansNow: [mechanics],
  };
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function fluidExplainerTeaser(
  ctx: FluidContext,
  coords: FluidCoords,
  siblings: FluidEvent[],
  self: FluidEvent,
): ReactNode | null {
  return splitLead(eventClauses(fluidEventSlots(ctx, coords, siblings, self))).lead;
}
