"use client";

// The Morpho market around one event — its oracle price and borrow rate at the
// end of block N − 1 and of block N (/api/chain/morpho/at-block). The opened
// card's grid and its explanation both read it, so one request serves both, and
// a past block's answer never changes.

import { useEffect, useState } from "react";
import type { MorphoContext } from "@/lib/shared/types/event-shape";
import type { MorphoMarketAtBlockResponse } from "@/lib/sources/chain/morpho-position";

export type MorphoAtBlock =
  | { status: "loading" }
  | { status: "miss" }
  | ({ status: "ok" } & MorphoMarketAtBlockResponse);

const cache = new Map<string, Promise<MorphoMarketAtBlockResponse | null>>();

function load(marketId: string, block: number, chainId: number) {
  const url = `/api/chain/morpho/at-block?market=${marketId}&block=${block}&chain=${chainId}`;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.prev && d?.at ? (d as MorphoMarketAtBlockResponse) : null))
      .catch(() => null);
    p.then((v) => {
      if (v == null) cache.delete(url);
    });
    cache.set(url, p);
  }
  return p;
}

export function useMorphoAtBlock(marketId: string | undefined, block: number | undefined, chainId: number) {
  const [state, setState] = useState<MorphoAtBlock>({ status: "loading" });
  useEffect(() => {
    if (!marketId || block == null) {
      setState({ status: "miss" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    load(marketId, block, chainId).then((v) => {
      if (live) setState(v ? { status: "ok", ...v } : { status: "miss" });
    });
    return () => {
      live = false;
    };
  }, [marketId, block, chainId]);
  return state;
}

// ── figures ─────────────────────────────────────────────────────────────────

/** A token amount on a Morpho event, at the timeline row's precision below
 *  1,000 (the spine's rule): two decimals from 1, four below 1, and a tiny
 *  non-zero amount at three significant digits, never "0". From 1,000 it keeps
 *  two decimals where the row abbreviates ("2.8K"), so a sum of event figures
 *  still adds up. */
export function fmtMorphoAmount(v: number | string | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  if (!Number.isFinite(n) || n === 0) return "0";
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1) return sign + a.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (a >= 0.0001) return sign + String(parseFloat(a.toFixed(4)));
  if (a < 0.000001) return `${sign}<0.000001`;
  return sign + a.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}

/** A part of a sum, at the precision of the sum it belongs to: two decimals
 *  when the total is 1 or more (so 127.80 + 0.14 = 127.94 reads as it adds),
 *  the amount's own precision below. */
export function fmtMorphoPart(n: number | string, total: number | string): string {
  const t = Math.abs(Number(total));
  const v = Number(n);
  if (Number.isFinite(t) && t >= 1 && Number.isFinite(v))
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return fmtMorphoAmount(n);
}

/** a − b on two decimal strings, exact to the longer one's decimals — the
 *  float difference (0.0022647 − 0.00163295 = 0.0006317500000000001) is
 *  rounded back to what the operands can carry. */
export function subDecimal(a: string, b: string): string {
  const places = (s: string) => (s.includes(".") ? s.split(".")[1].length : 0);
  const d = Math.min(18, Math.max(places(a), places(b)));
  return (Number(a) - Number(b)).toFixed(d).replace(/\.?0+$/, "") || "0";
}

/** A health factor: a third decimal below 1.1, rounded down under 1 so a
 *  liquidatable 0.9997 never reads 1.000. */
export function fmtMorphoHf(hf: number): string {
  if (hf >= 100) return ">100";
  if (hf < 1) return (Math.floor(hf * 1000) / 1000).toFixed(3);
  return hf < 1.1 ? hf.toFixed(3) : hf.toFixed(2);
}

/** An oracle price in the loan token: two decimals, grouped. */
export function fmtMorphoPrice(p: number): string {
  if (p >= 1) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

export interface MorphoHealthMove {
  /** The price both sides are valued at: the market oracle at the end of the
   *  block before the event. */
  price: number;
  priceBlock: number;
  lltv: number;
  collBefore: number;
  collAfter: number;
  debtBefore: number;
  debtAfter: number;
  /** Null where there is no debt on that side. */
  hfBefore: number | null;
  hfAfter: number | null;
  ltvBefore: number | null;
  ltvAfter: number | null;
  /** The collateral price, in the loan token, at which the position after the
   *  event would reach the liquidation line; null with no debt. */
  liqPriceAfter: number | null;
  liqPriceBefore: number | null;
}

/** The position's health either side of an event, from the row's own
 *  collateral and debt, both valued at the oracle price going into the block.
 *  One price for both sides, so the move is the event's alone. */
export function morphoHealthMove(ctx: MorphoContext, read: MorphoAtBlock): MorphoHealthMove | null {
  if (read.status !== "ok" || !(read.prev.price > 0)) return null;
  if (ctx.collateralAfter == null || ctx.debtAfter == null || ctx.debtBefore == null) return null;
  const collAfter = Number(ctx.collateralAfter);
  const collDelta =
    ctx.eventType === "supply_collateral" || ctx.eventType === "withdraw_collateral" || ctx.eventType === "liquidation"
      ? Number(ctx.assetsDelta)
      : 0;
  const collBefore = Number(subDecimal(ctx.collateralAfter, String(collDelta)));
  const debtBefore = Number(ctx.debtBefore);
  const debtAfter = Number(ctx.debtAfter);
  if (![collAfter, collBefore, debtBefore, debtAfter].every(Number.isFinite)) return null;
  const price = read.prev.price;
  const lltv = read.lltv;
  // A debt under a millionth of a token is dust: no meaningful factor.
  const hf = (c: number, d: number) => (d > 1e-6 ? (c * price * lltv) / d : null);
  const ltv = (c: number, d: number) => (d > 1e-6 && c > 0 ? d / (c * price) : null);
  const liq = (c: number, d: number) => (d > 1e-6 && c > 0 ? d / (c * lltv) : null);
  return {
    price,
    priceBlock: read.prev.block,
    lltv,
    collBefore,
    collAfter,
    debtBefore,
    debtAfter,
    hfBefore: hf(collBefore, debtBefore),
    hfAfter: hf(collAfter, debtAfter),
    ltvBefore: ltv(collBefore, debtBefore),
    ltvAfter: ltv(collAfter, debtAfter),
    liqPriceBefore: liq(collBefore, debtBefore),
    liqPriceAfter: liq(collAfter, debtAfter),
  };
}

/** The oracle price a liquidation ran on. The index stores the price at the end
 *  of the liquidation's block; when the oracle updated later in that block the
 *  liquidation ran on the one before. Of the two reads, the one that reproduces
 *  seized = repaid × incentive ÷ price is the price the contract used. Where
 *  neither does (a liquidation that also wrote off bad debt seizes all the
 *  collateral, so the relation does not hold) the end-of-block read stands, and
 *  where the read failed the index's figure does, at the event's block. */
export function morphoLiquidationPrice(
  ctx: MorphoContext,
  read: MorphoAtBlock,
  eventBlock: number | undefined,
): { price: number; block: number | undefined; lif: number | null } | null {
  const seized = Math.abs(Number(ctx.assetsDelta));
  const repaid = Number(ctx.loanRepaid);
  if (read.status === "ok" && seized > 0 && repaid > 0) {
    const implied = (repaid * read.lif) / seized;
    const off = (p: number) => Math.abs(p / implied - 1);
    const best = [read.prev, read.at].filter((r) => r.price > 0).sort((a, b) => off(a.price) - off(b.price))[0];
    if (best && off(best.price) < 0.002) return { price: best.price, block: best.block, lif: read.lif };
    if (read.at.price > 0) return { price: read.at.price, block: read.at.block, lif: read.lif };
  }
  const stored = ctx.oraclePriceAtBlock?.loanPerCollateral;
  if (read.status === "loading") return null;
  return stored ? { price: stored, block: eventBlock, lif: read.status === "ok" ? read.lif : null } : null;
}
