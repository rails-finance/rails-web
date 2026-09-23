// Aave V3 timeline run-collapse — shared by every V3 explorer.
// ----------------------------------------------------------------------------
// Two stretches of consecutive events say more as one row than as many, and
// both are things done TO a position rather than by it:
//
//   • a keeper's liquidation sweep across a whale's reserves, which arrives as
//     several LiquidationCall rows back to back;
//   • a custody-scale wallet's aToken transfers (routers, wrappers), which
//     arrive in the thousands and are position moves rather than Pool activity.
//
// Lifted out of the Ethereum detail page when the Base explorer gained a
// timeline, so the two cannot drift into collapsing the same history
// differently. Module scope matters: ChainTruthTimeline memoises its rows on
// this array's identity, so a fresh one per render recomputes every row.
//
// GROUPING IS THE INDEX'S ON THE MAINNET ARM NOW, and this file keeps both
// halves. Decision 0019's evening amendment makes the timeline's cut count
// ROWS, which only pays if the folders exist before the response is written —
// so the Ethereum Aave V3 page can ask for `?group=1` and draw the folders it
// is handed (`AAVE_V3_FOLDER_REGISTER` below). The specs stay, and not only
// for the flat answer: the BASE explorers share this file and are served by a
// whole-life replay rather than by the index, so they group client-side and
// will keep doing so until the index carries their running state.

"use client";

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE, TRANSFER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";
import { AAVE_FAMILY_FOLDER_REGISTER } from "@/lib/shared/aave-family-folders";

/** How a folder the INDEX served draws on this family — label, tone, spine
 *  glyph, corner mark. Shared with SparkLend, an Aave V3 fork the index
 *  transcribes alongside this one for the same reason. Read only by the
 *  MAINNET explorer: the Base lanes are replay-served and group client-side
 *  through the specs below. */
export const AAVE_V3_FOLDER_REGISTER = AAVE_FAMILY_FOLDER_REGISTER;

/** Runs shorter than this stay as individual cards. */
const MIN_LIQUIDATION_RUN = 4;
const MIN_TRANSFER_RUN = 4;

// A keeper's liquidation sweep across a whale's reserves collects several
// LiquidationCall rows back to back — passive/third-party events, so they
// collapse into one expandable run row via ChainTruthTimeline's runs seam.
// A sweep can also carry the write-off of what no liquidator repaid, served as
// its own `bad_debt_written_off` row in the liquidation's transaction (§20);
// that row is a member of the run, not a cut through it (§21), and the index
// groups the mainnet arm the same way (aave-family-timeline-folders.ts).
// Module-scope so the timeline's row memo keeps a stable identity.
export const AAVE_V3_TIMELINE_RUNS: TimelineRunSpec[] = [
  {
    match: (e) =>
      isAaveV3Event(e) &&
      (e.context.data.eventType === "liquidation" || e.context.data.eventType === "bad_debt_written_off"),
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const members = events.filter(isAaveV3Event);
        const liqs = members.filter((e) => e.context.data.eventType === "liquidation");
        const offs = members.filter((e) => e.context.data.eventType === "bad_debt_written_off");
        const repaid = sumBySymbol(
          liqs.map((e) => ({ symbol: e.context.data.reserveSymbol, amount: e.context.data.debtToCover })),
        );
        const seized = sumBySymbol(
          liqs.map((e) => ({
            symbol: e.context.data.collateralSymbol,
            amount: e.context.data.liquidatedCollateralAmount,
          })),
        );
        // The write-off's amount is signed like a repay's (debt leaving the
        // position); sumBySymbol takes the magnitude, as the index's own
        // "Written off" leg states it.
        const writtenOff = sumBySymbol(
          offs.map((e) => ({ symbol: e.context.data.reserveSymbol, amount: e.context.data.amount })),
        );
        const aggregates: RunAggregate[] = [
          ...[...repaid].map(([symbol, value]) => ({ verb: "Repaid", value, symbol, provWhat: "Debt repaid" })),
          ...[...seized].map(([symbol, value]) => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" })),
          ...[...writtenOff].map(([symbol, value]) => ({
            verb: "Written off",
            value,
            symbol,
            provWhat: "Debt written off",
            count: offs.filter((e) => e.context.data.reserveSymbol === symbol).length,
          })),
        ];
        return (
          <TimelineRunCard
            key={folder.key}
            count={events.length}
            memberNoun="liquidation"
            tone="danger"
            warningLabel="Liquidations"
            aggregates={aggregates}
            folder
            folderBadge={DANGER_FOLDER_BADGE}
            firstTimestamp={events[0].timestamp}
            lastTimestamp={events[events.length - 1].timestamp}
            isFirst={folder.isFirst}
            isLast={folder.isLast}
          >
            {folder.children}
          </TimelineRunCard>
        );
      }),
  },
  // Custody-scale wallets (aToken routers, wrappers) collect thousands of
  // back-to-back transfer rows — position moves, not the wallet's own Pool
  // activity, so consecutive transfers collapse into one expandable run.
  {
    match: (e) =>
      isAaveV3Event(e) && (e.context.data.eventType === "transfer_in" || e.context.data.eventType === "transfer_out"),
    min: MIN_TRANSFER_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_TRANSFER_RUN, (events, folder) => {
        const moves = events.filter(isAaveV3Event);
        const received = sumBySymbol(
          moves
            .filter((e) => e.context.data.eventType === "transfer_in")
            .map((e) => ({ symbol: e.context.data.reserveSymbol, amount: e.context.data.amount })),
        );
        const sent = sumBySymbol(
          moves
            .filter((e) => e.context.data.eventType === "transfer_out")
            .map((e) => ({
              symbol: e.context.data.reserveSymbol,
              amount: String(Math.abs(Number(e.context.data.amount))),
            })),
        );
        const aggregates: RunAggregate[] = [
          ...[...received].map(([symbol, value]) => ({
            verb: "Received",
            value,
            symbol,
            provWhat: "aTokens transferred in",
          })),
          ...[...sent].map(([symbol, value]) => ({ verb: "Sent", value, symbol, provWhat: "aTokens transferred out" })),
        ];
        return (
          <TimelineRunCard
            key={folder.key}
            count={events.length}
            memberNoun="transfer"
            aggregates={aggregates}
            tone="neutral"
            spineIcon="custody"
            muted
            folder
            folderBadge={TRANSFER_FOLDER_BADGE}
            firstTimestamp={events[0].timestamp}
            lastTimestamp={events[events.length - 1].timestamp}
            isFirst={folder.isFirst}
            isLast={folder.isLast}
          >
            {folder.children}
          </TimelineRunCard>
        );
      }),
  },
];
