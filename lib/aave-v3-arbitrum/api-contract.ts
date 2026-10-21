// The contract with rails-server's Aave V3 Arbitrum lane — both routes, in one
// file, so a change in the server's final shape is an edit here and nowhere
// else (rails-ops TO-DO-arbitrum-scoping.md §9 items 4 and 5).
//
//   POST /api/aave-v3-arbitrum/visits    the position page's chain read
//   GET  /api/aave-v3-arbitrum/timeline  a wallet's history, Base's row shape
//   GET  /api/aave-v3-arbitrum/positions the recorded wallets, newest visit first
//
// As landed on rails-server main (9cd6ebd; /positions 8a81dea). Collateral on/off events are stored
// there and not returned as rows; the arb1 witness covers Pool rows only, so
// `arb1ThroughBlock` says nothing about the aToken transfers.
//
// SERVER-ONLY in use (the callers send the bearer token); the types are plain.

import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import type { AaveV3IndexRow } from "@/lib/sources/api/aave-v3-base-timeline";

/** rails-server's mount for this lane. */
export const AAVE_V3_ARBITRUM_API_PREFIX = "/api/aave-v3-arbitrum";

// ── POST /visits ────────────────────────────────────────────────────────────

/** The body: the fields of the page's Pool read, as the reader returned them
 *  (the server takes up to 64 reserves). It answers `{ wallet, visitCount,
 *  history: { status, confirmedThroughBlock } }`, which the page does not read. */
export type AaveV3ArbitrumVisitBody = Pick<
  AaveV3PositionChainResponse,
  | "wallet"
  | "blockNumber"
  | "healthFactor"
  | "avgLiquidationThreshold"
  | "ltv"
  | "totalCollateralUsd"
  | "totalDebtUsd"
  | "supplyAssetCount"
  | "debtAssetCount"
  | "reserves"
  | "chainStale"
>;

export function visitBodyOf(read: AaveV3PositionChainResponse): AaveV3ArbitrumVisitBody {
  return {
    wallet: read.wallet.toLowerCase(),
    blockNumber: read.blockNumber,
    healthFactor: read.healthFactor,
    avgLiquidationThreshold: read.avgLiquidationThreshold,
    ltv: read.ltv,
    totalCollateralUsd: read.totalCollateralUsd,
    totalDebtUsd: read.totalDebtUsd,
    supplyAssetCount: read.supplyAssetCount,
    debtAssetCount: read.debtAssetCount,
    reserves: read.reserves,
    chainStale: read.chainStale,
  };
}

// ── GET /timeline?wallet= ───────────────────────────────────────────────────

/** One row: Base's `TimelineRow` (`kind` supply / withdraw / borrow / repay /
 *  liquidation / transfer_in / transfer_out, `block_number` a decimal string,
 *  `tx_hash` with 0x, `amount` a decimal string, the liquidation fields, and
 *  `atoken` / `counterparty` / `index_raw` on transfers). No `price_usd`, and
 *  `tx_from` is null until the validator fills it. */
export type AaveV3ArbitrumTimelineRow = AaveV3IndexRow;

/** Which store answered and what a second witness has said about it. Block
 *  fields are null where the server has not reached them. */
export interface AaveV3ArbitrumTimelineCoverage {
  /** Where the body of the history came from. */
  source: "etherscan" | "tenderly";
  status: "unconfirmed" | "confirmed" | "disputed";
  /** The newest block the body covers. */
  bodyThroughBlock: number | null;
  /** The newest block of the Tenderly tail merged over it. */
  tailThroughBlock: number | null;
  /** The newest block the validator agrees through. */
  confirmedThroughBlock: number | null;
  /** The newest block the keyless arb1 walk has sampled. */
  arb1ThroughBlock: number | null;
  /** When the validator last ran; null before it has. */
  validatedAt: string | null;
  /** Logs only Etherscan returned, dropped from `rows`, and which they were. */
  droppedCount: number;
  dropped: AaveV3ArbitrumDroppedLog[];
  /** The body starts at the Pool's creation block (always, by the contract;
   *  read rather than assumed, since a whole-life claim rests on it). */
  fromDeployment: boolean;
  /** Ranges inside the span no source answered for (on the wire
   *  `{ fromBlock, toBlock, reason }`; empty unless the Tenderly tail failed). */
  gaps: { from: number; to: number; reason?: string }[];
}

export interface AaveV3ArbitrumDroppedLog {
  txHash: string;
  logIndex: number;
  blockNumber: number;
}

export interface AaveV3ArbitrumTimelineResponse {
  /** The API's row ceiling was hit (false, by the contract): not whole. */
  truncated: boolean;
  rows: AaveV3ArbitrumTimelineRow[];
  totalEvents: number;
  /** aToken BalanceTransfer rows are in `rows` (true, by the contract). */
  transfersCaptured: boolean;
  coverage: AaveV3ArbitrumTimelineCoverage;
}

const block = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** The answer checked against the contract; null when it does not hold one.
 *  Block fields are read as numbers whether the server sends them as numbers
 *  or decimal strings. Every Arbitrum family answers this envelope; `Row` is
 *  the family's row (Morpho's reader passes its own). */
