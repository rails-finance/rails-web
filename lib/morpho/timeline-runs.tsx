"use client";

// Morpho Blue timeline run-collapse — one spec, both deployments (the L1
// position page and the Base per-market section render the same event shape).
// A borrower caught by a keeper sweep collects several liquidation rows back
// to back — passive/third-party events, so they collapse into one expandable
// run row via ChainTruthTimeline's runs seam. Owner actions always stand as
// their own rows.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders, DANGER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";
import type { FolderRegisterEntry, ServedFolder, ServedFolderRegister } from "@/lib/shared/timeline-folder";
import { OWNER_RUN_KIND, ownerRunEntry } from "@/lib/shared/owner-run-folders";

/** Runs shorter than this stay as individual cards — the four-row floor every
 *  explorer's liquidation run uses. */
const MIN_LIQUIDATION_RUN = 4;

export const MORPHO_LIQUIDATION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) => isMorphoEvent(e) && e.context.data.eventType === "liquidation",
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const liqs = events.filter(isMorphoEvent);
        // A liquidation row moves the COLLATERAL side (assetsDelta, negative);
        // the loan-token amount it cleared rides `loanRepaid` (repaid + any bad
        // debt socialised) — the two legs the single card's header shows.
        const repaid = sumBySymbol(
          liqs.map((e) => ({ symbol: e.context.data.loanSymbol, amount: e.context.data.loanRepaid })),
        );
        const seized = sumBySymbol(
          liqs.map((e) => ({
            symbol: e.context.data.collateralSymbol,
            amount: String(Math.abs(Number(e.context.data.assetsDelta) || 0)),
          })),
        );
        const aggregates: RunAggregate[] = [
          ...[...repaid].map(([symbol, value]) => ({ verb: "Repaid", value, symbol, provWhat: "Debt cleared" })),
          ...[...seized].map(([symbol, value]) => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" })),
        ];
        const count = events.length;
        return (
          <TimelineRunCard
            key={folder.key}
            count={count}
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
];

// ── Folders the INDEX served ────────────────────────────────────────────────
//
// The L1 position page reads its history as ROWS (decision 0019's evening
// amendment): rails-server transcribes the spec above as the `liquidation`
// kind and adds the owner run (decision 0021, 2026-09-24) as `owner_run`, in
// `api/src/services/morpho-timeline-folders.ts`. This register is how those
// two kinds draw; the spec above stays for the flat answer (`?folders=0`) and
// for the Base section, which groups in the browser.

const LIQUIDATION_FOLDER: FolderRegisterEntry = {
  memberNoun: "liquidation",
  tone: "danger",
  warningLabel: "Liquidations",
  folderBadge: DANGER_FOLDER_BADGE,
};

/** One member of an owner run, by the action it repeats. */
const OWNER_RUN_NOUN: Record<string, string> = {
  supply_collateral: "collateral deposit",
  withdraw_collateral: "collateral withdrawal",
  borrow: "borrow",
  repay: "repayment",
};

export const MORPHO_FOLDER_REGISTER: ServedFolderRegister = (folder: ServedFolder): FolderRegisterEntry =>
  folder.kind === OWNER_RUN_KIND ? ownerRunEntry(folder, (a) => OWNER_RUN_NOUN[a] ?? "event") : LIQUIDATION_FOLDER;
