// A Polaris pETH account row's T2 as a balance sheet (rails-ops
// reference/app-anatomy.md, T2; ui-jobs 865), as the deposit and loan sheets
// fill it (polaris-sp-loan-sheet.ts): one side per token the address holds
// or moved (pETH, fpETH, vpETH), each "Before this event", the row's moves in
// that token, and the total after it. A move that paid ETH or received it
// says so beside it. No side states a dollar (SHEET_NO_USD). A "To date"
// panel carries the account's running ETH in, ETH out and curve fees through
// the row, each swapping to what this row added.
//
// The route states `balances` and `to_date` only when its status is "ok"; a
// row without them, and an LP-only row, keep their cells. A not-decoded vpETH
// move with Morpho Blue draws on the vpETH side (the route's vpETH delta and
// balances carry it since server 66fc0884); the To date panel's ETH figures
// do not count it.

import {
  SHEET_NO_USD,
  SHEET_WORDS,
  type EventSheet,
  type SheetRow,
  type SheetSide,
  type SheetStat,
} from "@/components/shared/event-sheet";
import type { Provenance } from "@/components/shared/provenance";
import { FPETH, PETH, VPETH } from "@/lib/polaris/asset-catalog";
import { big, exactUnits, pethAmountText, pethKindLabel, ZERO } from "@/lib/polaris/peth-ledger";
import { pethLineProv, pethRowEthProv } from "@/lib/polaris/peth-provenance";
import type { PethLedgerRow } from "@/lib/sources/api/polaris-peth";

const TOKENS = [
  { key: "peth", meta: PETH },
  { key: "fpeth", meta: FPETH },
  { key: "vpeth", meta: VPETH },
] as const;

const WORDS = {
  ethPaid: (eth: string) => `· ${eth} ETH paid`,
  ethReceived: (eth: string) => `· ${eth} ETH received`,
  toDate: "To date",
  toDateTip: "This address's running ETH figures and curve fees through this transaction.",
  ethIn: "ETH in",
  ethOut: "ETH out",
  fees: "Curve fees paid",
};

const TIPS = {
  side: (symbol: string) => `This address's ${symbol}: what this transaction moved, then the balance after it.`,
  before: (symbol: string) => `The ${symbol} this address held just before this transaction.`,
  after: (symbol: string) => `The ${symbol} this address held just after this transaction.`,
  ethIn: "The ETH and WETH this address paid for pETH and fpETH, through this transaction.",
  ethOut: "The ETH and WETH that reached this address, through this transaction.",
  fees: "The fees the bonding curve took on this address's trades, through this transaction, in pETH.",
};

const VIA = "GET /api/polaris/peth/<address>";

