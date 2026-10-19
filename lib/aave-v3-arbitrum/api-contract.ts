// The contract with rails-server's Aave V3 Arbitrum lane — both routes, in one
// file, so a change in the server's final shape is an edit here and nowhere
// else (rails-ops TO-DO-arbitrum-scoping.md §9 items 4 and 5).
//
//   POST /api/aave-v3-arbitrum/visits    the position page's chain read
//   GET  /api/aave-v3-arbitrum/timeline  a wallet's history, Base's row shape
//
// As landed on rails-server main (9cd6ebd). Collateral on/off events are stored
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
 *  or decimal strings. */
export function readTimelineAnswer(raw: unknown): AaveV3ArbitrumTimelineResponse | null {
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
    rows: r.rows as AaveV3ArbitrumTimelineRow[],
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
