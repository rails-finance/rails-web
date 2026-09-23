// Morpho position timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/morpho/position/:id/timeline) returns the raw
// per-event signed deltas (coll / borr / borrow-shares) in block order, plus the
// market's decoded `market_params`. This builder owns the presentation: it
// REPLAYS the running collateral / borrowed-principal cumulatively and shapes
// each BaseActivityEvent + MorphoContext.

import { resolveErc20Meta, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { parseMarketParams, marketLabel } from "@/lib/morpho/asset-catalog";
import type { BaseActivityEvent, AssetFlow, MorphoContext, MorphoEventType } from "@/lib/shared/types/event-shape";
import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface MorphoTimelineResult {
  positionId: string;
  marketId: string | null;
  marketLabel: string | null;
  loanSymbol: string | null;
  collateralSymbol: string | null;
  owner: string | null;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts). The route attaches it. */
  rowCeiling?: TimelineRowCeiling;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history. */
  cutoffBlock?: number | null;
}

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** One raw delta row from the rails timeline route. */
export interface RawMorphoTimelineRow {
  src: MorphoEventType;
  coll: string;
  borr: string;
  bsh: string;
  tx: string;
  log_index: number;
  block_number: string;
  block_timestamp: string | null;
  /** Third-party-action facts (the tx signer + the event's own caller param),
   *  set ONLY on two-fact external rows — the route ships them exactly when
   *  on_behalf differs from BOTH; NULL otherwise (see the route). */
  tx_from: string | null;
  caller: string | null;
  /** The market's own oracle at this event's block (morpho_historic_prices,
   *  mig 112): IOracle.price() verbatim, raw 1e36 (loan units per collateral
   *  unit) — non-NULL only on priced liquidation blocks. */
  price_raw?: string | null;
  price_source?: string | null;
}

/** The rails timeline response envelope. */
export interface RawMorphoTimelineResponse {
  positionId: string;
  marketId: string; // 0x-prefixed
  owner: string;
  marketParams: string | null;
  rows: RawMorphoTimelineRow[];
  totalEvents: number;
  /** The MAX_TIMELINE_ROWS ceiling cut this query. Optional — absent on a
   *  backend that predates the field. */
  truncated?: boolean;
  /** Where `?recent=N` drew the line. Null (or absent) means the rows ARE the
   *  whole history. */
  cutoffBlock?: number | null;
}

/** The display label for each Morpho action — shared with the swept Base
 *  reader so the two lanes name an event identically. */
export const MORPHO_EVENT_LABEL: Record<MorphoEventType, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  supply_collateral: "Add Collateral",
  withdraw_collateral: "Remove Collateral",
  liquidation: "Liquidation",
};

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Exact raw → decimal string for a given token decimals (trims trailing zeros).
 *  Exported for the swept Base reader, which must scale exactly as this does. */
export function fmtUnits(raw: bigint, decimals: number): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return `${neg ? "-" : ""}${a.toString()}`;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

interface MarketMeta {
  marketId: string;
  loan: Erc20Meta;
  collateral: Erc20Meta | null;
  isIdle: boolean;
}

async function resolveMarketMeta(marketId: string, marketParams: string | null): Promise<MarketMeta | null> {
  if (!marketParams) return null;
  const p = parseMarketParams(marketId, marketParams);
  if (!p) return null;
  const addrs: string[] = [];
  if (p.loanToken && p.loanToken !== ZERO_ADDR) addrs.push(p.loanToken);
  if (!p.isIdle && p.collateralToken && p.collateralToken !== ZERO_ADDR) addrs.push(p.collateralToken);
  const meta = await resolveErc20Meta(addrs);
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
  });
  return {
    marketId: p.marketId,
    loan: meta.get(p.loanToken) ?? fallback(p.loanToken),
    collateral: p.isIdle ? null : (meta.get(p.collateralToken) ?? fallback(p.collateralToken)),
    isIdle: p.isIdle,
  };
}

/** The raw 1e36 oracle price → human loan-per-collateral; undefined keeps the
 *  event token-only (unpriced block, or a non-liquidation row). */
function oraclePriceOf(
  raw: string | null | undefined,
  source: string | null | undefined,
  collDec: number,
  loanDec: number,
): { loanPerCollateral: number; source: "morpho-oracle" } | undefined {
  if (raw == null || source !== "morpho-oracle") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const human = (n * Math.pow(10, collDec - loanDec)) / 1e36;
  return Number.isFinite(human) && human > 0 ? { loanPerCollateral: human, source } : undefined;
}

