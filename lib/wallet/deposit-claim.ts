// A Stability Pool deposit's dollars on the wallet page (ui-jobs 794; Miles,
// "full claim, head on wallet"): the compounded deposit at its stablecoin's
// $1 face plus the collateral the deposit is owed at the price the protocol's
// Troves use, both from the head read. Liquity V1's LQTY is not valued. A
// gain with no price states no dollars, so the position's head read fails
// (rule 743) rather than pricing half the claim. The band's deposit leg on
// the wallet page is the head-read deposit. An LQTY stake's dollars are its
// fees pending the same way, the LQTY staked not valued (Miles, "claim
// only"). Pure and client-safe.

import type { HolderLeg } from "@/components/shared/holder-strip";
import type { ProvClass } from "@/components/shared/provenance";
import { formatNumber } from "@/lib/utils/format";

/** One leg of a position's dollars, for its receipt row. `usd` null: the
 *  leg is held and not valued (V1's LQTY). */
export interface UsdPart {
  label: string;
  usd: number | null;
  pclass?: ProvClass;
  /** Where the dollars come from ("LUSD's $1 face"). */
  source: string;
}

export interface DepositClaim {
  usd: number;
  parts: UsdPart[];
}

/** The claim in dollars, or null where the gain has no price. */
export function depositClaim(opts: {
  /** The compounded deposit, in the stablecoin. */
  deposit: number;
  symbol: string;
  /** The collateral owed to the deposit, in its token. */
  gain: number;
  gainSymbol: string;
  /** Dollars per gain token; null where the read gave none. */
  price: number | null | undefined;
  /** The price's source ("the Liquity V1 PriceFeed"). */
  feed: string;
  /** A token the deposit is owed and no price is read for (V1's LQTY): a
   *  "not valued" leg where the amount owed is above zero. */
  unvalued?: { symbol: string; amount: number };
}): DepositClaim | null {
  const priced = opts.price != null && Number.isFinite(opts.price) && opts.price > 0;
  if (opts.gain > 0 && !priced) return null;
  const parts: UsdPart[] = [
    { label: "deposit", usd: opts.deposit, pclass: "state", source: `${opts.symbol}'s $1 face` },
  ];
  if (priced) {
    parts.push({
      label: `${opts.gainSymbol} gain`,
      usd: opts.gain * opts.price!,
      pclass: "oracle",
      source: opts.feed,
    });
  }
  if (opts.unvalued && opts.unvalued.amount > 0)
    parts.push({ label: opts.unvalued.symbol, usd: null, source: "not valued" });
  return { usd: parts.reduce((s, p) => s + (p.usd ?? 0), 0), parts };
}

/** An LQTY stake's claim in dollars: the LUSD fees pending at their $1 face
 *  and the ETH fees pending at the feed. The LQTY staked is not valued: no
 *  LQTY price is read. Null where ETH fees are pending and the feed gave no
 *  price. */
export function stakeClaim(opts: {
  stake: number;
  lusd: number;
  eth: number;
  price: number | null | undefined;
  feed: string;
}): DepositClaim | null {
  const priced = opts.price != null && Number.isFinite(opts.price) && opts.price > 0;
  if (opts.eth > 0 && !priced) return null;
  const parts: UsdPart[] = [{ label: "LUSD fees", usd: opts.lusd, pclass: "state", source: "LUSD's $1 face" }];
  if (priced) parts.push({ label: "ETH fees", usd: opts.eth * opts.price!, pclass: "oracle", source: opts.feed });
  if (opts.stake > 0) parts.push({ label: "LQTY", usd: null, source: "not valued" });
  return { usd: parts.reduce((s, p) => s + (p.usd ?? 0), 0), parts };
}

/** The band's deposit leg from the head read: the compounded deposits summed,
 *  no ≈. `deposits` holds each open deposit's amount and read block. */
export function headDepositLeg(
  leg: HolderLeg,
  deposits: { amount: number; block?: number }[],
  opts: { symbol: string; getter: string; protocol: string },
): HolderLeg {
  const sum = deposits.reduce((s, d) => s + d.amount, 0);
  const many = deposits.length > 1;
  const blocks = [...new Set(deposits.map((d) => d.block).filter((b): b is number => b != null))];
  const at = blocks.length === 1 ? `at block ${blocks[0].toLocaleString("en-US")}` : "at the chain head";
  return {
    ...leg,
    value: `${formatNumber(sum)} ${opts.symbol}`,
    approx: false,
    tip: many ? "Each deposit read from its pool at the chain head." : "Read from the pool at the chain head.",
    figure: { amount: sum, tokens: [{ symbol: opts.symbol }], usd: null },
    prov: {
      kind: "chain",
      pclass: "state",
      summary: many
        ? `Stability Pool deposits — the sum of each open ${opts.protocol} deposit's ${opts.symbol} now, its pool's ${opts.getter} read ${at}.`
        : `Stability Pool deposit — the ${opts.symbol} the wallet's ${opts.protocol} deposit holds now, the pool's ${opts.getter} read ${at}.`,
      via: `GET /api/chain/wallet/<address> · ${opts.getter}(depositor)`,
      formula: many ? "Σ compounded deposit over the open deposits" : "compounded deposit",
    },
  };
}
