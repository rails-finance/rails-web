// Receipts for the Pendle pages' figures. Rules: rails-ops
// standards/provenance-receipts-grammar.md. Balances, interest, rewards and
// the market's state are contract reads at the page's block (`state`); a mark
// from Pendle's TWAP oracle is `oracle`, RouterStatic's spot rate `state`;
// an event's legs are fields of a router log (`emitted`); entry APY, lifetime
// flows and the unrouted moves are Rails' reductions over the router logs
// (`indexed`); the underlying protocol is a Rails label (`offchain`).

import type { Provenance } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import {
  PENDLE_CHAIN_ID,
  PENDLE_ORACLE,
  PENDLE_ROUTER_STATIC,
  ROUTER_NAME,
  exact,
  symbolOf,
} from "@/lib/pendle/format";
import type { PendleMarkSource, PendleMarketTokens, PendleTimelineRow, PendleToken } from "@/lib/pendle/types";

const ROUTER_STATIC = { name: "Pendle RouterStatic", address: PENDLE_ROUTER_STATIC };
const ORACLE = { name: "PendlePYLpOracle", address: PENDLE_ORACLE };
const n = (b: number) => b.toLocaleString("en-US");

const callCheck = (what: string, block: number) => ({
  kind: "recompute" as const,
  text: `To check: ask any archive node for ${what} at block ${n(block)}.`,
});

const scaling = (raw: string | null, tok: PendleToken) =>
  raw == null || tok.decimals == null
    ? undefined
    : { raw, from: "call" as const, places: tok.decimals, why: `${symbolOf(tok)} has ${tok.decimals} decimals` };

/** A balance RouterStatic read for the wallet at the block. */
export function balanceProv(leg: "PT" | "YT" | "LP", tok: PendleToken, raw: string | null, block: number): Provenance {
  const fn =
    leg === "LP"
      ? "getUserMarketInfo(market, wallet).lpBalance"
      : `getUserPYInfo(YT, wallet).${leg === "PT" ? "ptBalance" : "ytBalance"}`;
  return {
    kind: "chain",
    pclass: "state",
    summary: `${leg} balance. The ${symbolOf(tok)} this wallet held at block ${n(block)}, read from Pendle's RouterStatic.`,
    contract: ROUTER_STATIC,
    via: fn,
    source: { block },
    scaling: scaling(raw, tok),
    verify: callCheck(`RouterStatic ${fn}`, block),
  };
}

/** The mark of one leg, in SY per token, and where it came from. */
export function markProv(
  leg: "PT" | "YT" | "LP",
  source: PendleMarkSource | null,
  twapSeconds: number,
  block: number,
): Provenance {
  const fn = `get${leg === "LP" ? "Lp" : leg === "PT" ? "Pt" : "Yt"}ToSyRate`;
  if (source === "oracle-twap")
    return {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `${leg} mark. Pendle's PT, YT and LP oracle: the market's time-weighted rate over ${twapSeconds / 60} minutes, in SY per ${leg}, at block ${n(block)}.`,
      contract: ORACLE,
      via: `${fn}(market, ${twapSeconds})`,
      source: { block },
      verify: callCheck(`PendlePYLpOracle ${fn}(market, ${twapSeconds})`, block),
    };
  return {
    kind: "chain",
    pclass: "state",
    summary: `${leg} mark. RouterStatic's spot rate in SY per ${leg} at block ${n(block)}. Pendle's oracle needs more stored observations on this market before it can give a ${twapSeconds / 60}-minute average, so Rails reads the spot rate.`,
    contract: ROUTER_STATIC,
    via: `${fn}(market)`,
    source: { block },
    verify: callCheck(`RouterStatic ${fn}(market)`, block),
  };
}

