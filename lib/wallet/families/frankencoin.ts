// Frankencoin on Ethereum, for the wallet view (decision 0071; SERVER-ONLY).
// One row per position contract (mig 526), the wallet its owner: the card is
// the listing's raw row, shaped by the listing's builder. A denied position is
// written closed and keeps 'denied' in the card, which the listing card words
// as denied; a succeeded challenge or a forced sale is a flag in the card, as
// the listing shows it, never a liquidation. Units at the last MintingUpdate.
// The head read is the listing's read of the owner (/api/frankencoin/positions
// with the owner, one call to rails-server): each position's row as the index
// holds it now. A position the read lists closed or denied holds nothing; one
// it does not list (passed to another owner) keeps its stored card. No
// dollars: Frankencoin runs no oracle (decision 0041).

import {
  buildFrankencoinPositionRows,
  type FrankencoinPositionSummary,
  type RawFrankencoinPositionRow,
} from "@/lib/sources/api/frankencoin-positions";
import { readFrankencoinPositions } from "@/lib/frankencoin/proxy-reads";
import { answerBody, routeBoxHop } from "@/lib/shared/proxy-answer";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

/** The listing route's most rows in one answer. */
const LIMIT = 500;

const rowOf = (p: WalletPosition) => (p.card as { row: FrankencoinPositionSummary }).row;

/** How a closed position ended, where the listing flags it. */
function ending(s: FrankencoinPositionSummary): string | undefined {
  if (s.status === "denied") return "Denied";
  if (s.challengeSucceededCount > 0) return plural(s.challengeSucceededCount, "succeeded challenge");
  return s.everForcedSale ? "Forced sale" : undefined;
}

export const frankencoin: FamilyModule = {
  id: "frankencoin",
  name: "Frankencoin",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "frankencoin",
  async shape(rows) {
    const cards = buildFrankencoinPositionRows(rows.map((r) => r.card as RawFrankencoinPositionRow));
    return rows.map((r, i): WalletPosition => {
      const s = cards[i];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "frankencoin",
        familyName: "Frankencoin",
        market: s.collateralSymbol,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "frankencoin", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      const size = s.peakMinted != null && s.peakMinted > 0 ? amountText(s.peakMinted, "ZCHF") : undefined;
      return {
        ...base,
        history: { ...historyBase(r), size, sizeNote: size ? "peak minted" : undefined, result: ending(s) },
      };
    });
  },
  async head(open, address, signal, _apiMs, { readerIp }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
    if (!base) throw new Error("RAILS_API_URL is not set");
    const qs = new URLSearchParams({
      owner: address.toLowerCase(),
      status: "open,closed,denied",
      limit: String(LIMIT),
      sortOrder: "desc",
    });
    const body = answerBody(
      await readFrankencoinPositions(qs, routeBoxHop(base, readerIp), signal),
      "Frankencoin positions",
    ) as { data: FrankencoinPositionSummary[] };
    const listed = new Map(body.data.map((s) => [s.position, s]));
    return {
      reads: 1,
      positions: open.map((p): WalletPosition => {
        const s = listed.get(rowOf(p).position);
        // Not listed for the owner: the stored card stands.
        if (!s) return { ...p, headRead: "failed" };
        if (s.status !== "open") return { ...p, closedSince: { block: s.lastBlockNumber }, headRead: "stored" };
        return {
          ...p,
          card: { kind: "frankencoin", row: s },
          headRead: "read",
          readAtBlock: s.lastBlockNumber,
          readAt: s.lastActivityAt,
        };
      }),
    };
  },
};
