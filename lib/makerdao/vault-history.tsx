"use client";

// What the MakerDAO vault page knows about its own history beyond the rows,
// shared with every card through one context:
//
//   • the ilk's state at each row's block (the OSM price, the minimum ratio,
//     the minimum debt), read by chain call (lib/makerdao/use-chain-history.ts);
//   • each liquidation's auction (penalty, collateral sold, collateral handed
//     back), read by chain call from the grab's transaction;
//   • which later rows moved that handed-back collateral: the Clipper returns
//     it to the urn as free collateral (vat.flux), and the owner moves it into
//     the vault and out again to take it (a frob in, a frob out);
//   • the debt split into what was drawn and the stability fee on it.
//
// THE FEE DEFINITION (one, used by the card, the flows panel and every row):
// the fee in the debt is the debt less the DAI drawn net of repayments since the
// vault last owed nothing. A repayment pays the drawn DAI first; the drawn part
// never goes below zero. Across the vault's life the fee is the debt owed now
// less every DAI drawn net of every repayment and liquidation, which is the
// same quantity added up over each stretch.

import { createContext, useContext, type ReactNode } from "react";
import type { BaseActivityEvent, MakerDAOContext } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";
import type { MakerAuctionOutcome, MakerAuctionRead, MakerIlkAt } from "@/lib/makerdao/chain-history-types";
import { makerTxHashOf } from "@/lib/makerdao/market-notes";

const EPS = 1e-9;

/** The debt at one row, split into DAI drawn and fee. `null` fields: the row
 *  sits in a stretch whose start is not loaded. */
export interface MakerDebtSplit {
  /** DAI drawn, net of repayments, since the vault last owed nothing — before
   *  this row and after it. */
  drawnBefore: number | null;
  drawnAfter: number | null;
  /** Debt less drawn, before this row and after it. */
  feeBefore: number | null;
  feeAfter: number | null;
  /** When the stretch this row belongs to began (the row after the vault last
   *  owed nothing). */
  stretchStartAt: number | null;
}

/** A row that moved the collateral an auction handed back. */
export interface MakerLeftoverLink {
  role: "in" | "out";
  auction: MakerAuctionOutcome;
  /** The liquidation row's timestamp. */
  grabAt: number;
  /** This row's own timestamp. */
  at: number;
}

export interface MakerVaultHistory {
  ilkAt: Map<number, MakerIlkAt>;
  /** By the grab row's transaction hash. */
  auctions: Map<string, MakerAuctionRead>;
  /** By event id. */
  leftover: Map<string, MakerLeftoverLink>;
  /** By event id. */
  debtSplit: Map<string, MakerDebtSplit>;
  /** By event id: the previous row's timestamp. */
  previousAt: Map<string, number>;
}

const EMPTY: MakerVaultHistory = {
  ilkAt: new Map(),
  auctions: new Map(),
  leftover: new Map(),
  debtSplit: new Map(),
  previousAt: new Map(),
};

const Ctx = createContext<MakerVaultHistory>(EMPTY);

export function MakerVaultHistoryProvider({ value, children }: { value: MakerVaultHistory; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMakerVaultHistory(): MakerVaultHistory {
  return useContext(Ctx);
}

type MakerEvent = BaseActivityEvent & { context: { protocol: "makerdao"; data: MakerDAOContext } };

const chainOrder = (a: MakerEvent, b: MakerEvent): number => {
  const li = (e: MakerEvent) => Number(e.id.slice(e.id.lastIndexOf(":") + 1)) || 0;
  return a.blockNumber - b.blockNumber || li(a) - li(b);
};

export function sortedMakerEvents(events: readonly BaseActivityEvent[]): MakerEvent[] {
  return events.filter(isMakerDAOEvent).slice().sort(chainOrder) as MakerEvent[];
}

/**
 * The drawn/fee split at every row. `wholeHistory` says the rows start at the
 * vault's first event, so the first stretch starts at zero; otherwise the split
 * is known only from the first row that leaves the debt at zero.
 */
export function makerDebtSplits(sorted: readonly MakerEvent[], wholeHistory: boolean): Map<string, MakerDebtSplit> {
  const out = new Map<string, MakerDebtSplit>();
  let drawn: number | null = wholeHistory ? 0 : null;
  let stretchStartAt: number | null = null;
  for (const e of sorted) {
    const d = e.context.data;
    const after = d.debtAfter != null ? Number(d.debtAfter) : NaN;
    const change = d.debtChange != null ? Number(d.debtChange) : 0;
    const before = Number.isFinite(after) ? after - change : NaN;
    const drawnBefore = drawn;
    if (drawn != null && Number.isFinite(after)) {
      if (before <= EPS && after > EPS) stretchStartAt = e.timestamp;
      if (d.eventType === "grab") {
        // A liquidation clears the debt it takes: drawn DAI first, as a
        // repayment does.
        drawn = Math.max(0, drawn + change);
      } else if (change > 0) {
        drawn = drawn + change;
      } else if (change < 0) {
        drawn = Math.max(0, drawn + change);
      }
    }
    if (Number.isFinite(after) && after <= EPS) drawn = 0;
    const drawnAfter = drawn;
    out.set(e.id, {
      drawnBefore,
      drawnAfter,
      feeBefore: drawnBefore != null && Number.isFinite(before) ? Math.max(0, before - drawnBefore) : null,
      feeAfter: drawnAfter != null && Number.isFinite(after) ? Math.max(0, after - drawnAfter) : null,
      stretchStartAt: drawnBefore != null ? stretchStartAt : null,
    });
    if (Number.isFinite(after) && after <= EPS) stretchStartAt = null;
  }
  return out;
}

/** Which rows moved an auction's handed-back collateral: the first row after
 *  the liquidation that adds exactly that amount, and the first after it that
 *  takes out at least 99.9% of it (a proxy's free rounds the amount down:
 *  vault 24785 took out 0.075556 of 0.075556946512177321 WBTC). */
export function makerLeftoverLinks(
  sorted: readonly MakerEvent[],
  auctions: Map<string, MakerAuctionRead>,
): Map<string, MakerLeftoverLink> {
  const out = new Map<string, MakerLeftoverLink>();
  sorted.forEach((g, i) => {
    if (g.context.data.eventType !== "grab") return;
    const a = auctions.get(makerTxHashOf(g));
    if (!a || a.kind !== "clipper") return;
    const left = Number(a.leftoverInk);
    if (!(left > 0)) return;
    let inIdx = -1;
    for (let j = i + 1; j < sorted.length; j++) {
      const d = sorted[j].context.data;
      if (d.eventType === "grab") break;
      if (d.eventType === "frob" && d.dink === a.leftoverInk) {
        inIdx = j;
        break;
      }
    }
    if (inIdx < 0) return;
    out.set(sorted[inIdx].id, { role: "in", auction: a, grabAt: g.timestamp, at: sorted[inIdx].timestamp });
    for (let j = inIdx + 1; j < sorted.length; j++) {
      const d = sorted[j].context.data;
      const dink = Number(d.dink);
      if (d.eventType === "frob" && dink < 0 && -dink >= left * 0.999) {
        out.set(sorted[j].id, { role: "out", auction: a, grabAt: g.timestamp, at: sorted[j].timestamp });
        break;
      }
      if (d.eventType !== "frob" || dink > 0) break;
    }
  });
  return out;
}

export function makerPreviousAt(sorted: readonly MakerEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) out.set(sorted[i].id, sorted[i - 1].timestamp);
  return out;
}
