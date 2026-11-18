// The receipt for a dollar figure in a wallet's band (ui-jobs 737): every
// dollar is worked out from on-chain values. It names each token's amount
// (the open positions' summed figure, from the index), each token's price
// (an on-chain read, at its block where the read states one; a stablecoin's
// $1 face is a definition, said as one) and the arithmetic: amount × price,
// and across tokens the sum of those legs, each leg worked out on its own row.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

export interface UsdLeg {
  /** The token's symbol ("WETH", "BOLD"). */
  token: string;
  amount: number;
  /** Where the amount comes from, in a phrase. */
  amountNote: string;
  /** USD per token. */
  price: number;
  /** Where the price comes from, in a phrase. */
  priceNote: string;
  /** A $1 face the protocol defines, not a read. */
  face?: boolean;
  /** The contract the price is read from. */
  priceContract?: { name: string; address?: string };
}

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
}): Provenance {
  const { legs } = opts;
  const total = legs.reduce((s, l) => s + l.amount * l.price, 0);
  const many = legs.length > 1;
  const inputs: ProvInput[] = legs.flatMap((l) => {
    const rows: ProvInput[] = [
      {
        label: `${l.token} amount`,
        value: `${formatNumber(l.amount)} ${l.token}`,
        kind: "chain",
        pclass: "indexed",
        note: l.amountNote,
      },
      l.face
        ? {
            label: `${l.token} price`,
            value: formatUsdValue(l.price),
            kind: "derived",
            definition: true,
            note: l.priceNote,
          }
        : {
            label: `${l.token} price`,
            value: formatUsdValue(l.price),
            kind: "chain-derived",
            pclass: "oracle",
            note: l.priceNote,
            contract: l.priceContract,
          },
    ];
    if (many)
      rows.push({
        label: `${l.token} amount × price`,
        value: formatUsdValue(l.amount * l.price),
        kind: "derived",
        step: true,
      });
    return rows;
  });
  const at =
    opts.block != null
      ? `the prices read at block ${opts.block.toLocaleString("en-US")}`
      : "the prices as the read served them (it states no block)";
  const faces = legs.filter((l) => l.face).map((l) => `1 ${l.token} is counted as $1`);
  return {
    kind: legs.every((l) => l.face) ? "derived" : "chain-derived",
    pclass: legs.every((l) => l.face) ? undefined : "oracle",
    summary: [
      `${opts.what}: ${many ? "each token's amount times its price, summed" : "the amount times the price"}, ${at}.`,
      faces.length ? `${faces.join("; ")}, a face the protocol defines.` : "",
      opts.caveat ?? "",
    ]
      .filter(Boolean)
      .join(" "),
    via: opts.via,
    formula: many ? "Σ amount × price" : "amount × price",
    inputs: [
      ...inputs,
      ...(many ? [{ label: "sum", value: formatUsdValue(total), kind: "derived" as const, step: true as const }] : []),
    ],
    source: opts.block != null ? { block: opts.block } : undefined,
  };
}
