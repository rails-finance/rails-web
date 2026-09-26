"use client";

// Timeline run specs for the Alchemist position page's ChainTruthTimeline —
// one kind, the redemption streak.
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

/** The run specs for one position. Memoised by the caller: a fresh array
 *  identity per render recomputes the timeline's rows. */
export function useAlchemixTimelineRuns(coords: AlchemixCoords): TimelineRunSpec[] {
  return useMemo(
    () => [
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
    [coords],
  );
}
