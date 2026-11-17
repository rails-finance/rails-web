// Receipts for a CoW swap's surplus and fee lines on the Aave V3 and V4 swap
// cards (lib/cow/surplus.ts). Rules: rails-ops
// standards/provenance-receipts-grammar.md §3–§5. The order's signed limits and
// the clearing prices are read from the settlement transaction's input: kind
// "chain" with the transaction-input note until the "input" class exists.
// Surplus is cited to docs.cow.fi Definitions and CoW Explorer's "Order
// surplus"; fees to docs.cow.fi Fees.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import { COW_TERMS } from "@/lib/cow/terms";
import { COW_CHAIN_ID, GPV2_SETTLEMENT } from "@/lib/cow/trade";
import { COW_FEE_LABEL, cowSurplusLabel, shiftRaw, type CowSwapFigures, type CowSwapView } from "@/lib/cow/surplus";

const SETTLEMENT = {
  name: `${COW_TERMS.settlement} (${COW_TERMS.settlementContract})`,
  address: GPV2_SETTLEMENT,
};

const DEFINITIONS = "https://docs.cow.fi/cow-protocol/reference/core/definitions";
const EXPLORER_ORDER = "https://docs.cow.fi/cow-protocol/tutorials/cow-explorer/order";
const FEES = "https://docs.cow.fi/governance/fees";

/** The executed amounts of the swap's Trade log, base units. */
export interface CowTradeRaw {
  sell: string;
  buy: string;
  fee: string;
}

export interface CowCoords {
  block: number | string;
  txHash: string;
}

const tokenName = (c: CowSwapView) => c.token.symbol ?? c.token.address;

/** Where the call sits in the input, for the leaves read from it. */
function inputNote(c: CowSwapView): string {
  const where =
    c.call === "wrapped"
      ? ` The settle() call sits inside the solver contract's input from byte ${c.settleOffset.toLocaleString("en-US")}; Etherscan does not decode it there.`
      : c.call === "inline"
        ? " The transaction's own function takes settle()'s arguments as its first four parameters; Etherscan decodes them under that function's name."
        : "";
  return `Transaction input, not a log field: the settle() call's argument, which the settlement contract checked against the order's signature.${where}`;
}

const inputLeaf = (c: CowSwapView, label: string, value: string): ProvInput => ({
  label,
  value,
  kind: "chain",
  pclass: "emitted",
  note: inputNote(c),
});

const logLeaf = (label: string, value: string): ProvInput => ({ label, value, kind: "chain", pclass: "emitted" });

const txVerify = (coords: CowCoords) => ({
  kind: "etherscan" as const,
  href: explorerUrl(COW_CHAIN_ID, "tx", coords.txHash),
  text: "The settlement transaction, its input and its Trade logs on Etherscan",
});

const source = (coords: CowCoords) => ({ block: coords.block, txHash: coords.txHash });

const via = (c: CowSwapView) =>
  `settle() input${c.call === "wrapped" ? `, from byte ${c.settleOffset.toLocaleString("en-US")}` : c.call === "inline" ? ", passed inline" : ""} · the order as signed; Trade log · the executed amounts`;

/** The surplus figure: received beyond the limit signed (sell order), returned to the wallet from the unused limit
 *  (buy order through an Aave adapter) or paid less than the limit signed (the wallet's own buy order), in the
 *  surplus token. */
