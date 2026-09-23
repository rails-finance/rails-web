// f(x) V2 positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/fx/positions) does the structural work — filter,
// sort, paginate over mv_fx_positions ⋈ fx_position_chain ⋈ fx_pool_state — and
// returns the page slice as raw per-position rows. This builder shapes each
// FxPositionSummary.
//
// CURRENT collateral/debt/owner come from the SETTLED lane (the worker's sweep
// of the pool's own getPosition/getPositionDebtRatio/ownerOf views) — event
// replay cannot see f(x)'s socialized mutations (funding, tick/pool rebalances,
// bad-debt write-offs). The event-implied debt rides along precisely so the gap
// (socializedDebt) can be shown, never hidden.

import { FX_POOLS, type FxPoolKey } from "@/lib/fx/asset-catalog";

export type FxPositionStatus = "open" | "closed" | "unknown";
export type FxPositionSort = "collateral" | "debt" | "debtRatio" | "events" | "lastActivity" | "created";

export interface FxPositionSummary {
  pool: FxPoolKey;
  /** Collateral token symbol (wstETH / WBTC — the Operate delta unit). */
  poolSymbol: string;
  /** Rate-normalized unit the settled amounts are in (stETH / WBTC). */
  normalizedSymbol: string;
  positionId: string;
  /** Settled ERC721 owner (sweep's ownerOf); opener as pre-sweep fallback. */
  owner: string | null;
  /** eth_getCode contract-ness of the settled owner (fx_owner_kind) — the
   *  second third-party-marking fact. Null until the kind scan covers it. */
  ownerIsContract: boolean | null;
  /** tx sender of the position's first event. */
  openedBy: string | null;
  status: FxPositionStatus;
  everLiquidated: boolean;
  liquidationCount: number;
  /** The settled lane — fx_position_chain (getPosition at the sweep's head block). */
  settled: {
    /** Collateral in NORMALIZED units (human-readable) + raw 1e18 string. */
    colls: number | null;
    collsRaw: string | null;
    /** fxUSD debt (human-readable) + raw 1e18 string. */
    debts: number | null;
    debtsRaw: string | null;
    /** getPositionDebtRatio scaled to 0–1 (null pre-sweep). */
    debtRatio: number | null;
    /** Head block the sweep read at. */
    block: number | null;
    /** colls × the pool oracle price (null when either side is missing). */
    collUsd: number | null;
  };
  /** Event-implied running debt Σ (fxUSD) — NOT the position's true debt. */
  impliedDebt: { amount: number; raw: string };
  /** implied − settled (fxUSD): the socialized lane (funding + rebalances +
   *  write-offs) over the position's whole life. Null pre-sweep. */
  socializedDebt: number | null;
  /** Latest indexed oracle price per NORMALIZED unit + the block it was read at. */
  oracle: { priceUsd: number | null; priceBlock: number | null };
  /** Event-replay lifecycle. All-null (eventCount 0) for the handful of
   *  positions minted via a path that emits no Operate — they exist only in
   *  the settled lane, and the UI says so rather than inventing dates. */
  activity: {
    firstBlock: number | null;
    lastBlock: number | null;
    firstTs: number | null;
    lastTs: number | null;
    eventCount: number;
  };
  /** The tick the position sat in at its last touch (position-snapshot fact). */
  lastTick: number | null;
}

/** One per-position page-slice row from the rails route (pre-presentation).
 *  Wei-scale values are decimal strings. */
export interface RawFxPositionRow {
  pool_key: FxPoolKey;
  position: string;
  /** Null for chain-only (eventless) positions — see `activity` note. */
  opened_block: string | null;
  opened_ts: string | null;
  opened_by: string | null;
  last_event_block: string | null;
  last_event_ts: string | null;
  n_operates: number;
  n_liquidations: number;
  ever_liquidated: boolean;
  implied_debt: string;
  coll_in_token: string;
  coll_out_token: string;
  protocol_fees_paid: string | null;
  gas_wei: string | null;
  last_tick: string | null;
  last_snap_price: string | null;
  last_snap_block: string | null;
  closed_hint: boolean;
  chain_raw_colls: string | null;
  chain_raw_debts: string | null;
  chain_debt_ratio: string | null;
  chain_owner: string | null;
  chain_closed: boolean | null;
  chain_block: string | null;
  /** Timeline route only (the listing route omits it — no marking there). */
  owner_is_contract?: boolean | null;
  pool_oracle_price: string | null;
  pool_price_block: string | null;
}

const WAD = 1e18;

const num = (s: string | null): number | null => (s == null ? null : Number(s) / WAD);

function statusOf(r: RawFxPositionRow): FxPositionStatus {
  if (r.chain_closed != null) return r.chain_closed ? "closed" : "open";
  // Pre-sweep fallback: the last snapshot's zero coll-shares is chain-exact for
  // closes-by-touch; anything else is unknown until the sweep lands.
  return r.closed_hint ? "closed" : "unknown";
}

export function toFxSummary(r: RawFxPositionRow): FxPositionSummary {
  const meta = FX_POOLS[r.pool_key];
  const settledColls = num(r.chain_raw_colls);
  const settledDebts = num(r.chain_raw_debts);
  const oraclePrice = num(r.pool_oracle_price);
  const impliedDebt = Number(r.implied_debt) / WAD;
  return {
    pool: r.pool_key,
    poolSymbol: meta.tokenSymbol,
    normalizedSymbol: meta.normalizedSymbol,
    positionId: r.position,
    owner: r.chain_owner ?? r.opened_by,
    ownerIsContract: r.owner_is_contract ?? null,
    openedBy: r.opened_by,
    status: statusOf(r),
    everLiquidated: r.ever_liquidated,
    liquidationCount: r.n_liquidations,
    settled: {
      colls: settledColls,
      collsRaw: r.chain_raw_colls,
      debts: settledDebts,
      debtsRaw: r.chain_raw_debts,
      debtRatio: num(r.chain_debt_ratio),
      block: r.chain_block != null ? Number(r.chain_block) : null,
      collUsd: settledColls != null && oraclePrice != null ? settledColls * oraclePrice : null,
    },
    impliedDebt: { amount: impliedDebt, raw: r.implied_debt },
    socializedDebt: settledDebts != null ? impliedDebt - settledDebts : null,
    oracle: {
      priceUsd: oraclePrice,
      priceBlock: r.pool_price_block != null ? Number(r.pool_price_block) : null,
    },
    activity: {
      firstBlock: r.opened_block != null ? Number(r.opened_block) : null,
      lastBlock: r.last_event_block != null ? Number(r.last_event_block) : null,
      firstTs: r.opened_ts != null ? Number(r.opened_ts) : null,
      lastTs: r.last_event_ts != null ? Number(r.last_event_ts) : null,
      eventCount: r.n_operates + r.n_liquidations,
    },
    lastTick: r.last_tick != null ? Number(r.last_tick) : null,
  };
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side — order is preserved. */
export function buildFxPositionRows(raw: RawFxPositionRow[]): FxPositionSummary[] {
  return raw.map(toFxSummary);
}
