"use client";

// The Aave family's folder register — how a SERVED folder draws, on SparkLend
// and on Aave V3.
// ----------------------------------------------------------------------------
// SparkLend is an Aave V3 fork and the two explorers' run specs are already
// line-for-line twins, so the index transcribes them ONCE
// (`api/src/services/aave-family-timeline-folders.ts`) and the web reads them
// back once here, for the same reason: keeping the pair in one place is what
// stops them drifting.
//
// WHAT THE WIRE SENDS AND WHAT THIS ADDS. The index sends `kind` (its own run
// key), `legs`, `counts` and `other` — no words, no tone, no icon, because
// those are display and display never left the web. This module is that
// display half, and it is the SAME register the client-grouped specs next door
// declare, so a folder drawn from the wire and a folder grouped in the browser
// are the same card.
//
// THREE KINDS ARRIVE. `liquidation` and `transfer` are the two specs; `mixed`
// is what rule 6 emits when two or more members are unlike the rest and the
// stretch is not homogeneous enough to summarise under one kind. A
// `liquidation` folder may hold `bad_debt_written_off` members beside its
// liquidations (rails-ops TO-DO-ui-jobs §21): the wire's `counts` and its
// "Written off" leg say so, and the register needs nothing more. A mixed
// folder still takes the DANGER register when a liquidation is among its
// members: severity is a fact about what is inside, not about how neatly the
// stretch grouped, and the corner mark is the only warning a folder row wears
// (the pill was retired at every width, 2026-09-02).

import { DANGER_FOLDER_BADGE, MIXED_FOLDER_BADGE, TRANSFER_FOLDER_BADGE } from "@/lib/shared/run-folders";
import type { FolderRegisterEntry, ServedFolder, ServedFolderRegister } from "@/lib/shared/timeline-folder";

const LIQUIDATION: FolderRegisterEntry = {
  memberNoun: "liquidation",
  tone: "danger",
  warningLabel: "Liquidations",
  folderBadge: DANGER_FOLDER_BADGE,
};

const TRANSFER: FolderRegisterEntry = {
  memberNoun: "transfer",
  tone: "neutral",
  spineIcon: "custody",
  muted: true,
  folderBadge: TRANSFER_FOLDER_BADGE,
};

/** A stretch rule 6 refused to summarise under one kind — the per-kind counts
 *  on the header say what is inside, which is what the two-way arrows mean
 *  everywhere else on the page ("events, various"). */
const MIXED: FolderRegisterEntry = {
  memberNoun: "event",
  tone: "neutral",
  spineIcon: "external",
  folderBadge: MIXED_FOLDER_BADGE,
};

/** A mixed folder holding a liquidation keeps the liquidation register's
 *  severity — see the header. */
const MIXED_WITH_LIQUIDATION: FolderRegisterEntry = {
  ...MIXED,
  tone: "danger",
  spineIcon: "warning",
  folderBadge: DANGER_FOLDER_BADGE,
};

export const AAVE_FAMILY_FOLDER_REGISTER: ServedFolderRegister = (folder: ServedFolder): FolderRegisterEntry => {
  if (folder.kind === "liquidation") return LIQUIDATION;
  if (folder.kind === "transfer") return TRANSFER;
  return folder.counts.some((c) => c.key === "liquidation" && c.count > 0) ? MIXED_WITH_LIQUIDATION : MIXED;
};
