// The receipt for a dollar figure in a wallet's band (ui-jobs 737): every
// dollar is worked out from on-chain values. It names each token's amount,
// each token's price (an on-chain read, at its block where the read states
// one; a stablecoin's $1 face is a definition, said as one) and the
// arithmetic: amount × price, and across tokens the sum of those legs.
//
// The shown-values arithmetic (shownUsd, amountText, priceText) is shared with
// every dollar figure whose receipt shows its rows: the Liquity-family
// position cards' collateral USD.
//
// THE ROWS REBUILD THE FIGURE. Each amount is shown to six decimal places and
// each price to six decimals (six significant figures below $1), each product
// is worked out from the two values as shown and rounded to the cent, and the
// sum is the sum of those cents. The figure the band draws is that sum (`usd`), so a reader who
// multiplies and adds the rows lands on it.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { formatUsdValue } from "@/lib/utils/format";
import { centsOf, shownUsd, shownEth, amountText, priceText } from "@/lib/shared/shown-usd";

export interface UsdLeg {
  /** The token's symbol ("WETH", "BOLD"). */
  token: string;
  /** The rows' name for the leg where the token alone does not tell two
   *  legs apart (two Morpho markets lending USDC); the token by default. */
  label?: string;
  amount: number;
  /** Where the amount comes from, in a phrase. */
  amountNote: string;
  /** USD per token. */
  price: number;
  /** Whose price and how it is composed, in a phrase. */
  priceNote: string;
  /** A $1 face the protocol defines, not a read. */
  face?: boolean;
  /** The contract the price is read from. */
  priceContract?: { name: string; address?: string };
  /** Rows ahead of the leg's amount: the reads it is worked out from (a
   *  30-day interest's shares, totals and rate; a composed price's raw
   *  oracle read). */
  before?: ProvInput[];
  /** The amount row's class where it is worked out rather than read (a
   *  difference of two reads); a read by default. */
  amountKind?: { kind: ProvInput["kind"]; pclass?: ProvInput["pclass"] };
}

// The shown-values arithmetic lives in lib/shared/shown-usd.ts, dependency-free.
export { shownPrice, shownUsd, shownComposedPrice, amountText, priceText } from "@/lib/shared/shown-usd";
const cents = centsOf;

/** The receipt and the figure it rebuilds. */
export function holderUsdReceipt(opts: {
  /** What the figure is ("The wallet's collateral in USD"). */
  what: string;
  legs: UsdLeg[];
  /** The block the prices were read at, where the read states it. */
  block?: number | null;
  /** The route the price read came through. */
  via: string;
  /** One more sentence for the summary (what the amounts leave out). */
  caveat?: string;
  /** List the legs largest product first, those under a cent behind the
   *  receipt's closed dust control (a market's every reserve). */
  byValue?: boolean;
  /** The unit the prices and products are in: dollars by default, or ETH
   *  (a Compound V2 liquidation before the oracle's dollar years), whose
   *  products run to six decimals. `usd` is then that figure in ETH. */
  numeraire?: "USD" | "ETH";
  /** The prices stand at different blocks, each named on its row. */
  blocksPerRow?: boolean;
}): { prov: Provenance; usd: number } {
  const eth = opts.numeraire === "ETH";
  const product = eth ? shownEth : shownUsd;
  // A negative amount or product leads with "−", as signedCents does.
  const minus = (v: number) => (v < 0 ? "−" : "");
  const valueText = (v: number) =>
    eth
      ? `${minus(v)}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`
      : `${minus(v)}${formatUsdValue(Math.abs(v))}`;
  const priceOf = (p: number) => (eth ? `${priceText(p).slice(1)} ETH` : priceText(p));
  const legs = opts.byValue
    ? [...opts.legs].sort((a, b) => product(b.amount, b.price) - product(a.amount, a.price))
    : opts.legs;
  const products = legs.map((l) => product(l.amount, l.price));
  const total = products.reduce((s, p) => s + p, 0);
  const usd = eth ? Math.round(total * 1e6) / 1e6 : cents(total);
  const many = legs.length > 1;
  const inputs: ProvInput[] = legs.flatMap((l, i) => {
    const rows: ProvInput[] = [
      ...(l.before ?? []),
      {
        label: `${l.label ?? l.token} amount`,
        value: `${minus(l.amount)}${amountText(Math.abs(l.amount))} ${l.token}`,
        kind: l.amountKind?.kind ?? "chain",
        pclass: l.amountKind ? l.amountKind.pclass : "indexed",
        note: l.amountNote,
      },
      l.face
        ? {
            label: `${l.label ?? l.token} price`,
            value: priceOf(l.price),
            kind: "derived",
            definition: true,
            note: l.priceNote,
          }
        : {
            label: `${l.label ?? l.token} price`,
            value: priceOf(l.price),
            kind: "chain-derived",
            pclass: "oracle",
            note: l.priceNote,
            contract: l.priceContract,
          },
    ];
    if (many)
      rows.push({
        label: `${l.label ?? l.token} amount × price`,
        value: valueText(products[i]),
        kind: "derived",
        step: true,
      });
    return opts.byValue && Math.abs(products[i]) < 0.01 ? rows.map((r) => ({ ...r, dust: true as const })) : rows;
  });
  const allFaces = legs.every((l) => l.face);
  const read = legs.filter((l) => !l.face).length;
  // A face is no read: a receipt of faces alone names no read and no block.
  const at = allFaces
    ? ""
    : opts.blocksPerRow
      ? ", each price at the block its row names"
      : opts.block != null
        ? `, the ${read > 1 ? "prices" : "price"} at block ${opts.block.toLocaleString("en-US")}`
        : `, the ${read > 1 ? "prices" : "price"} at the latest read, which names no block`;
  const faces = legs.filter((l) => l.face).map((l) => `1 ${l.token} is counted as $1`);
  return {
    usd,
    prov: {
      kind: allFaces ? "derived" : "chain-derived",
      pclass: allFaces ? undefined : "oracle",
      summary: [
        `${opts.what}: ${many ? "each token's amount times its price, summed" : "the amount times the price"}${at}.`,
        faces.length ? `${faces.join("; ")}, a face the protocol defines.` : "",
        opts.caveat ?? "",
      ]
        .filter(Boolean)
        .join(" "),
      via: opts.via,
      formula: many ? "Σ amount × price" : "amount × price",
      inputs: [
        ...inputs,
        ...(many ? [{ label: "sum", value: valueText(usd), kind: "derived" as const, step: true as const }] : []),
      ],
      source: opts.block != null && !allFaces ? { block: opts.block } : undefined,
    },
  };
}