export function cowSurplusProv(c: CowSwapView, trade: CowTradeRaw, coords: CowCoords): Provenance {
  const sym = tokenName(c);
  const sell = c.kind === "sell";
  const fee = c.limit.fee !== "0" || trade.fee !== "0";
  const part = c.partiallyFillable ? " pro rata to the part filled in this transaction," : "";
  const label = cowSurplusLabel(c.kind, c.route);
  const docs = `CoW Protocol's docs call it surplus, "The price improvement on a user's limit price".`;
  return {
    kind: "derived",
    pclass: "emitted",
    summary: sell
      ? `${label} — the ${sym} this sell order received above the least it would accept: the buy amount the order signed,${part} taken from what the order bought. ${docs}`
      : c.route === "cow_permit"
        ? `${label} — the ${sym} this buy order did not spend of the most it would pay: the sell amount the wallet's order signed,${part} less what the order sold. ${docs}`
        : `${label} — the ${sym} this buy order did not spend of the most it would pay: the sell amount the order signed,${part} less what the order sold. The front end that placed the order sets that limit with a slippage allowance, and the adapter sends the unused part to the wallet in the same transaction: one amount. ${docs}`,
    formula: sell
      ? `bought − ⌈limit buy × (sold${fee ? " − fee" : ""}) ÷ limit sell⌉`
      : `⌊limit sell × bought ÷ limit buy⌋${fee ? " + ⌊limit fee × bought ÷ limit buy⌋" : ""} − sold`,
    inputs: [
      inputLeaf(c, "limit sell (the order's sellAmount)", c.limit.sell),
      inputLeaf(c, "limit buy (the order's buyAmount)", c.limit.buy),
      ...(c.limit.fee !== "0" ? [inputLeaf(c, "limit fee (the order's feeAmount)", c.limit.fee)] : []),
      ...(c.partiallyFillable ? [inputLeaf(c, "executedAmount (partially fillable order)", c.executedAmount)] : []),
      logLeaf("sold (Trade log sellAmount)", trade.sell),
      ...(trade.fee !== "0" ? [logLeaf("fee (Trade log feeAmount)", trade.fee)] : []),
      logLeaf("bought (Trade log buyAmount)", trade.buy),
      { label: `the limit, in ${sym}`, value: c.limit.amount, kind: "derived" },
      { label: `surplus, in ${sym}`, value: c.surplus, kind: "derived" },
      {
        label: "surplus",
        value: "docs.cow.fi Definitions",
        kind: "offchain",
        pclass: "offchain",
        definition: true,
        verify: { kind: "link", href: DEFINITIONS, text: `${COW_TERMS.name}'s docs: Definitions` },
      },
      {
        label: "Order surplus",
        value: "CoW Explorer",
        kind: "offchain",
        pclass: "offchain",
        definition: true,
        verify: { kind: "link", href: EXPLORER_ORDER, text: `${COW_TERMS.name}'s docs: CoW Explorer, by order` },
      },
    ],
    contract: SETTLEMENT,
    via: via(c),
    source: source(coords),
    verify: txVerify(coords),
  };
}

/** The fee line: the gap between the trade's own clearingPrices entries and
 *  the settlement's uniform price, in bp. */
