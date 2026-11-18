// The receipt for a dollar figure in a wallet's band (ui-jobs 737): every
// dollar is worked out from on-chain values. It names each token's amount,
// each token's price (an on-chain read, at its block where the read states
// one; a stablecoin's $1 face is a definition, said as one) and the
// arithmetic: amount × price, and across tokens the sum of those legs.
//
// THE ROWS REBUILD THE FIGURE. Each amount is shown to six decimal places and
// each price to six significant figures, each product is worked out from the
// two values as shown and rounded to the cent, and the sum is the sum of those
// cents. The figure the band draws is that sum (`usd`), so a reader who
// multiplies and adds the rows lands on it.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { formatUsdValue } from "@/lib/utils/format";

export interface UsdLeg {
  /** The token's symbol ("WETH", "BOLD"). */
  token: string;
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
}

/** An amount as the receipt shows it: six decimal places. */
export const shownAmount = (v: number): number => Math.round(v * 1e6) / 1e6;
/** A price as the receipt shows it: six significant figures. */
// exponent-safe: toPrecision's string goes straight back to a Number; priceText prints it.
export const shownPrice = (v: number): number => (v === 0 ? 0 : Number(v.toPrecision(6)));
const cents = (v: number): number => Math.round(v * 100) / 100;

const amountText = (v: number) => shownAmount(v).toLocaleString("en-US", { maximumFractionDigits: 6 });
const priceText = (v: number) => {
  const p = shownPrice(v);
  if (p < 1) return `$${p.toLocaleString("en-US", { maximumSignificantDigits: 6 })}`;
  // Six significant figures, and at least the cents.
  const decimals = Math.max(2, 6 - (Math.floor(Math.log10(p)) + 1));
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: decimals })}`;
};

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
}): { prov: Provenance; usd: number } {
  const { legs } = opts;
  const products = legs.map((l) => cents(shownAmount(l.amount) * shownPrice(l.price)));
  const usd = cents(products.reduce((s, p) => s + p, 0));
  const many = legs.length > 1;
  const inputs: ProvInput[] = legs.flatMap((l, i) => {
    const rows: ProvInput[] = [
      {
        label: `${l.token} amount`,
        value: `${amountText(l.amount)} ${l.token}`,
        kind: "chain",
        pclass: "indexed",
        note: l.amountNote,
      },
      l.face
        ? {
            label: `${l.token} price`,
            value: priceText(l.price),
            kind: "derived",
            definition: true,
            note: l.priceNote,
          }
        : {
            label: `${l.token} price`,
            value: priceText(l.price),
            kind: "chain-derived",
            pclass: "oracle",
            note: l.priceNote,
            contract: l.priceContract,
          },
    ];
    if (many)
      rows.push({
        label: `${l.token} amount × price`,
        value: formatUsdValue(products[i]),
        kind: "derived",
        step: true,
      });
    return rows;
  });
  const allFaces = legs.every((l) => l.face);
  const read = legs.filter((l) => !l.face).length;
  // A face is no read: a receipt of faces alone names no read and no block.
  const at = allFaces
    ? ""
    : opts.block != null
      ? `, the ${read > 1 ? "prices" : "price"} at block ${opts.block.toLocaleString("en-US")}`
      : `, the ${read > 1 ? "prices" : "price"} at the latest read, which states no block`;
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
        ...(many ? [{ label: "sum", value: formatUsdValue(usd), kind: "derived" as const, step: true as const }] : []),
      ],
      source: opts.block != null && !allFaces ? { block: opts.block } : undefined,
    },
  };
}
