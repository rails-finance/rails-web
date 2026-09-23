// Aave V3 timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw reduced mv_aave_v3_events rows (per-reserve running
// balances: supply_before/after, debt_before/after, replayed two-axis in the MV);
// this transform maps them to the shared { wallet, events, totalEvents } shape the
// V3 cards consume — resolving ERC20 symbol/decimals (one multicall) and walking
// the pooled-account basket forward from the MV's *_after columns. The replay
// lives server-side in the MV; only presentation lives here.
//
// Per-event historic USD is NOT enriched here — the live index carries head blocks
// the (retired) frozen price cache couldn't price; per-event USD is a later layer.
//
// SERVER-ONLY — imported from the /api/aave-v3/* route handlers.

import type { BaseActivityEvent, OriginEnvelope } from "@/lib/shared/types/event-shape";
import type { AaveV3Context, AaveV3EventType } from "@/lib/shared/types/protocols/aave-v3";
import type {
  AaveV3SwapDetail,
  AaveV3SwapKind,
  AaveV3SwapPoolEvent,
  AaveV3SwapRoute,
} from "@/lib/shared/types/event-shape";
import { AAVE_V3_SWAP_LABELS } from "@/lib/aave-v3/swap-kinds";
import { resolveV3Tokens, scaleV3, flowV3, type V3TokenMeta } from "@/lib/sources/chain/aave-v3-tokens";

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface AaveV3TimelineResult {
  wallet: string;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts): what was served against what the
   *  position actually holds. The route attaches it; absent means uncapped. */
  rowCeiling?: TimelineRowCeiling;
}

/** One row of mv_aave_v3_events, exactly as the rails route projects it. */
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
  /** The other account of a transfer_in/transfer_out row (mig 160): the sender
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
  /** At-block USD from aave_v3_historic_prices (mig 092) — the event's own
   *  market's oracle read AT THE EVENT'S BLOCK by the oracle-price filler.
   *  NULL until the walk (or the --liq-only pass) reaches the block; the
   *  card renders token-only then. Liquidations carry both sides. */
  price_usd: string | null;
  price_source: string | null;
  collateral_price_usd: string | null;
  collateral_price_source: string | null;
  debt_price_usd: string | null;
  debt_price_source: string | null;
  /** Set when the route asked for `swaps=1` (server mig 243) on the row a paired
   *  position swap was merged into: its given leg, carrying the received leg. */
  swap?: MvSwapLeg | null;
}

export interface MvSwapLeg {
  role: "given" | "received";
  /** Null on a withdraw and swap (server mig 247), which has no received row. */
  pair_event_key: string | null;
  kind: string;
  route: string;
  order_uid: string | null;
  trade_owner: string | null;
  exact: boolean;
  trade_sell_amount: string | null;
  trade_buy_amount: string | null;
  trade_fee_amount: string | null;
  /** The ParaSwap adapter that made the Pool calls (server mig 248). */
  adapter?: string | null;
  /** On the given leg: the received leg's own columns. The server merged its row
   *  into this one, so the swap arrives — and counts — as one event. */
  received?: MvSwapReceived | null;
  /** Every row behind the card, in log order, when a leftover nets into a leg
   *  (server mig 248). Each amount is its row's own; the legs carry the net. */
  events?: MvSwapEvent[];
}

export interface MvSwapEvent {
  event_key: string;
  leg: "given" | "received";
  leftover: boolean;
  action: string;
  reserve: string | null;
  amount: string | null;
  log_index: number;
}

export interface MvSwapReceived {
  /** Null, with action "trade", on a withdraw and swap: the Trade's buy side. */
  event_key: string | null;
  action: string;
  reserve: string | null;
  amount: string | null;
  supply_before: string | null;
  supply_after: string | null;
  /** Absent from a server older than mig 245's api change. */
  debt_before?: string | null;
  debt_after?: string | null;
  price_usd: string | null;
  price_source: string | null;
}

const LABELS: Record<AaveV3EventType, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidation",
  transfer_in: "Transferred in",
  transfer_out: "Transferred out",
  swap: "Swap",
  bad_debt_written_off: "Debt written off",
};

/** CoW Protocol's marker for native ETH as an order's buy token. */
const NATIVE_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const NATIVE_ETH_META: V3TokenMeta = { address: NATIVE_ETH, symbol: "ETH", decimals: 18, lt: null };

function hexFromBytea(v: Buffer | string): string {
  if (typeof v === "string") return v.startsWith("0x") ? v : `0x${v}`;
  return `0x${v.toString("hex")}`;
}

// Scale a raw NUMERIC string by a reserve's decimals → display string.
function amt(raw: string | null, meta: V3TokenMeta | undefined): string | undefined {
  if (raw == null || meta == null) return undefined;
  return String(scaleV3(BigInt(raw), meta.decimals));
}

