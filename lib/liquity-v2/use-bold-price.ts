"use client";

// BOLD's row in a Liquity V2 Prices chip (ui-jobs 746): the Curve BOLD/USDC
// pool's price at head, or at a closed Trove's closing block. While the read
// is out the row names BOLD with no figure; where it failed the chip says the
// price is unavailable (BOLD_PRICE_UNAVAILABLE). It never stands in $1.

import { useEffect, useState } from "react";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { BOLD_PRICE_UNAVAILABLE, boldPriceProv, boldUsdFromCurve, type BoldPriceRead } from "./bold-price";

export type BoldPriceState =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ok"; read: BoldPriceRead; price: number };

/** The pool's price at head, refreshed every 30 s, or at `block` (read once).
 *  `block` null holds the read back (a closed Trove's closing row not yet
 *  known). */
export function useBoldPrice(block?: number | null): BoldPriceState {
  const [s, setS] = useState<BoldPriceState>({ state: "loading" });
  useEffect(() => {
    if (block === null) return;
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/chain/liquity-v2/bold-price${block != null ? `?block=${block}` : ""}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const read = (await res.json()) as BoldPriceRead;
        const price = boldUsdFromCurve(read.lastPriceRaw);
        if (!live) return;
        setS(price == null ? { state: "failed" } : { state: "ok", read, price });
      } catch {
        if (live) setS((prev) => (prev.state === "ok" ? prev : { state: "failed" }));
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
  if (s.state !== "ok") return { symbol: "BOLD", label: s.state === "failed" ? BOLD_PRICE_UNAVAILABLE : "BOLD" };
  return {
    symbol: "BOLD",
    price: s.price,
    label: `BOLD at the Curve BOLD/USDC pool, block ${s.read.blockNumber.toLocaleString("en-US")}`,
    info: boldPriceProv(s.read),
  };
}

/** The chip's reason line where BOLD's read failed. */
export const boldPriceReason = (s: BoldPriceState): string | undefined =>
  s.state === "failed" ? BOLD_PRICE_UNAVAILABLE : undefined;
