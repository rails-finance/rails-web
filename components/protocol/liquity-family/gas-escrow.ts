// The gas compensation escrow of Liquity V2 and its forks (rails-ops
// TO-DO-ui-jobs 363, 366, 388): the fixed amount of WETH every open sends to
// the branch's GasPool beside the collateral, which the close returns and a
// liquidation pays to the liquidator. It is neither collateral nor in the
// collateral ratio. The card draws it as a header leg and a spine row on the
// open and the close, and the sheet as a footnote under Risk and Limits on
// every holder event from the open to the close or the liquidation.
//
// Each deployment states its constant (`LiquityGasEscrow`, lib/shared/
// liquity-gas-escrow.ts, with the receipt and the footnote's words) in its own
// lib/<family>/event-provenance.ts and its read-more in its own vocabulary;
// this module builds the footnote from them.

import type { Provenance } from "@/components/shared/provenance";
import type { SheetFootnote } from "@/components/shared/event-sheet";
import { sheetUsd } from "@/components/shared/event-sheet";
import { gasEscrowFootnote, type GasEscrowMove, type LiquityGasEscrow } from "@/lib/shared/liquity-gas-escrow";

/** The escrow's footnote on the sheet: its amount, in dollars at this block's
 *  price where the page carries one for the token, and what the event did
 *  with it. */
export function gasEscrowNote(args: {
  escrow: LiquityGasEscrow;
  move: GasEscrowMove;
  /** The footnote's read-more, in the family's register. */
  tip: string;
  /** This block's price for the token the escrow is paid in, where the page
   *  carries it. */
  price: number | null;
  /** The receipt for the escrow at this event (gasEscrowProv). */
  info: Provenance;
  /** The amount as the sheet prints it. */
  fmt: (n: number) => string;
}): SheetFootnote {
  const { escrow: e, move, tip, info, fmt } = args;
  const price = args.price != null && args.price > 0 ? args.price : null;
  return gasEscrowFootnote({
    move,
    amount: e.amount,
    text: fmt(e.amount),
    symbol: e.symbol,
    info,
    usd:
      price != null
        ? {
            text: sheetUsd(e.amount * price),
            info: {
              kind: "chain-derived",
              pclass: "oracle",
              summary: `The gas compensation escrow in US dollars — ${e.label} times the ${e.symbol} price at this block.`,
              formula: "amount × price",
              inputs: [
                { label: "amount", value: e.label, kind: "chain", pclass: "state" },
                {
                  label: `${e.symbol} price at this block`,
                  value: sheetUsd(price),
                  kind: "chain-derived",
                  pclass: "oracle",
                },
              ],
            },
          }
        : undefined,
    tip,
  });
}
