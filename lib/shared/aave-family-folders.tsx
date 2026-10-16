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
// FOUR KINDS ARRIVE. `owner_run` is the owner's shape run or cycle
// (`lib/shared/owner-run-folders.tsx`), named by the card's own verbs.
// `liquidation` and `transfer` are the other two specs; `mixed`
// is what rule 6 emits when two or more members are unlike the rest and the
// stretch is not homogeneous enough to summarise under one kind. A
// `liquidation` folder may hold `bad_debt_written_off` members beside its
// liquidations (rails-ops TO-DO-ui-jobs §21): the wire's `counts` and its
// "Written off" leg say so, and the register needs nothing more. A mixed
// folder still takes the DANGER register when a liquidation is among its
// members: severity is a fact about what is inside, not about how neatly the
// stretch grouped, and the corner mark is the only warning a folder row wears
// (the pill was retired at every width, 2026-09-02).

import type { FolderRegisterEntry, ServedFolder, ServedFolderRegister } from "@/lib/shared/timeline-folder";
import { OWNER_RUN_KIND, ownerRunEntry } from "@/lib/shared/owner-run-folders";

const LIQUIDATION: FolderRegisterEntry = {
  memberNoun: "liquidation",
  tone: "critical",
  kindWord: "Liquidations",
};

const TRANSFER: FolderRegisterEntry = {
  memberNoun: "transfer",
  tone: "neutral",
  spineIcon: "custody",
  muted: true,
};

/** A stretch rule 6 refused to summarise under one kind — the per-kind counts
 *  on the header say what is inside, which is what the two-way arrows mean
 *  everywhere else on the page ("events, various"). */
const MIXED: FolderRegisterEntry = {
  memberNoun: "event",
  tone: "neutral",
  spineIcon: "external",
};

/** A mixed folder holding a liquidation keeps the liquidation register's
 *  severity — see the header. */
const MIXED_WITH_LIQUIDATION: FolderRegisterEntry = {
  ...MIXED,
  tone: "critical",
  spineIcon: "warning",
};

/** One member of an owner shape or cycle, by its action: the card's verb. */
const OWNER_RUN_NOUN: Record<string, string> = {
  supply: "supply",
  withdraw: "withdraw",
  borrow: "borrow",
  repay: "repay",
};

export const AAVE_FAMILY_FOLDER_REGISTER: ServedFolderRegister = (folder: ServedFolder): FolderRegisterEntry => {
  if (folder.kind === OWNER_RUN_KIND) return ownerRunEntry(folder, (a) => OWNER_RUN_NOUN[a] ?? "event");
  if (folder.kind === "liquidation") return LIQUIDATION;
  if (folder.kind === "transfer") return TRANSFER;
  return folder.counts.some((c) => c.key === "liquidation" && c.count > 0) ? MIXED_WITH_LIQUIDATION : MIXED;
};
