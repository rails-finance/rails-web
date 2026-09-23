// SparkLend timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw replayed spark_events_served rows (per-reserve
// running balances: supply_before/after, debt_before/after, replayed two-axis
// in the view); this transform maps each to a BaseActivityEvent + SparkContext
// at V3-parity depth — resolving ERC20 symbol/decimals (one multicall), carrying
// the explicit before-balances, walking the pooled-account basket forward from
// the view's *_after columns, and attaching the raw uint256 twins + origin
// envelopes (the near-clone of lib/sources/api/aave-v3-timeline.ts — SparkLend
// is an Aave V3 fork with an identical Pool event set; only the single-market
// shape differs). The replay lives server-side in the spark_events_served view
// (the sealed tail plus the live head; the mv_spark_events materialized view it
// replaced was dropped by server mig 232); only presentation lives here.
//
// Per-event historic USD is NOT enriched here — same deliberate gap as Aave V3's
// live arm; per-event USD is a later layer.
//
// SERVER-ONLY — imported from the /api/spark/* route handlers.

import type {
  BaseActivityEvent,
  AssetFlow,
  OriginEnvelope,
  SparkContext,
  SparkEventType,
  SparkSnapshotItem,
} from "@/lib/shared/types/event-shape";
import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface SparkTimelineResult {
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
   *  whenever `recent` was not asked for, and also when the position holds
   *  fewer events than the window. The route attaches it. */
  cutoffBlock?: number | null;
}

/** One row of spark_events_served, exactly as the rails /api/spark/timeline route
 *  projects it. numeric/bigint columns arrive as strings from pg. */
export interface MvRow {
  // The index's own row identity — `action:contract:tx_hash:log_index`, unique
  // by construction. OPTIONAL because the backend deploys separately: a
  // response from before it, or a cached one, simply has no key and the id
  // falls back to its former shape.
  event_key?: string;
  block_timestamp: string;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: Buffer | string;
  tx_from: string | null;
  caller: string | null;
  action: string;
  wallet: string;
  reserve: string | null;
  amount: string | null;
  borrow_rate: string | null;
  interest_rate_mode: number | string | null;
  use_a_tokens: boolean | null;
  collateral_asset: string | null;
  debt_asset: string | null;
  liquidated_collateral_amount: string | null;
  liquidator: string | null;
  /** The other account of a transfer_in/transfer_out row (mig 159): the sender
   *  on an inflow, the recipient on an outflow. NULL on Pool actions; optional
   *  so the transform tolerates a backend that predates the column. */
  counterparty?: string | null;
  supply_before: string | null;
  supply_after: string | null;
  debt_before: string | null;
  debt_after: string | null;
  /** msg.sender at the Pool (the raw event's own party param) — set for
   *  supply/borrow/repay, NULL for withdraw/liquidation. See the route. */
  pool_caller: string | null;
  /** At-block USD from spark_historic_prices (mig 092) — SparkLend's own
   *  oracle read AT THE EVENT'S BLOCK by the oracle-price filler. NULL until
   *  the walk (or the --liq-only pass) reaches the block; the card renders
   *  token-only then. Liquidations carry both sides. */
  price_usd: string | null;
  price_source: string | null;
  collateral_price_usd: string | null;
  collateral_price_source: string | null;
  debt_price_usd: string | null;
  debt_price_source: string | null;
}

/** At-block price pair → the context's typed shape. NULL columns (the walk
 *  hasn't reached the block) drop the key entirely; an unrecognized source
 *  string is treated the same — token-only beats a mislabeled receipt. */
function priceOf(usd: string | null, source: string | null): { usd: number; source: "iaave-oracle" } | undefined {
  if (usd == null || source !== "iaave-oracle") return undefined;
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? { usd: n, source } : undefined;
}

const LABELS: Record<SparkEventType, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidation",
  transfer_in: "Transferred in",
  transfer_out: "Transferred out",
};

const ZERO = BigInt(0);

