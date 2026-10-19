"use client";

// Shared Liquity-V2-fork event head — the card's `head` slot (ui-jobs 309),
// drawn by the shared ChainTruthRow, for the three forks (Ebisu, Asymmetry,
// Basedollar).
//
// The timeline's head is words (rails-ops decision 0045, TO-DO-ui-jobs 367):
// the past-participle kind, in its status pill where it has one, then the
// clauses for what the spine cannot show (`liquityForkT1Words`). The spine
// carries the figures: the legs, the escrow, the rate and a pending debt's
// figure. The head keeps a liquidation's claimable surplus, and a
// redistribution's arrival as words.

import type { EbisuContext, AsymmetryContext, BasedollarContext, OriginEnvelope } from "@/lib/shared/types/event-shape";
import type { ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { LiquityForkCoords, DeltaOps, LiquityForkLiquidationLeg } from "@/lib/shared/liquity-fork-provenance";
import { FORK_DEBT_DUST_FLOAT, forkRedistArrival } from "@/lib/shared/liquity-fork-ops";
import { L1_WORDS } from "@/lib/liquity/event-templates";
import { liquityForkT1Words, type LiquityForkT1Clause } from "@/lib/shared/liquity-fork-head-words";
import { zombieTitle } from "@/lib/liquity/trove-page-words";
import { formatDate } from "@/lib/date";
import { formatExact } from "@/lib/utils/format";

/** The fork contexts are structural twins; any of them drives the head. */
export type LiquityForkEventContext = EbisuContext | AsymmetryContext | BasedollarContext;

/** The per-deployment blanks: the debt symbol and the provenance builders (the
 *  fork vocabulary's own collDeltaProv / debtDeltaProv / rateAtEventProv). */
export interface LiquityForkHeaderBuilders {
  debtSymbol: string;
  collDeltaProv: (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null) => Provenance;
  debtDeltaProv: (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null) => Provenance;
  rateAtEventProv: (coords?: LiquityForkCoords) => Provenance;
  batchManagerProv: (coords: LiquityForkCoords | undefined, address: string) => Provenance;
  /** The branch minimum debt (MIN_DEBT); a redemption that takes the debt
   *  under it marks the row as the one that made the Trove a zombie. */
  minDebt?: number;
  /** A liquidated neighbour's redistribution applied on this touch — the
   *  TroveOperation `_debtIncreaseFromRedist` / `_collIncreaseFromRedist` leg. */
  redistProv?: (coords: LiquityForkCoords, vals: { leg: "debt" | "coll"; amount: string }) => Provenance;
  /** The Trove's share of a batch's premature-adjustment fee (server mig 342). */
  batchFeeShareProv?: (
    coords: LiquityForkCoords,
    vals: { fee?: string; batchFee: string; shares?: string; totalShares: string },
  ) => Provenance;
  /** A Liquidation log's leg; the head reads the surplus. */
  liquidationLegProv?: (
    coords: LiquityForkCoords,
    vals: { leg: LiquityForkLiquidationLeg; amount: string },
  ) => Provenance;
}

export interface LiquityForkHeadArgs {
  /** Zero-delta adjust: the head reads "No change". */
  noChange?: boolean;
  ctx: LiquityForkEventContext;
  txHash?: string;
  blockNumber?: number;
  builders: LiquityForkHeaderBuilders;
  /** The liquidation's surplus has since been claimed (the page's head read). */
  surplusClaimed?: { timestamp?: number | null } | null;
}

/** One clause of the head, drawn. */
function clauseNode(
  c: LiquityForkT1Clause,
  ctx: LiquityForkEventContext,
  coords: LiquityForkCoords,
  builders: LiquityForkHeaderBuilders,
) {
  if ("text" in c) return c.zombie ? <span title={zombieTitle(!!c.cleared)}>{c.text}</span> : <span>{c.text}</span>;
  if ("delegate" in c)
    return (
      <span>
        {c.lead}{" "}
        <Prov info={builders.batchManagerProv(coords, c.address)} value={c.address}>
          <span className="font-bold text-pink-500">{c.delegate}</span>
        </Prov>
      </span>
    );
  // The one figure the head states: the collateral the holder can claim.
  const amount = ctx.liquidation?.collSurplus ?? String(c.surplus);
  const figure = <span className="font-bold text-foreground">{c.surplus.toFixed(4)}</span>;
  return (
    <>
      {builders.liquidationLegProv ? (
        <Prov
          info={builders.liquidationLegProv(coords, { leg: "surplus", amount })}
          value={formatExact(c.surplus)}
          symbol={c.symbol}
        >
          {figure}
        </Prov>
      ) : (
        figure
      )}
      <TokenChipIcon symbol={c.symbol} size={16} />
      <span className={c.claimedAt === undefined ? "text-green-700 dark:text-green-400" : undefined}>
        {c.word}
        {c.claimedAt != null && <> {formatDate(c.claimedAt)}</>}
      </span>
    </>
  );
}

/** The timeline head's spec. */
export function liquityForkHeadSpec({
  noChange,
  ctx,
  txHash,
  blockNumber,
  builders,
  surplusClaimed,
}: LiquityForkHeadArgs): ChainTruthRowSpec {
  const coords: LiquityForkCoords = {
    txHash,
    blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };
  const words = liquityForkT1Words(ctx, { noChange, minDebt: builders.minDebt, surplusClaimed });
  const et = ctx.eventType;

  // A redistribution from a liquidated Trove on this branch, applied on this
  // touch: the chip names it in the caution tone. Its figures stand on the
  // spine's flank where the node is a warning one (Interest applied), and in
  // the Figures sheet and the Explanation on every row.
  const redist = forkRedistArrival(ctx);
  const redistribution =
    redist && (redist.debt >= FORK_DEBT_DUST_FLOAT || redist.coll > 0)
      ? { label: L1_WORDS.from_liquidation, and: L1_WORDS.and, deltas: [], wordsOnly: true }
      : undefined;

  const isOpen = et === "openTrove" || et === "openTroveAndJoinBatch";
  return {
    label: words.kind,
    status: isOpen ? "open" : et === "closeTrove" ? "close" : et === "applyPendingDebt" ? "party" : undefined,
    critical: et === "liquidate",
    labelOnSpine: et === "redeemCollateral",
    // A batch manager's change, or a batched Trove's rate moved by its
    // delegate: the word in the delegate's pink, no name.
    labelTone:
      et === "setBatchManagerAnnualInterestRate" ||
      et === "lowerBatchManagerAnnualFee" ||
      (et === "adjustTroveInterestRate" && ctx.isBatched)
        ? "delegate"
        : undefined,
    clauses: words.clauses.map((c) => clauseNode(c, ctx, coords, builders)),
    deltas: [],
    redistribution,
  };
}