export function cowFeeProv(c: CowSwapView, trade: CowTradeRaw, coords: CowCoords): Provenance {
  const sym = tokenName(c);
  const u = c.prices.uniform;
  const o = c.prices.own;
  const sell = c.kind === "sell";
  const signed = trade.fee !== "0";
  const net = signed ? "(sold − fee)" : "sold";
  const signedTerm = signed
    ? sell
      ? ` + ⌊fee × clearingPrices[${u.sellIndex}] ÷ clearingPrices[${u.buyIndex}]⌋`
      : " + fee"
    : "";
  return {
    kind: "derived",
    pclass: "emitted",
    summary: `${COW_FEE_LABEL} — what this trade gave up against the settlement's clearing price, in ${sym}, and that in basis points (0.01%) of the amount at the clearing price. CoW Protocol charges fees in the price, in the surplus token, not as transfers. The settlement contract priced the trade on clearingPrices entries [${o.sellIndex}, ${o.buyIndex}]; each token's first entry, [${u.sellIndex}, ${u.buyIndex}], is the clearing price.${signed ? ` The figure includes the order's signed fee, the Trade log's feeAmount${sell ? ", taken into the bought token at the clearing price" : ""}.` : ""} The gap holds the network cost as well as protocol and partner fees; Rails does not split them.`,
    formula: sell
      ? `at the clearing price = ⌊${net} × clearingPrices[${u.sellIndex}] ÷ clearingPrices[${u.buyIndex}]⌋; (at the clearing price − bought${signedTerm}) ÷ at the clearing price × 10,000`
      : `at the clearing price = ⌈bought × clearingPrices[${u.buyIndex}] ÷ clearingPrices[${u.sellIndex}]⌉; (${net} − at the clearing price${signedTerm}) ÷ at the clearing price × 10,000`,
    inputs: [
      inputLeaf(c, `clearingPrices[${u.sellIndex}] (sold token, first entry)`, u.sell),
      inputLeaf(c, `clearingPrices[${u.buyIndex}] (bought token, first entry)`, u.buy),
      inputLeaf(c, `clearingPrices[${o.sellIndex}] (sold token, this trade's entry)`, o.sell),
      inputLeaf(c, `clearingPrices[${o.buyIndex}] (bought token, this trade's entry)`, o.buy),
      logLeaf("sold (Trade log sellAmount)", trade.sell),
      ...(trade.fee !== "0" ? [logLeaf("fee (Trade log feeAmount)", trade.fee)] : []),
      logLeaf("bought (Trade log buyAmount)", trade.buy),
      ...(signed ? [{ label: `the signed fee, in ${sym}`, value: c.signedFee, kind: "derived" as const }] : []),
      { label: `the gap, in ${sym}`, value: c.feeGap, kind: "derived" },
      {
        label: "fees in the surplus token",
        value: "docs.cow.fi Fees",
        kind: "offchain",
        pclass: "offchain",
        definition: true,
        verify: { kind: "link", href: FEES, text: `${COW_TERMS.name}'s docs: Fees` },
      },
    ],
    contract: SETTLEMENT,
    via: via(c),
    source: source(coords),
    verify: txVerify(coords),
  };
}

/** The Aave V3 Pool, the lender the Aave swap adapters flash-borrow from. */
export const AAVE_V3_POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2";

/** The lender's name in a sentence: "Aave V3" for the Pool, else its short address. */
export const flashLenderName = (lender: string) =>
  lender.toLowerCase() === AAVE_V3_POOL ? "Aave V3" : `${lender.slice(0, 6)}…${lender.slice(-4)}`;

/** The flash-loan fee: the premium in the lender's FlashLoan log of this transaction (rails-server mig 481 reads it
 *  from the receipt on Aave V4 swaps). */
export function flashFeeProv(
  loan: NonNullable<CowSwapFigures["flashLoan"]>,
  token: { symbol: string | null; decimals: number | null },
  coords: CowCoords,
): Provenance {
  const sym = token.symbol ?? loan.asset;
  const lender = flashLenderName(loan.lender);
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `The flash-loan fee — the premium ${lender}'s Pool charged on the flash loan of ${sym} the order's contract took for this swap, from the Pool's FlashLoan log in this transaction${
      token.decimals != null
        ? `: ${shiftRaw(loan.premium, token.decimals)} ${sym} on a loan of ${shiftRaw(loan.amount, token.decimals)}`
        : ""
    }.`,
    contract: { name: lender === "Aave V3" ? "Aave V3 Pool" : lender, address: loan.lender },
    via: "FlashLoan log · amount and premium",
    inputs: [
      { label: "amount", value: loan.amount, kind: "chain", pclass: "emitted", note: "FlashLoan `amount`" },
      { label: "premium", value: loan.premium, kind: "chain", pclass: "emitted", note: "FlashLoan `premium`" },
      { label: "asset", value: loan.asset, kind: "chain", pclass: "emitted", note: "FlashLoan `asset`" },
    ],
    source: { block: coords.block, txHash: coords.txHash },
    verify: {
      kind: "etherscan",
      href: explorerUrl(COW_CHAIN_ID, "tx-logs", coords.txHash),
      text: "The transaction's logs on Etherscan",
    },
  };
}