export function readTimelineAnswer<Row = AaveV3ArbitrumTimelineRow>(
  raw: unknown,
): (Omit<AaveV3ArbitrumTimelineResponse, "rows"> & { rows: Row[] }) | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const c = r.coverage as Record<string, unknown> | undefined;
  if (!Array.isArray(r.rows) || !c || typeof c !== "object") return null;
  if (c.source !== "etherscan" && c.source !== "tenderly") return null;
  if (c.status !== "unconfirmed" && c.status !== "confirmed" && c.status !== "disputed") return null;
  const gaps = Array.isArray(c.gaps)
    ? (c.gaps as { fromBlock?: unknown; toBlock?: unknown; reason?: unknown }[]).flatMap((g) => {
        const from = block(g?.fromBlock);
        const to = block(g?.toBlock);
        if (from == null || to == null) return [];
        return [{ from, to, ...(typeof g.reason === "string" ? { reason: g.reason } : {}) }];
      })
    : [];
  const dropped = Array.isArray(c.dropped)
    ? (c.dropped as { tx_hash?: unknown; log_index?: unknown; block_number?: unknown }[]).flatMap((d) => {
        const blockNumber = block(d?.block_number);
        const logIndex = block(d?.log_index);
        return typeof d?.tx_hash === "string" && blockNumber != null && logIndex != null
          ? [{ txHash: d.tx_hash.toLowerCase(), logIndex, blockNumber }]
          : [];
      })
    : [];
  return {
    truncated: r.truncated === true,
    rows: r.rows as Row[],
    totalEvents: block(r.totalEvents) ?? r.rows.length,
    transfersCaptured: r.transfersCaptured === true,
    coverage: {
      source: c.source,
      status: c.status,
      bodyThroughBlock: block(c.bodyThroughBlock),
      tailThroughBlock: block(c.tailThroughBlock),
      confirmedThroughBlock: block(c.confirmedThroughBlock),
      arb1ThroughBlock: block(c.arb1ThroughBlock),
      validatedAt: typeof c.validatedAt === "string" ? c.validatedAt : null,
      droppedCount: block(c.droppedCount) ?? dropped.length,
      dropped,
      fromDeployment: c.fromDeployment === true,
      gaps,
    },
  };
}

// ── GET /positions?limit=&offset= ───────────────────────────────────────────

/** A visited wallet's history state; the server sends null before a visit
 *  has queued one. */
export interface AaveV3ArbitrumPositionHistory {
  status: "unconfirmed" | "confirmed" | "disputed";
  bodySource: "etherscan" | "tenderly" | null;
  confirmedThroughBlock: number | null;
  validatedAt: string | null;
  droppedCount: number;
  error: string | null;
}

/** One recorded wallet: the stored Pool read (figures as the server's decimal
 *  strings, read here as numbers) and its visit counts. */
export interface AaveV3ArbitrumPositionRow {
  wallet: string;
  blockNumber: number | null;
  /** Null when the wallet had no debt at the read. */
  healthFactor: number | null;
  avgLiquidationThreshold: number | null;
  ltv: number | null;
  totalCollateralUsd: number | null;
  totalDebtUsd: number | null;
  supplyCount: number;
  borrowCount: number;
  chainOpen: boolean | null;
  chainHasDebt: boolean | null;
  chainStale: boolean;
  refreshedAt: string | null;
  firstVisitedAt: string | null;
  lastVisitedAt: string | null;
  visitCount: number;
  /** The wallet's last block in the daily discovery log read; null for a
   *  wallet no discovery named. Optional on the wire until rails-server
   *  sends it (rails-ops TO-DO-arbitrum-scoping.md item 16). */
  lastActivityBlock: number | null;
  /** The wallet's distinct transactions over its recorded history; null
   *  until rails-server sends it. */
  txCount?: number | null;
  history: AaveV3ArbitrumPositionHistory | null;
}

export interface AaveV3ArbitrumPositionsResponse {
  rows: AaveV3ArbitrumPositionRow[];
  total: number;
  limit: number;
  offset: number;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** The answer checked against the contract; null when it does not hold one.
 *  A row without a wallet address is dropped; numeric fields are read as
 *  numbers whether the server sends numbers or decimal strings. */
export function readPositionsAnswer(raw: unknown): AaveV3ArbitrumPositionsResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.rows)) return null;
  const rows = (r.rows as Record<string, unknown>[]).flatMap((p): AaveV3ArbitrumPositionRow[] => {
    if (!p || typeof p !== "object" || typeof p.wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(p.wallet)) return [];
    const h = p.history as Record<string, unknown> | null | undefined;
    const status = h?.status;
    const history: AaveV3ArbitrumPositionHistory | null =
      h && (status === "unconfirmed" || status === "confirmed" || status === "disputed")
        ? {
            status,
            bodySource: h.bodySource === "etherscan" || h.bodySource === "tenderly" ? h.bodySource : null,
            confirmedThroughBlock: block(h.confirmedThroughBlock),
            validatedAt: str(h.validatedAt),
            droppedCount: block(h.droppedCount) ?? 0,
            error: str(h.error),
          }
        : null;
    return [
      {
        wallet: p.wallet.toLowerCase(),
        blockNumber: block(p.blockNumber),
        healthFactor: block(p.healthFactor),
        avgLiquidationThreshold: block(p.avgLiquidationThreshold),
        ltv: block(p.ltv),
        totalCollateralUsd: block(p.totalCollateralUsd),
        totalDebtUsd: block(p.totalDebtUsd),
        supplyCount: block(p.supplyCount) ?? 0,
        borrowCount: block(p.borrowCount) ?? 0,
        chainOpen: bool(p.chainOpen),
        chainHasDebt: bool(p.chainHasDebt),
        chainStale: p.chainStale === true,
        refreshedAt: str(p.refreshedAt),
        firstVisitedAt: str(p.firstVisitedAt),
        lastVisitedAt: str(p.lastVisitedAt),
        visitCount: block(p.visitCount) ?? 0,
        lastActivityBlock: block(p.lastActivityBlock),
        txCount: block(p.txCount),
        history,
      },
    ];
  });
  return {
    rows,
    total: block(r.total) ?? rows.length,
    limit: block(r.limit) ?? rows.length,
    offset: block(r.offset) ?? 0,
  };
}
