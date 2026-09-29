// f(x) V2 position timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/fx/position/:pool/:id/timeline) returns the raw
// Operate/LiquidatePosition rows in block order (each enriched with its same-tx
// PositionSnapshot: tick, shares, oracle price at the block), plus the position
// meta with the settled chain state. This builder shapes each
// BaseActivityEvent + FxContext.
//
// UNITS: an operate's collateral delta, a liquidation's seizure and a
// rebalance's collateral are all TOKEN units (wstETH 18 dp / WBTC 8 dp): the
// manager scales a seizure down to the token before it emits and transfers it
// (PoolManager `_afterRebalanceOrLiquidate`), net of the protocol's share of
// the bonus. getPosition reads are NORMALIZED 1e18 (stETH-equivalent). Debt is fxUSD everywhere. The running
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

const SHARE_ROUNDING_WEI = BigInt(100_000);

/** The row's position on chain (getPosition at its block): collateral and
 *  debt after; the debt before (the read at block − 1 on a liquidation, else
 *  the after less the event's own debt delta, which the stored pairs match to
 *  within share rounding); and the debt's change since the previous event
 *  block's read — funding, rebalances and any bad-debt share, which carry no
 *  event of the position's own. */
function chainFigures(
  r: RawFxTimelineRow,
  debtDelta: bigint,
): Pick<FxContext, "collAfter" | "collBefore" | "debtAfter" | "debtBefore" | "debtSincePrevious"> {
  if (r.chain_debts_after == null || r.chain_colls_after == null) return {};
  const after = BigInt(r.chain_debts_after);
  const before = r.chain_debts_before != null ? BigInt(r.chain_debts_before) : after - debtDelta;
  const since = r.chain_prev_debts_after != null && !r.is_open_event ? before - BigInt(r.chain_prev_debts_after) : null;
  return {
    collAfter: fmtUnits(r.chain_colls_after, 18),
    ...(r.chain_colls_before != null ? { collBefore: fmtUnits(r.chain_colls_before, 18) } : {}),
    debtAfter: fmtUnits(after.toString(), 18),
    debtBefore: fmtUnits(before.toString(), 18),
    // An operate's before carries the pool's share rounding (up to 16,799 wei
    // over the stored pairs), so a move inside that is not stated.
    ...(since != null && (since < ZERO ? -since : since) > SHARE_ROUNDING_WEI
      ? { debtSincePrevious: fmtUnits(since.toString(), 18) }
      : {}),
  };
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
  /** getPosition at the row's block (NORMALIZED collateral, fxUSD debt, 1e18):
   *  the position after the block's last event for it, so null on an earlier
   *  row of a block with two. `_before` is the read at block − 1, served on a
   *  liquidation; `chain_prev_debts_after` the read at the position's previous
   *  event block. All absent on a payload from before the route sent them. */
  chain_colls_after?: string | null;
  chain_debts_after?: string | null;
  chain_colls_before?: string | null;
  chain_debts_before?: string | null;
  chain_prev_debts_after?: string | null;
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

/** One socialized-lane row — a rebalance or liquidation the route's
 *  tick-lineage replay attributed to this position: a one-tick
 *  `RebalanceTick` (kind "tick"), the pool-wide `Rebalance` (kind "pool", no
 *  tick) or the pool-wide `Liquidate` (kind "liquidate", no tick; mig 369).
 *  Amounts are the whole tick's (or pool's); collateral in token units. */
export interface RawFxSocializedRow {
  block_number: string;
  block_timestamp: string | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  tick: string | null;
  position_tick: string;
  colls: string;
  fx_usd_debts: string;
  stable_debts: string;
  /** Absent on a payload from before the route sent it: a one-tick row. */
  kind?: "tick" | "pool" | "liquidate";
  /** Pool-wide rows: the tick the position's shares moved to (-32768 = the
   *  tick was liquidated whole). */
  moved_to_tick?: string;
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
      ? { actionType: "liquidatePosition", actionLabel: "Liquidated" }
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
      // Collateral sent to the liquidator — token units.
      flows.push({
        token: meta.tokenAddress,
        tokenSymbol: meta.tokenSymbol,
        tokenDecimals: meta.tokenDecimals,
        amount: r.liq_colls,
        amountFormatted: numUnits(r.liq_colls, meta.tokenDecimals),
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
            liqColls: r.liq_colls != null ? fmtUnits(r.liq_colls, meta.tokenDecimals) : undefined,
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
      ...chainFigures(r, debtDelta),
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
  // ── Socialized lane: rebalance hits as derived rows ────────────────────────
  // The replay proves THIS position's shares sat in the rebalanced tick; the
  // amounts stay the whole tick's (or pool's) clear, so the card labels them
  // that way, carries no position flows, and reads the position's own change
  // when the row is opened.
  for (const s of resp.socialized ?? []) {
    if (s.kind === "liquidate") {
      // A pool-wide Liquidate: the run liquidated this position's tick. Its
      // amounts are the whole run's, so they ride the pool fields and the
      // row's debtDelta stays 0 (the lifetime sums count the position's own
      // events only); the row read states the position's change.
      const emptied = s.moved_to_tick === "-32768";
      const context: FxContext = {
        eventType: "liquidation",
        pool: position.pool,
        poolSymbol: meta.tokenSymbol,
        positionId: position.positionId,
        debtDelta: "0",
        impliedDebtAfter: "0",
        poolWide: true,
        rebalancedTick: Number(s.position_tick),
        tickRebColls: fmtUnits(s.colls, meta.tokenDecimals),
        tickRebFxusdDebts: fmtUnits(s.fx_usd_debts, 18),
        tickRebStableDebts: fmtUnits(s.stable_debts, 18),
        ...(emptied ? { emptiesPosition: true } : {}),
        ...(s.tx_from ? { txFrom: s.tx_from.toLowerCase() } : {}),
        ...ownerFacts(orderKey(s.block_number, s.log_index)),
      };
      events.push({
        id: `${s.tx_hash}:${s.log_index}`,
        txHash: s.tx_hash,
        blockNumber: Number(s.block_number),
        timestamp: s.block_timestamp != null ? Number(s.block_timestamp) : 0,
        wallet,
        actionType: "liquidatePosition",
        actionLabel: "Pool Liquidation",
        flows: [],
        etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", s.tx_hash),
        context: { protocol: "fx" as const, data: context },
      });
      continue;
    }
    const poolWide = s.kind === "pool";
    const context: FxContext = {
      eventType: "tickRebalance",
      pool: position.pool,
      poolSymbol: meta.tokenSymbol,
      positionId: position.positionId,
      debtDelta: "0",
      impliedDebtAfter: "0",
      rebalancedTick: Number(s.position_tick),
      ...(poolWide ? { poolWide: true } : {}),
      tickRebColls: fmtUnits(s.colls, meta.tokenDecimals),
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
      actionLabel: poolWide ? "Pool Rebalance" : "Tick Rebalance",
      flows: [],
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", s.tx_hash),
      context: { protocol: "fx" as const, data: context },
    });
  }

  events.sort(
    (a, b) => orderKey(a.blockNumber, Number(a.id.split(":")[1])) - orderKey(b.blockNumber, Number(b.id.split(":")[1])),
  );

  // Loans on one NFT: closing or liquidating empties the position but keeps
  // the NFT, and a later deposit funds the same id again (wsteth-137 closed
  // 18 Jan 2025 and borrowed again on 20 Jan). A windowed response does not
  // start at the first loan, so it is not numbered.
  let loan = 0;
  let emptied = true;
  for (const e of resp.cutoffBlock == null ? events : []) {
    const d = (e.context as { data: FxContext }).data;
    if (d.eventType !== "operate" && d.eventType !== "liquidation") continue;
    if (emptied && d.eventType === "operate") {
      loan += 1;
      if (loan > 1) d.reopens = true;
    }
    if (loan > 0) d.loanNumber = loan;
    emptied = d.emptiesPosition === true;
  }

  return { position, events, totalEvents: resp.totalEvents ?? events.length };
}
