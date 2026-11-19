// Compound V3 Arbitrum's adapter onto the shared holder strip
// (components/shared/holder-strip.tsx) — what the wallet overview,
// /arbitrum/compound-v3/<wallet>, states above the wallet's Comet cards
// (rails-ops reference/arbitrum-position-first-lane.md).
//
// A pure function of what the overview already holds: the whole-wallet Comet
// read (`head`, one batched call at one block answering every Comet) and the
// overview's Comets, each with the status its card states. It fetches nothing.
//
// Every Comet is on the page (the roster has four), so the legs are summed over
// the whole wallet whenever the read answered. With no read, the strip states
// how many Comets the history names and why nothing else is stated.
//
// Each Comet lends one base and quotes in one unit (cWETHv3 in ETH),
// so no leg is a quantity of one token: collateral, debt and the lent base are
// each stated in dollars at each Comet's `getPrice`, the ETH-quoted Comet
// converted at the read's `ethUsd` (lib/compound-arbitrum/usd.ts), wearing ≈,
// with the per-Comet amounts beneath.

import type { HolderLeg, HolderStripProps } from "@/components/shared/holder-strip";
import type { Provenance } from "@/components/shared/provenance";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import type { CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
import { scaleCompoundChainBalance, type CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import { holderUsdReceipt, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { compoundArbitrumUsd, cometUsdPrice } from "./usd";
import { cometComposedPriceNote, cometNoPriceLine, cometPriceNote, type CometUnpriced } from "./price-notes";

/** Why a Comet's price has no dollars: a zero getPrice, or no conversion. */
const whyUnpriced = (c: HolderStripComet, price: number): CometUnpriced => ({
  comet: c.market.label,
  why: !(price > 0) ? "zero" : "conversion",
});

/** One Comet on the overview: the read's answer for it (null where it holds
 *  nothing now, or the read failed) and the status its card states. */
export interface HolderStripComet {
  market: Pick<CometMarket, "key" | "label" | "comet" | "baseSymbol">;
  chain: CompoundMarketChainResponse | null;
  status: CompoundPositionView["status"];
}

const LEG_TIP = {
  collateral:
    "An estimate: each Comet's collateral at that Comet's price feeds as of this read, added across the Comets. Each Comet holds its collateral against its loan alone.",
  debt: "An estimate: each Comet's borrowed base, interest included, at that Comet's price feed as of this read, added across the Comets.",
  lent: "An estimate: each Comet's lent base, interest included, at that Comet's price feed as of this read, added across the Comets.",
} as const;

const count = (n: number): string => n.toLocaleString("en-US");

/** "a, b and c". */
const joinAnd = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/** Where a deployment's strip read its figures: the route the Comet read
 *  answers on, and where the ETH-quoted Comet's WETH-in-dollars leg came from. */
export interface HolderStripSource {
  via: string;
  ethUsdFrom: string;
  /** The WETH-in-dollars leg comes from a read of its own (Base), so the
   *  receipts name each price's block on its row. */
  separateWeth?: boolean;
}

const ARBITRUM_SOURCE: HolderStripSource = {
  via: "GET /api/chain/compound-arbitrum/wallet",
  ethUsdFrom: "from the same read",
};

/** One priced row of a leg: the amount, the Comet's price as shown (the WETH
 *  Comet's composed), and the rows ahead of a composed price. */
function cometLeg(
  c: HolderStripComet,
  symbol: string,
  amount: number,
  rawPrice: number,
  ethUsd: number | undefined,
  amountNote: string,
  src: HolderStripSource,
  /** The Comet read's block, named on the row where the WETH leg has its own. */
  blockOf: number,
): UsdLeg | null {
  const ch = c.chain!;
  const u = cometUsdPrice(ch, rawPrice, ethUsd);
  if (!u) return null;
  return {
    token: symbol,
    label: `${c.market.label} ${symbol}`,
    amount,
    amountNote,
    price: u.usd,
    priceNote: u.eth
      ? cometComposedPriceNote({
          comet: c.market.label,
          ethPrice: u.eth.price,
          ethUsd: u.eth.ethUsd,
          wethFrom: src.ethUsdFrom,
          block: src.separateWeth ? blockOf : null,
        })
      : cometPriceNote(c.market.label, src.separateWeth ? blockOf : null),
    priceContract: { name: c.market.label, address: c.market.comet },
  };
}

/** A leg's figure and receipt from its rows; the no-figure words where a
 *  Comet in it has no conversion (no partial totals). */
function legFigure(
  label: string,
  what: string,
  rows: (UsdLeg | null)[],
  unpriced: CometUnpriced[],
  block: number,
  src: HolderStripSource,
): { value: string; approx: boolean; prov: Provenance } | null {
  if (unpriced.length > 0)
    return {
      value: "—",
      approx: false,
      prov: {
        kind: "derived",
        summary: `${what} — ${cometNoPriceLine(unpriced)}, so the ${label.toLowerCase()} is not drawn.`,
        via: src.via,
      },
    };
  const legs = rows.filter((r): r is UsdLeg => r != null);
  if (legs.length === 0) return null;
  const { prov, usd } = holderUsdReceipt({
    what,
    legs,
    block,
    blocksPerRow: src.separateWeth,
    via: `${src.via} at block ${block.toLocaleString("en-US")} · one batched read of every Comet · Σ amount × the Comet's price`,
    caveat:
      "An estimate: the Comets hold different tokens, and a sum of them exists only at a price, which moves every block.",
  });
  if (!(usd > 0)) return null;
  return { value: formatUsdValue(usd), approx: true, prov };
}

/** The counts sentence, in Comet positions. */
function countsLine(n: number, counts: { open: number; closed: number; liquidated: number }, liquidatable: number) {
  const parts = [
    counts.open > 0 ? `${count(counts.open)} open` : null,
    counts.closed > 0 ? `${count(counts.closed)} closed` : null,
    counts.liquidated > 0 ? `${count(counts.liquidated)} liquidated` : null,
  ].filter((p): p is string => p != null);
  const noun = n === 1 ? "Comet account" : "Comet accounts";
  const spread = parts.length === 1 && n > 1 ? `${n === 2 ? "both" : "all"} ${parts[0].split(" ")[1]}` : joinAnd(parts);
  const liq =
    liquidatable > 0
      ? ` ${count(liquidatable)} of the open ones ${liquidatable === 1 ? "is" : "are"} liquidatable.`
      : "";
  return `This wallet holds ${count(n)} ${noun}, ${spread}.${liq}`;
}

/** Build the strip for the wallet overview. `comets` is the overview's list,
 *  open first. */
export function compoundArbitrumHolderStrip(
  head: CompoundWalletChainResponse | null,
  comets: HolderStripComet[],
): HolderStripProps {
  return compoundHolderStrip(head, comets, ARBITRUM_SOURCE);
}

/** The strip over any Compound V3 deployment's whole-wallet Comet read, its
 *  receipts naming `src`. Base's adapter is lib/compound-base/holder-strip.ts. */
export function compoundHolderStrip(
  head: CompoundWalletChainResponse | null,
  comets: HolderStripComet[],
  src: HolderStripSource,
): HolderStripProps {
  if (!head) {
    // No read: the history names the Comets, and nothing says which are open.
    const n = comets.length;
    return {
      countsLine: `The history names ${count(n)} ${n === 1 ? "Comet account" : "Comet accounts"} for this wallet.`,
      counts: { open: 0, closed: 0, liquidated: 0 },
      legs: [],
      truncated: false,
      note: "The Comets did not answer in time, so which are open and what they hold is unread; reload to read them.",
    };
  }

  const open = comets.filter((c) => c.status === "open" && c.chain != null);
  const counts = {
    open: open.length,
    closed: comets.filter((c) => c.status === "closed").length,
    liquidated: comets.filter((c) => c.status === "liquidated").length,
  };
  const liquidatable = open.filter((c) => c.chain!.isLiquidatable).length;

  const usd = compoundArbitrumUsd(head).byComet;
  const block = head.blockNumber;
  const legs: HolderLeg[] = [];

  // ── collateral: per Comet and asset, the shown products summed ─────────
  {
    const rows: (UsdLeg | null)[] = [];
    const unpriced: CometUnpriced[] = [];
    const parts: string[] = [];
    for (const c of open) {
      const ch = c.chain!;
      if (ch.collateral.length === 0) continue;
      const v = usd.get(ch.comet.toLowerCase())?.collateralUsd;
      parts.push(v == null ? `${c.market.label} not priced` : `${c.market.label} ${formatUsdValue(v)}`);
      for (const a of ch.collateral) {
        const amount = scaleCompoundChainBalance(a.balanceRaw, a.decimals);
        if (!(amount > 0)) continue;
        const r = cometLeg(
          c,
          a.symbol,
          amount,
          a.price,
          head.ethUsd,
          `${c.market.label}'s collateralBalanceOf`,
          src,
          block,
        );
        if (!r && !unpriced.some((u) => u.comet === c.market.label)) unpriced.push(whyUnpriced(c, a.price));
        rows.push(r);
      }
    }
    const f = legFigure(
      "Total collateral",
      "What the wallet holds as collateral across its Comets, in USD",
      rows,
      unpriced,
      block,
      src,
    );
    if (f)
      legs.push({
        id: "collateral",
        label: "Total collateral",
        ...f,
        tip: f.approx ? LEG_TIP.collateral : undefined,
        footnote: { text: parts.join(" · ") },
      });
  }

  // ── the base, borrowed and lent: the shown products, the parts in each base ──
  const baseLeg = (side: "borrow" | "supply") => {
    const rows: (UsdLeg | null)[] = [];
    const unpriced: CometUnpriced[] = [];
    const parts: string[] = [];
    for (const c of open) {
      const ch = c.chain!;
      const amount = scaleCompoundChainBalance(
        side === "borrow" ? ch.borrowBalanceRaw : ch.supplyBalanceRaw,
        ch.baseDecimals,
      );
      if (!(amount > 0)) continue;
      const r = cometLeg(
        c,
        ch.baseSymbol,
        amount,
        ch.basePrice,
        head.ethUsd,
        `${c.market.label}'s ${side === "borrow" ? "borrowBalanceOf" : "balanceOf"}, interest included`,
        src,
        block,
      );
      parts.push(`${formatNumber(amount)} ${ch.baseSymbol}${r ? "" : " (not priced)"}`);
      if (!r) unpriced.push(whyUnpriced(c, ch.basePrice));
      rows.push(r);
    }
    const f = legFigure(
      side === "borrow" ? "Total debt" : "Total lent",
      side === "borrow"
        ? "What the wallet owes across its Comets, in USD"
        : "What the wallet lends across its Comets, in USD",
      rows,
      unpriced,
      block,
      src,
    );
    if (!f) return;
    legs.push({
      id: side === "borrow" ? "debt" : "lent",
      label: side === "borrow" ? "Total debt" : "Total lent",
      ...f,
      tip: f.approx ? (side === "borrow" ? LEG_TIP.debt : LEG_TIP.lent) : undefined,
      footnote: { text: parts.join(" · ") },
    });
  };
  baseLeg("borrow");
  baseLeg("supply");

  return {
    countsLine: countsLine(comets.length, counts, liquidatable),
    counts,
    legs,
    truncated: false,
  };
}