function hexFromBytea(v: Buffer | string): string {
  if (typeof v === "string") return v.startsWith("0x") ? v : `0x${v}`;
  return `0x${v.toString("hex")}`;
}

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Exact raw → decimal string for a token's decimals (trims trailing zeros). */
function fmtUnits(raw: bigint, decimals: number): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return `${neg ? "-" : ""}${a.toString()}`;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Scale a raw NUMERIC string by a reserve's decimals → display string. */
function scaledStr(raw: string | null, meta: Erc20Meta | undefined): string | undefined {
  if (raw == null || meta == null) return undefined;
  return String(scaleRaw(bigintOf(raw), meta.decimals));
}

// Raw-integer passthrough for ctx.raw: the view's columns are pg NUMERIC(78,0) and
// serialize as bare integer strings; null → undefined so the key drops out of
// the JSON. Raws are the chain values — never rebuilt from the scaled floats.
function rawVal(v: string | null): string | undefined {
  return v == null ? undefined : String(v).split(".")[0];
}

/** Origin envelope for a value that IS one decoded Pool log param: the emitting
 *  event, the ABI param name (SparkLend keeps V3's Pool ABI — Supply/Withdraw/
 *  Borrow/Repay all carry `amount`; LiquidationCall carries `debtToCover` +
 *  `liquidatedCollateralAmount`), the untouched integer, and the divisor
 *  exponent. The before/after running sums get NO envelope — window aggregates
 *  over many logs (derived). */
function originVal(
  event: string,
  param: string,
  meta: Erc20Meta | undefined,
  v: string | null,
): OriginEnvelope | undefined {
  const raw = rawVal(v);
  return raw === undefined || meta == null ? undefined : { event, param, raw, scale: meta.decimals };
}

/** Pool event emitting each action's `amount` param (V3 ABI, kept by the fork). */
const AMOUNT_EVENT: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
};

const BASKET_DUST = 0.0001;

/** The tokens a row names (lowercased): the ones the transform reads symbol
 *  and decimals for. */
export function sparkRowTokens(r: MvRow): string[] {
  const out: string[] = [];
  for (const a of [r.reserve, r.collateral_asset, r.debt_asset]) if (a) out.push(a.toLowerCase());
  return out;
}

/**
 * Transform raw spark_events_served rows → { wallet, events, totalEvents }. The
 * replay lives in the view; only chain-direct presentation (symbols, signs) here.
 */
