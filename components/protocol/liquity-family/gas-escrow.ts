// The gas compensation escrow of Liquity V2 and its forks (rails-ops
// TO-DO-ui-jobs 363 and 366; Polaris's escrow, components/protocol/polaris/,
// is the template): the fixed amount of WETH every open sends to the branch's
// GasPool beside the collateral, which the close returns and a liquidation
// pays to the liquidator. It is neither collateral nor in the collateral
// ratio. The card draws it as a header leg and a spine row on the open and
// the close, and the sheet as a panel of its own between Collateral and Debt
// on every holder event from the open to the close or the liquidation.
//
// Each deployment states its constant (`LiquityGasEscrow`, lib/shared/
// liquity-gas-escrow.ts, with the receipt) in its own
// lib/<family>/event-provenance.ts and its words in its own vocabulary; this
// module builds the panel from them.

import type { Provenance } from "@/components/shared/provenance";
import type { GasEscrowMove, LiquityGasEscrow } from "@/lib/shared/liquity-gas-escrow";
import { SHEET_NO_USD, SHEET_WORDS, sheetUsd, type SheetRow, type SheetSide } from "@/components/shared/event-sheet";

/** The words the panel reads, in the family's register. */
export interface GasEscrowWords {
  name: string;
  tip: string;
  sent: string;
  returned: string;
  paid: string;
  tipSent: string;
  tipReturned: string;
  tipPaid: string;
  tipLast: string;
  tipMarket: string;
  tipBefore: string;
  tipTotal: string;
  /** The total's read-more where the page carries no price for the token. */
  tipTotalUnpriced: string;
}

/** The panel's prices: this block's and the previous event's, for the token
 *  the escrow is paid in, where the page carries them. */
export interface GasEscrowPrices {
  now: number | null;
  prev: number | null;
}

const usdProv = (e: LiquityGasEscrow, what: string, price: number, when: string): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `${what}, in US dollars — ${e.label} times the ${e.symbol} price at ${when}.`,
  formula: "amount × price",
  inputs: [
    { label: "amount", value: e.label, kind: "chain", pclass: "state" },
    { label: `${e.symbol} price at ${when}`, value: sheetUsd(price), kind: "chain-derived", pclass: "oracle" },
  ],
});

/** The escrow's panel on the sheet: `id: "escrow"`, on the Collateral side and
 *  outside its total. An event that does not move it states it untouched; the
 *  carry layer states it at the previous event and this one where the page
 *  carries a price for the token. */
export function gasEscrowSide(args: {
  escrow: LiquityGasEscrow;
  move: GasEscrowMove;
  words: GasEscrowWords;
  prices: GasEscrowPrices;
  /** The receipt for the escrow at this event (gasEscrowProv). */
  info: Provenance;
  /** The receipt for the escrow held before it ("held"). */
  held: Provenance;
  /** The amount as the sheet prints it. */
  fmt: (n: number) => string;
}): SheetSide {
  const { escrow: e, move, words: W, prices, info, held, fmt } = args;
  const amt = e.amount;
  const now = prices.now != null && prices.now > 0 ? prices.now : null;
  const prev = prices.prev != null && prices.prev > 0 ? prices.prev : null;
  const fig = (n: number, i: Provenance = info) => ({
    text: n < 0 ? `−${fmt(-n)}` : fmt(n),
    symbol: e.symbol,
    address: e.address,
    info: i,
    value: String(Math.abs(n)),
  });

  // What the Trove held before this event: nothing before the open.
  const carry: SheetSide["carry"] = [];
  // A page with no price for the token states the amount on the total alone:
  // the layer would repeat it with no dollar figure.
  if (move !== "sent" && (now != null || prev != null)) {
    carry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: fig(amt, held),
      usd:
        prev != null
          ? { text: sheetUsd(amt * prev), info: usdProv(e, "The escrow after the previous event", prev, "that event") }
          : undefined,
      tip: W.tipLast,
    });
    if (now != null && prev != null && Math.round(amt * (now - prev) * 100) !== 0)
      carry.push({
        key: "market",
        label: SHEET_WORDS.market,
        usd: {
          text: sheetUsd(amt * (now - prev), true),
          info: {
            kind: "chain-derived",
            pclass: "oracle",
            summary: `Market move on the escrow since the last event — ${e.label} valued at this event's ${e.symbol} price less the previous event's. No token moved.`,
            formula: "amount × (price now − price at the previous event)",
            inputs: [
              { label: "amount", value: e.label, kind: "chain", pclass: "state" },
              { label: `${e.symbol} price at the previous event`, value: sheetUsd(prev), kind: "chain-derived" },
              { label: `${e.symbol} price at this event`, value: sheetUsd(now), kind: "chain-derived" },
            ],
          },
        },
        tip: W.tipMarket,
      });
  }

  const moved = move === "sent" ? amt : move === "held" ? 0 : -amt;
  const label = move === "sent" ? W.sent : move === "returned" ? W.returned : W.paid;
  const rows: SheetRow[] =
    move === "held"
      ? []
      : [
          {
            key: `escrow-${move}`,
            label,
            amount: fig(moved),
            usd: now != null ? { text: sheetUsd(moved * now), info: usdProv(e, label, now, "this block") } : undefined,
            tip: move === "sent" ? W.tipSent : move === "returned" ? W.tipReturned : W.tipPaid,
          },
        ];

  const after = move === "sent" || move === "held" ? amt : 0;
  return {
    side: "collateral",
    id: "escrow",
    name: W.name,
    tip: W.tip,
    icons: [e.symbol],
    carry,
    before:
      carry.length > 0
        ? {
            key: "before",
            label: SHEET_WORDS.before,
            amount: fig(amt, held),
            usd:
              now != null
                ? {
                    text: sheetUsd(amt * now),
                    info: usdProv(e, "The escrow just before this event", now, "this block"),
                  }
                : undefined,
            tip: W.tipBefore,
          }
        : undefined,
    rows,
    total:
      now == null
        ? SHEET_NO_USD
        : after === 0
          ? { text: "$0", info }
          : { text: sheetUsd(after * now), info: usdProv(e, "The escrow after this event", now, "this block") },
    totalAmount: { ...fig(after), value: String(after) },
    totalTip: now != null ? W.tipTotal : W.tipTotalUnpriced,
  };
}
