// BOLD's market price at a Liquity V2 event (ui-jobs 757): the Curve BOLD/USDC
// pool's last_price(0) at the event's block, or the newest stored read before
// it, as the trove timeline route serves it (`context.data.boldPrice`, rails-
// server mig 497). A stated fact: debt stays at its $1 face (ui-jobs 297) and
// nothing is valued at this price. A row with no boldPrice states no line.
//
// Dependency-free apart from relative imports, so the unit test loads it.

import type { Provenance } from "../../components/shared/provenance";
import type { DebtTokenPrice } from "../shared/types/event-shape";
import { priceText } from "../shared/shown-usd";
import { BOLD_USDC_POOL_NAME } from "./bold-price";

/** The line in its three parts: the words before the price, the price, and
 *  the pool, the call and the block after it. */
export interface BoldEventLine {
  lead: string;
  price: string;
  rest: string;
  text: string;
}

const block = (n: number) => n.toLocaleString("en-US");
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** "BOLD at $0.998842 on the Curve BOLD/USDC pool (0xefc6…4b3e),
 *  last_price(0) at block N", with "; this event is at block M" where the read
 *  is older than the event. Null where the row carries no usable price. */
export function boldEventLine(bp: DebtTokenPrice | undefined | null, eventBlock?: number): BoldEventLine | null {
  if (!bp || !(bp.usd > 0) || !Number.isFinite(bp.usd) || !(bp.block > 0)) return null;
  const lead = "BOLD at";
  const price = priceText(bp.usd);
  const older = eventBlock != null && eventBlock > 0 && eventBlock !== bp.block;
  const rest =
    `on the Curve BOLD/USDC pool (${shortAddr(bp.pool)}), last_price(0) at block ${block(bp.block)}` +
    (older ? `; this event is at block ${block(eventBlock)}` : "");
  return { lead, price, rest, text: `${lead} ${price} ${rest}` };
}

/** The line's receipt: the pool, the call, the raw and the block. */
export function boldEventProv(bp: DebtTokenPrice, eventBlock?: number): Provenance | undefined {
  const line = boldEventLine(bp, eventBlock);
  if (!line) return undefined;
  const ema =
    bp.emaUsd != null && bp.emaUsd > 0 ? ` The pool's EMA, price_oracle(0), put BOLD at ${priceText(bp.emaUsd)}.` : "";
  return {
    kind: "chain-derived",
    pclass: "state",
    summary:
      `${line.text}. 1 ÷ the pool's last_price(0), the BOLD one ${bp.quoteSymbol} bought at the pool's last trade, with ${bp.quoteSymbol} at $1.` +
      ema +
      " Debt stays at its $1 face; this price values nothing on the card.",
    formula: "1 ÷ (last_price(0) ÷ 10¹⁸)",
    inputs: [
      {
        label: "last_price(0)",
        value: bp.lastPriceRaw,
        kind: "chain",
        pclass: "state",
        note: `block ${block(bp.block)}`,
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
    via: `GET /api/liquity-v2/troves/:id/timeline · boldPrice · last_price(0) @ ${block(bp.block)}`,
  };
}
