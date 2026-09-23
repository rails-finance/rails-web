"use client";

// SparkLend timeline run-collapse — the Aave V3 pair (liquidation sweeps +
// spToken transfer bursts), lifted out of the wallet page so every explorer's
// run specs live in one place per protocol (lib/<proto>/timeline-runs).
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.
//
// GROUPING IS THE INDEX'S ON THIS FAMILY NOW, and this file keeps both halves.
// Decision 0019's evening amendment makes the timeline's cut count ROWS, which
// only pays if the folders exist before the response is written — so the
// SparkLend page asks for `?group=1` and draws the folders it is handed
// (`SPARK_FOLDER_REGISTER` below, and the index's transcription of these very
// specs in `api/src/services/aave-family-timeline-folders.ts`). The specs stay
// because the flat answer is still what the page reads by default and what
// every other surface reads: the two paths draw the same card, and the specs
// go only when this family's last flat reader does.

import { isSparkEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE, TRANSFER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";
import { AAVE_FAMILY_FOLDER_REGISTER } from "@/lib/shared/aave-family-folders";

/** How a folder the INDEX served draws on this family — label, tone, spine
 *  glyph, corner mark. Shared with Aave V3, because SparkLend is an Aave V3
 *  fork and the index transcribes the two specs once for the same reason. */
export const SPARK_FOLDER_REGISTER = AAVE_FAMILY_FOLDER_REGISTER;

/** Runs shorter than this stay as individual cards. */
const MIN_LIQUIDATION_RUN = 4;
const MIN_TRANSFER_RUN = 4;

// A keeper's liquidation sweep across a whale's reserves collects several
// LiquidationCall rows back to back — passive/third-party events, so they
// collapse into one expandable run row via ChainTruthTimeline's runs seam.
// Module-scope so the timeline's row memo keeps a stable identity. SparkLend
// mirrors Aave V3's event shape exactly, so this spec mirrors that page's.
export const SPARK_TIMELINE_RUNS: TimelineRunSpec[] = [
  {
    match: (e) => isSparkEvent(e) && e.context.data.eventType === "liquidation",
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const liqs = events.filter(isSparkEvent);
        const repaid = sumBySymbol(
          liqs.map((e) => ({ symbol: e.context.data.reserveSymbol, amount: e.context.data.debtToCover })),
        );
        const seized = sumBySymbol(
          liqs.map((e) => ({
            symbol: e.context.data.collateralSymbol,
            amount: e.context.data.liquidatedCollateralAmount,
          })),
        );
        const aggregates: RunAggregate[] = [
          ...[...repaid].map(([symbol, value]) => ({ verb: "Repaid", value, symbol, provWhat: "Debt repaid" })),
          ...[...seized].map(([symbol, value]) => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" })),
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
  // Custody-scale wallets (spToken routers, wrappers) collect thousands of
  // back-to-back transfer rows — position moves, not the wallet's own Pool
  // activity, so consecutive transfers collapse into one expandable run.
  {
    match: (e) =>
      isSparkEvent(e) && (e.context.data.eventType === "transfer_in" || e.context.data.eventType === "transfer_out"),
    min: MIN_TRANSFER_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_TRANSFER_RUN, (events, folder) => {
        const moves = events.filter(isSparkEvent);
        const received = sumBySymbol(
          moves
            .filter((e) => e.context.data.eventType === "transfer_in")
            .map((e) => ({ symbol: e.context.data.reserveSymbol, amount: e.context.data.assetsDelta })),
        );
        const sent = sumBySymbol(
          moves
            .filter((e) => e.context.data.eventType === "transfer_out")
            .map((e) => ({
              symbol: e.context.data.reserveSymbol,
              amount: String(Math.abs(Number(e.context.data.assetsDelta))),
            })),
        );
        const aggregates: RunAggregate[] = [
          ...[...received].map(([symbol, value]) => ({
            verb: "Received",
            value,
            symbol,
            provWhat: "spTokens transferred in",
          })),
          ...[...sent].map(([symbol, value]) => ({
            verb: "Sent",
            value,
            symbol,
            provWhat: "spTokens transferred out",
          })),
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
