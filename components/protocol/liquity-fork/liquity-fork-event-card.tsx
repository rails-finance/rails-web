"use client";

// The Liquity V2 forks' event card (Ebisu, Asymmetry, Basedollar) on the shared
// shell's slots (rails-ops reference/shared-event-card-spec.md §3; ui-jobs 309
// step 5). A Trove event moves two axes, so the spine can show two token flows
// (branch collateral + the fork's stable); a liquidation shows the critical
// warning spine, a redemption the caution one. Each fork supplies its
// deployment: the family key, its words, its stable and its provenance
// vocabulary (lib/<fork>/event-provenance.ts).
//
// T2: the balance sheet (liquity-fork-sheet.tsx) where the event states a
// Trove's balances; a batch manager's rows keep the cells: Collateral and Debt
// (ledger cells), Collateral ratio and Interest rate
// (liquity-fork-state-stats.tsx). The price row states the owner's gas where
// the chain gives a whole figure and the branch price the cells are valued at;
// a redemption's fee and whole-redemption figures and a liquidation's legs and
// forensics stand under the grid as notes.

import type { ReactNode } from "react";
import { forkDebtMove, FORK_DEBT_DUST_FLOAT, forkCollMove, forkRedistArrival } from "@/lib/shared/liquity-fork-ops";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { eventGas, type EventCardPrice } from "@/components/shared/event-price-row";
import { chainTruthCells, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { InLedgerFigures } from "@/components/shared/event-ledger-context";
import { CutTeaser, splitFirstSentence } from "@/lib/shared/explainer-prose";
import { LiquityLedgerProvider } from "@/components/protocol/liquity-family/liquity-ledger";
import type { SpineColumnProps, SpineTokenRow, SpineWarningLeg } from "@/components/shared/spine-column";
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
import { liquityForkSheet, type LiquityForkSheetBranch } from "./liquity-fork-sheet";
import { FORK_ESCROW_WORDS, type LiquityForkEscrow } from "./liquity-fork-escrow";
import { liquityForkT1Words } from "@/lib/shared/liquity-fork-head-words";
import { liquityT1Caption } from "@/lib/liquity/event-prose";
import { L1_WORDS } from "@/lib/liquity/event-templates";
import { useSurplusClaimFor } from "@/components/protocol/liquity-family/coll-surplus-context";

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
  /** The branch of a collateral symbol: its token and governance ratios, which
   *  the balance sheet's Risk and Limits panels read. */
  branch?: (collateralSymbol: string) => LiquityForkSheetBranch | undefined;
  /** The gas compensation escrow, where the fork's constant is established
   *  (lib/<fork>/event-provenance.ts): a spine row on the open and the
   *  close, a sheet panel on every event. */
  escrow?: LiquityForkEscrow;
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
  // moves no token, so the act's rows leave it out (the sheet states it).
  const collDelta = forkCollMove(ctx);
  // The debt the act moved (TroveOperation).
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
  // The gas compensation escrow, handed first in the family's order escrow,
  // collateral, debt, so the spine's sort draws it beneath the collateral
  // (rails-ops reference/shared-event-card-spec.md, "Spine order").
  const isOpenEvent = ctx.eventType === "openTrove" || ctx.eventType === "openTroveAndJoinBatch";
  if (fork.escrow && (isOpenEvent || ctx.eventType === "closeTrove"))
    tokens.push({
      symbol: fork.escrow.constant.symbol,
      address: fork.escrow.constant.address,
      direction: isOpenEvent ? "right" : "left",
      verb: isOpenEvent ? FORK_ESCROW_WORDS.spineSent : FORK_ESCROW_WORDS.spineReturned,
      value: fork.escrow.constant.amount,
      display: String(fork.escrow.constant.amount),
    });
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
  // A redemption's or a liquidation's legs, drawn as nodes on the spine: the
  // collateral that left the Trove below the debt it cleared, on the same
  // receipts the sheet traces.
  const warningLegs: SpineWarningLeg[] | undefined = isWarning
    ? [
        ...(collDelta !== 0
          ? [
              {
                label: isRedemption ? L1_WORDS.reduced : L1_WORDS.liquidated,
                value: Math.abs(collDelta),
                symbol: ctx.collateralSymbol,
                address: soleFlowAddress(event.flows, ctx.collateralSymbol),
              },
            ]
          : []),
        ...(debtMoved
          ? [
              {
                label: L1_WORDS.cleared,
                value: Math.abs(debtDelta),
                symbol: debtSymbol,
                address: soleFlowAddress(event.flows, debtSymbol),
              },
            ]
          : []),
      ]
    : undefined;

  // The rate on the spine's flank where the rate is the event's point: an
  // opening's below its legs, a rate change's and a delegate's join or leave
  // beside the glyph, in the delegate's pink where a batch manager sets it.
  // It echoes the Interest rate cell's receipt.
  const et = ctx.eventType;
  const rate = ctx.interestRate != null ? Number(ctx.interestRate) : NaN;
  const rateBefore = ctx.rateBefore != null ? Number(ctx.rateBefore) : NaN;
  const isRateChange =
    et === "adjustTroveInterestRate" ||
    et === "setBatchManagerAnnualInterestRate" ||
    et === "lowerBatchManagerAnnualFee";
  const isDelegate = et === "setInterestBatchManager" || et === "removeFromBatch";
  const rateSpan: [number, number] | undefined = !Number.isFinite(rate)
    ? undefined
    : isOpenEvent
      ? [0, rate]
      : isRateChange || isDelegate
        ? [Number.isFinite(rateBefore) ? rateBefore : rate, rate]
        : undefined;
  const rateFlank = rateSpan
    ? {
        rateSpan,
        rateTone: ctx.isBatched ? ("delegate" as const) : undefined,
        rateProv: {
          info: provs.rateAtEventProv(coords, ctx.origin?.annualInterestRate),
          value: `${rate}%`,
          echo: true,
        },
      }
    : {};
  // Interest applied: the debt the event added, on the debt node in the
  // caution tone, as Liquity V2 draws it, and below it any collateral a
  // liquidated neighbour's redistribution brought on the same touch. The
  // sheet's Debt and Redistribution rows carry the receipts.
  const isPendingDebt = et === "applyPendingDebt";
  const pendingLegs = ((): SpineWarningLeg[] | undefined => {
    if (!isPendingDebt) return undefined;
    const legs: SpineWarningLeg[] = [];
    const redist = forkRedistArrival(ctx);
    if (redist && redist.coll > 0)
      legs.push({
        label: L1_WORDS.from_liquidation,
        value: redist.coll,
        symbol: ctx.collateralSymbol,
        address: soleFlowAddress(event.flows, ctx.collateralSymbol),
      });
    const added = Number(ctx.debtDelta) || 0;
    if (added >= FORK_DEBT_DUST_FLOAT)
      legs.push({
        label: L1_WORDS.spine_debt_added,
        value: added,
        symbol: debtSymbol,
        address: soleFlowAddress(event.flows, debtSymbol),
      });
    return legs;
  })();
  const spine: SpineColumnProps = isWarning
    ? { icon: "warning", warningTone: isLiq ? "critical" : "caution", warningLegs, isLast: !!isLast }
    : isPendingDebt
      ? { icon: "warning", warningTone: "caution", warningLegs: pendingLegs, isLast: !!isLast }
      : isNoChange
        ? { icon: "no-change", isLast: !!isLast }
        : isDelegate
          ? {
              icon: "delegate",
              iconDirection: et === "setInterestBatchManager" ? "up" : "down",
              ...rateFlank,
              isLast: !!isLast,
            }
          : isRateChange
            ? {
                icon: "rate-change",
                iconDirection:
                  rateSpan && rateSpan[1] !== rateSpan[0] ? (rateSpan[1] > rateSpan[0] ? "up" : "down") : undefined,
                ...rateFlank,
                isLast: !!isLast,
              }
            : { tokens: tokens.length > 0 ? tokens : undefined, ...(isOpenEvent ? rateFlank : {}), isLast: !!isLast };

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

  const surplusClaimed = useSurplusClaimFor(isLiq ? event.txHash : undefined);
  const head = liquityForkHeadSpec({
    noChange: isNoChange,
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    builders: { ...provs, debtSymbol, minDebt: fork.minDebt },
    surplusClaimed,
  });
  // The phone caption and the row's accessible name follow the head's words.
  const caption = liquityT1Caption(
    liquityForkT1Words(ctx, { noChange: isNoChange, minDebt: fork.minDebt, surplusClaimed }),
  );

  const sheet = liquityForkSheet({
    ctx,
    coords,
    debtSymbol,
    provs,
    branch: fork.branch?.(ctx.collateralSymbol),
    actionLabel: event.actionLabel,
    flows: event.flows,
    escrow: fork.escrow,
  });

  const buildTeaser = () => liquityForkExplainerTeaser(ctx, coords, fork.words, provs);
  const teaser = buildTeaser();
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
    caption,
    // A batch manager moved the rate, or the protocol applied pending debt:
    // not the owner's act.
    actor:
      ctx.eventType === "setBatchManagerAnnualInterestRate" || ctx.eventType === "applyPendingDebt"
        ? { byOwner: false }
        : undefined,
    sheet,
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
        // The event page's title is the teaser's first sentence and the pane
        // opens on the rest (decision 0045, "Ruled since"); the cut is stated
        // here, where the text is known, for the component that draws it.
        <CutTeaser
          whole={<InLedgerFigures build={buildTeaser} />}
          head={<InLedgerFigures build={() => splitFirstSentence(buildTeaser()).head} />}
          tail={
            splitFirstSentence(teaser).tail != null ? (
              <InLedgerFigures build={() => splitFirstSentence(buildTeaser()).tail} />
            ) : null
          }
        />
      ) : undefined,
    },
    learnMore: <LearnMore inline content={liquityForkLearnMoreContent(ctx, fork.words)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
