// Euler V2 on Base, for the wallet view (decision 0071; SERVER-ONLY). One row
// per (sub-account, vault) pair (mig 517): the store holds shares and no
// asset amount, so a stored card states the pair's flags alone
// (lib/euler/wallet-card.ts). The head read is the explorer's wallet read,
// GET /api/at-block/euler/positions for the owner, one call to rails-server:
// every account's holdings at one Base block, each the amount its shares
// redeem for and its debt. A pair the read lists takes those figures. A pair
// it no longer lists, or lists holding nothing, is closed since the sweep
// where the read covers every account's deposits (the position index's, or
// account 0); otherwise it is not read. No dollars: the wallet read prices
// nothing (decision 0041).

import { fetchEulerWallet } from "@/lib/api/fetch-euler";
import { eulerPairOf, type EulerWalletCardRow } from "@/lib/euler/wallet-card";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { historyBase, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

/** The stored card (mig 517): the pair, its flags and its shares. */
interface RawEulerPairCard {
  account: string;
  index: number | null;
  vault: string;
  shares: string | null;
  collateral: boolean | null;
  controller: boolean | null;
}

const rowOf = (p: WalletPosition) => (p.card as { row: EulerWalletCardRow }).row;

export const eulerV2Base: FamilyModule = {
  id: "euler-v2-base",
  name: "Euler V2",
  chain: BASE_CHAIN_ID,
  summaryChain: "base",
  summaryFamily: "euler-v2",
  async shape(rows) {
    return rows.map((r): WalletPosition => {
      const c = (r.card ?? {}) as Partial<RawEulerPairCard>;
      const status = r.status === "liquidated" ? "liquidated" : r.status === "open" ? "open" : "closed";
      const row: EulerWalletCardRow = {
        status,
        account: (c.account ?? r.positionId.split("-")[0]).toLowerCase(),
        index: c.index ?? null,
        vault: (c.vault ?? r.market ?? "").toLowerCase(),
        collateral: c.collateral === true,
        controller: c.controller === true,
        read: null,
      };
      const base: WalletPosition = {
        chain: BASE_CHAIN_ID,
        family: "euler-v2",
        familyName: "Euler V2",
        positionId: r.positionId,
        href: r.href,
        status,
        card: { kind: "euler-v2", row },
        headRead: "none",
        ...storeStamp(r),
      };
      if (status === "open") return base;
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
  async head(open, address, signal): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    signal.throwIfAborted();
    const answer = await fetchEulerWallet(BASE_CHAIN_ID, address);
    signal.throwIfAborted();
    if (answer.kind !== "ok") return { reads: 0, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
    const w = answer.data;
    // The read without its accounts, for the receipts.
    const wallet = { ...w, accounts: [] };
    const block = w.head.block;
    return {
      reads: 1,
      positions: open.map((p): WalletPosition => {
        const row = rowOf(p);
        const pair = eulerPairOf(w, row.account, row.vault);
        if (pair && (pair.deposit || pair.loan)) {
          const symbol = (pair.deposit ?? pair.loan)!.vaultSymbol;
          return {
            ...p,
            market: symbol,
            card: { kind: "euler-v2", row: { ...row, read: { wallet, ...pair } } },
            headRead: "read",
            readAtBlock: block,
            readAt: w.head.time,
          };
        }
        // The read finds every account's deposits through the position
        // index, or account 0's alone: only then does a missing pair hold
        // nothing. A truncated read proves nothing.
        const covered = !w.truncated && (w.deposits?.source === "index" || row.index === 0);
        if (!covered) return { ...p, headRead: "failed" };
        return { ...p, closedSince: { block }, headRead: "stored" };
      }),
    };
  },
};
