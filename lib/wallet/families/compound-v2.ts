// Compound V2 on Ethereum, for the wallet view (decision 0071; SERVER-ONLY).
// One row per wallet (mig 512): the card is the listing row, built from the
// summary row's `card` by the listing's builder. A closed row needs no market
// state: its card is its peaks. The head read is the listing's read of the
// twenty markets' state (resolveCompoundV2MarketState: rails-server's head
// routes first, then its stored snapshot), made once for the wallet's open row
// and handed to the builder: the exchange rates turn the stored cTokens into
// the underlying they are worth, and the Comptroller's oracle prices both
// sides. The debt is the emitted accountBorrows at the wallet's last event in
// each market, as on the listing, so the open position's head is "stored".

import {
  buildCompoundV2PositionRows,
  type CompoundV2PositionSummary,
  type RawCompoundV2WalletRow,
} from "@/lib/sources/api/compound-v2-positions";
import { resolveCompoundV2MarketState } from "@/lib/sources/chain/compound-v2-market-state";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

const USD_SOURCE = "Compound V2 Comptroller's oracle, debt at the wallet's last event in each market";

/** "76.1 WETH +2": the largest peak by amount and how many more. */
function peakText(legs: { symbol: string; amount: number }[]): string | undefined {
  const held = legs.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
  if (held.length === 0) return undefined;
  return `${amountText(held[0].amount, held[0].symbol)}${held.length > 1 ? ` +${held.length - 1}` : ""}`;
}

/** Both sides in dollars at the oracle, or undefined where a leg is unpriced
 *  (no partial total). */
function dollarsOf(s: CompoundV2PositionSummary): { collateralUsd?: number; debtUsd?: number } {
  let coll = 0;
  let debt = 0;
  for (const x of s.supplies) {
    const p = s.priceByMarket[x.market];
    if (x.current == null || p == null) return {};
    coll += x.current * p;
  }
  for (const x of s.borrows) {
    const p = s.priceByMarket[x.market];
    if (p == null) return {};
    debt += x.amount * p;
  }
  return { collateralUsd: coll, debtUsd: debt };
}

export const compoundV2: FamilyModule = {
  id: "compound-v2",
  name: "Compound V2",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "compound-v2",
  async shape(rows) {
    // No market state here: an open card is rebuilt with it in `head`.
    const cards = await buildCompoundV2PositionRows(
      rows.map((r) => r.card as RawCompoundV2WalletRow),
      new Map(),
    );
    return rows.map((r, i): WalletPosition => {
      const s = cards[i];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "compound-v2",
        familyName: "Compound V2",
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "compound-v2", row: s },
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
          sizeNote: supply || debt ? "highest recorded" : undefined,
          result: (r.liquidationCount ?? 0) > 0 ? plural(r.liquidationCount!, "liquidation") : undefined,
        },
      };
    });
  },
  async head(open, _address, _signal, _apiMs, rows): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const state = await resolveCompoundV2MarketState();
    if (state.size === 0 || !state.read) {
      return { reads: 1, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
    }
    // One summary row per wallet, so each open position finds its row by id.
    const raw = new Map(rows.map((r) => [r.positionId, r.card as RawCompoundV2WalletRow]));
    const cards = await buildCompoundV2PositionRows(
      open.map((p) => raw.get(p.positionId)!),
      state,
    );
    return {
      reads: 1,
      positions: open.map((p, i): WalletPosition => {
        const s = cards[i];
        const usd = dollarsOf(s);
        return {
          ...p,
          card: { kind: "compound-v2", row: s },
          ...usd,
          usdSource: USD_SOURCE,
          usdOwnOracle: usd.collateralUsd != null,
          // The balances are the store's at the wallet's last event, the debt
          // without the interest since: the card keeps the store's stamp, and
          // a section holding it states no total (rule 743).
          headRead: "stored",
        };
      }),
    };
  },
};