/** A leg's value in the asset: balance × mark × SY.exchangeRate(). */
export function valueProv(
  leg: "PT" | "YT" | "LP" | "interest" | "total",
  t: PendleMarketTokens,
  block: number,
  expired: boolean | null,
): Provenance {
  const asset = symbolOf(t.asset);
  if (leg === "total")
    return {
      kind: "derived",
      pclass: "state",
      summary: `Value. The PT, YT and LP legs and the unclaimed interest, each at its mark, in ${asset} at block ${n(block)}.`,
      formula: "PT + YT + LP + unclaimed interest",
      source: { block },
      verify: { kind: "rollup", text: "The sum of the four values on the card." },
    };
  if (leg === "interest")
    return {
      kind: "derived",
      pclass: "state",
      summary: `Unclaimed interest. The yield this wallet's YT has earned and not claimed, in SY from RouterStatic, then in ${asset} at the SY's exchange rate.`,
      formula: "unclaimedInterest × SY.exchangeRate() ÷ 10¹⁸",
      contract: ROUTER_STATIC,
      source: { block },
      verify: callCheck("RouterStatic getUserPYInfo(YT, wallet).unclaimedInterest and SY.exchangeRate()", block),
    };
  if (expired && leg === "PT")
    return {
      kind: "derived",
      pclass: "state",
      summary: `PT value. The market has expired; Rails values each PT at one ${asset}, the most it redeems for by Pendle's docs.`,
      formula: "PT balance × 1",
      source: { block },
      verify: callCheck("market.isExpired()", block),
    };
  if (expired && leg === "YT")
    return {
      kind: "derived",
      pclass: "state",
      summary: "YT value. The market has expired, so YT is worth nothing; any unclaimed interest stays claimable.",
      formula: "0",
      source: { block },
      verify: callCheck("market.isExpired()", block),
    };
  return {
    kind: "derived",
    pclass: "state",
    summary: `${leg} value. The ${leg} balance at its mark in SY, then in ${asset} at the SY's exchange rate, at block ${n(block)}.`,
    formula: `${leg} balance × ${leg.toLowerCase()}ToSy ÷ 10¹⁸ × SY.exchangeRate() ÷ 10¹⁸`,
    source: { block },
    verify: {
      kind: "recompute",
      text: "To check: multiply the balance by the mark and the SY's exchange rate on this card.",
    },
  };
}

/** The market's implied APY from readState's lastLnImpliedRate. */
export function impliedApyProv(market: string, block: number, lnRate: string | null): Provenance {
  return {
    kind: "derived",
    pclass: "state",
    summary: `Implied APY. The fixed rate the market prices PT at: e to the power of its last stored ln implied rate, less one, at block ${n(block)}.`,
    formula: "e^(lastLnImpliedRate ÷ 10¹⁸) − 1",
    inputs: lnRate ? [{ label: "lastLnImpliedRate", value: lnRate, kind: "chain", pclass: "state" }] : undefined,
    contract: { name: "Pendle market", address: market },
    source: { block },
    verify: callCheck(`the market's readState(router).lastLnImpliedRate`, block),
  };
}

/** The PT-weighted fixed APY over the wallet's PT buys through the routers. */
export function entryApyProv(buys: number, unpriced: number): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `Fixed APY at entry. Each PT buy this wallet paid for through a Pendle router, priced at the asset it paid and the time left to maturity, weighted by the PT it bought: ${buys} ${buys === 1 ? "buy" : "buys"}${unpriced ? `, ${unpriced} without a price` : ""}.`,
    formula: "Σ (PT ÷ asset paid)^(year ÷ time to expiry) − 1, weighted by PT",
    verify: { kind: "rollup", text: "The buys are the Buy PT rows of the timeline below, each with its rate." },
  };
}

/** A reward or interest amount RouterStatic read for the wallet. */
export function rewardProv(
  symbol: string,
  side: "YT" | "LP",
  raw: string,
  decimals: number | null,
  block: number,
): Provenance {
  const fn =
    side === "YT" ? "getUserPYInfo(YT, wallet).unclaimedRewards" : "getUserMarketInfo(market, wallet).unclaimedRewards";
  return {
    kind: "chain",
    pclass: "state",
    summary: `Unclaimed ${symbol}. The ${symbol} rewards this wallet's ${side} has accrued and not claimed, at block ${n(block)}.`,
    contract: ROUTER_STATIC,
    via: fn,
    source: { block },
    scaling:
      decimals == null ? undefined : { raw, from: "call", places: decimals, why: `${symbol} has ${decimals} decimals` },
    verify: callCheck(`RouterStatic ${fn}`, block),
  };
}

/** The LP's share of the pool's PT and SY. */
export function lpSplitProv(block: number): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `LP split. The pool's PT and SY in proportion to this wallet's LP, at block ${n(block)}.`,
    contract: ROUTER_STATIC,
    via: "getUserMarketInfo(market, wallet).ptBalance, .syBalance",
    source: { block },
    verify: callCheck("RouterStatic getUserMarketInfo(market, wallet)", block),
  };
}

/** The maturity: the market's expiry and isExpired() at the block. */
export function maturityProv(market: string, expiry: number, block: number): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `Maturity. The market's expiry, unix ${expiry}, and whether it had passed at block ${n(block)}.`,
    contract: { name: "Pendle market", address: market },
    via: "expiry(), isExpired()",
    source: { block },
    verify: callCheck("the market's expiry() and isExpired()", block),
  };
}

