// Maple timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw replayed mv_maple_events rows (migration 107:
// exact share-balance + escrow + deposited-principal running lanes, queue
// fills deduped, request owners resolved); this transform maps each to a
// BaseActivityEvent + MapleContext. The two pools are a fixed catalog, so
// there is NO per-request ERC20 resolution — symbols/decimals come from the
// catalog. The replay lives server-side in the MV; only presentation lives
// here.
//
// Per-event USD needs no oracle: the funds asset IS the unit (USDC/USDT), and
// every value-bearing event (deposit / withdraw / fill) carries BOTH assets
// and shares in its own log — self-priced at its own moment.
//
// SERVER-ONLY — imported from the /api/maple/* route handlers.

import type { BaseActivityEvent, AssetFlow, MapleContext, MapleEventType } from "@/lib/shared/types/event-shape";
import { maplePoolOf, MAPLE_SHARE_DECIMALS } from "@/lib/maple/asset-catalog";

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface MapleTimelineResult {
  wallet: string;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts): what was served against what the
   *  position actually holds. The route attaches it; absent means uncapped. */
  rowCeiling?: TimelineRowCeiling;
}

/** One row of mv_maple_events, exactly as the rails /api/maple/timeline route
 *  projects it. numeric/bigint columns arrive as strings from pg. */
export interface MvRow {
  // The index's own row identity, unique by construction. OPTIONAL because the
  // backend deploys separately: a response from before it, or a cached one,
  // simply has no key and the id falls back to its former shape.
  event_key?: string;
  block_timestamp: string;
  block_number: string;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  action: string;
  wallet: string;
  caller: string | null;
  pool: string;
  asset: string;
  assets: string | null;
  shares: string | null;
  request_id: string | null;
  shares_before: string;
  shares_after: string;
  escrow_before: string;
  escrow_after: string;
  principal_before: string;
  principal_after: string;
}

const LABELS: Record<MapleEventType, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  request: "Withdrawal requested",
  request_decrease: "Request reduced",
  request_cancel: "Request cancelled",
  request_fill: "Withdrawal filled",
  transfer_in: "Received",
  transfer_out: "Sent",
};

const ZERO = BigInt(0);

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Exact raw → decimal string for the given decimals (trims trailing zeros). */
function fmtUnits(raw: bigint, decimals: number): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return `${neg ? "-" : ""}${a.toString()}`;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

function scaledStr(raw: string | null, decimals: number): string | undefined {
  if (raw == null) return undefined;
  return fmtUnits(bigintOf(raw), decimals);
}

// Raw-integer passthrough for ctx.raw (pg NUMERIC → bare integer string);
// null → undefined so the key drops out of the JSON.
function rawVal(v: string | null): string | undefined {
  return v == null ? undefined : String(v).split(".")[0];
}

function flowFor(token: string, symbol: string, decimals: number, raw: bigint, direction: "in" | "out"): AssetFlow {
  const mag = raw < ZERO ? -raw : raw;
  return {
    token,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    amount: mag.toString(),
    amountFormatted: Number(fmtUnits(mag, decimals)),
    direction,
  };
}

/**
 * Transform raw mv_maple_events rows → { wallet, events, totalEvents }. The
 * replay lives in the MV; only chain-direct presentation (symbols, signs) here.
 */
