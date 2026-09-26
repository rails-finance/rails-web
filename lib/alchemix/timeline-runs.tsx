"use client";

// Timeline run specs for the Alchemist position page's ChainTruthTimeline —
// two kinds, and they are not the same kind of thing.
//
// THE TRANSACTION ROW IS THE UNIT, NOT A COLLAPSE. Several of a position's logs
// in one transaction draw one card, the way Liquity V2's `Open` is one card for
// a deposit and a borrow. It rides the run machinery because that machinery is
// what turns consecutive rows into one row, but it is `asOneEvent`: the
// reader's "Collapse like events" choice does not reach it, because nothing is
// being collapsed: the card IS the transaction.
//
// THE UNIT IS THE TRANSACTION AND THE READING BELONGS TO THE BLOCK, and those
// are two different things. Measured against production on 2026-09-26: 3,248 of
// the 8,680 blocks holding one of a position's events hold more than one, and
// NONE of them holds more than one transaction for that position: every
// multi-event block is a single transaction. So the reading covers exactly the
// card's legs today, and the card still does not assume it: `legCount` reaches
// `AlchemixStateAtBlock`, and where the block holds more of this position's
// events than the card draws, the heading counts the block's instead of naming
// the transaction.
//
// AND THE REDEMPTION STREAK, which is a collapse and stays one.
//
// WHY THIS PAGE NEEDED ONE. A redemption belongs to the whole line, so every
// open position on the line carries every one of them: across the 23 Ethereum
// positions sampled on 2026-09-26, 1,148 of 1,767 timeline rows were
// redemptions. They arrive in bursts (eth-alusd/1221 has 25 back to back in
// three weeks, six of them on 12 September), and back to back they draw as
// near-identical cards, the later ones showing a bare time under a date that
// has scrolled away.
//
// WHY IT COULD NOT BE PORTED BEFORE. A run header states a total, and until the
// wire carried `debtClearedFromReadings` an Alchemix run had no per-position
// total to state — the log names no position. Now each member carries what it
// cleared here, measured as the difference of two debt readings, so the run's
// total is the sum of those differences.
//
// WHAT MAY BE SUMMED. Debt cleared is a flow between two blocks, so adding the
// members is the same kind of statement each member makes. Nothing else here
// is: the line-wide redeemed amount belongs to the line rather than to this
// position, and an earmarked figure is stateable at the block it was read at
// and at no other, so neither is summed, here or anywhere.

import { useMemo } from "react";

import { isAlchemistEvent } from "@/lib/shared/types/event-shape";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { renderRunFolders } from "@/lib/shared/run-folders";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { formatUnitsExact } from "@/lib/utils/format";
import { AlchemixRedemptionRunCard } from "@/components/protocol/alchemix/alchemix-redemption-run-card";
import { AlchemixEventCard } from "@/components/protocol/alchemix/alchemix-event-card";
import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { clearedRunProv, type AlchemixCoords } from "@/lib/alchemix/event-provenance";

/** Runs shorter than this stay as individual cards.
 *
 *  THREE, WHERE LIQUITY V2 TAKES FOUR, and the difference is what the two
 *  rows carry. A Liquity redemption card states that Trove's own collateral
 *  and debt movement, so three of them are three distinct readings and hiding
 *  them behind a click costs something. An Alchemix redemption card names no
 *  actor, draws no token flow, and says the same two sentences every time; the
 *  one figure that differs is the cleared amount, which the run header sums and
 *  the expanded members still state one by one.
 *
 *  The sample above bears the floor out: eleven streaks were three long, five
 *  of them inside a single day, which is where the later cards show a bare time
 *  under a date they have lost. Moving the floor from four to three takes the
 *  redemption rows left standing as their own cards from 51 to 18. Two stays as
 *  cards: a pair is no wall, and the second card is still beside its dated
 *  sibling. */
const MIN_REDEMPTION_RUN = 3;

const WAD = 1e18;

