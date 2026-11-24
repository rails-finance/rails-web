// PWN on Ethereum, for the wallet view (decision 0071; SERVER-ONLY). One row
// per (loan, role) (mig 527): the wallet is the loan's borrower or its lender,
// `role` in the card, which is the listing's raw row, shaped by the listing's
// builder. A borrower's row is a loan (the principal its debt), a lender's a
// deposit (the credit it advanced). An open loan past its deadline is the
// listing's "Defaulted, not yet claimed", which the card works out at visit
// from the terms (pwnLoanState); the row stays open, its collateral in escrow.
// The link is the wallet's own PWN page for the loan. The head read is the
// listing's read of the wallet (/api/pwn/positions with the wallet, one call
// to rails-server): each loan's row as the store holds it now. A loan it lists
// repaid or defaulted holds nothing for the wallet. One it does not list keeps
// its stored card; a whole answer then holds nothing for it at the store's
// latest block. No dollars: the listing prices none (decision 0041).

import { buildPwnPositionRows, type PwnPositionSummary, type RawPwnPositionRow } from "@/lib/sources/api/pwn-positions";
import { readPwnPositions } from "@/lib/pwn/proxy-reads";
import { answerBody, routeBoxHop } from "@/lib/shared/proxy-answer";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { historyBase, storeStamp } from "@/lib/wallet/summary-row";
import { holdsNothingSince } from "@/lib/wallet/holds-nothing";
import type { FamilyModule, HeadResult } from "./module";

/** The listing route's most rows in one answer (it caps `limit` at 100). */
const LIMIT = 100;

const keyOf = (s: Pick<PwnPositionSummary, "version" | "loanId">) => `${s.version ?? ""}-${s.loanId}`;
const rowOf = (p: WalletPosition) => (p.card as { row: PwnPositionSummary }).row;

export const pwn: FamilyModule = {
  id: "pwn",
  name: "PWN",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "pwn",
  async shape(rows) {
    const cards = await buildPwnPositionRows(rows.map((r) => r.card as RawPwnPositionRow));
    return rows.map((r, i): WalletPosition => {
      const s = cards[i];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "pwn",
        familyName: "PWN",
        market: s.credit?.symbol,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "pwn", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      return {
        ...base,
        history: { ...historyBase(r), result: s.status === "defaulted" ? "Defaulted" : "Repaid" },
      };
    });
  },
  async head(open, address, signal, _apiMs, { readerIp }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
    if (!base) throw new Error("RAILS_API_URL is not set");
    const qs = new URLSearchParams({
      wallet: address.toLowerCase(),
      status: "open,repaid,defaulted",
      limit: String(LIMIT),
      sortOrder: "desc",
    });
    const body = answerBody(await readPwnPositions(qs, routeBoxHop(base, readerIp), signal), "PWN loans") as {
      data: PwnPositionSummary[];
      pagination: { total: number };
    };
    const listed = new Map(body.data.map((s) => [keyOf(s), s]));
    // The store holds every loan event through the latest one it states.
    const indexed = body.data.reduce<number | undefined>(
      (m, s) => Math.max(m ?? 0, s.closedBlock ?? 0, s.createdBlock ?? 0),
      undefined,
    );
    const whole = body.pagination.total <= body.data.length;
    return {
      reads: 1,
      positions: open.map((p): WalletPosition => {
        const s = listed.get(keyOf(rowOf(p)));
        // Not listed for the wallet: the stored card stands. Left out of a
        // whole answer, the wallet holds nothing there at the store's block,
        // where that is at or past the stored read.
        if (!s) {
          const head = whole ? holdsNothingSince(indexed, p.readAtBlock) : undefined;
          return { ...p, ...(head != null ? { closedSince: { block: head } } : {}), headRead: "stored" };
        }
        if (s.status !== "open")
          return { ...p, closedSince: { block: s.closedBlock ?? s.createdBlock ?? 0 }, headRead: "stored" };
        return { ...p, card: { kind: "pwn", row: s }, headRead: "read" };
      }),
    };
  },
};
