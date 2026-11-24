// LlamaLend (Curve lending) on Ethereum, for the wallet view (decision 0071;
// SERVER-ONLY). One row per (controller, user) (mig 521): the card is the
// listing row, built by the listing's builder. The stored card is the
// position's last UserState (its debt at that block; its collateral null where
// the chain logged the "unknown" sentinel), built as the listing builds a row
// whose live read did not land. The head read is the listing's: the
// builder reads every market's AMM price_oracle and, in one Multicall over the
// open positions, each one's user_state and health(user, true), so the card's
// collateral, debt, soft-liquidation state and health are at the head. A
// position whose live debt reads zero was repaid since the sweep: it keeps the
// stored card, marked closed since the sweep.
// Dollars only where the listing states them: crvUSD-borrowed markets.

import {
  buildLlamalendPositionRows,
  type LlamalendPositionSummary,
  type RawLlamalendPositionRow,
} from "@/lib/sources/api/llamalend-positions";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { historyBase, opt, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const USD_SOURCE = "LlamaLend AMM price oracle, debt in crvUSD";

export const llamalend: FamilyModule = {
  id: "llamalend",
  name: "LlamaLend",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "llamalend",
  async shape(rows) {
    // The stored figures: an open row is built as a row the builder reads
    // nothing for, then carries its status back, so shaping reads no chain.
    const raw = rows.map((r) => r.card as RawLlamalendPositionRow);
    const built = await buildLlamalendPositionRows(
      raw.map((c) => (c.status === "open" ? { ...c, status: "closed" } : c)),
      new Map(),
    );
    return rows.map((r, i): WalletPosition => {
      const s: LlamalendPositionSummary = raw[i].status === "open" ? { ...built[i], status: "open" } : built[i];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "llamalend",
        familyName: "LlamaLend",
        market: s.marketLabel,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "llamalend", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      // The store records no peaks, so the History row states no size.
      return {
        ...base,
        history: {
          ...historyBase(r),
          result: (r.liquidationCount ?? 0) > 0 ? plural(r.liquidationCount!, "liquidation") : undefined,
        },
      };
    });
  },
  async head(open, _address, signal, _apiMs, { rows }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    signal.throwIfAborted();
    const raw = new Map(rows.map((r) => [r.positionId, r.card as RawLlamalendPositionRow]));
    const cards = await buildLlamalendPositionRows(open.map((p) => raw.get(p.positionId)!));
    signal.throwIfAborted();
    const now = Math.floor(Date.now() / 1000);
    // The reads that answered: the block and the AMMs' prices, and the
    // positions' Multicall.
    const live = (c: LlamalendPositionSummary) => c.stateBasis === "chain" || c.liveDebtZero === true;
    const reads = (cards.some((c) => c.priceBlock != null) ? 2 : 0) + (cards.some(live) ? 1 : 0);
    // The head block the read is pinned to, from the market state.
    const head = cards.find((c) => c.priceBlock != null)?.priceBlock ?? null;
    return {
      reads,
      positions: open.map((p, i): WalletPosition => {
        const s = cards[i];
        // Repaid since the sweep: the figures stay the store's, so the section
        // states no total (rule 743), and the card states no risk.
        if (s.liveDebtZero && head != null) return { ...p, closedSince: { block: head }, headRead: "stored" };
        // The live read did not land: the stored figures stand.
        if (s.stateBasis !== "chain") return { ...p, headRead: "failed" };
        const h = s.healthFull;
        return {
          ...p,
          card: { kind: "llamalend", row: s },
          collateralUsd: opt(s.collateralUsd),
          debtUsd: opt(s.debtUsd),
          usdSource: s.debtUsd != null ? USD_SOURCE : undefined,
          usdOwnOracle: s.collateralUsd != null,
          // health(user, true) is a margin over the debt, h = value / debt − 1;
          // the collateral can fall by h / (1 + h) before it reaches 0. A rank only.
          buffer: h != null && h > -1 ? h / (1 + h) : undefined,
          riskFigure: h != null ? { value: `${pct(h)} health`, label: "liquidates below 0%" } : undefined,
          liquidatable: s.liquidatable ?? undefined,
          headRead: "read",
          readAtBlock: s.priceBlock ?? head ?? undefined,
          readAt: Math.floor(Date.now() / 1000),
        };
      }),
    };
  },
};
