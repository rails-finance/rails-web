// f(x) V2 position timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/fx/position/:pool/:id/timeline) returns the raw
// Operate/LiquidatePosition rows in block order (each enriched with its same-tx
// PositionSnapshot: tick, shares, oracle price at the block), plus the position
// meta with the settled chain state. This builder shapes each
// BaseActivityEvent + FxContext.
//
// UNITS: an operate's collateral delta is the TOKEN as transferred (wstETH
// 18 dp / WBTC 8 dp); a liquidation's seized collateral is NORMALIZED 1e18
// units (stETH-equivalent / WBTC-18dp) — the two never mix in one field, and
// flows carry each with its own symbol. Debt is fxUSD everywhere. The running
// implied debt is event-replay only — its gap vs the settled debt is the
// socialized lane (funding / rebalances / write-offs), shown as an explicit
// reconciliation, never hidden.

import { FX_POOLS, FXUSD_META, type FxPoolKey } from "@/lib/fx/asset-catalog";
import { toFxSummary, type FxPositionSummary, type RawFxPositionRow } from "@/lib/sources/api/fx-positions";
import type { BaseActivityEvent, AssetFlow, FxContext, FxEventType } from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface FxTimelineResult {
  position: FxPositionSummary | null;
  events: BaseActivityEvent[];
  /** ⚠️ The mv_fx_events LANE's count, as the backend counts it — the
   *  ownership and socialized lanes are on top of this, and they always ride
   *  the response whole. */
  totalEvents: number;
  /** Where a `recent` window opened over the mv_fx_events lane: `events`
   *  holds every MV-lane event from this block onward — PLUS the ownership
   *  and socialized lanes whole, on both sides of the line — and the opening
   *  balance below it is fetched separately with THIS number. Null means the
   *  MV lane arrived whole. */
  cutoffBlock?: number | null;
}

/** One raw event row from the rails timeline route. */
export interface RawFxTimelineRow {
  action: "operate" | "liquidate";
  block_number: string;
  block_timestamp: string | null;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  delta_colls: string | null;
  delta_debts: string | null;
  protocol_fees: string | null;
  liq_colls: string | null;
  liq_fxusd_debts: string | null;
  liq_stable_debts: string | null;
  snap_tick: string | null;
  snap_coll_shares: string | null;
  snap_debt_shares: string | null;
  snap_price: string | null;
  is_open_event: boolean;
  empties_position: boolean;
  implied_debt_after: string;
}

/** One ownership-lane row (pool ERC721 Transfer; fx_v2_transfer). */
export interface RawFxTransferRow {
  block_number: string;
  block_timestamp: string | null;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  from_addr: string;
  to_addr: string;
  from_is_contract: boolean | null;
  to_is_contract: boolean | null;
}

/** One socialized-lane row — a tick-level rebalance the route's tick-lineage
 *  replay attributed to this position (fx_v2_rebalance_tick, amounts are the
 *  WHOLE tick's clear). */
export interface RawFxSocializedRow {
  block_number: string;
  block_timestamp: string | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  tick: string;
  position_tick: string;
  colls: string;
  fx_usd_debts: string;
  stable_debts: string;
}

/** The rails timeline response envelope. */
export interface RawFxTimelineResponse {
  position: RawFxPositionRow;
  events: RawFxTimelineRow[];
  /** Ownership lane — absent/empty until the transfer scan's first pass. */
  transfers?: RawFxTransferRow[];
  /** Socialized lane — derived tick-rebalance hits (may be absent). */
  socialized?: RawFxSocializedRow[];
  totalEvents: number;
  /** The MAX_TIMELINE_ROWS cap cut the MV lane. */
  truncated?: boolean;
  /** Where `?recent=N` drew the line over the MV lane. */
  cutoffBlock?: number | null;
}

const ZERO = BigInt(0);

