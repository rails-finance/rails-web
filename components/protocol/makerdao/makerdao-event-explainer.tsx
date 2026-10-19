"use client";

// The Explanation pane (zone Z2) of a MakerDAO vault event: the generator's
// sentences (lib/makerdao/event-prose.ts, its strings in
// content/makerdao/event-prose.yaml), one bullet each, under the three event
// headings when two of them hold two or more bullets. Each figure the header
// or the detail grid also prints echoes that receipt. The pane reads the ilk
// at the row's block when it opens, which can add a sentence, so a timeline
// card passes the body alone and no teaser. The event page's card passes the
// first sentence as its title (`MakerExplainerLead`, rails-ops decision 0045,
// "Ruled since") and the pane opens on the second (`leadOnTitle`).

import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import { debtDeltaOf, dinkProv, inkAfterProv, type MakerCoords } from "@/lib/makerdao/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { makerEventProse, makerExplanationRuns, type MakerEchoKey } from "@/lib/makerdao/event-prose";
import type { MakerRowExtras } from "@/lib/makerdao/event-figures";
import { resultingState } from "@/lib/makerdao/event-figures";
import { makerOwnerAt, openedForSigner, useMakerVaultHistory, type MakerEvent } from "@/lib/makerdao/vault-history";
import { useIlkAtRow } from "./makerdao-cells";

export interface MakerDAOEventExplainerProps {
  ctx: MakerDAOContext;
  /** The row's id, which the page's history is keyed by. */
  eventId?: string;
  txHash?: string;
  blockNumber?: number;
  /** The event page states the first sentence as its title: the pane leaves
   *  it out. */
  leadOnTitle?: boolean;
}

/** What the page holds about one row (lib/makerdao/vault-history.tsx), as the
 *  generator's extras. */
export function useMakerRowExtras(
  ctx: MakerDAOContext,
  eventId: string | undefined,
  txHash: string | undefined,
  blockNumber: number | undefined,
  /** Read the row's block when the page does not hold it (the opened card). */
  readOwn = true,
): MakerRowExtras {
  const history = useMakerVaultHistory();
  const ilkAt = useIlkAtRow(ctx, blockNumber, readOwn);
  // The hash sits in the row id's middle segment when the row carries none.
  const idTx = eventId?.split(":")[1];
  const tx = (txHash || (idTx && /^0x[0-9a-fA-F]{64}$/.test(idTx) ? idTx : undefined))?.toLowerCase();
  const auction = ctx.eventType === "grab" && tx ? history.auctions.get(tx) : undefined;
  let leftoverTakenAt: number | undefined;
  if (auction?.kind === "clipper") {
    for (const link of history.leftover.values()) {
      if (link.role === "out" && link.auction.txHash.toLowerCase() === tx) leftoverTakenAt = link.at;
    }
  }
  const txRows = tx ? history.txRows.get(tx) : undefined;
  const self = eventId ? txRows?.find((r) => r.id === eventId) : undefined;
  return {
    ilkAt,
    txRows,
    txContext: tx ? history.txContext.get(tx) : undefined,
    ownership: eventId ? history.ownership.get(eventId) : undefined,
    ownershipAll: history.ownership,
    matStep: eventId ? history.matSteps.get(eventId) : undefined,
    createdForSigner: self ? openedForSigner(self as MakerEvent, history.txRows) : false,
    ownerAt: self ? makerOwnerAt(history, self.timestamp) : history.owner,
    eventId,
    split: eventId ? history.debtSplit.get(eventId) : undefined,
    previousAt: eventId ? history.previousAt.get(eventId) : undefined,
    leftover: eventId ? history.leftover.get(eventId) : undefined,
    auction,
    leftoverTakenAt,
  };
}

/** The header's and the detail grid's receipt each echoed figure registers
 *  against: the collateral delta (a frob labels the header axis, so its value
 *  is the bare magnitude; grab and fork keep the sign), the debt delta, and
 *  the collateral after the row. */
function echoFor(key: MakerEchoKey, ctx: MakerDAOContext, coords: MakerCoords): ProseEcho | null {
  const sym = ctx.collateralSymbol;
  const labeled = ctx.eventType === "frob";
  switch (key) {
    case "coll_change":
      return { info: dinkProv(sym, coords), value: chainTruthDeltaValue(Number(ctx.dink) || 0, labeled), symbol: sym };
    case "debt_change": {
      const dsym = ilkDebtSymbol(ctx.ilk);
      const debt = debtDeltaOf(ctx, dsym, coords);
      return { info: debt.prov, value: chainTruthDeltaValue(debt.value, labeled), symbol: dsym };
    }
    case "coll_after":
      return {
        info: inkAfterProv(sym, coords),
        value: formatNumber(resultingState(ctx).inkAfter),
        symbol: sym,
      };
  }
}

/** The Explanation's first sentence as printed (the first run's first), for
 *  the event page's title. */
export function MakerExplainerLead({ ctx, eventId, txHash, blockNumber }: MakerDAOEventExplainerProps) {
  const coords: MakerCoords = { txHash, blockNumber, urn: ctx.urn, ilk: ctx.ilk };
  const extras = useMakerRowExtras(ctx, eventId, txHash, blockNumber);
  const lead = makerExplanationRuns(makerEventProse({ ctx, extras }))[0]?.sentences[0];
  return lead ? <ProseSentenceText s={lead} echo={(key: MakerEchoKey) => echoFor(key, ctx, coords)} /> : null;
}

export function MakerDAOEventExplainer({
  ctx,
  eventId,
  txHash,
  blockNumber,
  leadOnTitle,
}: MakerDAOEventExplainerProps) {
  const coords: MakerCoords = { txHash, blockNumber, urn: ctx.urn, ilk: ctx.ilk };
  const extras = useMakerRowExtras(ctx, eventId, txHash, blockNumber);
  const prose = makerEventProse({ ctx, extras });
  const echo = (key: MakerEchoKey) => echoFor(key, ctx, coords);
  const items = makerExplanationRuns(prose).flatMap((run, r) =>
    run.sentences.flatMap((s, i) => {
      if (leadOnTitle && r === 0 && i === 0) return [];
      const node = <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;
      return [run.heading ? { group: run.heading, node } : node];
    }),
  );
  return <ProseExplainer items={items} />;
}
