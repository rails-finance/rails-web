// Compound V3's dollar arithmetic, one shape for every deployment (ui-jobs
// 743): the card, the Arbitrum and Base wallet strips and /wallet price a
// token at its Comet's getPrice as shown; an ETH-quoted Comet's price is one
// composed row, getPrice in ETH × WETH in dollars, each factor as shown. Each
// product is the amount at six decimals × that price, to the cent, and each
// figure the sum of its products; a side holding an unpriced asset draws no
// figure and names it. Pure, so scripts/test/compound-v3-usd.test.mjs asserts it.

import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { Provenance } from "@/components/shared/provenance";
import { holderUsdReceipt, type UsdLeg } from "@/lib/shared/holder-usd-receipt";
import { shownComposedPrice, shownPrice } from "@/lib/shared/shown-usd";
import { cometComposedPriceNote, cometPriceNote } from "./comet-price-notes";

/** Where a price composed: the Comet's getPrice in ETH and WETH in dollars. */
export interface CometPriceFactor {
  eth?: { price: number; ethUsd: number };
}

/** A Comet's price in dollars as shown, and the ETH factor where it composed
 *  one; null where the Comet has no conversion. */
export function cometUsdPrice(
  p: Pick<CompoundMarketChainResponse, "quoteUnit">,
  price: number,
  ethUsd: number | undefined,
): { usd: number; eth?: { price: number; ethUsd: number } } | null {
  if (!(price > 0)) return null;
  if (p.quoteUnit === "USD") return { usd: shownPrice(price) };
  if (p.quoteUnit === "ETH" && ethUsd != null && ethUsd > 0)
    return { usd: shownComposedPrice(price, ethUsd), eth: { price, ethUsd } };
  return null;
}

/** Every held token at its Comet's price in dollars as shown, keyed by
 *  lowercase address: the `prices` the market pages and the overview read. */
export function cometPricesUsd(
  p: CompoundMarketChainResponse,
  baseToken: string,
  ethUsd: number | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  const base = cometUsdPrice(p, p.basePrice, ethUsd);
  if (base) out[baseToken.toLowerCase()] = base.usd;
  for (const c of p.collateral) {
    const u = cometUsdPrice(p, c.price, ethUsd);
    if (u) out[c.address.toLowerCase()] = u.usd;
  }
  return out;
}

/** The ETH factors behind `cometPricesUsd`'s ETH-quoted entries. */
export function cometPriceFactors(
  p: CompoundMarketChainResponse,
  baseToken: string,
  ethUsd: number | undefined,
): Record<string, CometPriceFactor> {
  const out: Record<string, CometPriceFactor> = {};
  const put = (addr: string, raw: number) => {
    const u = cometUsdPrice(p, raw, ethUsd);
    if (u?.eth) out[addr.toLowerCase()] = { eth: u.eth };
  };
  put(baseToken, p.basePrice);
  for (const c of p.collateral) put(c.address, c.price);
  return out;
}

/** What the card's dollar receipts read: each token's price as shown, the
 *  factors of a composed one, and the block the prices stand at. */
export interface CometUsdView {
  marketLabel: string;
  comet: string;
  priceByAddress?: Record<string, number>;
  priceFactors?: Record<string, CometPriceFactor>;
  /** The block the prices were read at; null where the read names none. */
  priceBlock?: number | null;
}

const blockText = (b: number) => `block ${b.toLocaleString("en-US")}`;

/** A side's dollars: each leg's shown product, summed; the asset names where
 *  any leg has no price (no figure is drawn); null with no legs. `balance`
 *  says where the amounts come from: the live read at its block, or the
 *  replay of the account's events, which names no block. */
export function compoundSideUsd(o: {
  what: string;
  view: CometUsdView;
  legs: readonly { symbol: string; address: string; amount: number; decimalsUnread?: boolean }[];
  balance: { source: "chain"; block: number | null } | { source: "replay" };
}): { usd: number; prov: Provenance } | { missing: string[] } | null {
  const live = o.legs.filter((l) => l.amount > 0 || l.decimalsUnread);
  if (live.length === 0) return null;
  // A token whose decimals were not read has no amount to price: no figure,
  // and the card names it as not loaded, not as unpriced.
  if (live.some((l) => l.decimalsUnread)) return { missing: [] };
  const missing = live.filter((l) => !(o.view.priceByAddress?.[l.address.toLowerCase()]! > 0)).map((l) => l.symbol);
  if (missing.length > 0) return { missing: [...new Set(missing)] };
  const pb = o.view.priceBlock ?? null;
  const amountNote =
    o.balance.source === "chain"
      ? `${o.view.marketLabel}'s balance, read by eth_call${o.balance.block != null ? ` at ${blockText(o.balance.block)}` : ""}`
      : `the account's balance replayed from its events, at a block this read does not name`;
  const legs: UsdLeg[] = live.map((l) => {
    const addr = l.address.toLowerCase();
    const f = o.view.priceFactors?.[addr]?.eth;
    return {
      token: l.symbol,
      amount: l.amount,
      amountNote,
      amountKind: o.balance.source === "chain" ? { kind: "chain", pclass: "state" } : undefined,
      price: o.view.priceByAddress![addr],
      priceNote: f
        ? cometComposedPriceNote({
            comet: o.view.marketLabel,
            ethPrice: f.price,
            ethUsd: f.ethUsd,
            wethFrom: "the USD Comet's WETH collateral feed, in the same read",
          })
        : cometPriceNote(o.view.marketLabel),
      priceContract: { name: o.view.marketLabel, address: o.view.comet },
    };
  });
  const bb = o.balance.source === "chain" ? o.balance.block : null;
  const caveat =
    o.balance.source === "replay"
      ? "The balances are the account's replayed from its events, at a block this read does not name."
      : bb != null && pb != null && bb !== pb
        ? `The balances stand at ${blockText(bb)} and the prices at ${blockText(pb)}.`
        : undefined;
  return holderUsdReceipt({
    what: o.what,
    legs,
    block: pb,
    via: `each asset × ${o.view.marketLabel}'s getPrice, as shown, summed`,
    caveat,
  });
}
