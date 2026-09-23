// Liquity V1 timeline — the `api` arm's presentation transform (chain-state tier).
// ----------------------------------------------------------------------------
// rails-server returns the raw merged mv_liquity_v1_events rows (both TroveUpdated
// emitters, with the Trove's absolute before/after ETH collateral + LUSD debt). This
// transform maps each to a BaseActivityEvent + LiquityV1Context the chain-state cards
// consume. Collateral is always ETH, debt always LUSD (both 1e18) — no ERC20 lookup.
// The after-values are directly emitted; the deltas are after − before (chain-derived).
//
// SERVER-ONLY — imported from the /api/liquity-v1/* route handlers.

import type {
  BaseActivityEvent,
  AssetFlow,
  LiquityV1Context,
  LiquityV1EventType,
} from "@/lib/shared/types/event-shape";
import { LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";
import { classifyTroveAdjust, forkAdjustLabel } from "@/lib/shared/liquity-fork-ops";

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface LiquityV1TimelineResult {
  wallet: string;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts): what was served against what the
   *  position actually holds. The route attaches it; absent means uncapped. */
  rowCeiling?: TimelineRowCeiling;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — which is the answer
   *  whenever `recent` was not asked for, and also when the wallet holds fewer
   *  events than the window. The route attaches it. */
  cutoffBlock?: number | null;
}

/** One row of mv_liquity_v1_events, exactly as the rails timeline route projects it.
 *  numeric/bigint columns arrive as strings from pg. */
export interface MvRow {
  block_timestamp: string;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  wallet: string;
  epoch: number;
  action: string;
  coll_after: string | null;
  debt_after: string | null;
  coll_before: string | null;
  debt_before: string | null;
  stake: string | null;
  // The protocol's own ETH:USD at the event's block (PriceFeed.lastGoodPrice,
  // mig 110) — non-NULL only on priced liquidation/redemption blocks.
  price_usd: string | null;
  price_source: string | null;
}

const LABELS: Record<LiquityV1EventType, string> = {
  openTrove: "Open Trove",
  adjustTrove: "Adjust Trove",
  closeTrove: "Close Trove",
  liquidation: "Liquidation",
  redemption: "Redemption",
};

const ZERO = BigInt(0);
const DECIMALS = 18;
// Native ETH has no ERC20 address — the conventional sentinel used across the app.
const ETH_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Exact raw → decimal string (trims trailing zeros). */
function fmtUnits(raw: bigint, decimals: number = DECIMALS): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** The at-block PriceFeed figure → ctx shape; undefined keeps the event
 *  token-only (unpriced block, or a plain trove op the filler never targets). */
function priceOf(
  usd: string | null,
  source: string | null,
): { usd: number; source: "pricefeed-lastgoodprice" } | undefined {
  if (usd == null || source !== "pricefeed-lastgoodprice") return undefined;
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? { usd: n, source } : undefined;
}

function flowFor(token: string, symbol: string, raw: bigint, direction: "in" | "out"): AssetFlow {
  const mag = raw < ZERO ? -raw : raw;
  return {
    token,
    tokenSymbol: symbol,
    tokenDecimals: DECIMALS,
    amount: mag.toString(),
    amountFormatted: Number(fmtUnits(mag)),
    direction,
  };
}

/** Transform raw mv_liquity_v1_events rows → { wallet, events, totalEvents }. */
export function buildLiquityV1Timeline(rows: MvRow[], walletRaw: string): LiquityV1TimelineResult {
  const wallet = walletRaw.toLowerCase();

  const events: BaseActivityEvent[] = rows.map((r) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const block = Number(r.block_number);
    const ts = Number(r.block_timestamp);
    const kind = r.action as LiquityV1EventType;

    const collAfter = bigintOf(r.coll_after);
    const debtAfter = bigintOf(r.debt_after);
    const collBefore = bigintOf(r.coll_before);
    const debtBefore = bigintOf(r.debt_before);
    const collDelta = collAfter - collBefore;
    const debtDelta = debtAfter - debtBefore;

    const ctx: LiquityV1Context = {
      eventType: kind,
      collDelta: fmtUnits(collDelta),
      debtDelta: fmtUnits(debtDelta),
      collAfter: fmtUnits(collAfter),
      debtAfter: fmtUnits(debtAfter),
      collBefore: fmtUnits(collBefore),
      debtBefore: fmtUnits(debtBefore),
      // Per-life open marker: each Trove life begins with its own openTrove, so a
      // reopened Trove's second life is also flagged (not just the global idx 0).
      isOpen: kind === "openTrove",
      epoch: r.epoch,
      ...(kind === "liquidation" || kind === "redemption"
        ? { priceAtBlock: priceOf(r.price_usd, r.price_source) }
        : {}),
    };

    // Spine flows: ETH collateral + LUSD debt, signed by which way each moved.
    // "out" = leaves the wallet toward the protocol (collateral deposit / debt repay);
    // "in" = comes to the wallet (collateral withdraw / debt draw).
    const flows: AssetFlow[] = [];
    if (collDelta !== ZERO) flows.push(flowFor(ETH_SENTINEL, "ETH", collDelta, collDelta > ZERO ? "out" : "in"));
    if (debtDelta !== ZERO)
      flows.push(flowFor(LIQUITY_V1_ADDRESSES.LUSD, "LUSD", debtDelta, debtDelta > ZERO ? "in" : "out"));

    return {
      id: `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: block,
      timestamp: ts,
      wallet,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
      actionType: kind,
      // Derive the verb where "Adjust Trove" underdetermines it — which axes the
      // borrower moved (mirrors the forks and fx-timeline). Same classifier as
      // the V2 forks; the sign of a coll/debt delta is universal. NO rate pill —
      // V1 has no user-set rate, and that absence is the fact about V1. Falls
      // back to the static label when nothing meaningfully moved.
      actionLabel:
        kind === "adjustTrove"
          ? (forkAdjustLabel(classifyTroveAdjust({ collDelta, debtDelta })) ?? LABELS[kind] ?? kind)
          : (LABELS[kind] ?? kind),
      flows,
      context: { protocol: "liquity-v1", data: ctx },
    };
  });

  return { wallet, events, totalEvents: events.length };
}
