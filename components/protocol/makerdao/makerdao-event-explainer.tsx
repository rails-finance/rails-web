"use client";

// Plain-English explainer for a Maker vault event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/makerdao/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. Every figure here is the card's own
// face value, Prov-traced (an echo of the header delta / detail grid / forensics
// receipt); the debt is quoted in DAI (or USDS), dart × the rate at the block,
// the figure the header draws.
//
// A frob is ONE vault operation carrying two signed deltas — collateral and
// debt — so the narration decomposes the pair: deposit, withdraw, draw, repay,
// or a combination in one transaction.

import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import type { MakerCoords } from "@/lib/makerdao/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { makerdaoVaultContent, makerdaoLiquidationContent } from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { makerdaoEventSlots, type MakerRowExtras } from "@/lib/makerdao/explainer-clauses";
import { makerOwnerAt, openedForSigner, useMakerVaultHistory, type MakerEvent } from "@/lib/makerdao/vault-history";
import { useIlkAtRow } from "./makerdao-cells";

export interface MakerDAOEventExplainerProps {
  ctx: MakerDAOContext;
  /** The row's id, which the page's history is keyed by. */
  eventId?: string;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal (fork and give ride the vault-operations content; the grab
 *  and LockStake auction rows ride the liquidation content). Used by the card
 *  composer, which renders the "?" trigger on the footer row (this pane
 *  renders prose only). */
export function makerdaoLearnMoreContent(ctx: MakerDAOContext, returned = false): LearnMoreContent {
  if (ctx.eventType === "grab" || ctx.eventType.startsWith("lse-")) return makerdaoLiquidationContent();
  const o = { debtSym: ilkDebtSymbol(ctx.ilk), ilk: ctx.ilk };
  const vc = (k: Parameters<typeof makerdaoVaultContent>[0]) => makerdaoVaultContent(k, o);
  if (ctx.eventType === "give") return vc("ownership");
  if (ctx.eventType !== "frob") return vc("adjust");
  if (ctx.isOpen) return vc("open");
  if (returned) return vc("returned");
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;
  if (dink !== 0 && dart !== 0) return vc("adjust");
  if (dink > 0) return vc("deposit");
  if (dink < 0) return vc("withdraw");
  if (dart > 0) return vc("generate");
  if (dart < 0) return vc("repay");
  return vc("adjust");
}

/** What the page holds about one row (lib/makerdao/vault-history.tsx), as the
 *  explainer's extras. */
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

export function MakerDAOEventExplainer({ ctx, eventId, txHash, blockNumber, skipLead }: MakerDAOEventExplainerProps) {
  const coords: MakerCoords = { txHash, blockNumber, urn: ctx.urn, ilk: ctx.ilk };
  const extras = useMakerRowExtras(ctx, eventId, txHash, blockNumber);
  const clauses = eventClauses(makerdaoEventSlots(ctx, coords, extras));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
