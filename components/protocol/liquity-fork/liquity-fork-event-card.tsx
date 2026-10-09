"use client";

// The Liquity V2 forks' event card (Ebisu, Asymmetry, Basedollar) on the shared
// shell's slots (rails-ops reference/shared-event-card-spec.md §3; ui-jobs 309
// step 5). A Trove event moves two axes, so the spine can show two token flows
// (branch collateral + the fork's stable); a liquidation shows the critical
// warning spine, a redemption the caution one. Each fork supplies its
// deployment: the family key, its words, its stable and its provenance
// vocabulary (lib/<fork>/event-provenance.ts).
//
// T2: Collateral and Debt (ledger cells), Collateral ratio and Interest rate
// (liquity-fork-state-stats.tsx). The price row states the owner's gas where
// the chain gives a whole figure and the branch price the cells are valued at;
// a redemption's fee and whole-redemption figures and a liquidation's legs and
// forensics stand under the grid as notes.

import type { ReactNode } from "react";
import { forkDebtMove, FORK_DEBT_DUST_FLOAT, forkCollMove } from "@/lib/shared/liquity-fork-ops";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { eventGas, type EventCardPrice } from "@/components/shared/event-price-row";
import { chainTruthCells, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { InLedgerFigures } from "@/components/shared/event-ledger-context";
import { LiquityLedgerProvider } from "@/components/protocol/liquity-family/liquity-ledger";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";
import { LiquidationForensics } from "@/components/shared/liquidation-forensics";
import { Prov } from "@/components/shared/provenance";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { formatUsdValue } from "@/lib/utils/format";
import {
  liquityForkExplainerTeaser,
  type LiquityForkExplainerProvs,
} from "@/lib/shared/liquity-fork-explainer-clauses";
import type { LiquityForkCoords } from "@/lib/shared/liquity-fork-provenance";
import type { LiquityForkLearnMoreParams } from "@/lib/shared/learn-more-content";
import {
  liquityForkHeadSpec,
  type LiquityForkEventContext,
  type LiquityForkHeaderBuilders,
} from "./liquity-fork-event-header";
import { LiquityForkEventExplainer, liquityForkLearnMoreContent } from "./liquity-fork-event-explainer";
import { liquityForkStateFigures, liquityForkStateStats, type LiquityForkStateProvs } from "./liquity-fork-state-stats";
import { buildForkLiquidationForensics, forkLiquidationStats, forkRedemptionStats } from "./liquity-fork-forensics";

/** A fork's provenance vocabulary: every builder the card's parts read. */
export type LiquityForkCardProvs = LiquityForkExplainerProvs &
  LiquityForkStateProvs &
  Omit<LiquityForkHeaderBuilders, "debtSymbol" | "minDebt"> &
  Parameters<typeof forkRedemptionStats>[2];

/** What names one fork deployment. */
export interface LiquityForkDeployment {
  /** The key the card's open state is stored under ("ebisu"). */
  family: string;
  words: LiquityForkLearnMoreParams;
  debtSymbol: string;
  minDebt: number;
  provs: LiquityForkCardProvs;
  /** The chain gives the owner's gas as one whole figure. False on an L2 whose
   *  execution fee leaves out the L1 data fee (Basedollar on Base). */
  gas: boolean;
}

export interface LiquityForkEventCardProps {
  event: BaseActivityEvent & { context: { data: LiquityForkEventContext } };
  isLast?: boolean;
  eventNumber?: number;
  fork: LiquityForkDeployment;
}

/** A redemption's or a liquidation's figures, one line each, under the grid. */
function ForkNotes({ stats, children }: { stats: ChainTruthStat[]; children?: ReactNode }) {
  if (stats.length === 0 && children == null) return null;
  return (
    <>
      {stats.length > 0 && (
        <div className="mx-5 my-2 space-y-1 rounded-xl bg-background px-4 py-3" data-event-notes="">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
              data-note-row={s.label}
            >
              <span className="text-rb-500">{s.label}</span>
              <span className="tabular-nums text-foreground">
                <Prov info={s.prov} value={s.value}>
                  {s.display ?? s.value}
                </Prov>
                {s.symbol ? ` ${s.symbol}` : ""}
                {s.sub != null && <span className="text-rb-500"> · {s.sub}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {children}
    </>
  );
}

export function LiquityForkEventCard({ event, isLast, eventNumber, fork }: LiquityForkEventCardProps) {
  const ctx = event.context.data;
  const { provs, debtSymbol } = fork;
  const isLiq = ctx.eventType === "liquidate";
  const isRedemption = ctx.eventType === "redeemCollateral";
  // Both liquidation and redemption are adverse events the owner didn't initiate.
  // Liquidation is terminal (critical/red); a redemption changes the Trove
  // without the owner acting (caution/orange, color-grammar.md §5).
  const isWarning = isLiq || isRedemption;
  // Zero-delta adjust — classified by the timeline transform (the single
  // source of truth for the predicate); spine shows the neutral glyph and the
  // head suppresses its sub-epsilon dust chip.
  const isNoChange = event.actionType === "adjustTrove_noChange";

  // The collateral the act moved; a redistribution landing on the same touch
  // is a figure of the head and moves no token, so the spine leaves it out.
  const collDelta = forkCollMove(ctx);
  // The debt the act moved (TroveOperation), the figure the head states.
  const debtDelta = forkDebtMove(ctx).value;
  const debtMoved = Math.abs(debtDelta) >= FORK_DEBT_DUST_FLOAT;

  const coords: LiquityForkCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };

  // direction "right" = token moves toward the protocol (collateral deposit /
  // debt repay), "left" = toward the wallet (collateral withdraw / debt draw).
  // Each row names its token's contract from the event's flows: the icon CDNs
  // are asked by address, and a branch the house table does not know yet
  // would otherwise draw as a letter. Two flows sharing one symbol resolve to
  // nothing, which keeps the letter.
  const tokens: SpineTokenRow[] = [];
  if (!isWarning && collDelta !== 0)
    tokens.push({
      symbol: ctx.collateralSymbol,
      address: soleFlowAddress(event.flows, ctx.collateralSymbol),
      direction: collDelta > 0 ? "right" : "left",
      value: Math.abs(collDelta),
    });
  if (!isWarning && debtMoved)
    tokens.push({
      symbol: debtSymbol,
      address: soleFlowAddress(event.flows, debtSymbol),
      direction: debtDelta > 0 ? "left" : "right",
      value: Math.abs(debtDelta),
    });
  const spine: SpineColumnProps = isWarning
    ? { icon: "warning", warningTone: isLiq ? "critical" : "caution", isLast: !!isLast }
    : isNoChange
      ? { icon: "no-change", isLast: !!isLast }
      : { tokens: tokens.length > 0 ? tokens : undefined, isLast: !!isLast };

  // ── T2 ──
  const stats = liquityForkStateStats(ctx, coords, debtSymbol, provs);
  const cells = chainTruthCells(stats, { inputs: { "Collateral ratio": ["collateral", "debt"] } });
  // A redemption's fee and the whole redemption this Trove was a slice of; a
  // liquidation's legs (where its debt went, the surplus left for the owner)
  // and the whole-trove valued block, at the branch's MCR for the block. The
  // branch price a redemption emitted stands in the price row.
  const noteStats = [
    ...forkRedemptionStats(ctx, coords, provs, debtSymbol).filter((s) => s.label !== "Branch price"),
    ...forkLiquidationStats(ctx, coords, provs.liquidationLegProv, debtSymbol),
  ];
  const forensics = isLiq ? buildForkLiquidationForensics(ctx, coords, provs, { stablecoin: debtSymbol }) : undefined;

  // The price row: the gas of the owner's transactions only (a redeemer, a
  // liquidator or a batch manager paid for theirs), and the branch price the
  // cells are valued at. A redemption's price is the one its log emitted; a
  // liquidation's stands in its forensics block.
  const f = liquityForkStateFigures(ctx);
  const emitted = ctx.priceAtBlock?.source === "redemption-event-price";
  const price: EventCardPrice = {
    gas: fork.gas && !isWarning && !ctx.batchRate ? eventGas(event.gas) : undefined,
    prices:
      f.price != null && !isLiq
        ? [
            {
              symbol: ctx.collateralSymbol,
              usd: f.price,
              info: emitted
                ? provs.emittedRedemptionPriceProv(coords, f.price)
                : provs.atBlockPriceProv(coords, f.price),
              value: formatUsdValue(f.price),
              // Cents: a collateral near $1 (ysyBOLD) reads as "$1" in whole dollars.
              format: formatUsdValue,
              title: emitted
                ? `${ctx.collateralSymbol} price the redemption acted at, as its log emitted it`
                : `${ctx.collateralSymbol} price at this block, from the branch's price feed`,
            },
          ]
        : [],
  };

  const head = liquityForkHeadSpec({
    actionLabel: event.actionLabel,
    noChange: isNoChange,
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    builders: { ...provs, debtSymbol, minDebt: fork.minDebt },
    flows: event.flows,
  });

  const teaser = liquityForkExplainerTeaser(ctx, coords, fork.words, provs);
  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: fork.family,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: event.actionLabel,
    // A batch manager moved the rate: not the owner's act.
    actor: ctx.eventType === "setBatchManagerAnnualInterestRate" ? { byOwner: false } : undefined,
    cells: cells.length > 0 ? cells : { none: "the batch row carries no figure of the Trove" },
    ledgers: {
      provider: (children) => (
        <LiquityLedgerProvider eventId={event.id} eventTs={event.timestamp}>
          {children}
        </LiquityLedgerProvider>
      ),
    },
    price,
    notes:
      noteStats.length > 0 || forensics ? (
        <ForkNotes stats={noteStats}>{forensics && <LiquidationForensics {...forensics} />}</ForkNotes>
      ) : undefined,
    explainer: {
      body: (
        <LiquityForkEventExplainer
          ctx={ctx}
          fork={fork.words}
          builders={provs}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          skipLead
        />
      ),
      first: teaser ? (
        <InLedgerFigures build={() => liquityForkExplainerTeaser(ctx, coords, fork.words, provs)} />
      ) : undefined,
    },
    learnMore: <LearnMore inline content={liquityForkLearnMoreContent(ctx, fork.words)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