export function buildMapleTimeline(rows: MvRow[], walletRaw: string): MapleTimelineResult {
  const wallet = walletRaw.toLowerCase();
  const poolOf = maplePoolOf;

  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const kind = r.action as MapleEventType;
    const p = poolOf(r.pool);
    const assets = bigintOf(r.assets);
    const shares = bigintOf(r.shares);

    const base = {
      // `${tx}-${logIndex}` is NOT unique: a pool-share transfer with this
      // wallet on both sides emits a transfer_in AND a transfer_out row from
      // the same log. `id` is the React key and the numbering key, so the
      // index's own event_key is used wherever the backend supplies it.
      id: r.event_key || `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: Number(r.block_timestamp),
      wallet,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
    };

    const caller = r.caller?.toLowerCase();

    const ctx: MapleContext = {
      eventType: kind,
      pool: p.key,
      poolSymbol: p.symbol,
      assetSymbol: p.assetSymbol,
      sharesBefore: scaledStr(r.shares_before, MAPLE_SHARE_DECIMALS),
      sharesAfter: scaledStr(r.shares_after, MAPLE_SHARE_DECIMALS),
      escrowBefore: scaledStr(r.escrow_before, MAPLE_SHARE_DECIMALS),
      escrowAfter: scaledStr(r.escrow_after, MAPLE_SHARE_DECIMALS),
      principalBefore: scaledStr(r.principal_before, p.decimals),
      principalAfter: scaledStr(r.principal_after, p.decimals),
      isOpen: idx === 0,
      ...(caller ? { caller } : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      raw: {
        assets: rawVal(r.assets),
        shares: rawVal(r.shares),
        sharesBefore: rawVal(r.shares_before),
        sharesAfter: rawVal(r.shares_after),
        escrowBefore: rawVal(r.escrow_before),
        escrowAfter: rawVal(r.escrow_after),
        principalBefore: rawVal(r.principal_before),
        principalAfter: rawVal(r.principal_after),
      },
    };
    if (r.request_id != null) ctx.requestId = String(r.request_id).split(".")[0];

    let flows: AssetFlow[] = [];

    switch (kind) {
      case "deposit": {
        ctx.assetsDelta = fmtUnits(assets, p.decimals);
        ctx.sharesDelta = fmtUnits(shares, MAPLE_SHARE_DECIMALS);
        // Funds move toward the pool; the share mint is the receipt.
        flows = assets !== ZERO ? [flowFor(p.asset, p.assetSymbol, p.decimals, assets, "out")] : [];
        break;
      }
      case "withdraw": {
        ctx.assetsDelta = fmtUnits(-assets, p.decimals);
        ctx.sharesDelta = fmtUnits(-shares, MAPLE_SHARE_DECIMALS);
        flows = assets !== ZERO ? [flowFor(p.asset, p.assetSymbol, p.decimals, assets, "in")] : [];
        break;
      }
      case "request": {
        ctx.requestShares = fmtUnits(shares, MAPLE_SHARE_DECIMALS);
        ctx.sharesDelta = fmtUnits(-shares, MAPLE_SHARE_DECIMALS);
        flows = shares !== ZERO ? [flowFor(p.pool, p.symbol, MAPLE_SHARE_DECIMALS, shares, "out")] : [];
        break;
      }
      case "request_decrease":
      case "request_cancel": {
        ctx.requestShares = fmtUnits(shares, MAPLE_SHARE_DECIMALS);
        ctx.sharesDelta = fmtUnits(shares, MAPLE_SHARE_DECIMALS);
        flows = shares !== ZERO ? [flowFor(p.pool, p.symbol, MAPLE_SHARE_DECIMALS, shares, "in")] : [];
        break;
      }
      case "request_fill": {
        ctx.requestShares = fmtUnits(shares, MAPLE_SHARE_DECIMALS);
        ctx.assetsDelta = fmtUnits(-assets, p.decimals);
        ctx.sharesDelta = "0"; // the shares burn from the queue's escrow, not the wallet
        flows = assets !== ZERO ? [flowFor(p.asset, p.assetSymbol, p.decimals, assets, "in")] : [];
        break;
      }
      case "transfer_in":
      case "transfer_out": {
        const signed = kind === "transfer_in" ? shares : -shares;
        ctx.sharesDelta = fmtUnits(signed, MAPLE_SHARE_DECIMALS);
        ctx.counterparty = caller;
        flows =
          shares !== ZERO
            ? [flowFor(p.pool, p.symbol, MAPLE_SHARE_DECIMALS, shares, kind === "transfer_in" ? "in" : "out")]
            : [];
        break;
      }
    }

    return {
      ...base,
      actionType: kind,
      actionLabel: LABELS[kind] ?? kind,
      flows,
      context: { protocol: "maple", data: ctx },
    };
  });

  return { wallet, events, totalEvents: events.length };
}
