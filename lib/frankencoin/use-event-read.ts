"use client";

// Client read for one Frankencoin event's receipt figures
// (/api/chain/frankencoin/event): what a mint paid out, sent to the reserve and
// charged as interest, and what a repayment burned and got back from the
// reserve. A mined transaction never changes, so each answer is kept per page
// load and shared by the card's grid and its explanation.

import { useEffect, useState } from "react";
import type { FrankencoinEventRead } from "@/lib/sources/chain/frankencoin-event";
import type { FrankencoinContext } from "@/lib/shared/types/event-shape";

export type { FrankencoinEventRead };

const cache = new Map<string, Promise<FrankencoinEventRead | null>>();

const isRead = (d: unknown): d is FrankencoinEventRead =>
  d != null && typeof d === "object" && "mintedOut" in d && "burnedFromPayer" in d;

function load(url: string): Promise<FrankencoinEventRead | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (isRead(d) ? d : null))
      .catch(() => null);
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

/** The receipt read for one event: null while loading, when it failed, or for
 *  a kind that moves no ZCHF. */
export function useFrankencoinEventRead(ctx: FrankencoinContext, txHash?: string): FrankencoinEventRead | null {
  const url =
    txHash && frankencoinEventMovesZchf(ctx)
      ? `/api/chain/frankencoin/event?tx=${txHash}&position=${ctx.position.toLowerCase()}`
      : null;
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
  if (!url || state?.url !== url) return null;
  const v = state.value;
  return v && !v.shared ? v : null;
}

/** The split of a mint or a repayment, from the receipt, in ZCHF. */
export interface FrankencoinZchfSplit {
  /** Mint: what the borrower received, the reserve share, the interest. */
  received: number | null;
  receivedBy: string | null;
  reserveShare: number | null;
  interest: number | null;
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
    return {
      received,
      receivedBy: read.mintedOutTo,
      reserveShare: toReserve != null && interest != null ? toReserve - interest : null,
      interest,
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
    paid: burned - back,
    payer: read.payer,
    reserveReturned: back + (n(read.burnedFromReserve) ?? 0),
  };
}
