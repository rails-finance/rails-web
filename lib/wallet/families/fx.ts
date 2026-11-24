// f(x) Protocol V2 on Ethereum, for the wallet view (decision 0071;
// SERVER-ONLY). One row per position NFT, (pool, id) (mig 525), the wallet the
// NFT's holder: the card is the listing's raw row, shaped by the listing's
// toFxSummary. An open row states getPosition at its last event; one whose
// read is not stored yet states no figure and is marked not read. The head
// read is the listing's read of the holder (/api/fx/positions with the owner,
// one call to rails-server): each position's sweep read, with its block, debt
// ratio and the pool's oracle price. It fills a position not read where the
// sweep has read it. A position the sweep reads closed holds nothing at that
// block; one the read does not list (passed to another holder) keeps its
// stored card. No dollars: the listing prices at visit in the browser
// (decision 0041).

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { toFxSummary, type FxPositionSummary, type RawFxPositionRow } from "@/lib/sources/api/fx-positions";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { historyBase, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

/** The listing route's most rows in one answer. */
const LIMIT = 500;

/** The holder's positions as the listing answers them, every status. */
async function readHolder(
  holder: string,
  signal: AbortSignal,
  readerIp?: string,
): Promise<{ positions: RawFxPositionRow[]; total: number }> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  const qs = new URLSearchParams({ owner: holder.toLowerCase(), limit: String(LIMIT), sortOrder: "desc" });
  const res = await fetch(`${base}/api/fx/positions?${qs}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`/api/fx/positions answered ${res.status}`);
  return (await res.json()) as { positions: RawFxPositionRow[]; total: number };
}

const keyOf = (s: Pick<FxPositionSummary, "pool" | "positionId">) => `${s.pool}-${s.positionId}`;
const rowOf = (p: WalletPosition) => (p.card as { row: FxPositionSummary }).row;

export const fx: FamilyModule = {
  id: "fx",
  name: "f(x) Protocol",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "fx",
  readsNotRead: true,
  async shape(rows) {
    return rows.map((r): WalletPosition => {
      const s = toFxSummary(r.card as RawFxPositionRow);
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "fx",
        familyName: "f(x) Protocol",
        market: s.poolSymbol,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "fx", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      // No boundary read stored at the last event yet (mig 525).
      if (r.status === "open") return s.settled.colls == null ? { ...base, notRead: true } : base;
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
  async head(open, address, signal, _apiMs, { readerIp }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const answer = await readHolder(address, signal, readerIp);
    const listed = new Map(answer.positions.map((raw) => [`${raw.pool_key}-${raw.position}`, toFxSummary(raw)]));
    return {
      reads: 1,
      positions: open.map((p): WalletPosition => {
        const s = listed.get(keyOf(rowOf(p)));
        // Not listed for the holder, or not swept yet: the stored card stands.
        if (!s || s.status === "unknown" || s.settled.block == null)
          return p.notRead ? p : { ...p, headRead: "failed" };
        if (s.status === "closed")
          return { ...p, notRead: undefined, closedSince: { block: s.settled.block }, headRead: "stored" };
        if (s.settled.colls == null) return p.notRead ? p : { ...p, headRead: "failed" };
        return {
          ...p,
          notRead: undefined,
          card: { kind: "fx", row: s },
          headRead: "read",
          readAtBlock: s.settled.block,
          readAt: undefined,
        };
      }),
    };
  },
};