/** The run's own date range, in the form TimelineRunCard prints above it, so
 *  the receipt names the run the reader is looking at. */
function rangeOf(events: BaseActivityEvent[]): string {
  const stamps = events.map((e) => e.timestamp);
  const from = Math.min(...stamps);
  const to = Math.max(...stamps);
  const sameDay = shortDate(from) === shortDate(to) && shortDateYear(from) === shortDateYear(to);
  return sameDay
    ? `${shortDate(from)} ${shortDateYear(from)}`
    : `${shortDate(from)} ${shortDateYear(from)} – ${shortDate(to)} ${shortDateYear(to)}`;
}

/** The legs of one transaction in LOG ORDER. The displayed list is newest
 *  first, so a transaction's legs arrive reversed; the id is `txHash:logIndex`,
 *  which is where the order comes from. */
function inLogOrder(run: BaseActivityEvent[]): AlchemistEvent[] {
  const legs = run.filter(isAlchemistEvent);
  return [...legs].sort((a, b) => logIndexOf(a) - logIndexOf(b));
}

const logIndexOf = (e: BaseActivityEvent): number => {
  const n = Number(e.id.split(":").pop());
  return Number.isFinite(n) ? n : 0;
};

/** The run specs for one position. Memoised by the caller: a fresh array
 *  identity per render recomputes the timeline's rows. */
export function useAlchemixTimelineRuns(
  coords: AlchemixCoords,
  mytSymbol: string,
  siblingsByTx: Map<string, AlchemistEvent[]>,
): TimelineRunSpec[] {
  return useMemo(
    () => [
      {
        // One transaction, one card. A line-scope row names no position and is
        // nobody's leg, so it is not a candidate.
        asOneEvent: true,
        match: (e: BaseActivityEvent) => isAlchemistEvent(e) && e.context.data.scope === "position",
        min: 2,
        sameRun: (prev: BaseActivityEvent, next: BaseActivityEvent) => prev.txHash === next.txHash,
        render: (run, meta) => {
          const legs = inLogOrder(run);
          return (
            <AlchemixEventCard
              key={legs[0].id}
              legs={legs}
              mytSymbol={mytSymbol}
              siblings={siblingsByTx.get(legs[0].txHash) ?? legs}
              isFirst={meta.isFirst}
              isLast={meta.isLast}
            />
          );
        },
      },
      {
        match: (e: BaseActivityEvent) => isAlchemistEvent(e) && e.context.data.eventType === "redemption",
        min: MIN_REDEMPTION_RUN,
        render: (run, meta) =>
          renderRunFolders(run, meta, MIN_REDEMPTION_RUN, (events, folder) => {
            // The total is summed in wei and scaled once, so it carries every
            // digit its members do. A member with no figure is counted apart
            // and never as a zero: the header states how much of the run the
            // total covers.
            let totalRaw = BigInt(0);
            let stated = 0;
            let symbol = "";
            for (const e of events) {
              if (!isAlchemistEvent(e)) continue;
              symbol ||= e.context.data.syntheticSymbol;
              const cleared = e.context.data.debtClearedFromReadings;
              if (cleared?.status !== "stated" || cleared.amountRaw == null) continue;
              stated++;
              totalRaw += BigInt(cleared.amountRaw);
            }
            const raw = totalRaw.toString();
            const range = rangeOf(events);
            return (
              <AlchemixRedemptionRunCard
                key={folder.key}
                count={events.length}
                totalCleared={Number(totalRaw) / WAD}
                totalClearedExact={formatUnitsExact(raw, 18)}
                statedCount={stated}
                syntheticSymbol={symbol}
                prov={clearedRunProv(symbol, raw, events.length, stated, range, coords)}
                firstTimestamp={events[0].timestamp}
                lastTimestamp={events[events.length - 1].timestamp}
                isFirst={folder.isFirst}
                isLast={folder.isLast}
              >
                {folder.children}
              </AlchemixRedemptionRunCard>
            );
          }),
      },
    ],
    [coords, mytSymbol, siblingsByTx],
  );
}
