// Alchemix on Ethereum (V2 and V3) and on Base (V3), for the wallet view
// (decision 0071; SERVER-ONLY). Both chains write the slug 'alchemix' (mig
// 523), so the modules are per chain. Each row's card is its listing's row.
//
// V2 (Ethereum): one row per (line, account), closed history frozen at the
// 2026-04-02 wind-down, drawn with the V2 listing's card. No head read.
//
// V3: one row per (line, position NFT) the wallet holds, the reading at the
// position's last band edge, with no reducer block and no dollars. The head
// read is the listing's read of the holder on the chain
// (/api/alchemix/positions with the owner and the chain, one call to
// rails-server): each position's figures at the line's head reading. A
// position it reads closed holds nothing at that block. One it does not list
// (its NFT passed to another holder), or lists refused or with no reading,
// keeps its stored card; a whole answer then holds nothing for it at its
// line's head block. No dollars: the listing prices none (decision 0041).

import { readAlchemixPositionsFromBackend } from "@/lib/sources/api/alchemix-positions-backend";
import { ALCHEMIX_BASE, ALCHEMIX_ETHEREUM, type AlchemixDeployment } from "@/lib/alchemix/lines";
import type { ChainId } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import type { WalletSummaryRow } from "@/lib/wallet/summary-row";
import { historyBase, plural, storeStamp } from "@/lib/wallet/summary-row";
import type {
  AlchemixPositionSummary,
  AlchemixStoredPositionSummary,
  AlchemixV2PositionSummary,
} from "@/types/api/alchemix";
import { holdsNothingSince } from "@/lib/wallet/holds-nothing";
import type { FamilyModule, HeadResult } from "./module";

/** The listing route's most rows in one answer. */
const LIMIT = 500;

const isV2 = (card: unknown) => (card as { version?: unknown } | null)?.version === "v2";

const rowOf = (p: WalletPosition) => (p.card as { row: AlchemixStoredPositionSummary }).row;

function module(dep: AlchemixDeployment, lane: "ethereum" | "base"): FamilyModule {
  const chain = dep.chainId as ChainId;
  const position = (r: WalletSummaryRow, card: WalletPosition["card"], market: string): WalletPosition => ({
    chain,
    family: "alchemix",
    familyName: "Alchemix",
    market,
    positionId: r.positionId,
    href: r.href,
    status: r.status,
    card,
    headRead: "none",
    ...storeStamp(r),
  });
  return {
    id: lane === "base" ? "alchemix-base" : "alchemix",
    name: "Alchemix",
    chain,
    summaryChain: lane,
    summaryFamily: "alchemix",
    async shape(rows) {
      return rows.map((r): WalletPosition => {
        if (isV2(r.card)) {
          const row = r.card as AlchemixV2PositionSummary;
          // Closed history: the store records no peak, and the card states the
          // frozen debt and collateral.
          return {
            ...position(r, { kind: "alchemix-v2", row }, `${row.syntheticSymbol} V2`),
            status: "closed",
            history: historyBase(r),
          };
        }
        const row = r.card as AlchemixStoredPositionSummary;
        const base = position(r, { kind: "alchemix", lane, row }, row.syntheticSymbol);
        if (r.status === "open") return base;
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
      const read = await readAlchemixPositionsFromBackend(
        { chainId: dep.chainId, owner: address.toLowerCase(), limit: LIMIT, offset: 0 },
        readerIp,
        signal,
      );
      if (!read.ok) throw new Error(`/api/alchemix/positions answered ${read.status}`);
      const data = read.result.data;
      const listed = new Map(data.map((s) => [`${s.lineKey}:${s.tokenId}`, s]));
      // A reading's block: the line's head reading, or the debt's block
      // where that reading is stale.
      const blockOf = (s: AlchemixPositionSummary): number | null =>
        (s.chainReading && !s.chainReading.stale ? s.chainReading.blockNumber : null) ??
        s.figures.debt?.asOfBlock ??
        null;
      // Each line's head block, from the answer's rows on it.
      const lineBlock = new Map<string, number>();
      for (const s of data) {
        const b = blockOf(s);
        if (b != null && b > (lineBlock.get(s.lineKey) ?? 0)) lineBlock.set(s.lineKey, b);
      }
      const whole = read.result.pagination.total <= data.length;
      return {
        reads: 1,
        positions: open.map((p): WalletPosition => {
          const stored = rowOf(p);
          const s = listed.get(`${stored.lineKey}:${stored.tokenId}`);
          const block = s ? blockOf(s) : null;
          if (s && block != null && s.status === "closed") return { ...p, closedSince: { block }, headRead: "stored" };
          if (s && block != null && s.status === "open")
            return {
              ...p,
              card: { kind: "alchemix", lane, row: s },
              headRead: "read",
              readAtBlock: block,
              readAt: undefined,
            };
          // The read answered without figures for it: the stored card stands.
          // Not listed in a whole answer, the wallet holds nothing there at
          // the line's head block, where that is at or past the stored read.
          const head = !s && whole ? holdsNothingSince(lineBlock.get(stored.lineKey), p.readAtBlock) : undefined;
          return { ...p, ...(head != null ? { closedSince: { block: head } } : {}), headRead: "stored" };
        }),
      };
    },
  };
}

export const alchemixEthereum = module(ALCHEMIX_ETHEREUM, "ethereum");
export const alchemixBase = module(ALCHEMIX_BASE, "base");
