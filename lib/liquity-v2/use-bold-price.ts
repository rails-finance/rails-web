"use client";

// BOLD's row in a Liquity V2 Prices chip (ui-jobs 746): the Curve BOLD/USDC
// pool's price at head, or at a closed Trove's closing block. While the read
// is out the row names BOLD with no figure; where it failed, or the block
// predates the pool, the chip says the price is unavailable and why. It never
// stands in $1. A head read is retried every 30 s; after a failure the last
// good read stands until its block is BOLD_PRICE_MAX_AGE_S old.

import { useEffect, useState } from "react";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import {
  BOLD_PRICE_MAX_AGE_S,
  BOLD_PRICE_NO_POOL,
  BOLD_PRICE_UNAVAILABLE,
  BOLD_USDC_POOL_FROM_BLOCK,
  boldPriceProv,
  boldUsdFromCurve,
  type BoldPriceRead,
} from "./bold-price";

export type BoldPriceState =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "no-pool" }
  | { state: "ok"; read: BoldPriceRead; price: number };

/** The pool's price at head, refreshed every 30 s, or at `block` (read once).
 *  `block` null holds the read back (a closed Trove's closing row not yet
 *  known, or a page with no use for the head price). */
export function useBoldPrice(block?: number | null): BoldPriceState {
  const [s, setS] = useState<BoldPriceState>({ state: "loading" });
  useEffect(() => {
    if (block === null) return;
    if (block != null && block < BOLD_USDC_POOL_FROM_BLOCK) {
      setS({ state: "no-pool" });
      return;
    }
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/chain/liquity-v2/bold-price${block != null ? `?block=${block}` : ""}`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          if (live) setS({ state: "no-pool" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const read = (await res.json()) as BoldPriceRead;
        const price = boldUsdFromCurve(read.lastPriceRaw);
        if (!live) return;
        if (price == null) throw new Error("no price");
        setS({ state: "ok", read, price });
      } catch {
        if (!live) return;
        const now = Date.now() / 1000;
        setS((prev) =>
          prev.state === "ok" && block == null && now - prev.read.blockTimestamp <= BOLD_PRICE_MAX_AGE_S
            ? prev
            : { state: "failed" },
        );
      }
    };
    void load();
    const timer = block == null ? setInterval(load, 30_000) : undefined;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [block]);
  return s;
}

/** The block a closed Trove's closing prices stand at: its newest row's, as
 *  closingPricesAt picks it. Null for an open Trove or one whose rows are not
 *  in, which holds useBoldPrice's read back. */
export function closedAtBlock(status: string | undefined, rows: readonly { blockNumber: number }[]): number | null {
  if (status == null || status === "open" || rows.length === 0) return null;
  return rows.reduce((m, r) => Math.max(m, r.blockNumber), 0);
}

/** BOLD's row for the chip: priced with its receipt, or named with no figure. */
export function boldStripAsset(s: BoldPriceState): LatestPriceAsset {
  if (s.state !== "ok") return { symbol: "BOLD", label: boldPriceReason(s) ?? "BOLD" };
  return {
    symbol: "BOLD",
    price: s.price,
    label: `BOLD at the Curve BOLD/USDC pool, block ${s.read.blockNumber.toLocaleString("en-US")}`,
    info: boldPriceProv(s.read),
  };
}

/** The chip's reason line where BOLD has no price. */
export function boldPriceReason(s: BoldPriceState): string | undefined {
  return s.state === "failed" ? BOLD_PRICE_UNAVAILABLE : s.state === "no-pool" ? BOLD_PRICE_NO_POOL : undefined;
}