/** A lifetime total over the wallet's router events in one market. */
export function flowProv(what: string, events: number): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `${what}. Summed over this wallet's ${events} router ${events === 1 ? "event" : "events"} in the market, from the router logs Rails holds.`,
    verify: { kind: "rollup", text: "The sum of the legs on the timeline's rows for this market." },
  };
}

/** A move the router logs do not explain: the balance against the router net. */
export function boundaryProv(leg: "PT" | "YT" | "LP", block: number): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `Moved outside the routers. The ${leg} balance at block ${n(block)} less what this wallet received and paid through Pendle's routers.`,
    formula: `${leg} balance − (${leg} received − ${leg} paid through routers)`,
    verify: { kind: "rollup", text: "The balance on the position card less the router legs on the timeline." },
  };
}

/** One leg of a router event, a field of the router's log. */
export function legProv(
  row: Pick<PendleTimelineRow, "router" | "event" | "txHash" | "block">,
  tok: PendleToken,
  raw: string,
): Provenance {
  const r = ROUTER_NAME[row.router];
  const abs = raw.startsWith("-") ? raw.slice(1) : raw;
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `${symbolOf(tok)} moved. The amount of ${symbolOf(tok)} this ${row.event} log records for the wallet's side.`,
    contract: { name: r.name, address: r.address },
    via: `${row.event} log`,
    source: { block: row.block, txHash: row.txHash },
    scaling:
      tok.decimals == null
        ? undefined
        : { raw: abs, from: "log", places: tok.decimals, why: `${symbolOf(tok)} has ${tok.decimals} decimals` },
    verify: {
      kind: "etherscan",
      href: explorerUrl(PENDLE_CHAIN_ID, "tx-logs", row.txHash),
      text: "The transaction's logs on Etherscan",
    },
  };
}

/** An event's asset value: its SY side at SY.exchangeRate() at the event's block. */
export function eventAssetProv(row: PendleTimelineRow, asset: string): Provenance {
  return {
    kind: "derived",
    pclass: "state",
    summary: `Value in ${asset}. The SY side of this event at the SY's exchange rate at block ${n(row.block)}.`,
    formula: "SY equivalent × SY.exchangeRate() ÷ 10¹⁸",
    inputs: [
      { label: "SY equivalent", value: row.syEquivalent ?? undefined, kind: "chain", pclass: "emitted" },
      { label: "SY.exchangeRate()", value: row.syToAsset ?? undefined, kind: "chain", pclass: "state" },
    ],
    source: { block: row.block, txHash: row.txHash },
    verify: callCheck("SY.exchangeRate()", row.block),
  };
}

/** The trade's implied APY: Pendle's effectiveImpliedApy from the PT and the asset. */
export function tradeApyProv(row: PendleTimelineRow): Provenance {
  return {
    kind: "derived",
    pclass: "emitted",
    summary:
      "Fixed APY of the trade. The PT per asset of this trade, raised to a year over the time left to maturity, less one.",
    formula: "(PT ÷ asset)^(year ÷ time to expiry) − 1",
    source: { block: row.block, txHash: row.txHash },
    verify: {
      kind: "recompute",
      text: "To check: divide the PT by the asset value on this card and raise it to a year over the days left.",
    },
  };
}

/** The Rails label for the protocol behind the yield token. */
export function underlyingProv(label: string, yieldToken: PendleToken): Provenance {
  return {
    kind: "offchain",
    pclass: "offchain",
    summary: `Underlying protocol. ${label} is Rails' label for the issuer of ${symbolOf(yieldToken)}, the token this market's SY wraps (SY.yieldToken()); the chain does not name the protocol.`,
    verify: { kind: "none", text: "A Rails label: nothing on chain to check it against." },
  };
}

/** The market's pool in the asset: its SY plus its PT at the PT mark. */
export function tvlProv(market: string, block: number): Provenance {
  return {
    kind: "derived",
    pclass: "state",
    summary: `Pool size. The market's SY plus its PT at the PT's rate in SY, then in the asset at the SY's exchange rate, at block ${n(block)}.`,
    formula: "(totalSy + totalPt × ptToSy ÷ 10¹⁸) × SY.exchangeRate() ÷ 10¹⁸",
    contract: { name: "Pendle market", address: market },
    source: { block },
    verify: callCheck("the market's readState(router) and the SY's exchangeRate()", block),
  };
}

/** A figure of the market's state at the block: readState's totals, or the LP supply. */
export function poolStateProv(
  what: "PT in the pool" | "SY in the pool" | "LP supply",
  market: string,
  block: number,
): Provenance {
  const fn =
    what === "LP supply" ? "totalSupply()" : `readState(router).${what === "PT in the pool" ? "totalPt" : "totalSy"}`;
  return {
    kind: "chain",
    pclass: "state",
    summary: `${what}. The market's ${fn} at block ${n(block)}.`,
    contract: { name: "Pendle market", address: market },
    via: fn,
    source: { block },
    verify: callCheck(`the market's ${fn}`, block),
  };
}