// Raw-integer passthrough for ctx.raw: the MV columns are pg NUMERIC(78,0) and
// serialize as bare integer strings; null → undefined so the key drops out of
// the JSON. Raws are the chain values — never rebuilt from the scaled floats.
function rawVal(v: string | null): string | undefined {
  return v == null ? undefined : String(v).split(".")[0];
}

/** Origin envelope for a value that IS one decoded Pool log param: the
 *  emitting event, the ABI param name (V3 Pool ABI — Supply/Withdraw/Borrow/
 *  Repay all carry `amount`; LiquidationCall carries `debtToCover` +
 *  `liquidatedCollateralAmount`), the untouched integer, and the divisor
 *  exponent (displayed = raw ÷ 10^scale — the reserve's decimals). Declared
 *  HERE, beside the column projections, so the claim can't drift. Undefined
 *  when the column is NULL or the reserve's decimals are unresolved (nothing
 *  scaled is displayed then either). The before/after running sums get NO
 *  envelope — window aggregates over many logs (derived). */
function originVal(
  event: string,
  param: string,
  meta: V3TokenMeta | undefined,
  v: string | null,
): OriginEnvelope | undefined {
  const raw = rawVal(v);
  return raw === undefined || meta == null ? undefined : { event, param, raw, scale: meta.decimals };
}

/** At-block price pair → the context's typed shape. NULL columns (the walk
 *  hasn't reached the block) drop the key entirely; an unrecognized source
 *  string (a future filler source this build predates) is treated the same —
 *  the card renders token-only rather than mislabeling a receipt. */
function priceOf(usd: string | null, source: string | null): { usd: number; source: "iaave-oracle" } | undefined {
  if (usd == null || source !== "iaave-oracle") return undefined;
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? { usd: n, source } : undefined;
}

/** V3 Pool event emitting each action's `amount` param. */
const AMOUNT_EVENT: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  bad_debt_written_off: "DeficitCreated",
};

/** The emitted param behind each action's `amount` column, where it is not
 *  the Pool ABI's own `amount`: DeficitCreated carries `amountCreated`. */
const AMOUNT_PARAM: Record<string, string> = {
  bad_debt_written_off: "amountCreated",
};

/** The tokens a row names (lowercased, native ETH left out): the ones the
 *  transform reads symbol and decimals for. */
export function aaveV3RowTokens(r: MvRow): string[] {
  const out: string[] = [];
  for (const a of [
    r.reserve,
    r.collateral_asset,
    r.debt_asset,
    r.swap?.received?.reserve,
    ...(r.swap?.events ?? []).map((e) => e.reserve),
  ]) {
    if (a && a.toLowerCase() !== NATIVE_ETH) out.push(a.toLowerCase());
  }
  return out;
}

/**
 * Transform raw mv_aave_v3_events rows → the shared { wallet, events, totalEvents }
 * shape. The replay lives in the MV; the presentation (symbols, basket) lives here.
 */
