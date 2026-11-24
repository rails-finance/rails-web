// Polaris on Sepolia (testnet), for the wallet view (decision 0071;
// SERVER-ONLY). One row per CDP, reserve loan or Stability Pool deposit the
// wallet holds (mig 529), `kind` in the card ('cdp', 'loan' or 'sp'), which
// holds the fields the kind's listing card draws under the listing's names. A
// CDP goes through the CDP listing's builder to PolarisPositionCard, a loan to
// PolarisLoanCard, a deposit to PolarisDepositCard. Units are at the last row:
// a loan's debt at the index of its last touch, a deposit as recorded at its
// last operation. Every figure is a testnet figure, so the page keeps Polaris
// out of the wallet's counts and totals (WALLET_COUNTS_SCOPE).
//
// The head read is what the three listings read for a holder, one call to
// rails-server per kind the wallet holds open (/api/polaris/positions,
// /api/polaris/reserve-loans and /api/polaris/stability-pool with the
// wallet), and for open CDPs the CDP listing's market board (one Sepolia
// Multicall, kept 60 s), which gives each CDP card its ratio. A position the
// read lists closed or liquidated holds nothing; one it does not list (its
// NFT passed on) keeps its stored card. A whole loan or deposit answer then
// holds nothing for it at the route's served_thru_block, the index head it
// states; the CDP route states none, so a CDP it leaves out keeps its stored
// card alone. A loan untouched since the store's
// row keeps its stored debt; one touched since takes the listing's row.

