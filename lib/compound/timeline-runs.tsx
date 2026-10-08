"use client";

// Compound V3 (Comet) timeline run-collapse — one spec, both deployments.
// Comet absorbs a whole account at once: one absorb_debt row plus one
// absorb_collateral row per seized asset, all in the same transaction. A
// keeper sweep over a wallet in several markets, or repeated absorptions of a
// position that keeps slipping under water, collects those rows back to back
// — passive/third-party events, so they collapse into one expandable run row
// via ChainTruthTimeline's runs seam. Owner actions always stand as rows.
// Module scope matters: ChainTruthTimeline memoises its rows on this array's
// identity, so a fresh one per render would recompute every row.

import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import { compoundAbsorbSplit } from "@/lib/compound/row-facts";
import type { TimelineRunSpec } from "@/components/shared/chain-truth-timeline";
import { TimelineRunCard, type RunAggregate } from "@/components/shared/timeline-run-card";
import { renderRunFolders } from "@/lib/shared/run-folders";
import { sumBySymbol } from "@/lib/shared/run-aggregates";
import type { FolderRegisterEntry, ServedFolder, ServedFolderRegister } from "@/lib/shared/timeline-folder";
import { OWNER_RUN_KIND, ownerRunEntry } from "@/lib/shared/owner-run-folders";

/** Runs shorter than this stay as individual cards — the four-row floor every
 *  explorer's liquidation run uses. One absorption is at least two rows
 *  (debt + one collateral leg), so this is roughly a two-absorption floor. */
const MIN_LIQUIDATION_RUN = 4;

export const COMPOUND_LIQUIDATION_RUNS: TimelineRunSpec[] = [
  {
    match: (e) =>
      isCompoundEvent(e) &&
      (e.context.data.eventType === "absorb_debt" || e.context.data.eventType === "absorb_collateral"),
    min: MIN_LIQUIDATION_RUN,
    render: (run, meta) =>
      renderRunFolders(run, meta, MIN_LIQUIDATION_RUN, (events, folder) => {
        const legs = events.filter(isCompoundEvent);
        const debtLegs = legs.filter((e) => e.context.data.eventType === "absorb_debt");
        const repaid = sumBySymbol(
          debtLegs.map((e) => ({
            symbol: e.context.data.assetSymbol,
            amount:
              compoundAbsorbSplit(e.context.data)?.cleared ?? String(Math.abs(Number(e.context.data.assetsDelta) || 0)),
          })),
        );
        const seized = sumBySymbol(
          legs
            .filter((e) => e.context.data.eventType === "absorb_collateral")
            .map((e) => ({
              symbol: e.context.data.assetSymbol,
              amount: String(Math.abs(Number(e.context.data.assetsDelta) || 0)),
            })),
        );
        const aggregates: RunAggregate[] = [
          ...[...repaid].map(([symbol, value]) => ({ verb: "Debt cleared", value, symbol, provWhat: "Debt cleared" })),
          ...[...seized].map(([symbol, value]) => ({ verb: "Seized", value, symbol, provWhat: "Collateral seized" })),
        ];
        // The header counts ABSORPTIONS (debt legs), not rows — a collateral leg
        // is the same absorption's seizure, not another liquidation. A run of
        // collateral legs alone (the debt leg outside the drawn slice) counts rows.
        const count = debtLegs.length || events.length;
        return (
          <TimelineRunCard
            key={folder.key}
            count={count}
            memberNoun="liquidation"
            tone="critical"
            kindWord="Liquidations"
            aggregates={aggregates}
            folder
            firstTimestamp={events[0].timestamp}
            lastTimestamp={events[events.length - 1].timestamp}
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
// The Compound V3 mainnet page reads its history as ROWS (decision 0019's
// evening amendment): rails-server transcribes the spec above as the
// `liquidation` kind and adds the owner run (decision 0021, 2026-09-24) as
// `owner_run`, in `api/src/services/compound-timeline-folders.ts`. This
// register is how those two kinds draw; the spec above stays for the flat
// answer (`?folders=0`) and for the Base deployment.

/** A served liquidation folder counts its ROWS (the wire's `count`), where the
 *  client spec above counts absorptions, so its member is an event: one
 *  absorption is a debt row and a row per seized collateral. */
const LIQUIDATION_FOLDER: FolderRegisterEntry = {
  memberNoun: "event",
  tone: "critical",
  kindWord: "Liquidations",
  readingLine: true,
};

/** One member of an owner run, by the action it repeats. */
const OWNER_RUN_NOUN: Record<string, string> = {
  supply: "deposit",
  withdraw: "withdrawal",
  supply_collateral: "collateral deposit",
  withdraw_collateral: "collateral withdrawal",
  transfer_in: "receipt",
  transfer_out: "transfer",
  transfer_collateral_in: "collateral receipt",
  transfer_collateral_out: "collateral transfer",
};

export const COMPOUND_FOLDER_REGISTER: ServedFolderRegister = (folder: ServedFolder): FolderRegisterEntry =>
  folder.kind === OWNER_RUN_KIND
    ? { ...ownerRunEntry(folder, (a) => OWNER_RUN_NOUN[a] ?? "event"), readingLine: true }
    : LIQUIDATION_FOLDER;
