"use client";

// Client read for one Frankencoin event's receipt figures
// (/api/chain/frankencoin/event): what a mint paid out, sent to the reserve and
// charged as interest at which rate, what a repayment burned and got back from
// the reserve, who bought or bid in a challenge and where its ZCHF went, and a
// new owner's kind. A mined transaction never changes, so each answer is kept
// per page load and shared by the card's grid, its explanation and the
// challenge panel. The page starts the reads as soon as the timeline lands, so
// an opened card rarely waits; while one is in flight the card says so.

import { useEffect, useState } from "react";
import type { FrankencoinEventRead } from "@/lib/sources/chain/frankencoin-event";
import type { BaseActivityEvent, FrankencoinContext } from "@/lib/shared/types/event-shape";

export type { FrankencoinEventRead };

const cache = new Map<string, Promise<FrankencoinEventRead | null>>();

const isRead = (d: unknown): d is FrankencoinEventRead =>
  d != null && typeof d === "object" && "mintedOut" in d && "burnedFromPayer" in d;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One read, retried twice: a cold route or a refused RPC call answers late or
 *  not at all on the first try, and a missing split must not stick. */
async function fetchRead(url: string): Promise<FrankencoinEventRead | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        if (isRead(d)) return d;
      }
    } catch {
      // Network failure: try again.
    }
    if (attempt < 2) await wait(1500 * (attempt + 1));
  }
  return null;
}

function load(url: string): Promise<FrankencoinEventRead | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetchRead(url);
    p.then((v) => {
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

/** The event kinds whose ZCHF moved through the owner's wallet: a mint, a
 *  repayment, a combined adjust and a close. */
export function frankencoinEventMovesZchf(ctx: FrankencoinContext): boolean {
  if (ctx.eventType !== "mint" && ctx.eventType !== "repay" && ctx.eventType !== "adjust" && ctx.eventType !== "close")
    return false;
  const after = Number(ctx.minted ?? NaN);
  const before = Number(ctx.mintedBefore ?? NaN);
  return Number.isFinite(after) && Number.isFinite(before) && after !== before;
}

/** The log index an event id carries (`kind:txhash:logIndex[:n]`). */
const logIndexOf = (eventId?: string): string | null => {
  const part = eventId?.split(":")[2];
  return part != null && /^\d+$/.test(part) ? part : null;
};

/** The read's URL for one event, or null for a kind that reads nothing. */
export function frankencoinEventReadUrl(ctx: FrankencoinContext, txHash?: string, eventId?: string): string | null {
  if (!txHash) return null;
  const challenge =
    ctx.hub === "v2" && (ctx.eventType === "challenge_averted" || ctx.eventType === "challenge_succeeded");
  const ownership = ctx.eventType === "ownership_transferred" && ctx.newOwner != null;
  if (!frankencoinEventMovesZchf(ctx) && !challenge && !ownership) return null;
  const q = new URLSearchParams({ tx: txHash, position: ctx.position.toLowerCase(), kind: ctx.eventType });
  const log = logIndexOf(eventId);
  if (log != null) q.set("log", log);
  if (ownership && ctx.newOwner) q.set("owner", ctx.newOwner.toLowerCase());
  return `/api/chain/frankencoin/event?${q.toString()}`;
}

export interface FrankencoinEventReadState {
  /** The read, once landed (withheld when it could not isolate the event). */
  read: FrankencoinEventRead | null;
  /** The read is still in flight. */
  pending: boolean;
}

/** The receipt read for one event, with whether it is still loading. */
export function useFrankencoinEventRead(
  ctx: FrankencoinContext,
  txHash?: string,
  eventId?: string,
): FrankencoinEventReadState {
  const url = frankencoinEventReadUrl(ctx, txHash, eventId);
  const [state, setState] = useState<{ url: string; value: FrankencoinEventRead | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    load(url).then((d) => {
      if (live) setState({ url, value: d });
    });
    return () => {
      live = false;
    };
  }, [url]);
  if (!url) return { read: null, pending: false };
  if (state?.url !== url) return { read: null, pending: true };
  const v = state.value;
  return { read: v && !v.shared ? v : null, pending: false };
}

/** Start every read the timeline's cards and challenge panel will ask for, so
 *  the figures are in place when a card opens. At most `cap` of them, newest
 *  first. */
export function prefetchFrankencoinEventReads(events: BaseActivityEvent[], cap = 24): void {
  const urls: string[] = [];
  for (let i = events.length - 1; i >= 0 && urls.length < cap; i--) {
    const e = events[i];
    if (e.context?.protocol !== "frankencoin") continue;
    const ctx = e.context.data as FrankencoinContext;
    if (ctx.eventType === "ownership_transferred") continue;
    const url = frankencoinEventReadUrl(ctx, e.txHash, e.id);
    if (url) urls.push(url);
  }
  urls.forEach((u) => void load(u));
}

/** The split of a mint or a repayment, from the receipt, in ZCHF. */
export interface FrankencoinZchfSplit {
  /** Mint: what the borrower received, the reserve share, the interest. */
  received: number | null;
  receivedBy: string | null;
  reserveShare: number | null;
  interest: number | null;
  /** Mint: the annual rate in force at the block (percent) and the days of
   *  term it was charged for. */
  ratePct: number | null;
  termDays: number | null;
  /** Repayment: what the payer paid net, the reserve share returned. */
  paid: number | null;
  payer: string | null;
  reserveReturned: number | null;
}

export function frankencoinZchfSplit(read: FrankencoinEventRead | null, dMint: number): FrankencoinZchfSplit | null {
  if (!read) return null;
  const n = (s: string | null) => (s == null || s === "" ? null : Number(s));
  if (dMint > 0) {
    const received = n(read.mintedOut);
    const toReserve = n(read.mintedToReserve);
    const interest = n(read.interest);
    if (received == null || received <= 0) return null;
    const rate = read.rate;
    const from = rate && read.blockTimestamp != null ? Math.max(read.blockTimestamp, rate.start) : null;
    return {
      received,
      receivedBy: read.mintedOutTo,
      reserveShare: toReserve != null && interest != null ? toReserve - interest : null,
      interest,
      ratePct: rate ? rate.annualInterestPPM / 10_000 : null,
      termDays: rate && from != null && rate.expiration > from ? (rate.expiration - from) / 86400 : null,
      paid: null,
      payer: null,
      reserveReturned: null,
    };
  }
  const burned = n(read.burnedFromPayer);
  const back = n(read.reserveReturned) ?? 0;
  if (burned == null || burned <= 0) return null;
  return {
    received: null,
    receivedBy: null,
    reserveShare: null,
    interest: null,
    ratePct: null,
    termDays: null,
    paid: burned - back,
    payer: read.payer,
    reserveReturned: back + (n(read.burnedFromReserve) ?? 0),
  };
}