import {
  buildPolarisPositionRows,
  type PolarisPositionSummary,
  type RawPolarisPositionRow,
} from "@/lib/sources/api/polaris-positions";
import { readPolarisPositionsFromBackend } from "@/lib/sources/api/polaris-positions-backend";
import {
  readPolarisSpLoans,
  type PolarisDepositListResponse,
  type PolarisDepositRow,
  type PolarisLoanListResponse,
  type PolarisLoanRow,
} from "@/lib/sources/api/polaris-sp-loans";
import { loadPolarisMarketsFromChain, type PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";
import { createAuthHeaders } from "@/lib/api/fetch-with-auth";
import { SEPOLIA_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, opt, plural, storeStamp, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import { holdsNothingSince } from "@/lib/wallet/holds-nothing";
import type { FamilyModule, HeadResult } from "./module";

/** The listing routes' most rows in one answer. */
const LIMIT = 500;

type PolarisRowKind = "cdp" | "loan" | "sp";

/** The row's kind, from its card (mig 529). */
const polarisKindOf = (card: unknown): PolarisRowKind | undefined => {
  const kind = (card as { kind?: unknown } | null)?.kind;
  return kind === "cdp" || kind === "loan" || kind === "sp" ? kind : undefined;
};

const STABLE: Record<string, string> = { usdp: "USDp", goldp: "GOLDp" };

/** A stored CDP card through the listing's builder: the card leaves out what
 *  the listing card does not draw, and states the liquidation in `status`. */
function cdpOf(card: unknown): PolarisPositionSummary | undefined {
  const raw = card as RawPolarisPositionRow;
  return buildPolarisPositionRows([{ ...raw, liquidated: raw.liquidated ?? raw.status === "liquidated" }])[0];
}

function shapeRow(r: WalletSummaryRow): WalletPosition | null {
  const kind = polarisKindOf(r.card);
  const base = {
    chain: SEPOLIA_CHAIN_ID as ChainId,
    family: "polaris",
    familyName: "Polaris",
    positionId: r.positionId,
    href: r.href,
    status: r.status,
    headRead: "none" as const,
    ...storeStamp(r),
  };
  const ended = r.status !== "open";
  if (kind === "cdp") {
    const s = cdpOf(r.card);
    if (!s) return null;
    const size = s.peakDebt > 0 ? amountText(s.peakDebt, s.stableSymbol) : undefined;
    return {
      ...base,
      market: s.stableSymbol,
      card: { kind: "polaris-cdp", row: s, markets: null },
      ...(ended && {
        history: {
          ...historyBase(r),
          size,
          sizeNote: size ? "peak debt" : undefined,
          result: s.liqCount > 0 ? plural(s.liqCount, "liquidation") : undefined,
        },
      }),
    };
  }
  if (kind === "loan")
    return {
      ...base,
      market: "Reserve loan",
      card: {
        kind: "polaris-loan",
        row: r.card as PolarisLoanRow,
        via: "wallet",
        blocks: { coll: opt(r.readBlock), debt: opt(r.readBlock) },
      },
      ...(ended && { history: historyBase(r) }),
    };
  if (kind === "sp") {
    const row = r.card as PolarisDepositRow;
    return {
      ...base,
      market: STABLE[row.market],
      card: { kind: "polaris-deposit", row, via: "wallet", block: opt(r.readBlock) },
      ...(ended && { history: historyBase(r) }),
    };
  }
  return null;
}

/** What one kind's listing read answered: each position's row by its key,
 *  and the index head the route states the rows current to, where it states
 *  one and the answer is whole. */
interface Listed<T> {
  rows: Map<string, T>;
  head: () => number | undefined;
}

const blockOf = (v: string | number | null | undefined): number | undefined => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const cdpKey = (s: { market: string; cdpId: string }) => `${s.market}:${s.cdpId}`;
const spKey = (r: { market: string; token_id: string }) => `${r.market}:${r.token_id}`;

const settledOr = <T>(s: PromiseSettledResult<T> | undefined): T | null => (s?.status === "fulfilled" ? s.value : null);

export const polaris: FamilyModule = {
  id: "polaris",
  name: "Polaris",
  chain: SEPOLIA_CHAIN_ID,
  summaryChain: "sepolia",
  summaryFamily: "polaris",
  async shape(rows) {
    return rows.flatMap((r) => shapeRow(r) ?? []);
  },
  async head(open, address, signal, _apiMs, { readerIp }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
    if (!base) throw new Error("RAILS_API_URL is not set");
    const wallet = address.toLowerCase();
    const has = (k: string) => open.some((p) => p.card.kind === k);
    const hop = { baseUrl: base, headers: createAuthHeaders(readerIp), signal };
    const list = { wallet, limit: String(LIMIT), sortOrder: "desc" };
    let reads = 0;
    const read = <T>(on: boolean, fn: () => Promise<T>): Promise<T | null> => {
      if (!on) return Promise.resolve(null);
      reads += 1;
      return fn();
    };
    const [cdps, board, loans, deposits] = await Promise.allSettled([
      read(has("polaris-cdp"), async () => {
        const r = await readPolarisPositionsFromBackend(
          { wallet, status: ["open", "closed", "liquidated"], limit: LIMIT, sortOrder: "desc" },
          readerIp,
          signal,
        );
        if (!r.ok) throw new Error(`/api/polaris/positions answered ${r.status}`);
        // The route states no head for the rows it serves: the market books'
        // lastScannedBlock is mv_polaris_markets', refreshed apart from them.
        const listed: Listed<PolarisPositionSummary> = {
          rows: new Map(r.result.data.map((s) => [cdpKey(s), s])),
          head: () => undefined,
        };
        return listed;
      }),
      read(has("polaris-cdp"), async (): Promise<PolarisMarketsChainResponse | null> => {
        const b = await loadPolarisMarketsFromChain();
        return b.chainStale ? null : b;
      }),
      read(has("polaris-loan"), async () => {
        const r = await readPolarisSpLoans<PolarisLoanListResponse>("reserve-loans", list, hop);
        const whole = r.pagination.total <= r.rows.length;
        const listed: Listed<PolarisLoanRow> & { index: PolarisLoanListResponse["index"] } = {
          rows: new Map(r.rows.map((x) => [x.loan_id, x])),
          head: () => (whole ? blockOf(r.served_thru_block) : undefined),
          index: r.index,
        };
        return listed;
      }),
      read(has("polaris-deposit"), async () => {
        const r = await readPolarisSpLoans<PolarisDepositListResponse>("stability-pool", list, hop);
        const whole = r.pagination.total <= r.rows.length;
        const listed: Listed<PolarisDepositRow> = {
          rows: new Map(r.rows.map((x) => [spKey(x), x])),
          head: () => (whole ? blockOf(r.served_thru_block) : undefined),
        };
        return listed;
      }),
    ]);
    signal.throwIfAborted();
    const cdpRows = settledOr(cdps);
    const markets = settledOr(board) ?? null;
    const loanRead = settledOr(loans);
    const spRows = settledOr(deposits);
    // Left out of a whole answer: the wallet holds nothing there at the
    // route's stated head, where that is at or past the stored read. A read
    // that did not answer leaves the stored card as failed.
    const leftOut = <T>(p: WalletPosition, read: Listed<T> | null): WalletPosition => {
      if (!read) return { ...p, headRead: "failed" };
      const head = holdsNothingSince(read.head(), p.readAtBlock);
      return { ...p, ...(head != null ? { closedSince: { block: head } } : {}), headRead: "stored" };
    };

    return {
      reads,
      positions: open.map((p): WalletPosition => {
        const c = p.card;
        if (c.kind === "polaris-cdp") {
          const s = cdpRows?.rows.get(cdpKey(c.row));
          // The board still gives a stored CDP its ratio.
          if (!s) return leftOut({ ...p, card: { ...c, markets } }, cdpRows);
          if (s.status !== "open")
            return { ...p, card: { ...c, markets }, closedSince: { block: s.lastBlock }, headRead: "stored" };
          return {
            ...p,
            card: { kind: "polaris-cdp", row: s, markets },
            headRead: "read",
            readAtBlock: s.lastBlock,
            readAt: s.lastTs,
          };
        }
        if (c.kind === "polaris-loan") {
          const s = loanRead?.rows.get(c.row.loan_id);
          if (!s) return leftOut(p, loanRead);
          if (s.status !== "open") return { ...p, closedSince: { block: Number(s.last_block) }, headRead: "stored" };
          // Untouched since the store's row: its debt at the last touch, which
          // the card's tip states, stands.
          if (String(s.last_timestamp) === String(c.row.last_timestamp)) return { ...p, headRead: "read" };
          // Touched since: the listing's row, its debt at the deployment's
          // latest index.
          const at = loanRead?.index;
          const debtBlock = blockOf(at?.block_number) ?? blockOf(s.last_block);
          return {
            ...p,
            card: {
              kind: "polaris-loan",
              row: s,
              via: "listing",
              blocks: { coll: blockOf(s.last_block), debt: debtBlock },
            },
            headRead: "read",
            readAtBlock: debtBlock,
            readAt: Number(at?.block_timestamp ?? s.last_timestamp) || undefined,
          };
        }
        if (c.kind === "polaris-deposit") {
          const s = spRows?.rows.get(spKey(c.row));
          if (!s) return leftOut(p, spRows);
          if (s.status !== "open") return { ...p, closedSince: { block: Number(s.last_block) }, headRead: "stored" };
          return {
            ...p,
            card: { kind: "polaris-deposit", row: s, via: "listing", block: blockOf(s.last_block) },
            headRead: "read",
            readAtBlock: blockOf(s.last_block),
            readAt: Number(s.last_timestamp) || undefined,
          };
        }
        return p;
      }),
    };
  },
};
