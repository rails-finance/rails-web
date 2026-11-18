// BOLD's dollar price on Liquity V2 pages (ui-jobs 746): the Curve
// Stableswap-NG BOLD/USDC pool, coins(0) BOLD and coins(1) USDC, read at a
// pinned head block (lib/sources/chain/liquity-v2-bold-price.ts, served at
// /api/chain/liquity-v2/bold-price).
//
// last_price(0) is coins(1) priced in coins(0) at the pool's last trade, 1e18
// scaled: BOLD per USDC. BOLD in USD is its inverse at USDC $1. At block
// 26,444,554 it read 1.001670796804945482 (BOLD $0.998332), with
// get_dy(0, 1, 1e18) paying 0.997922 USDC for one BOLD after the pool's fee.
// price_oracle(0), the pool's EMA of that price (about 866 s), goes beside it
// in the receipt. Debt stays at its $1 face (ui-jobs 741): this price is the
// Prices chip's, whose figure takes offPar's caution orange beyond DEPEG_BAND
// (components/shared/latest-prices.tsx), and the cards' "today" USD figures
// read it from there.
//
// Dependency-free apart from relative imports, so the unit test loads it.

import type { Provenance } from "../../components/shared/provenance";
import { priceText } from "../shared/shown-usd";
import { liquityV2BoldPriceNote } from "./price-notes";

export const BOLD_USDC_POOL = "0xefc6516323fbd28e80b85a497b65a86243a54b3e";
export const BOLD_USDC_POOL_NAME = "Curve BOLD/USDC (Stableswap-NG)";
/** The first block with the pool's code; a read before it has no pool. */
export const BOLD_USDC_POOL_FROM_BLOCK = 22_512_006;

/** The pool's two prices at one block, as the route returns them. */
export interface BoldPriceRead {
  blockNumber: number;
  /** Unix seconds. */
  blockTimestamp: number;
  /** last_price(0): BOLD per USDC at the last trade, 1e18 scaled. */
  lastPriceRaw: string;
  /** price_oracle(0), the EMA, 1e18 scaled; null where that call failed. */
  emaRaw: string | null;
  /** get_dy(0, 1, 1e18): the USDC (6 decimals) one BOLD swaps for now. */
  dyRaw: string | null;
}

/** BOLD in USD from a BOLD-per-USDC raw, at USDC $1. Null for a raw that is
 *  absent, zero or not an integer. */
export function boldUsdFromCurve(raw: string | null | undefined): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const perUsdc = Number(raw) / 1e18;
  return perUsdc > 0 && Number.isFinite(perUsdc) ? 1 / perUsdc : null;
}

const POOL = { name: BOLD_USDC_POOL_NAME, address: BOLD_USDC_POOL };

/** The chip's receipt: the pool, the call and the block. */
export function boldPriceProv(read: BoldPriceRead): Provenance | undefined {
  const price = boldUsdFromCurve(read.lastPriceRaw);
  if (price == null) return undefined;
  const ema = boldUsdFromCurve(read.emaRaw);
  const block = read.blockNumber.toLocaleString("en-US");
  return {
    kind: "chain-derived",
    pclass: "state",
    summary:
      `BOLD in USD — 1 ÷ the ${BOLD_USDC_POOL_NAME} pool's last_price(0) at block ${block}, ` +
      `the BOLD one USDC bought at the pool's last trade, with USDC at $1: ${priceText(price)}.` +
      (ema != null ? ` The pool's EMA, price_oracle(0), puts BOLD at ${priceText(ema)}.` : ""),
    formula: "1 ÷ (last_price(0) ÷ 10¹⁸)",
    inputs: [
      {
        label: "last_price(0)",
        value: read.lastPriceRaw,
        kind: "chain",
        pclass: "state",
        note: liquityV2BoldPriceNote(read.blockNumber),
      },
      ...(read.emaRaw != null
        ? [{ label: "price_oracle(0)", value: read.emaRaw, kind: "chain" as const, pclass: "state" as const }]
        : []),
    ],
    contract: POOL,
    source: { block: read.blockNumber },
    verify: {
      kind: "recompute",
      text: `To check: ask any Ethereum archive node for the pool's last_price(0) at block ${block}, and divide 10¹⁸ by it.`,
    },
    via: `GET /api/chain/liquity-v2/bold-price · last_price(0) @ ${block}`,
  };
}

/** The row's words where the read failed: the chip names BOLD with no figure. */
export const BOLD_PRICE_UNAVAILABLE = "BOLD's price is unavailable: the read of the Curve BOLD/USDC pool failed.";

/** Where the block predates the pool. */
export const BOLD_PRICE_NO_POOL = "BOLD's price is unavailable: the Curve BOLD/USDC pool did not exist at this block.";

/** How old a head read may grow, after later reads fail, before the chip
 *  stops showing it. */
export const BOLD_PRICE_MAX_AGE_S = 120;
