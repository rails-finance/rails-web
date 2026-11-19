// Aave V4's dollar figures and their receipts (ui-jobs 743): each amount ×
// its on-chain price as the rows show them, each product to the cent, the
// figure their sum (lib/shared/holder-usd-receipt.ts). A row with no on-chain
// price leaves the figure undrawn and is named instead: there are no partial
// totals. Pure, so scripts/test/aave-v4-usd-receipt.test.mjs asserts it.

import type { Provenance } from "@/components/shared/provenance";
import { holderUsdReceipt, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import {
  aaveV4PeakPriceNote,
  aaveV4PriceNote,
  aaveV4AssetName,
  AAVE_V4_FACE_NOTE,
  type AaveV4Face,
  type AaveV4PriceSource,
} from "./price-notes";

/** An on-chain price and the read behind it. */
export interface AaveV4RowPrice {
  usd: number;
  source?: AaveV4PriceSource | null;
  block?: number | null;
  /** The spoke oracle answering it, where the read names one. */
  oracle?: string | null;
  /** The price's own note where it is not a plain read (a peak's). */
  note?: string;
}

export interface AaveV4UsdRow {
  symbol: string;
  address?: string | null;
  amount: number;
  amountNote: string;
  price: AaveV4RowPrice | null;
  /** The rows' name where the symbol alone does not tell two rows apart. */
  label?: string;
}

export type AaveV4UsdResult =
  | { prov: Provenance; usd: number; missing: [] }
  /** No figure: `missing` names the assets with no on-chain price; `state`
   *  says the oracle read is still loading or did not answer. */
  | { prov: null; usd: null; missing: string[]; state?: "pending" | "failed" };

/** The figure and its receipt; where a held row has no on-chain price, no
 *  figure and the assets to name. Null with nothing held. */
export function aaveV4UsdReceipt(o: {
  what: string;
  rows: readonly AaveV4UsdRow[];
  face: AaveV4Face;
  via: string;
  /** List the rows by value, those under a cent behind the dust control. */
  byValue?: boolean;
  /** The block the amounts stand at, named beside the prices' where they differ. */
  balanceBlock?: number | null;
  caveat?: string;
}): AaveV4UsdResult | null {
  const live = o.rows.filter((r) => r.amount > 0);
  if (live.length === 0) return null;
  const missing = [
    ...new Set(live.filter((r) => !(r.price && r.price.usd > 0)).map((r) => aaveV4AssetName(r.symbol, r.address))),
  ];
  if (missing.length > 0) return { prov: null, usd: null, missing };
  const legs: UsdLeg[] = live.map((r) => {
    const p = r.price as AaveV4RowPrice;
    return {
      token: r.symbol,
      label: r.label,
      amount: r.amount,
      amountNote: r.amountNote,
      price: p.usd,
      priceNote: p.note ?? aaveV4PriceNote(p.source, r.symbol, p.block),
      ...(p.oracle ? { priceContract: { name: "Aave V4 spoke oracle", address: p.oracle } } : {}),
    };
  });
  const blocks = [...new Set(live.map((r) => r.price?.block ?? null))];
  const priceBlock = blocks.length === 1 ? blocks[0] : null;
  // Where the prices stand at several blocks, each row names its own; the
  // balances' block is still named once.
  const both =
    o.balanceBlock == null
      ? ""
      : priceBlock == null && blocks.length > 1
        ? `The balances stand at block ${o.balanceBlock.toLocaleString("en-US")}.`
        : priceBlock != null && o.balanceBlock !== priceBlock
          ? `The balances stand at block ${o.balanceBlock.toLocaleString("en-US")} and the prices at block ${priceBlock.toLocaleString("en-US")}.`
          : "";
  const caveat = [o.caveat, both, AAVE_V4_FACE_NOTE[o.face]].filter(Boolean).join(" ");
  const { prov, usd } = holderUsdReceipt({
    what: o.what,
    legs,
    block: priceBlock,
    via: o.via,
    caveat: caveat || undefined,
    byValue: o.byValue,
    blocksPerRow: blocks.length > 1,
  });
  return { prov, usd, missing: [] };
}

/** A peak's receipt: the amounts held at it, each at its reserve's last
 *  event's oracle price, both blocks named (ui-jobs 743). */
export function aaveV4PeakReceipt(
  what: string,
  peak: { block: number; legs: readonly { symbol: string; amount: number; price: number; priceBlock: number }[] },
): AaveV4UsdResult | null {
  return aaveV4UsdReceipt({
    what,
    rows: peak.legs.map((l) => ({
      symbol: l.symbol,
      amount: l.amount,
      amountNote: `the position's balance at block ${peak.block.toLocaleString("en-US")}, from its events`,
      price: {
        usd: l.price,
        block: l.priceBlock,
        note: `the spoke oracle's getReservePrice(${l.symbol}) stored for its event: ${aaveV4PeakPriceNote(l.priceBlock, peak.block)}`,
      },
    })),
    face: "compact",
    via: "the position's events · each reserve's balance × its last event's stored oracle price · summed, at the highest instant",
  });
}

const FLOW_WORD = {
  withdrawn: "withdrawn",
  repaid: "repaid",
  liquidatedDebt: "repaid by liquidation",
  liquidatedCollateral: "seized by liquidation",
} as const;

/** An outflow figure's receipt: each event's amount at that event's on-chain
 *  price, each row naming its block, the figure their sum (ui-jobs 743). */
export function aaveV4FlowReceipt(
  what: string,
  assets: readonly {
    symbol: string;
    legs: readonly { flow: keyof typeof FLOW_WORD; amount: number; price: number; source: string; block: number }[];
  }[],
): AaveV4UsdResult | null {
  return aaveV4UsdReceipt({
    what,
    rows: assets.flatMap((a) =>
      a.legs.map((l) => ({
        symbol: a.symbol,
        label: `${a.symbol} ${FLOW_WORD[l.flow]} at block ${l.block.toLocaleString("en-US")}`,
        amount: l.amount,
        amountNote: `the amount the position's event at block ${l.block.toLocaleString("en-US")} moved`,
        price: { usd: l.price, source: l.source as AaveV4PriceSource, block: l.block },
      })),
    ),
    face: "compact",
    via: "the position's events · each outflow × the on-chain price stored for its block · summed",
  });
}

/** A peak as the card draws it: the receipt's figure, or no figure and the
 *  reserves no instant could be priced without; null where the side never
 *  held anything (ui-jobs 743). */
export function aaveV4PeakState(
  what: string,
  peak: Parameters<typeof aaveV4PeakReceipt>[1] | undefined,
  unpriced: readonly string[] | undefined,
): AaveV4UsdResult | null {
  if (peak) return aaveV4PeakReceipt(what, peak);
  return unpriced && unpriced.length > 0 ? { prov: null, usd: null, missing: [...unpriced] } : null;
}
