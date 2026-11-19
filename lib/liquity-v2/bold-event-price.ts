// BOLD's market price at a Liquity V2 event (ui-jobs 757): the Curve BOLD/USDC
// pool's last_price(0) at the event's block, or the newest stored read before
// it, as the trove timeline route serves it (`context.data.boldPrice`, rails-
// server mig 497). Debt stays at its $1 face (ui-jobs 297). A row with no
// boldPrice states no line.
//
// Dependency-free apart from relative imports, so the unit test loads it.

import type { EventPriceChip } from "../../components/shared/event-price-row";
import type { Provenance } from "../../components/shared/provenance";
import type { DebtTokenPrice } from "../shared/types/event-shape";
import { priceText } from "../shared/shown-usd";
import { BOLD_USDC_POOL_NAME } from "./bold-price";

/** The line in its three parts: the words before the price, the price, and
 *  the block after it. */
export interface BoldEventLine {
  lead: string;
  price: string;
  rest: string;
  text: string;
}

const block = (n: number) => n.toLocaleString("en-US");

/** A read older than the event: the event's block is set and differs. */
const olderRead = (bp: DebtTokenPrice, eventBlock?: number) =>
  eventBlock != null && eventBlock > 0 && eventBlock !== bp.block;

/** "BOLD at $0.998842 at this block", or "BOLD at $0.998842 at block N" where
 *  the read is from an earlier block than the event's (ui-jobs 743: a read
 *  from another block names it). Null where the row carries no usable price. */
export function boldEventLine(bp: DebtTokenPrice | undefined | null, eventBlock?: number): BoldEventLine | null {
  if (!bp || !(bp.usd > 0) || !Number.isFinite(bp.usd) || !(bp.block > 0)) return null;
  const lead = "BOLD at";
  const price = priceText(bp.usd);
  const rest = olderRead(bp, eventBlock) ? `at block ${block(bp.block)}` : "at this block";
  return { lead, price, rest, text: `${lead} ${price} ${rest}` };
}

/** The line's receipt: the pool, the call, the raw and the block. */
export function boldEventProv(bp: DebtTokenPrice, eventBlock?: number): Provenance | undefined {
  const line = boldEventLine(bp, eventBlock);
  if (!line) return undefined;
  const ema =
    bp.emaUsd != null && bp.emaUsd > 0 ? `The pool's EMA, price_oracle(0), put BOLD at ${priceText(bp.emaUsd)}. ` : "";
  return {
    kind: "chain-derived",
    pclass: "state",
    summary: `${line.text}, from the Curve BOLD/USDC pool's last_price(0), with ${bp.quoteSymbol} at $1. ${ema}Debt stays at its $1 face.`,
    formula: "1 ÷ (last_price(0) ÷ 10¹⁸)",
    inputs: [
      {
        label: "last_price(0)",
        value: bp.lastPriceRaw,
        kind: "chain",
        pclass: "state",
        note: `read at block ${block(bp.block)}`,
      },
      ...(bp.emaRaw != null
        ? [{ label: "price_oracle(0)", value: bp.emaRaw, kind: "chain" as const, pclass: "state" as const }]
        : []),
    ],
    contract: { name: BOLD_USDC_POOL_NAME, address: bp.pool },
    source: { block: bp.block },
    verify: {
      kind: "recompute",
      text: `To check: ask any Ethereum archive node for the pool's last_price(0) at block ${block(bp.block)}, and divide 10¹⁸ by it.`,
    },
    via: `GET /api/trove/:collateralType/:troveId/timeline · boldPrice · last_price(0) @ ${block(bp.block)}`,
  };
}

/** BOLD's chip on the price row, beside the collateral's: the stored price at
 *  its block, and the page's head read once the row's clock press stands at
 *  the latest block (ThenTodayChip), with the line's receipt. None where the
 *  row carries no boldPrice. */
export function boldPriceChip(
  bp: DebtTokenPrice | undefined | null,
  eventBlock: number | undefined,
  title?: string,
): EventPriceChip | null {
  if (!bp || !boldEventLine(bp, eventBlock)) return null;
  return {
    symbol: "BOLD",
    usd: bp.usd,
    format: priceText,
    info: boldEventProv(bp, eventBlock),
    value: String(bp.usd),
    title,
    figure: "bold-price",
  };
}