/** A market token: which contract read names it. */
export function marketTokenProv(
  role: "Wrapped token" | "SY" | "PT" | "YT" | "LP" | "Reward",
  tok: PendleToken,
  market: string,
): Provenance {
  const via =
    role === "Wrapped token"
      ? "SY.yieldToken()"
      : role === "Reward"
        ? "market.getRewardTokens()"
        : role === "LP"
          ? "the market contract"
          : `market.readTokens() → ${role}`;
  return {
    kind: "chain",
    pclass: "state",
    summary: `${role}. ${symbolOf(tok)}, contract ${tok.address}, named by ${via}.`,
    contract: { name: "Pendle market", address: market },
    via,
    verify: {
      kind: "etherscan",
      href: explorerUrl(PENDLE_CHAIN_ID, "address", tok.address),
      text: "The contract on Etherscan",
    },
  };
}

/** A count over the roster: every market the router record names, or those
 *  before or past their maturity at the block. */
export function rosterCountProv(which: "all" | "active" | "matured", count: number, block: number): Provenance {
  const what =
    which === "all"
      ? `Markets. The ${n(count)} markets Pendle's routers have named through block ${n(block)}, from the router logs Rails holds.`
      : which === "active"
        ? `Active markets. The ${n(count)} markets whose isExpired() read false at block ${n(block)}.`
        : `Matured markets. The ${n(count)} markets whose isExpired() read true at block ${n(block)}, or did not answer.`;
  return {
    kind: "derived",
    pclass: which === "all" ? "indexed" : "state",
    summary: what,
    source: { block },
    verify: { kind: "rollup", text: "The rows of the table, with the Maturity filter set to every market." },
  };
}

/** A token's price in the asset: its mark in SY times the SY's exchange rate. */
export function priceProv(
  leg: "PT" | "YT" | "LP",
  source: PendleMarkSource | null,
  twapSeconds: number,
  block: number,
  asset: string,
  expired: boolean,
): Provenance {
  if (expired && leg !== "LP")
    return {
      kind: "derived",
      pclass: "state",
      summary:
        leg === "PT"
          ? `PT price. The market has matured; Rails prices each PT at one ${asset}, the most it redeems for by Pendle's docs.`
          : "YT price. The market has matured, so YT is worth nothing.",
      formula: leg === "PT" ? "1" : "0",
      source: { block },
      verify: callCheck("market.isExpired()", block),
    };
  const mark = markProv(leg, source, twapSeconds, block);
  return {
    kind: "derived",
    pclass: source === "oracle-twap" ? "oracle" : "state",
    summary: `${leg} price. What one ${leg} is worth in ${asset}: its mark in SY ${source === "oracle-twap" ? `(Pendle's oracle, a ${twapSeconds / 60}-minute average)` : "(RouterStatic's spot rate)"}, times the SY's exchange rate, at block ${n(block)}.`,
    formula: `${leg.toLowerCase()}ToSy × SY.exchangeRate() ÷ 10¹⁸`,
    inputs: [
      {
        label: `${leg} mark`,
        kind: "chain",
        pclass: mark.pclass,
        contract: mark.contract,
        note: mark.via,
      },
      { label: "SY.exchangeRate()", kind: "chain", pclass: "state" },
    ],
    contract: mark.contract,
    source: { block },
    verify: callCheck(`${mark.contract?.name ?? "the oracle"} ${mark.via} and the SY's exchangeRate()`, block),
  };
}

/** The SY's exchange rate: what one SY is worth in the asset. */
export function syRateProv(sy: PendleToken, block: number, asset: string): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    summary: `SY price. What one ${symbolOf(sy)} is worth in ${asset}: the SY's exchangeRate() at block ${n(block)}.`,
    contract: { name: symbolOf(sy), address: sy.address },
    via: "exchangeRate()",
    source: { block },
    verify: callCheck(`${symbolOf(sy)} exchangeRate()`, block),
  };
}

/** The count of a market's router events. */
export function marketEventsProv(events: number): Provenance {
  return {
    kind: "derived",
    pclass: "indexed",
    summary: `Router events. The ${n(events)} ${events === 1 ? "event" : "events"} Pendle's routers have logged on this market, from the router logs Rails holds.`,
    verify: { kind: "rollup", text: "The rows below, read 50 at a time." },
  };
}
