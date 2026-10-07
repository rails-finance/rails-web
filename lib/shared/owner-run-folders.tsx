"use client";

// The owner's own runs, drawn as a folder — decision 0021's 2026-09-24
// amendment: on a served timeline, five or more of the owner's rows of one
// action on one market (supply, withdraw, borrow, repay) back to back are one
// folder, in the liquidation and transfer folders' grammar. The index groups
// them (`OWNER_RUN_KIND` on the wire, rails-server
// `api/src/services/compound-timeline-folders.ts` on the Compound family);
// this module is the display half every family's register shares, so an owner
// run reads the same wherever it is served.
//
// An owner run is the holder's own activity, so it wears no severity: neutral
// tone, not muted, and a repeat mark in the corner. Its header sums one asset
// under one verb, which is the whole of what the run did.
//
// Since 2026-09-28 (the amendment's question C) an owner run is also five or
// more transactions of one SHAPE back to back: the same owner actions and
// token transfers in each (a Maple deposit and its share transfer). The
// index sends the shape (`ServedFolder.shape`, the member kinds of one
// transaction) and legs netted per asset; the header names the shape before
// the sums, "12 × deposit + share transfer".

import type { ReactNode } from "react";
import { Repeat } from "lucide-react";
import type { FolderRegisterEntry, ServedFolder } from "@/lib/shared/timeline-folder";

/** The wire kind of an owner-run folder. */
export const OWNER_RUN_KIND = "owner_run";

/** The corner mark: one action, repeated. */
export const OWNER_RUN_FOLDER_BADGE: ReactNode = <Repeat size={10} strokeWidth={2.5} className="text-rb-500" />;

/**
 * The register entry for an owner-run folder. `nounOf` names one member from
 * the family's own action key (`counts[0].key`, the one action the run holds);
 * the card pluralises it with an "s", so a noun is chosen that takes one.
 */
export function ownerRunEntry(folder: ServedFolder, nounOf: (action: string) => string): FolderRegisterEntry {
  if (folder.shape && folder.shape.length > 0) {
    return {
      memberNoun: "event",
      tone: "neutral",
      folderBadge: OWNER_RUN_FOLDER_BADGE,
      shapeLabel: ownerShapeLabel(folder.shape, nounOf),
    };
  }
  return {
    memberNoun: nounOf(folder.counts[0]?.key ?? ""),
    tone: "neutral",
    folderBadge: OWNER_RUN_FOLDER_BADGE,
  };
}

/** A shape run's summary: one noun per member kind of one transaction, in
 *  their order — "Deposit + share transfer". The row's bracketed count is its
 *  only count (ui-jobs 250). */
export function ownerShapeLabel(shape: string[], nounOf: (action: string) => string): string {
  const words = shape.map(nounOf).join(" + ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