export async function buildSparkTimeline(rows: MvRow[], walletRaw: string): Promise<SparkTimelineResult> {
  const wallet = walletRaw.toLowerCase();

  // One batched ERC20 multicall over every reserve referenced.
  const addrs = new Set<string>();
  for (const r of rows) for (const a of sparkRowTokens(r)) addrs.add(a);
  const metas = await resolveErc20Meta([...addrs]);
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
    unresolved: true,
  });
  const unresolved = (r: MvRow) => sparkRowTokens(r).some((a) => !metas.has(a) || metas.get(a)!.unresolved === true);
  const meta = (a: string | null): Erc20Meta | undefined =>
    a == null ? undefined : (metas.get(a.toLowerCase()) ?? fallback(a.toLowerCase()));

  // Pooled-account basket: each reserve's latest running balance (human units),
  // walked forward so each event carries the snapshot AFTER it. Sourced from the
  // view's replayed *_after columns.
  const supplyBasket = new Map<string, { symbol: string; amount: number }>();
  const debtBasket = new Map<string, { symbol: string; amount: number }>();
  const snapshot = (m: Map<string, { symbol: string; amount: number }>): SparkSnapshotItem[] => {
    const out: SparkSnapshotItem[] = [];
    for (const [address, v] of m.entries())
      if (v.amount > BASKET_DUST) out.push({ symbol: v.symbol, amount: String(v.amount), address });
    return out;
  };

  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const e = sparkEvent(r, idx);
    if (unresolved(r)) e.tokenMetaUnresolved = true;
    return e;
  });

  function sparkEvent(r: MvRow, idx: number): BaseActivityEvent {
    const tx = hexFromBytea(r.tx_hash);
    const block = Number(r.block_number);
    const ts = Number(r.block_timestamp);
    const kind = r.action as SparkEventType;

    const base = {
      // `${tx}-${logIndex}` is NOT unique: a BalanceTransfer with this wallet
      // on both sides emits a transfer_in AND a transfer_out row from the same
      // log. `id` is the React key and the chronological numbering key, so the
      // index's own event_key is used wherever the backend supplies it.
      id: r.event_key || `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: block,
      timestamp: ts,
      wallet,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
    };

    if (kind === "liquidation") {
      const collMeta = meta(r.collateral_asset);
      const debtMeta = meta(r.debt_asset);
      const seized = bigintOf(r.liquidated_collateral_amount);
      const covered = bigintOf(r.amount); // amount = debtToCover in the view
      if (collMeta && r.supply_after != null) {
        supplyBasket.set(collMeta.address, {
          symbol: collMeta.symbol,
          amount: scaleRaw(bigintOf(r.supply_after), collMeta.decimals),
        });
      }
      if (debtMeta && r.debt_after != null) {
        debtBasket.set(debtMeta.address, {
          symbol: debtMeta.symbol,
          amount: scaleRaw(bigintOf(r.debt_after), debtMeta.decimals),
        });
      }
      const ctx: SparkContext = {
        eventType: "liquidation",
        reserveSymbol: debtMeta?.symbol ?? "?",
        collateralSymbol: collMeta?.symbol ?? "?",
        collateralAsset: collMeta?.address,
        side: "supply",
        // Both signed negative — the liquidation removes collateral and debt.
        assetsDelta: fmtUnits(-seized, collMeta?.decimals ?? 18),
        debtDelta: fmtUnits(-covered, debtMeta?.decimals ?? 18),
        debtToCover: scaledStr(r.amount, debtMeta),
        liquidatedCollateralAmount: scaledStr(r.liquidated_collateral_amount, collMeta),
        liquidator: r.liquidator?.toLowerCase() ?? undefined,
        collateralPrice: priceOf(r.collateral_price_usd, r.collateral_price_source),
        debtPrice: priceOf(r.debt_price_usd, r.debt_price_source),
        supplyBefore: scaledStr(r.supply_before, collMeta),
        supplyAfter: scaledStr(r.supply_after, collMeta),
        debtBefore: scaledStr(r.debt_before, debtMeta),
        debtAfter: scaledStr(r.debt_after, debtMeta),
        allSupplies: snapshot(supplyBasket),
        allDebts: snapshot(debtBasket),
        raw: {
          debtToCover: rawVal(r.amount),
          liquidatedCollateralAmount: rawVal(r.liquidated_collateral_amount),
          supplyBefore: rawVal(r.supply_before),
          supplyAfter: rawVal(r.supply_after),
          debtBefore: rawVal(r.debt_before),
          debtAfter: rawVal(r.debt_after),
        },
        origin: {
          debtToCover: originVal("LiquidationCall", "debtToCover", debtMeta, r.amount),
          liquidatedCollateralAmount: originVal(
            "LiquidationCall",
            "liquidatedCollateralAmount",
            collMeta,
            r.liquidated_collateral_amount,
          ),
        },
        isOpen: idx === 0,
      };
      return {
        ...base,
        actionType: kind,
        actionLabel: LABELS[kind],
        flows: liquidationFlows(seized, covered, collMeta, debtMeta),
        context: { protocol: "spark", data: ctx },
      };
    }

    const rMeta = meta(r.reserve);
    // Transfers ride the SUPPLY axis: an spToken move changes the supplied
    // balance (debt tokens are non-transferable). Omitting them here would
    // silently read the debt columns and mis-shape the event as a debt move —
    // the compound-timeline BASE_ACTIONS trap.
    const isTransfer = kind === "transfer_in" || kind === "transfer_out";
    const isSupplySide = kind === "supply" || kind === "withdraw" || isTransfer;
    const amt = bigintOf(r.amount);
    // Signed by the balance axis: supply/borrow/transfer_in increase the
    // position's balance, withdraw/repay/transfer_out decrease it.
    const signed = kind === "supply" || kind === "borrow" || kind === "transfer_in" ? amt : -amt;

    if (rMeta) {
      if (isSupplySide && r.supply_after != null) {
        supplyBasket.set(rMeta.address, {
          symbol: rMeta.symbol,
          amount: scaleRaw(bigintOf(r.supply_after), rMeta.decimals),
        });
      } else if (!isSupplySide && r.debt_after != null) {
        debtBasket.set(rMeta.address, {
          symbol: rMeta.symbol,
          amount: scaleRaw(bigintOf(r.debt_after), rMeta.decimals),
        });
      }
    }

    const ctx: SparkContext = {
      eventType: kind,
      reserveSymbol: rMeta?.symbol ?? "?",
      price: priceOf(r.price_usd, r.price_source),
      side: isSupplySide ? "supply" : "debt",
      assetsDelta: fmtUnits(signed, rMeta?.decimals ?? 18),
      ...(kind === "borrow"
        ? {
            interestRateMode: r.interest_rate_mode != null ? Number(r.interest_rate_mode) : undefined,
            borrowRate: r.borrow_rate ?? undefined,
          }
        : {}),
      ...(kind === "repay" ? { useATokens: r.use_a_tokens ?? undefined } : {}),
      // The other account of a position move — a true counterparty of the
      // event, not a verdict about who acted (renders as the neutral to/from
      // chip, not the external-actor pink).
      ...(isTransfer && r.counterparty ? { counterparty: r.counterparty.toLowerCase() } : {}),
      // The acting parties, when this event type carries them (supply/borrow/
      // repay — pool_caller is NULL otherwise): the tx signer + the Pool's
      // msg.sender. The card derives third-party marking from these.
      ...(r.tx_from && r.pool_caller
        ? { txFrom: r.tx_from.toLowerCase(), poolCaller: r.pool_caller.toLowerCase() }
        : {}),
      ...(isSupplySide
        ? { supplyBefore: scaledStr(r.supply_before, rMeta), supplyAfter: scaledStr(r.supply_after, rMeta) }
        : { debtBefore: scaledStr(r.debt_before, rMeta), debtAfter: scaledStr(r.debt_after, rMeta) }),
      allSupplies: snapshot(supplyBasket),
      allDebts: snapshot(debtBasket),
      raw: {
        amount: rawVal(r.amount),
        ...(isSupplySide
          ? { supplyBefore: rawVal(r.supply_before), supplyAfter: rawVal(r.supply_after) }
          : { debtBefore: rawVal(r.debt_before), debtAfter: rawVal(r.debt_after) }),
      },
      origin: {
        // Transfers get NO envelope: their amount is DERIVED (the transfer's
        // scaled value × the index the BalanceTransfer emitted), not one
        // untouched log param — the provenance receipt states the derivation.
        amount: isTransfer ? undefined : originVal(AMOUNT_EVENT[kind] ?? kind, "amount", rMeta, r.amount),
      },
      isOpen: idx === 0,
    };

    // Direction: "in" = toward wallet, "out" = toward protocol (a transfer_in
    // moves spTokens toward this wallet; a transfer_out sends them away).
    const dir: "in" | "out" = kind === "supply" || kind === "repay" || kind === "transfer_out" ? "out" : "in";
    const flows: AssetFlow[] = rMeta && amt !== ZERO ? [flowFor(rMeta, amt, dir)] : [];

    return {
      ...base,
      actionType: kind,
      actionLabel: LABELS[kind] ?? kind,
      flows,
      context: { protocol: "spark", data: ctx },
    };
  }

  return { wallet, events, totalEvents: events.length };
}

function flowFor(m: Erc20Meta, raw: bigint, direction: "in" | "out"): AssetFlow {
  const mag = raw < ZERO ? -raw : raw;
  return {
    token: m.address,
    tokenSymbol: m.symbol,
    tokenDecimals: m.decimals,
    amount: mag.toString(),
    amountFormatted: Number(fmtUnits(mag, m.decimals)),
    direction,
  };
}

function liquidationFlows(
  seized: bigint,
  covered: bigint,
  collMeta: Erc20Meta | undefined,
  debtMeta: Erc20Meta | undefined,
): AssetFlow[] {
  const flows: AssetFlow[] = [];
  // Collateral leaves the position (toward the liquidator); debt is cleared.
  if (collMeta && seized !== ZERO) flows.push(flowFor(collMeta, seized, "out"));
  if (debtMeta && covered !== ZERO) flows.push(flowFor(debtMeta, covered, "out"));
  return flows;
}
