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
import type {
  MakerAuctionOutcome,
  MakerAuctionRead,
  MakerIlkAt,
  MakerMatChange,
  MakerTxContext,
} from "@/lib/makerdao/chain-history-types";
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
  /** By give row id: who owned the vault before and after it. */
  ownership: Map<string, MakerOwnershipStep>;
  /** Every loaded row of each transaction, in chain order, by hash. */
  txRows: Map<string, MakerEvent[]>;
  /** What each ownership transaction did (tx-context read), by hash. */
  txContext: Map<string, MakerTxContext>;
  /** By event id: the ilk's minimum ratio moved since the previous row. */
  matSteps: Map<string, MakerMatStep>;
  /** The owners over the vault's loaded history, oldest first. */
  owners: MakerOwnerSpan[];
  /** The vault's owner today (the account behind its proxy), lowercased. */
  owner: string | null;
}

/** An owner of the vault: the address the CDP manager records (`holder`,
 *  often a DSProxy) and the account behind it (`owner`). */
export interface MakerOwnerRef {
  holder: string | null;
  owner: string | null;
}

export interface MakerOwnershipStep {
  before: MakerOwnerRef;
  after: MakerOwnerRef;
  /** The give's caller. */
  caller: string | null;
  /** The loaded give before this one moved the vault to `before`. False on
   *  the first loaded give, whose `before` is the vault's creator. */
  beforeFromGive: boolean;
}

/** One owner's stretch of the vault's history. */
export interface MakerOwnerSpan {
  ref: MakerOwnerRef;
  since: number;
  /** The give that ended it, null for the current owner. */
  until: number | null;
  /** Held only inside one transaction that handed it back. */
  withinTx: boolean;
}

/** The ilk's minimum ratio at the previous row and at this one. */
export interface MakerMatStep {
  from: number;
  to: number;
  previousAt: number;
  /** The governance change between the two rows, when the Spotter's log was
   *  read; null while loading or when none was found. */
  change: MakerMatChange | null;
}

const EMPTY: MakerVaultHistory = {
  ilkAt: new Map(),
  auctions: new Map(),
  leftover: new Map(),
  debtSplit: new Map(),
  previousAt: new Map(),
  ownership: new Map(),
  txRows: new Map(),
  txContext: new Map(),
  matSteps: new Map(),
  owners: [],
  owner: null,
};

const Ctx = createContext<MakerVaultHistory>(EMPTY);

export function MakerVaultHistoryProvider({ value, children }: { value: MakerVaultHistory; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMakerVaultHistory(): MakerVaultHistory {
  return useContext(Ctx);
}

export type MakerEvent = BaseActivityEvent & { context: { protocol: "makerdao"; data: MakerDAOContext } };

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

/** Every loaded row of each transaction, in chain order. */
export function makerTxRows(sorted: readonly MakerEvent[]): Map<string, MakerEvent[]> {
  const out = new Map<string, MakerEvent[]>();
  for (const e of sorted) {
    const tx = makerTxHashOf(e);
    if (!tx) continue;
    const list = out.get(tx) ?? [];
    list.push(e);
    out.set(tx, list);
  }
  return out;
}

/** Who owned the vault around each give, and the owners over time. The
 *  first loaded give's `before` is the account in force at the rows before
 *  it (ownerAt), else the give's caller: the CDP manager lets only the owner
 *  or an address it allowed give a vault away. An Instadapp account's owner
 *  comes from the transaction read (its creator, the owner's proxy). */
export function makerOwnership(
  sorted: readonly MakerEvent[],
  txContext: Map<string, MakerTxContext>,
): { steps: Map<string, MakerOwnershipStep>; owners: MakerOwnerSpan[] } {
  const steps = new Map<string, MakerOwnershipStep>();
  const owners: MakerOwnerSpan[] = [];
  let current: MakerOwnerRef | null = null;
  let lastOwnerAt: string | null = null;
  for (const e of sorted) {
    const d = e.context.data;
    if (d.eventType !== "give") {
      if (d.ownerAt) lastOwnerAt = d.ownerAt;
      continue;
    }
    const ctx = txContext.get(makerTxHashOf(e));
    const dst = d.giveDst ?? null;
    const dstParty = dst ? ctx?.parties[dst] : undefined;
    let dstOwner = d.giveDstOwner ?? dst;
    if (dstParty?.kind === "instadapp-account" && dstParty.owner) {
      const hop = ctx?.parties[dstParty.owner];
      dstOwner = hop?.kind === "dsproxy" && hop.owner ? hop.owner : dstParty.owner;
    }
    const before: MakerOwnerRef = current ?? {
      holder: d.giveCaller ?? null,
      owner: lastOwnerAt ?? d.giveCaller ?? null,
    };
    const after: MakerOwnerRef = { holder: dst, owner: dstOwner };
    steps.set(e.id, { before, after, caller: d.giveCaller ?? null, beforeFromGive: current != null });
    if (owners.length === 0) owners.push({ ref: before, since: sorted[0].timestamp, until: null, withinTx: false });
    owners[owners.length - 1].until = e.timestamp;
    owners.push({ ref: after, since: e.timestamp, until: null, withinTx: false });
    current = after;
  }
  // An owner whose stretch starts and ends inside one transaction held the
  // vault only there.
  for (let i = 1; i < owners.length - 1; i++) {
    if (owners[i].until === owners[i].since) owners[i].withinTx = true;
  }
  return { steps, owners };
}

/** The account that owned the vault at `at` (the owner behind its proxy):
 *  the loaded owner span that covers it, else the owner today. */
export function makerOwnerAt(history: MakerVaultHistory, at: number): string | null {
  let found: MakerOwnerRef | null = null;
  for (const o of history.owners) if (o.since <= at) found = o.ref;
  return found?.owner ?? found?.holder ?? history.owner;
}

/** Where the ilk's minimum ratio differs from the previous row's. */
export function makerMatSteps(
  sorted: readonly MakerEvent[],
  ilkAt: Map<number, MakerIlkAt>,
): { steps: Map<string, Omit<MakerMatStep, "change"> & { fromBlock: number; toBlock: number }> } {
  const steps = new Map<string, Omit<MakerMatStep, "change"> & { fromBlock: number; toBlock: number }>();
  let prev: { mat: number; block: number; at: number } | null = null;
  for (const e of sorted) {
    const d = e.context.data;
    if (d.eventType !== "frob" && d.eventType !== "grab") continue;
    const mat = ilkAt.get(e.blockNumber)?.mat ?? null;
    if (mat == null) continue;
    if (prev && Math.abs(prev.mat - mat) > 1e-9) {
      steps.set(e.id, { from: prev.mat, to: mat, previousAt: prev.at, fromBlock: prev.block, toBlock: e.blockNumber });
    }
    prev = { mat, block: e.blockNumber, at: e.timestamp };
  }
  return { steps };
}

/** A row signed by someone other than its owner-in-force, in a transaction
 *  whose give hands the vault to the signer (or the proxy it entered through):
 *  the vault was created by a contract for the signer, who ran it. */
export function openedForSigner(e: MakerEvent, txRows: Map<string, MakerEvent[]>): boolean {
  const d = e.context.data;
  if (!d.txFrom) return false;
  const rows = txRows.get(makerTxHashOf(e)) ?? [];
  return rows.some((r) => {
    const g = r.context.data;
    return (
      g.eventType === "give" &&
      ((g.giveDstOwner != null && g.giveDstOwner === d.txFrom) || (g.giveDst != null && g.giveDst === d.txTo))
    );
  });
}
