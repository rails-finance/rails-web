// LlamaLend plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the loan looks
// like AFTER this event) where the event carries an after-image, never on the
// event type alone: a repay that closes the loan, a repay that leaves debt
// standing, and a partial liquidation that records no end balances all read
// differently though two of them share a kind. The state-blind morals the old
// bullets carried ("keeps it clear of the liquidation bands") are gone —
// replaced by facts about THIS event's own figures, plus the band-direction
// mechanic that IS true of the single lever each operate moves.
//
// Figures render through <Prov echo>: the emitted deltas twin the header row,
// the after-balances twin the detail grid — same prov vocabulary + coords, so
// the same entry key. Only chrome-mirrored figures are bold (the highlight
// rule, charter §5.6); the already-converted crvUSD a hard liquidation seizes
// (convertedTaken) has no on-card twin, so it stays muted, unwrapped.
//
// ── The seized-crvUSD trap (kept) ────────────────────────────────────────────
// On a hard liquidation, the debt delta is the debt written off (captioned
// "cleared"); `convertedTaken` is a SEPARATE figure — the borrowed token the
// AMM had already converted out of the collateral (soft-liquidation), seized as
// the other leg of the AMM holding. It is NEVER the debt cleared, and no clause
// here captions it as such.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items LlamaLend cannot fill on the event stream, each a data fact:
//   • §5.1 (risk consequence with FIGURES per event): the captured event carries
//     no oracle price and no band-price bounds, so a numeric health / distance-
//     to-line at event time cannot be computed. The band DIRECTION each single-
//     lever operate moves is stated (verified LLAMMA math), but without a figure.
//   • §5.2 (mechanic-why on fees): operates charge no per-event fee (interest
//     accrues per second, no upfront fee). The only fee-like figure is the
//     liquidation discount, named but not numbered — the discount rate is not in
//     the event.
//   • §5.4 (derived net-outcome): a liquidation's premium against the discount
//     would need the oracle price at the event, which the stream does not carry —
//     so no valued net-outcome figure is derived (unlike Fluid, whose liquidation
//     rows embed the oracle price).
// Filled: forward paths (§5.3) on the partial-liquidation and soft-liquidation
// states; act context (§5.5) on the liquidator row; the highlight rule (§5.6).

import type { ReactNode } from "react";
import type { LlamalendContext } from "@/lib/shared/types/event-shape";
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
  collateralDeltaProv,
  debtDeltaProv,
  afterImageProv,
  liquidationProv,
  type LlamalendCoords,
} from "@/lib/llamalend/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

/** A balance below this is arithmetic dust, not a real leg. Mirrors economics.ts. */
const DUST = 1e-12;

// ── resulting state ──────────────────────────────────────────────────────────

export interface LlamalendResultingState {
  colAfter: number | null;
  debtAfter: number | null;
  hasColAfter: boolean;
  hasDebtAfter: boolean;
  /** Debt stated and cleared to zero — the loan closed. */
  closedLoan: boolean;
  /** Debt stated and still standing. */
  debtStanding: boolean;
  /** No after-image at all — the partial-liquidation path emits none. */
  unstated: boolean;
}

const num = (h?: string | null): number | null => {
  if (h == null || h === "") return null;
  const n = Number(h);
  return Number.isFinite(n) ? n : null;
};