export async function buildAaveV3Timeline(rows: MvRow[], walletRaw: string): Promise<AaveV3TimelineResult> {
  const wallet = walletRaw.toLowerCase();

  // Resolve symbol/decimals for every reserve referenced (primary / collateral /
  // debt) in one batched ERC20 multicall.
  const addrs = new Set<string>();
  for (const r of rows) for (const a of aaveV3RowTokens(r)) addrs.add(a);
  const metas = await resolveV3Tokens([...addrs]);
  const meta = (a: string | null | undefined): V3TokenMeta | undefined =>
    a == null ? undefined : a.toLowerCase() === NATIVE_ETH ? NATIVE_ETH_META : metas.get(a.toLowerCase());

  // A paired swap arrives as ONE row (server `?swaps=1`): the given leg, with
  // the received leg's columns riding in `swap.received`.
  const events: BaseActivityEvent[] = rows.map((r) => {
    const e = r.swap?.role === "given" && r.swap.received ? swapEvent(r, r.swap, r.swap.received) : rowEvent(r);
    if (aaveV3RowTokens(r).some((a) => !metas.has(a) || metas.get(a)!.unresolved === true))
      e.tokenMetaUnresolved = true;
    return e;
  });

  function swapEvent(g: MvRow, leg: MvSwapLeg, x: MvSwapReceived): BaseActivityEvent {
    const tx = hexFromBytea(g.tx_hash);
    const gMeta = meta(g.reserve);
    const xMeta = meta(x.reserve);
    const kind = leg.kind as AaveV3SwapKind;
    // Each leg rides its own axis: an aToken leg (a transfer, a supply) the
    // supplied balance, a repay or borrow the debt.
    const givenAction: AaveV3SwapDetail["givenAction"] =
      g.action === "repay" ? "repay" : g.action === "transfer_in" ? "transfer_in" : "transfer_out";
    const receivedAction: AaveV3SwapDetail["receivedAction"] =
      x.action === "supply" || x.action === "borrow" || x.action === "repay" || x.action === "trade"
        ? x.action
        : "transfer_in";
    const givenDebt = givenAction === "repay";
    const receivedDebt = receivedAction === "borrow" || receivedAction === "repay";
    // A withdraw and swap's received leg is the Trade's buy side: no position
    // balance, no price, no Pool log.
    const receivedTrade = receivedAction === "trade";
    // A ParaSwap swap's leftover rows net into their legs (server mig 248): a
    // netted leg's amount is a difference, which no single log's param backs.
    const events: AaveV3SwapPoolEvent[] | undefined = leg.events?.map((e) => {
      const m = meta(e.reserve);
      const action = e.action as AaveV3SwapPoolEvent["action"];
      return {
        eventKey: e.event_key,
        leg: e.leg,
        leftover: e.leftover,
        action,
        symbol: m?.symbol,
        asset: e.reserve?.toLowerCase() ?? undefined,
        amount: amt(e.amount, m),
        raw: rawVal(e.amount),
        origin: action === "transfer_out" ? undefined : originVal(AMOUNT_EVENT[action], "amount", m, e.amount),
      };
    });
    const givenNet = !!events?.some((e) => e.leg === "given" && e.leftover);
    const receivedNet = !!events?.some((e) => e.leg === "received" && e.leftover);
    const swap: AaveV3SwapDetail = {
      kind,
      route: leg.route as AaveV3SwapRoute,
      givenAction,
      receivedAction,
      givenEventKey: g.event_key!,
      receivedEventKey: x.event_key ?? undefined,
      receivedSymbol: xMeta?.symbol,
      receivedAsset: x.reserve?.toLowerCase() ?? undefined,
      receivedAmount: amt(x.amount, xMeta),
      ...(receivedTrade
        ? {}
        : receivedDebt
          ? {
              receivedDebtBefore: amt(x.debt_before ?? null, xMeta),
              receivedDebtAfter: amt(x.debt_after ?? null, xMeta),
            }
          : { receivedSupplyBefore: amt(x.supply_before, xMeta), receivedSupplyAfter: amt(x.supply_after, xMeta) }),
      receivedPrice: priceOf(x.price_usd, x.price_source),
      // A Pool log leg carries its own amount param; a transfer leg's is derived.
      receivedOrigin:
        receivedAction === "transfer_in" || receivedAction === "trade" || receivedNet
          ? undefined
          : originVal(AMOUNT_EVENT[receivedAction], "amount", xMeta, x.amount),
      orderUid: leg.order_uid ?? undefined,
      tradeOwner: leg.trade_owner?.toLowerCase() ?? undefined,
      exact: leg.exact,
      adapter: leg.adapter?.toLowerCase() ?? undefined,
      ...(events ? { events } : {}),
      raw: {
        receivedAmount: rawVal(x.amount),
        ...(receivedTrade
          ? {}
          : receivedDebt
            ? { receivedDebtBefore: rawVal(x.debt_before ?? null), receivedDebtAfter: rawVal(x.debt_after ?? null) }
            : { receivedSupplyBefore: rawVal(x.supply_before), receivedSupplyAfter: rawVal(x.supply_after) }),
        tradeSellAmount: rawVal(leg.trade_sell_amount),
        tradeBuyAmount: rawVal(leg.trade_buy_amount),
        tradeFeeAmount: rawVal(leg.trade_fee_amount),
      },
    };
    const ctx: AaveV3Context = {
      eventType: "swap",
      amount: amt(g.amount, gMeta),
      reserveSymbol: gMeta?.symbol,
      reserve: g.reserve?.toLowerCase() ?? undefined,
      price: priceOf(g.price_usd, g.price_source),
      // No counterparty and no acting parties: on the adapter route both are
      // the order's one-use contract, which is never named as a party (§15).
      ...(givenDebt
        ? { debtBefore: amt(g.debt_before, gMeta), debtAfter: amt(g.debt_after, gMeta) }
        : { supplyBefore: amt(g.supply_before, gMeta), supplyAfter: amt(g.supply_after, gMeta) }),
      raw: {
        amount: rawVal(g.amount),
        ...(givenDebt
          ? { debtBefore: rawVal(g.debt_before), debtAfter: rawVal(g.debt_after) }
          : { supplyBefore: rawVal(g.supply_before), supplyAfter: rawVal(g.supply_after) }),
      },
      // A repay leg carries the Repay log's own amount; a transfer leg's is
      // derived, so no envelope.
      origin: givenDebt && !givenNet ? { amount: originVal("Repay", "amount", gMeta, g.amount) } : {},
      swap,
    };
    // Both reserves ride the flows, in leg order, for the icon chips.
    const flows = [
      ...(gMeta && g.amount != null
        ? [flowV3(gMeta, BigInt(g.amount), givenAction === "transfer_in" ? "in" : "out")]
        : []),
      // A supply from a swap's Trade leg is what the order sold.
      ...(xMeta && x.amount != null
        ? [flowV3(xMeta, BigInt(x.amount), receivedAction === "repay" || kind === "supply_from_swap" ? "out" : "in")]
        : []),
    ];
    return {
      id: g.event_key!,
      txHash: tx,
      blockNumber: Number(g.block_number),
      timestamp: Number(g.block_timestamp),
      wallet: g.wallet,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
      actionType: "swap",
      actionLabel: AAVE_V3_SWAP_LABELS[kind] ?? LABELS.swap,
      flows,
      context: { protocol: "aave-v3", data: ctx },
    };
  }

  function rowEvent(r: MvRow): BaseActivityEvent {
    const tx = hexFromBytea(r.tx_hash);
    const block = Number(r.block_number);
    const ts = Number(r.block_timestamp);
    const kind = r.action as AaveV3EventType;
    const rMeta = meta(r.reserve);

    const base = {
      // `${tx}-${logIndex}` is NOT unique: a BalanceTransfer with this wallet
      // on both sides emits a transfer_in AND a transfer_out row from the same
      // log. `id` is the React key and the chronological numbering key, so the
      // index's own event_key is used wherever the backend supplies it.
      id: r.event_key || `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: block,
      timestamp: ts,
      wallet: r.wallet,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
    };

    if (kind === "liquidation") {
      const collMeta = meta(r.collateral_asset);
      const debtMeta = meta(r.debt_asset) ?? rMeta;
      const ctx: AaveV3Context = {
        eventType: "liquidation",
        reserveSymbol: debtMeta?.symbol,
        reserve: (r.debt_asset ?? r.reserve)?.toLowerCase() ?? undefined,
        collateralAsset: collMeta?.address,
        collateralSymbol: collMeta?.symbol,
        debtToCover: amt(r.amount, debtMeta),
        liquidatedCollateralAmount: amt(r.liquidated_collateral_amount, collMeta),
        liquidator: r.liquidator?.toLowerCase() ?? undefined,
        collateralPrice: priceOf(r.collateral_price_usd, r.collateral_price_source),
        debtPrice: priceOf(r.debt_price_usd, r.debt_price_source),
        supplyBefore: amt(r.supply_before, collMeta),
        supplyAfter: amt(r.supply_after, collMeta),
        debtBefore: amt(r.debt_before, debtMeta),
        debtAfter: amt(r.debt_after, debtMeta),
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
      };
      return {
        ...base,
        actionType: kind,
        actionLabel: LABELS[kind],
        flows: [],
        context: { protocol: "aave-v3", data: ctx },
      };
    }

    // Transfers ride the SUPPLY axis: an aToken move changes the supplied
    // balance (debt tokens are non-transferable). Omitting them here would
    // silently read the debt columns and mis-shape the event as a debt move —
    // the compound-timeline BASE_ACTIONS trap.
    const isTransfer = kind === "transfer_in" || kind === "transfer_out";
    const isSupplySide = kind === "supply" || kind === "withdraw" || isTransfer;

    // Direction: "in" = toward wallet, "out" = toward protocol (a transfer_in
    // moves aTokens toward this wallet; a transfer_out sends them away). A
    // write-off moves no token at all; it takes a repay's sign because it is
    // the same movement on the debt axis, debt leaving the position.
    const dir: "in" | "out" =
      kind === "supply" || kind === "repay" || kind === "transfer_out" || kind === "bad_debt_written_off"
        ? "out"
        : "in";
    const flows = rMeta && r.amount != null ? [flowV3(rMeta, BigInt(r.amount), dir)] : [];

    const ctx: AaveV3Context = {
      eventType: kind,
      amount: amt(r.amount, rMeta),
      reserveSymbol: rMeta?.symbol,
      reserve: r.reserve?.toLowerCase() ?? undefined,
      price: priceOf(r.price_usd, r.price_source),
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
        ? { supplyBefore: amt(r.supply_before, rMeta), supplyAfter: amt(r.supply_after, rMeta) }
        : { debtBefore: amt(r.debt_before, rMeta), debtAfter: amt(r.debt_after, rMeta) }),
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
        amount: isTransfer
          ? undefined
          : originVal(AMOUNT_EVENT[kind] ?? kind, AMOUNT_PARAM[kind] ?? "amount", rMeta, r.amount),
      },
    };
    return {
      ...base,
      actionType: kind,
      actionLabel: LABELS[kind] ?? kind,
      flows,
      context: { protocol: "aave-v3", data: ctx },
    };
  }

  return { wallet, events, totalEvents: events.length };
}
