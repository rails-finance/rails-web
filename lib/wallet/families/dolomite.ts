// Dolomite on Ethereum, for the wallet view (decision 0071; SERVER-ONLY). One
// row per account, (owner, account number) (mig 522): the card is the
// listing's raw row, built with the listing's builder. Shaping reads no chain,
// so an open card's legs state par, which the card labels so. The head read is
// the listing's: one read of every market's index, price and rates at a head
// block (resolveDolomiteMarketState, through rails-server's head reads), and
// each leg's tokens now are its par times the market's index, its dollars at
// the core's oracle (getMarketPrice). Par moves only at the account's
// events, which the store follows, so this read cannot find an account emptied
// since the sweep. A closed account's card states its peaks from the store,
// with no read.

import {
  buildDolomitePositionRows,
  type DolomiteBalanceAmount,
  type DolomiteMarketRead,
  type DolomitePositionSummary,
  type RawDolomiteAccountRow,
} from "@/lib/sources/api/dolomite-positions";
import { resolveDolomiteMarketState } from "@/lib/sources/chain/dolomite-markets";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

const USD_SOURCE = "Dolomite's getMarketPrice at the head block";

/** A market read with nothing in it: the stored card, built with no chain read. */
const NO_READ: DolomiteMarketRead = { state: new Map(), blockNumber: 0 };

/** "76.1 WETH +2": the largest peak by amount and how many more. */
function peakText(legs: { symbol: string; amount: number }[]): string | undefined {
  const held = legs.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
  if (held.length === 0) return undefined;
  return `${amountText(held[0].amount, held[0].symbol)}${held.length > 1 ? ` +${held.length - 1}` : ""}`;
}

/** One side's dollars at the core's oracle, or null where a leg is unread or
 *  unpriced (no partial total). */
function sideUsd(s: DolomitePositionSummary, legs: DolomiteBalanceAmount[]): number | null {
  let sum = 0;
  for (const l of legs) {
    const price = s.priceByMarket[String(l.marketId)];
    if (l.current == null || l.decimalsUnread || price == null) return null;
    sum += l.current * price;
  }
  return sum;
}

export const dolomite: FamilyModule = {
  id: "dolomite",
  name: "Dolomite",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "dolomite",
  async shape(rows) {
    const cards = await buildDolomitePositionRows(
      rows.map((r) => r.card as RawDolomiteAccountRow),
      NO_READ,
    );
    return rows.map((r, i): WalletPosition => {
      const s = cards[i];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "dolomite",
        familyName: "Dolomite",
        market: s.accountLabel,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "dolomite", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      const supply = peakText(s.peakSupplies);
      const debt = peakText(s.peakBorrows);
      return {
        ...base,
        history: {
          ...historyBase(r),
          size: supply || debt ? [supply ?? "nothing supplied", debt].filter(Boolean).join(" / ") : undefined,
          sizeNote: supply || debt ? "peak" : undefined,
          result: (r.liquidationCount ?? 0) > 0 ? plural(r.liquidationCount!, "liquidation") : undefined,
        },
      };
    });
  },
  async head(open, _address, signal, _apiMs, { rows }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    signal.throwIfAborted();
    const market = await resolveDolomiteMarketState();
    signal.throwIfAborted();
    // The block, the core's constants and the markets' Multicall.
    const reads = 3;
    if (market.state.size === 0 || market.blockNumber === 0)
      return { reads, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
    const raw = new Map(rows.map((r) => [r.positionId, r.card as RawDolomiteAccountRow]));
    const cards = await buildDolomitePositionRows(
      open.map((p) => raw.get(p.positionId)!),
      market,
    );
    const at = market.head?.blockTime ?? Math.floor(Date.now() / 1000);
    return {
      reads,
      positions: open.map((p, i): WalletPosition => {
        const s = cards[i];
        // A leg whose market the read did not answer stays in par.
        if ([...s.supplies, ...s.borrows].some((l) => l.current == null)) return { ...p, headRead: "failed" };
        const coll = sideUsd(s, s.supplies);
        const debt = sideUsd(s, s.borrows);
        const priced = coll != null && debt != null;
        return {
          ...p,
          card: { kind: "dolomite", row: s },
          ...(priced ? { collateralUsd: coll, debtUsd: debt, usdSource: USD_SOURCE, usdOwnOracle: true } : {}),
          headRead: "read",
          readAtBlock: market.blockNumber,
          readAt: at,
        };
      }),
    };
  },
};