export function resultingState(ctx: LlamalendContext): LlamalendResultingState {
  const colAfter = num(ctx.collateralAfter);
  const debtAfter = num(ctx.debtAfter);
  return {
    colAfter,
    debtAfter,
    hasColAfter: colAfter != null,
    hasDebtAfter: debtAfter != null,
    closedLoan: debtAfter != null && Math.abs(debtAfter) <= DUST,
    debtStanding: debtAfter != null && debtAfter > DUST,
    unstated: colAfter == null && debtAfter == null,
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

/** Etherscan address link, click-isolated from the card. Muted-blue, never bold
 *  — a party address is not a chrome-mirrored figure. */
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

const fmtAbs = (h?: string | null): string => formatNumber(Math.abs(Number(h)));
const present = (h?: string | null): boolean => h != null && h !== "" && Number(h) !== 0;

// ── the variant table ────────────────────────────────────────────────────────

export function llamalendEventSlots(ctx: LlamalendContext, coords: LlamalendCoords): EventProseSlots {
  const collSym = ctx.collateralSymbol;
  const debtSym = ctx.borrowedSymbol;
  const rs = resultingState(ctx);

  // Emitted-delta figures echo the header row (signed exact value, same prov
  // vocabulary + coords → same entry key).
  const collDeltaFig = () => (
    <Fig
      echo
      info={collateralDeltaProv(collSym, ctx.eventType, coords, ctx.raw?.collateralDelta)}
      value={chainTruthDeltaValue(Number(ctx.collateralDelta ?? 0), false)}
      symbol={collSym}
    >
      {fmtAbs(ctx.collateralDelta)} {collSym}
    </Fig>
  );
  const debtDeltaFig = () => (
    <Fig
      echo
      info={debtDeltaProv(debtSym, ctx.eventType, coords, ctx.raw?.debtDelta)}
      value={chainTruthDeltaValue(Number(ctx.debtDelta ?? 0), false)}
      symbol={debtSym}
    >
      {fmtAbs(ctx.debtDelta)} {debtSym}
    </Fig>
  );
  // After-balance figures echo the detail grid's after-value receipt.
  const colAfterFig = () => (
    <Fig
      echo
      info={afterImageProv(collSym, "collateral", coords, ctx.raw?.collateralAfter)}
      value={fmtAbs(ctx.collateralAfter)}
      symbol={collSym}
    >
      {fmtAbs(ctx.collateralAfter)} {collSym}
    </Fig>
  );
  const debtAfterFig = () => (
    <Fig
      echo
      info={afterImageProv(debtSym, "debt", coords, ctx.raw?.debtAfter)}
      value={fmtAbs(ctx.debtAfter)}
      symbol={debtSym}
    >
      {fmtAbs(ctx.debtAfter)} {debtSym}
    </Fig>
  );

  // The general band mechanic (collateral sits as liquidity across price
  // bands, which is what makes soft-liquidation possible) is Layer-2 material —
  // the "?" modal (llamalendBorrowContent's "Collateral lives in an AMM")
  // closes on the identical sentence, so the pane no longer repeats it.

  switch (ctx.eventType) {
    case "borrow": {
      const collMoved = present(ctx.collateralDelta);
      const happened = ctx.isOpen ? (
        collMoved ? (
          <>
            Opened the position, depositing {collDeltaFig()} of collateral and drawing {debtDeltaFig()}.
          </>
        ) : (
          <>Opened the position, drawing {debtDeltaFig()}.</>
        )
      ) : collMoved ? (
        <>
          Borrowed another {debtDeltaFig()} and added {collDeltaFig()} of collateral.
        </>
      ) : (
        <>Borrowed another {debtDeltaFig()} against the position&rsquo;s collateral.</>
      );
      // On open the totals equal the deltas just stated — skip the echo; on a
      // later borrow the running totals are worth stating.
      const changed: ClauseInput =
        !ctx.isOpen && rs.hasDebtAfter && rs.hasColAfter
          ? clause(
              <>
                That takes the debt to {debtAfterFig()} against {colAfterFig()} of collateral.
              </>,
            )
          : null;
      return {
        happened: [clause(happened)],
        changed: [changed],
        meansNow: [],
      };
    }

    case "add_collateral": {
      const changed: ClauseInput =
        rs.hasColAfter && rs.hasDebtAfter
          ? clause(
              <>
                The position now holds {colAfterFig()} of collateral against {debtAfterFig()} of debt.
              </>,
            )
          : null;
      return {
        happened: [clause(<>Added {collDeltaFig()} of collateral without changing the debt.</>)],
        changed: [changed],
        meansNow: [],
      };
    }

    case "repay": {
      const ending: ClauseInput = rs.closedLoan
        ? cont(<>, clearing it in full and closing the loan — the remaining collateral left the AMM with it.</>)
        : rs.debtStanding
          ? cont(
              <>
                , leaving {debtAfterFig()} outstanding
                {rs.hasColAfter ? <> against {colAfterFig()} of collateral</> : null}.
              </>,
            )
          : cont(<>.</>);
      return {
        happened: [clause(<>Repaid {debtDeltaFig()} of the position&rsquo;s debt</>), ending],
        meansNow: [],
      };
    }

    case "remove_collateral": {
      const changed: ClauseInput =
        rs.hasColAfter && rs.hasDebtAfter
          ? clause(
              <>
                The position now holds {colAfterFig()} of collateral against {debtAfterFig()} of debt.
              </>,
            )
          : null;
      return {
        happened: [clause(<>Withdrew {collDeltaFig()} of collateral from the position&rsquo;s bands.</>)],
        changed: [changed],
        meansNow: [],
      };
    }

    case "liquidation":
      return liquidationSlots(ctx, coords, collSym, debtSym, rs);

    default:
      return { happened: [] };
  }
}

function liquidationSlots(
  ctx: LlamalendContext,
  coords: LlamalendCoords,
  collSym: string,
  debtSym: string,
  rs: LlamalendResultingState,
): EventProseSlots {
  // Match the header's echo role exactly (`ctx.role ?? "borrower"`), so the
  // liquidation figures twin the header's liquidationProv primary.
  const role = ctx.role ?? "borrower";
  const isSelf = ctx.role === "self" || !!ctx.selfLiquidation;
  const collMoved = present(ctx.collateralDelta);
  const debtMoved = present(ctx.debtDelta);
  const conv = present(ctx.convertedTaken) ? fmtAbs(ctx.convertedTaken) : null;

  // The liquidation figures re-key onto liquidationProv (the header's primary
  // for a Liquidate row), not the operate delta provs.
  const liqDebtFig = () => (
    <Fig
      echo
      info={liquidationProv("debt", debtSym, role, coords, ctx.raw?.debtDelta)}
      value={chainTruthDeltaValue(Number(ctx.debtDelta ?? 0), false)}
      symbol={debtSym}
    >
      {fmtAbs(ctx.debtDelta)} {debtSym}
    </Fig>
  );
  const liqCollFig = () => (
    <Fig
      echo
      info={liquidationProv("collateral", collSym, role, coords, ctx.raw?.collateralDelta)}
      value={chainTruthDeltaValue(Number(ctx.collateralDelta ?? 0), false)}
      symbol={collSym}
    >
      {fmtAbs(ctx.collateralDelta)} {collSym}
    </Fig>
  );

  if (role === "liquidator") {
    const happened = (
      <>
        Acted as the liquidator of another position
        {ctx.positionUser ? (
          <>
            {" "}
            (borrower <Addr address={ctx.positionUser} />)
          </>
        ) : null}
        : put {liqDebtFig()} toward its debt and received {liqCollFig()} at the market&rsquo;s liquidation discount.
      </>
    );
    return {
      happened: [clause(happened)],
      meansNow: [clause(<>This row narrates the act, not this address&rsquo;s own position in the market.</>)],
    };
  }

  if (isSelf) {
    const happened = <>The borrower closed the position from soft-liquidation, settling the debt themselves.</>;
    // convertedTaken is muted — no on-card twin, so no Fig, no bold.
    const changed: ClauseInput = conv
      ? clause(
          <>
            The settlement drew on the {conv} {debtSym} the AMM had already converted, topped up to clear the rest.
          </>,
        )
      : clause(<>The debt settled partly from the {debtSym} the AMM had already converted.</>);
    return {
      happened: [clause(happened)],
      changed: [changed],
      meansNow: [
        clause(
          <>
            Whatever collateral remained came back — a normal close from soft-liquidation, not a loss to a third party.
          </>,
        ),
      ],
    };
  }

  // Third-party hard liquidation, the borrower's row.
  const opener = (
    <>
      A liquidator
      {ctx.liquidator ? (
        <>
          {" "}
          (<Addr address={ctx.liquidator} />)
        </>
      ) : null}{" "}
      settled this position: {debtMoved ? <>{liqDebtFig()} of debt cleared</> : <>the debt cleared</>}
    </>
  );
  const seizeTail: ClauseInput = collMoved
    ? conv
      ? cont(
          <>
            {" "}
            and {liqCollFig()} taken at the market&rsquo;s liquidation discount, along with {conv} {debtSym} the AMM had
            already converted — a hard liquidation seizes both legs of the position&rsquo;s holding.
          </>,
        )
      : cont(<> and {liqCollFig()} taken at the market&rsquo;s liquidation discount.</>)
    : conv
      ? cont(
          <>
            , along with {conv} {debtSym} the AMM had already converted — a hard liquidation seizes both legs of the
            position&rsquo;s holding.
          </>,
        )
      : cont(<>.</>);

  const softLiqHistory = clause(
    <>
      A hard liquidation only arms after soft-liquidation. While the price sat inside the band, the AMM had already been
      converting the collateral gradually, and the position&rsquo;s health eroded to zero.
    </>,
  );
  const takingFraming = clause(
    <>The balances were taken under the protocol&rsquo;s rules, not moved by the borrower.</>,
  );
  const partialPath: ClauseInput = rs.unstated
    ? clause(
        <>
          A partial liquidation doesn&rsquo;t record the position&rsquo;s end balances, so its remaining collateral and
          debt aren&rsquo;t shown here; they settle on its next event, and the loan may still be open.
        </>,
      )
    : null;

  return {
    happened: [clause(opener), seizeTail],
    changed: [softLiqHistory],
    meansNow: [takingFraming, partialPath],
  };
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function llamalendExplainerTeaser(ctx: LlamalendContext, coords: LlamalendCoords): ReactNode | null {
  return splitLead(eventClauses(llamalendEventSlots(ctx, coords))).lead;
}
