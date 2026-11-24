// Maple on Ethereum, for the wallet view (decision 0071; SERVER-ONLY). One row
// per lender wallet (mig 524): the card is the listing's raw row, built with
// the listing's builder. Shaping reads no
// chain, so an open card states the pool shares (held plus escrowed in the
// withdrawal queue) and no asset amount. The head read is the listing's: one
// read of both pools' exit rates at a head block (resolveMaplePoolState,
// through rails-server's head reads), and each pool's shares redeem for
// shares × the exit rate. Shares move only at the wallet's events, which the
// store follows, so this read cannot find a wallet emptied since the sweep. The
// listing prices nothing, so neither does the wallet (decision 0041).

import {
  buildMaplePositionRows,
  type MaplePositionSummary,
  type RawMapleWalletRow,
} from "@/lib/sources/api/maple-positions";
import { resolveMaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

/** "245.7M syrupUSDC +1": the largest pool's peak shares and how many more. */
function peakText(s: MaplePositionSummary): string | undefined {
  const held = s.peakPools.filter((p) => p.peakShares > 0).sort((a, b) => b.peakShares - a.peakShares);
  if (held.length === 0) return undefined;
  return `${amountText(held[0].peakShares, held[0].symbol)}${held.length > 1 ? ` +${held.length - 1}` : ""}`;
}

export const maple: FamilyModule = {
  id: "maple",
  name: "Maple",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "maple",
  async shape(rows) {
    const { rows: cards } = await buildMaplePositionRows(
      rows.map((r) => r.card as RawMapleWalletRow),
      new Map(),
    );
    // The builder leaves out a known bridge escrow, so a card is found by wallet.
    const byWallet = new Map(cards.map((c) => [c.wallet.toLowerCase(), c]));
    return rows.flatMap((r): WalletPosition[] => {
      const s = byWallet.get((r.card as RawMapleWalletRow).wallet.toLowerCase());
      if (!s) return [];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "maple",
        familyName: "Maple",
        market: s.pools.length === 1 ? s.pools[0].symbol : undefined,
        positionId: r.positionId,
        href: r.href,
        status: r.status === "open" ? "open" : "closed",
        card: { kind: "maple", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      if (base.status === "open") return [base];
      const size = peakText(s);
      return [{ ...base, history: { ...historyBase(r), size, sizeNote: size ? "peak shares" : undefined } }];
    });
  },
  async head(open, _address, signal, _apiMs, { rows }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    signal.throwIfAborted();
    const state = await resolveMaplePoolState();
    signal.throwIfAborted();
    // The block and the pools' three Multicalls.
    const reads = 4;
    if (state.size === 0) return { reads, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
    const raw = new Map(rows.map((r) => [r.positionId, r.card as RawMapleWalletRow]));
    const { rows: cards } = await buildMaplePositionRows(
      open.map((p) => raw.get(p.positionId)!),
      state,
    );
    const byWallet = new Map(cards.map((c) => [c.wallet.toLowerCase(), c]));
    const first = [...state.values()][0];
    return {
      reads,
      positions: open.map((p): WalletPosition => {
        const s = byWallet.get((p.card as { row: MaplePositionSummary }).row.wallet.toLowerCase());
        // A pool the read did not answer keeps the stored shares.
        if (!s || s.pools.some((x) => x.currentValue == null)) return { ...p, headRead: "failed" };
        return {
          ...p,
          card: { kind: "maple", row: s },
          headRead: "read",
          readAtBlock: first.blockNumber,
          readAt: first.head?.blockTime ?? Math.floor(Date.now() / 1000),
        };
      }),
    };
  },
};