/** Build the position timeline from the rails route's raw delta rows. */
export async function buildMorphoTimeline(resp: RawMorphoTimelineResponse): Promise<MorphoTimelineResult> {
  const meta = await resolveMarketMeta(resp.marketId, resp.marketParams);
  const loanDec = meta?.loan.decimals ?? 18;
  const collDec = meta?.collateral?.decimals ?? 18;
  const loanSym = meta?.loan.symbol ?? "?";
  const collSym = meta?.collateral?.symbol ?? null;
  const owner = resp.owner.toLowerCase();

  let collRun = ZERO;
  let borrRun = ZERO;
  const events: BaseActivityEvent[] = resp.rows.map((r, idx) => {
    const coll = bigintOf(r.coll);
    const borr = bigintOf(r.borr);
    collRun += coll;
    borrRun += borr;

    const eventType = r.src;
    const isCollateral = eventType === "supply_collateral" || eventType === "withdraw_collateral";
    const isLiq = eventType === "liquidation";
    const side: "loan" | "collateral" = isCollateral || isLiq ? "collateral" : "loan";

    const assetsRaw = side === "collateral" ? coll : borr;
    const assetsDec = side === "collateral" ? collDec : loanDec;
    const shareDelta = r.bsh !== "0" && r.bsh !== "" ? r.bsh : undefined;

    const ctx: MorphoContext = {
      eventType,
      marketId: meta?.marketId ?? resp.marketId,
      loanSymbol: loanSym,
      collateralSymbol: collSym ?? "—",
      side,
      assetsDelta: fmtUnits(assetsRaw, assetsDec),
      sharesDelta: shareDelta,
      collateralAfter: fmtUnits(collRun, collDec),
      borrowedAfter: fmtUnits(borrRun, loanDec),
      isOpen: idx === 0,
      // The acting parties, present only on two-fact external rows (the route
      // pre-filters). The card derives third-party marking from these.
      ...(r.tx_from && r.caller ? { txFrom: r.tx_from.toLowerCase(), caller: r.caller.toLowerCase() } : {}),
      // Liquidation rows: the cleared loan leg (|borr| = repaid + bad debt)
      // and the market's own oracle at the block (mig 112) — the forensics
      // inputs. The raw 1e36 price converts to human loan-per-collateral
      // with both tokens' decimals: loanHuman = collHuman × raw × 10^(collDec
      // − loanDec) ÷ 1e36.
      ...(isLiq
        ? {
            loanRepaid: fmtUnits(borr < ZERO ? -borr : borr, loanDec),
            oraclePriceAtBlock: oraclePriceOf(r.price_raw, r.price_source, collDec, loanDec),
          }
        : {}),
    };

    return {
      id: `${r.tx}:${r.log_index}`,
      txHash: r.tx,
      blockNumber: Number(r.block_number),
      timestamp: r.block_timestamp != null ? Number(r.block_timestamp) : 0,
      wallet: owner,
      actionType: eventType,
      actionLabel: MORPHO_EVENT_LABEL[eventType],
      flows: flowsFor(eventType, coll, borr, collDec, loanDec, collSym, loanSym, meta),
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", r.tx),
      context: { protocol: "morpho", data: ctx },
    };
  });

  return {
    positionId: resp.positionId,
    marketId: meta?.marketId ?? resp.marketId,
    marketLabel: meta ? marketLabel(loanSym, collSym ?? "—", meta.isIdle) : null,
    loanSymbol: loanSym,
    collateralSymbol: collSym,
    owner,
    events,
    totalEvents: events.length,
  };
}

function flowsFor(
  eventType: MorphoEventType,
  coll: bigint,
  borr: bigint,
  collDec: number,
  loanDec: number,
  collSym: string | null,
  loanSym: string,
  meta: MarketMeta | null,
): AssetFlow[] {
  void eventType;
  const flows: AssetFlow[] = [];
  if (coll !== ZERO && collSym) {
    const mag = coll < ZERO ? -coll : coll;
    flows.push({
      token: meta?.collateral?.address ?? "",
      tokenSymbol: collSym,
      tokenDecimals: collDec,
      amount: mag.toString(),
      amountFormatted: Number(fmtUnits(mag, collDec)),
      direction: coll > ZERO ? "in" : "out",
    });
  }
  if (borr !== ZERO) {
    const mag = borr < ZERO ? -borr : borr;
    flows.push({
      token: meta?.loan.address ?? "",
      tokenSymbol: loanSym,
      tokenDecimals: loanDec,
      amount: mag.toString(),
      amountFormatted: Number(fmtUnits(mag, loanDec)),
      direction: borr > ZERO ? "out" : "in",
    });
  }
  return flows;
}
