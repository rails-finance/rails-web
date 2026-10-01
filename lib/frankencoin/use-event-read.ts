"use client";

// Client read for one Frankencoin event's receipt figures
// (/api/chain/frankencoin/event): what a mint paid out, sent to the reserve and
// charged as interest at which rate, what a repayment burned and got back from
// the reserve, who bought or bid in a challenge and where its ZCHF went, who
// bought a forced sale and where its ZCHF went, and a new owner's kind. A
// mined transaction never changes, so each answer is kept per page load and
// shared by the card's grid, its explanation and the challenge panel. The
// page starts the reads as soon as the timeline lands, so an opened card
// rarely waits; while one is in flight the card says so.

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

/** One event's read by its URL, from the page's cache: the Lifetime flows
 *  replay splits every mint and repayment with the cards' own reads. */
export const loadFrankencoinEventRead = (url: string): Promise<FrankencoinEventRead | null> => load(url);

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
    ctx.hub === "v2" &&
    (ctx.eventType === "challenge_averted" ||
      ctx.eventType === "challenge_succeeded" ||
      ctx.eventType === "forced_sale");
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

type FrankEvent = BaseActivityEvent & { context: { protocol: "frankencoin"; data: FrankencoinContext } };

/** The opening read's URL for an original's page: its PositionOpened row, and
 *  the block of its first ledger row when a later transaction wrote it. */
function openingUrl(events: FrankEvent[]): string | null {
  const open = events.find((e) => e.context.data.eventType === "open");
  if (!open?.txHash) return null;
  const first = events.find((e) => e.context.data.firstState === true);
  const q = new URLSearchParams({ tx: open.txHash, position: open.context.data.position.toLowerCase(), kind: "open" });
  const log = logIndexOf(open.id);
  if (log != null) q.set("log", log);
  if (first && first.txHash !== open.txHash && first.blockNumber > open.blockNumber)
    q.set("first", String(first.blockNumber));
  return `/api/chain/frankencoin/event?${q.toString()}`;
}

/** The opening read of an original's page (null on a clone's), with whether it
 *  is still loading. One request per page; the Open row and the first ledger
 *  row both read from it. */
export function useFrankencoinOpening(events: FrankEvent[]): FrankencoinEventReadState {
  const url = openingUrl(events);
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
  return { read: state.value?.opening ? state.value : null, pending: false };
}

const scaleRaw = (raw: string, decimals: number): string => {
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals > 0 ? digits.slice(digits.length - decimals).replace(/0+$/, "") : "";
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
};

/** The timeline with the opening transaction's figures in place, from the
 *  receipt: the Open row carries the collateral it moved in and the declared
 *  price it set, and the first ledger row (written by a later transaction)
 *  starts from the balance and price one block before it, so its change is
 *  what that transaction moved. The index books the opening deposit into that
 *  row instead (rails-ops item 158). */
export function applyFrankencoinOpening(events: FrankEvent[], read: FrankencoinEventRead | null): FrankEvent[] {
  const o = read?.opening;
  if (!o) return events;
  return events.map((e) => {
    const c = e.context.data;
    if (c.eventType === "open") {
      const deposited = BigInt(o.depositedRaw);
      const data: FrankencoinContext = {
        ...c,
        ...(deposited > BigInt(0) ? { collateral: scaleRaw(o.depositedRaw, c.collateralDecimals) } : {}),
        ...(o.priceRaw != null ? { liqPrice: scaleRaw(o.priceRaw, 36 - c.collateralDecimals) } : {}),
        raw: {
          ...c.raw,
          ...(deposited > BigInt(0) ? { collateral: o.depositedRaw } : {}),
          ...(o.priceRaw != null ? { price: o.priceRaw } : {}),
        },
      };
      return { ...e, context: { ...e.context, data } };
    }
    const fb = o.firstBefore;
    if (c.firstState !== true || !fb || fb.block !== e.blockNumber || fb.collateralRaw == null) return e;
    const collBefore = BigInt(fb.collateralRaw);
    const collAfter = c.raw?.collateral != null ? BigInt(c.raw.collateral) : null;
    const priceAfter = c.raw?.price != null ? BigInt(c.raw.price) : null;
    const priceBefore = fb.priceRaw != null ? BigInt(fb.priceRaw) : null;
    const dColl = collAfter != null ? collAfter - collBefore : null;
    const priceMoved = priceBefore != null && priceAfter != null && priceBefore !== priceAfter;
    const dMint = Number(c.minted ?? 0) - Number(c.mintedBefore ?? 0);
    // Re-classified on the corrected axes; a settlement stays a settlement.
    let eventType = c.eventType;
    if (eventType !== "auction_settlement" && eventType !== "close") {
      const axes = [dColl != null && dColl !== BigInt(0), dMint !== 0, priceMoved].filter(Boolean).length;
      eventType =
        axes > 1
          ? "adjust"
          : dMint !== 0
            ? dMint > 0
              ? "mint"
              : "repay"
            : dColl != null && dColl !== BigInt(0)
              ? dColl > BigInt(0)
                ? "add_collateral"
                : "withdraw_collateral"
              : priceMoved
                ? "adjust_price"
                : "adjust";
    }
    const data: FrankencoinContext = {
      ...c,
      eventType,
      collateralBefore: scaleRaw(fb.collateralRaw, c.collateralDecimals),
      ...(fb.priceRaw != null ? { liqPriceBefore: scaleRaw(fb.priceRaw, 36 - c.collateralDecimals) } : {}),
      firstState: collBefore === BigInt(0) && fb.priceRaw == null ? true : undefined,
      beforeReadAtBlock: true,
      raw: {
        ...c.raw,
        collateralBefore: fb.collateralRaw,
        ...(fb.priceRaw != null ? { priceBefore: fb.priceRaw } : {}),
      },
    };
    const flows = e.flows.map((f) =>
      eq(f.token, c.collateralToken) && dColl != null
        ? {
            ...f,
            amount: (dColl < BigInt(0) ? -dColl : dColl).toString(),
            amountFormatted: Math.abs(Number(scaleRaw(dColl.toString(), c.collateralDecimals))),
            direction: dColl < BigInt(0) ? ("out" as const) : ("in" as const),
          }
        : f,
    );
    const parts: string[] = [];
    if (dColl != null && dColl !== BigInt(0)) parts.push(dColl > BigInt(0) ? "Add" : "Withdraw");
    if (dMint !== 0) parts.push(dMint > 0 ? "Mint" : "Repay");
    if (priceMoved) parts.push("Reprice");
    const actionLabel = eventType === "adjust" && parts.length > 1 ? parts.join(" + ") : e.actionLabel;
    return {
      ...e,
      actionType: eventType,
      actionLabel,
      flows: flows.filter((f) => !(eq(f.token, c.collateralToken) && dColl === BigInt(0))),
      context: { ...e.context, data },
    };
  });
}

const eq = (a: string | undefined, b: string | undefined) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