const balanceProv = (row: PethLedgerRow, symbol: string, when: "before" | "after"): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${symbol} ${when === "before" ? "before" : "after"} this event — the ${symbol} this address held just ${when} this transaction, from its stored transfers.`,
  formula: `Σ ${symbol} transfers in − out, ${when === "before" ? "before" : "through"} this transaction`,
  via: `${VIA} · balances`,
  source: { block: row.block_number, txHash: row.tx_hash },
});

const toDateProv = (row: PethLedgerRow, what: "ethIn" | "ethOut" | "fees"): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary:
    what === "ethIn"
      ? "ETH in to date — the ETH and WETH this address paid for pETH and fpETH, through this transaction."
      : what === "ethOut"
        ? "ETH out to date — the ETH and WETH that reached this address, through this transaction."
        : "Curve fees to date — the fees the bonding curve took on this address's trades, through this transaction, in pETH.",
  formula:
    what === "fees" ? "Σ feeAmount through this row" : `Σ ${what === "ethIn" ? "ETH in" : "ETH out"} through this row`,
  via: `${VIA} · to_date`,
  source: { block: row.block_number, txHash: row.tx_hash },
});

/** A balance keeps its sign: a negative one (a history the index holds with
 *  gaps) reads as negative, never as its magnitude. */
const balanceText = (raw: bigint) => `${raw < ZERO ? "−" : ""}${pethAmountText(raw)}`;
const signed = (raw: bigint) => `${raw < ZERO ? "−" : "+"}${pethAmountText(raw)}`;

/** The row's sheet, or undefined where it keeps its cells. */
export function polarisPethSheet(row: PethLedgerRow): EventSheet | undefined {
  if (!row.balances) return undefined;
  const ethIn = big(row.eth_in_raw);
  const ethOut = big(row.eth_out_raw);
  let inNoted = false;
  let outNoted = false;

  const sides: SheetSide[] = [];
  for (const { key, meta } of TOKENS) {
    const bal = row.balances[key];
    if (!bal) continue;
    const before = big(bal.before_raw);
    const after = big(bal.after_raw);
    const lines = row.lines.filter((l) => l.token === key && big(l.amount_raw) > ZERO);
    if (before === ZERO && after === ZERO && lines.length === 0) continue;
    const fig = (raw: bigint, text: string, info: Provenance) => ({
      text,
      symbol: meta.symbol,
      address: meta.address,
      info,
      value: exactUnits(raw),
    });
    const rows: SheetRow[] = lines.map((l, i) => {
      const amt = big(l.amount_raw);
      const raw = l.direction === "in" ? amt : -amt;
      // The ETH the transaction paid or received, beside its first move in.
      let note: string | undefined;
      if (l.direction === "in" && ethIn > ZERO && !inNoted) {
        note = WORDS.ethPaid(pethAmountText(ethIn));
        inNoted = true;
      } else if (l.direction === "out" && ethOut > ZERO && !outNoted) {
        note = WORDS.ethReceived(pethAmountText(ethOut));
        outNoted = true;
      }
      return {
        key: `${l.rule}-${i}`,
        label: pethKindLabel(l.rule),
        ...(note ? { note } : {}),
        amount: fig(raw, signed(raw), pethLineProv(row, l, meta.symbol)),
      };
    });
    sides.push({
      side: "collateral",
      id: key,
      name: meta.symbol,
      tip: TIPS.side(meta.symbol),
      icons: [meta.symbol],
      iconAddresses: { [meta.symbol]: meta.address },
      carry: [],
      before: {
        key: "before",
        label: SHEET_WORDS.before,
        amount: fig(before, balanceText(before), balanceProv(row, meta.symbol, "before")),
        tip: TIPS.before(meta.symbol),
      },
      rows,
      total: SHEET_NO_USD,
      totalAmount: fig(after, balanceText(after), balanceProv(row, meta.symbol, "after")),
      totalTip: TIPS.after(meta.symbol),
    });
  }
  if (sides.length === 0) return undefined;

  const panels: EventSheet["panels"] = [];
  const t = row.to_date;
  if (t) {
    const stat = (
      k: "ethIn" | "ethOut" | "fees",
      label: string,
      total: string,
      thisRow: string,
      symbol: string,
      tip: string,
    ): SheetStat => {
      const v = big(total);
      const d = big(thisRow);
      return {
        key: k,
        label,
        tip,
        value: { text: `${pethAmountText(v)} ${symbol}`, info: toDateProv(row, k), value: exactUnits(v) },
        change:
          d > ZERO
            ? {
                text: `+${pethAmountText(d)} ${symbol}`,
                info: k === "fees" ? pethRowEthProv(row, "fee") : pethRowEthProv(row, k),
                value: exactUnits(d),
              }
            : null,
      };
    };
    panels.push({
      panel: "to-date",
      name: WORDS.toDate,
      tip: WORDS.toDateTip,
      rows: [
        stat("ethIn", WORDS.ethIn, t.eth_in_raw, row.eth_in_raw, "ETH", TIPS.ethIn),
        stat("ethOut", WORDS.ethOut, t.eth_out_raw, row.eth_out_raw, "ETH", TIPS.ethOut),
        stat("fees", WORDS.fees, t.curve_fees_raw, row.curve_fee_raw, PETH.symbol, TIPS.fees),
      ],
    });
  }
  return { sides, panels };
}