/** Format a raw integer string at `decimals` into a plain decimal string. */
function fmtUnits(rawStr: string, decimals: number): string {
  let bi = BigInt(rawStr);
  const neg = bi < ZERO;
  if (neg) bi = -bi;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = (bi / base).toString();
  const frac = (bi % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

const numUnits = (rawStr: string, decimals: number): number => Number(rawStr) / 10 ** decimals;

function labelFor(
  collDelta: bigint,
  debtDelta: bigint,
  isOpen: boolean,
  empties: boolean,
): { actionType: string; actionLabel: string } {
  if (isOpen) return { actionType: "openPosition", actionLabel: "Open Position" };
  if (empties) return { actionType: "closePosition", actionLabel: "Close Position" };
  const collIn = collDelta > ZERO;
  const collOut = collDelta < ZERO;
  const debtUp = debtDelta > ZERO;
  const debtDown = debtDelta < ZERO;
  let label = "Adjust Position";
  if (collIn && debtUp) label = "Deposit & Borrow";
  else if (collIn && debtDown) label = "Deposit & Repay";
  else if (collOut && debtUp) label = "Withdraw & Borrow";
  else if (collOut && debtDown) label = "Repay & Withdraw";
  else if (collIn) label = "Deposit";
  else if (collOut) label = "Withdraw";
  else if (debtUp) label = "Borrow fxUSD";
  else if (debtDown) label = "Repay fxUSD";
  return { actionType: "adjustPosition", actionLabel: label };
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** Strict (block, logIndex) order key. */
const orderKey = (block: string | number, logIndex: number): number => Number(block) * 100000 + logIndex;

/** Build the position timeline from the rails route's raw rows. */
export function buildFxTimeline(resp: RawFxTimelineResponse): FxTimelineResult {
  const position = resp.position ? toFxSummary(resp.position) : null;
  if (!position) return { position: null, events: [], totalEvents: 0 };
  const meta = FX_POOLS[position.pool as FxPoolKey];
  const wallet = (position.owner ?? position.openedBy ?? meta.address).toLowerCase();

  // ── Ownership eras (the transfer lane) ─────────────────────────────────────
  // Raw transfers are full of INTRA-TX custody churn: mints route 0x0 → a
  // minter contract → the user, and automation managers shuttle the NFT in
  // and out around every operate (hundreds of round trips on bot positions).
  // So ownership is judged PER TRANSACTION: each tx's transfers collapse to
  // their net effect (first `from` → last `to`), the owner in force is the
  // RESTING owner after a tx completes, and only standalone net changes
  // (no own-event in the tx, from ≠ to) render as timeline cards.
  const transfers = [...(resp.transfers ?? [])].sort(
    (a, b) => orderKey(a.block_number, a.log_index) - orderKey(b.block_number, b.log_index),
  );
  const isContractByAddr = new Map<string, boolean>();
  for (const t of transfers) {
    if (t.from_is_contract != null) isContractByAddr.set(t.from_addr.toLowerCase(), t.from_is_contract);
    if (t.to_is_contract != null) isContractByAddr.set(t.to_addr.toLowerCase(), t.to_is_contract);
  }
  if (position.owner != null && position.ownerIsContract != null) {
    isContractByAddr.set(position.owner.toLowerCase(), position.ownerIsContract);
  }

  interface TxGroup {
    txHash: string;
    firstFrom: string;
    restingOwner: string;
    last: RawFxTransferRow;
    /** Order key of the tx's FIRST transfer — an event in the same tx (any
     *  log position) or any later key resolves to this group's resting owner. */
    key: number;
  }
  const txGroups: TxGroup[] = [];
  for (const t of transfers) {
    const g = txGroups[txGroups.length - 1];
    if (g && g.txHash === t.tx_hash.toLowerCase()) {
      g.restingOwner = t.to_addr.toLowerCase();
      g.last = t;
    } else {
      txGroups.push({
        txHash: t.tx_hash.toLowerCase(),
        firstFrom: t.from_addr.toLowerCase(),
        restingOwner: t.to_addr.toLowerCase(),
        last: t,
        key: orderKey(t.block_number, t.log_index),
      });
    }
  }
  const ownerFacts = (key: number): { ownerAt?: string; ownerAtIsContract?: boolean } => {
    let ownerAt: string | undefined;
    for (const g of txGroups) {
      if (g.key > key) break;
      ownerAt = g.restingOwner;
    }
    if (!ownerAt) return {};
    const kind = isContractByAddr.get(ownerAt);
    return { ownerAt, ...(kind != null ? { ownerAtIsContract: kind } : {}) };
  };

  const operateTxHashes = new Set(resp.events.map((r) => r.tx_hash.toLowerCase()));

  const events: BaseActivityEvent[] = resp.events.map((r) => {
    const isLiq = r.action === "liquidate";
    const eventType: FxEventType = isLiq ? "liquidation" : "operate";
    const collDelta = r.delta_colls != null ? BigInt(r.delta_colls) : ZERO;
    const debtDelta = r.delta_debts != null ? BigInt(r.delta_debts) : ZERO;

    const { actionType, actionLabel } = isLiq
      ? { actionType: "liquidatePosition", actionLabel: "Liquidation" }
      : labelFor(collDelta, debtDelta, r.is_open_event, r.empties_position);

    const flows: AssetFlow[] = [];
    if (!isLiq && collDelta !== ZERO) {
      const mag = collDelta < ZERO ? -collDelta : collDelta;
      flows.push({
        token: meta.tokenAddress,
        tokenSymbol: meta.tokenSymbol,
        tokenDecimals: meta.tokenDecimals,
        amount: mag.toString(),
        amountFormatted: numUnits(mag.toString(), meta.tokenDecimals),
        direction: collDelta > ZERO ? "in" : "out",
      });
    }
    if (isLiq && r.liq_colls != null && BigInt(r.liq_colls) !== ZERO) {
      // Seized collateral — NORMALIZED units, so it carries the normalized symbol.
      flows.push({
        token: meta.tokenAddress,
        tokenSymbol: meta.normalizedSymbol,
        tokenDecimals: 18,
        amount: r.liq_colls,
        amountFormatted: numUnits(r.liq_colls, 18),
        direction: "out",
      });
    }
    if (debtDelta !== ZERO) {
      const mag = debtDelta < ZERO ? -debtDelta : debtDelta;
      flows.push({
        token: FXUSD_META.address,
        tokenSymbol: FXUSD_META.symbol,
        tokenDecimals: FXUSD_META.decimals,
        amount: mag.toString(),
        amountFormatted: numUnits(mag.toString(), 18),
        direction: debtDelta > ZERO ? "out" : "in",
      });
    }

    const gasUsed = r.tx_gas_used != null ? Number(r.tx_gas_used) : null;
    const gasPrice = r.tx_gas_price != null ? Number(r.tx_gas_price) : null;

    const context: FxContext = {
      eventType,
      pool: position.pool,
      poolSymbol: meta.tokenSymbol,
      positionId: position.positionId,
      ...(isLiq
        ? {
            liqColls: r.liq_colls != null ? fmtUnits(r.liq_colls, 18) : undefined,
            liqFxusdDebts: r.liq_fxusd_debts != null ? fmtUnits(r.liq_fxusd_debts, 18) : undefined,
            liqStableDebts: r.liq_stable_debts != null ? fmtUnits(r.liq_stable_debts, 18) : undefined,
          }
        : {
            collDelta: fmtUnits(collDelta.toString(), meta.tokenDecimals),
            protocolFees: r.protocol_fees != null ? fmtUnits(r.protocol_fees, 18) : undefined,
          }),
      debtDelta: fmtUnits(debtDelta.toString(), 18),
      ...(r.snap_tick != null ? { tick: Number(r.snap_tick) } : {}),
      ...(r.snap_coll_shares != null ? { collShares: r.snap_coll_shares } : {}),
      ...(r.snap_debt_shares != null ? { debtShares: r.snap_debt_shares } : {}),
      ...(r.snap_price != null ? { oraclePrice: fmtUnits(r.snap_price, 18) } : {}),
      impliedDebtAfter: fmtUnits(r.implied_debt_after, 18),
      isOpen: r.is_open_event || undefined,
      emptiesPosition: r.empties_position || undefined,
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      ...ownerFacts(orderKey(r.block_number, r.log_index)),
    };

    return {
      id: `${r.tx_hash}:${r.log_index}`,
      txHash: r.tx_hash,
      blockNumber: Number(r.block_number),
      timestamp: r.block_timestamp != null ? Number(r.block_timestamp) : 0,
      wallet,
      actionType,
      actionLabel,
      flows,
      ...(gasUsed != null && gasPrice != null
        ? { gas: { gasUsed, gasCostEth: (gasUsed * gasPrice) / 1e18, gasCostUsd: 0 } }
        : {}),
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", r.tx_hash),
      context: { protocol: "fx" as const, data: context },
    };
  });

  // ── Ownership changes as timeline rows ─────────────────────────────────────
  // One card per tx-group NET change, and only for standalone txs: a group
  // sharing its tx with an own-event is that event's ERC721 side-effect
  // (mint routing, manager custody), and a round trip (from == to) is pure
  // churn. A standalone mint is the only dated record of an eventless
  // position and anchors its timeline as "Position Minted".
  for (const g of txGroups) {
    if (operateTxHashes.has(g.txHash)) continue;
    if (g.firstFrom === g.restingOwner) continue; // round trip — no net change
    const isMint = g.firstFrom === ZERO_ADDR;
    const t = g.last;

    const gasUsed = t.tx_gas_used != null ? Number(t.tx_gas_used) : null;
    const gasPrice = t.tx_gas_price != null ? Number(t.tx_gas_price) : null;
    const context: FxContext = {
      eventType: "transfer",
      pool: position.pool,
      poolSymbol: meta.tokenSymbol,
      positionId: position.positionId,
      debtDelta: "0",
      impliedDebtAfter: "0",
      transferFrom: g.firstFrom,
      transferTo: g.restingOwner,
    };
    events.push({
      id: `${t.tx_hash}:${t.log_index}`,
      txHash: t.tx_hash,
      blockNumber: Number(t.block_number),
      timestamp: t.block_timestamp != null ? Number(t.block_timestamp) : 0,
      wallet,
      actionType: isMint ? "mintPosition" : "transferOwnership",
      actionLabel: isMint ? "Position Minted" : "Ownership Transfer",
      flows: [],
      ...(gasUsed != null && gasPrice != null
        ? { gas: { gasUsed, gasCostEth: (gasUsed * gasPrice) / 1e18, gasCostUsd: 0 } }
        : {}),
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", t.tx_hash),
      context: { protocol: "fx" as const, data: context },
    });
  }
  // ── Socialized lane: tick-rebalance hits as derived rows ───────────────────
  // These are the Maker-fork-style derived events: the replay proves THIS
  // position's shares sat in the rebalanced tick; the amounts stay the whole
  // tick's clear (per-position slices aren't provable from the logs), so the
  // card labels them tick-level and carries no position flows.
  for (const s of resp.socialized ?? []) {
    const context: FxContext = {
      eventType: "tickRebalance",
      pool: position.pool,
      poolSymbol: meta.tokenSymbol,
      positionId: position.positionId,
      debtDelta: "0",
      impliedDebtAfter: "0",
      rebalancedTick: Number(s.position_tick),
      tickRebColls: fmtUnits(s.colls, 18),
      tickRebFxusdDebts: fmtUnits(s.fx_usd_debts, 18),
      tickRebStableDebts: fmtUnits(s.stable_debts, 18),
      ...(s.tx_from ? { txFrom: s.tx_from.toLowerCase() } : {}),
      ...ownerFacts(orderKey(s.block_number, s.log_index)),
    };
    events.push({
      id: `${s.tx_hash}:${s.log_index}`,
      txHash: s.tx_hash,
      blockNumber: Number(s.block_number),
      timestamp: s.block_timestamp != null ? Number(s.block_timestamp) : 0,
      wallet,
      actionType: "tickRebalance",
      actionLabel: "Tick Rebalance",
      flows: [],
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", s.tx_hash),
      context: { protocol: "fx" as const, data: context },
    });
  }

  events.sort(
    (a, b) => orderKey(a.blockNumber, Number(a.id.split(":")[1])) - orderKey(b.blockNumber, Number(b.id.split(":")[1])),
  );

  return { position, events, totalEvents: resp.totalEvents ?? events.length };
}
