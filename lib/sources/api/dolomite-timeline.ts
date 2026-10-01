// Dolomite timeline — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// rails-server returns the raw mv_dolomite_events rows (migration 122): the
// action events un-pivoted to the BALANCE grain — one row per BalanceUpdate
// leg, discriminated by (action, leg): a liquidation is FOUR rows
// (solid_held / solid_owed on the liquidator's account, liquid_held /
// liquid_owed on the borrower's), a vaporization three, transfer/sell/buy
// two. `event_key` is unique per row — the React key. Each row carries the
// leg's emitted deltaWei AND the emitted absolute after-state `new_par`
// (Dolomite emits the scaled balance itself — last-write-wins, not a running
// sum; `par_before` is a lag of it, null on the first touch = zero). This
// transform maps each (action, leg) pair to a presentation event type and
// builds BaseActivityEvent + DolomiteContext.
//
// MARKET IDENTITY IS NOT ON THE ROW — the backend keys rows by numeric
// market_id only (the roster grows by governance; nothing hardcodes it), so
// the proxy resolves identity from the core's own roster at head
// (resolveDolomiteMarketState) and passes the map in. A row whose market is
// unresolvable degrades to "market #N" with RAW integer amounts (scaling by a
// guessed decimals would mis-state USDC by 1e12) rather than mis-scaling.
//
// ⚠️ account_number is a uint256 and stays a STRING end to end — Number()
// would silently destroy hash-derived numbers past 2^53.
//
// A liquidation's INDEXED owner is the liquidator (`liquidator` is named on
// ALL liquidation legs); the borrower-side legs render as debt written down
// (`liquidation`) and collateral TAKEN (`seize_out`) — never as acts the
// borrower performed.
//
// SERVER-ONLY — imported from the /api/dolomite/* route handlers.

import type { BaseActivityEvent, AssetFlow, DolomiteContext, DolomiteEventType } from "@/lib/shared/types/event-shape";
import type { DolomiteMarketStateMap } from "@/lib/sources/chain/dolomite-markets";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { dolomiteBalanceAction, DOLOMITE_BALANCE_ACTION_LABELS } from "@/lib/dolomite/balance-action";

export interface DolomiteTimelineResult {
  owner: string;
  /** Canonical decimal string (uint256). */
  accountNumber: string;
  events: BaseActivityEvent[];
  /** The account's WHOLE history as the backend counts it — not the page. */
  totalEvents: number;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — the answer whenever
   *  `recent` was not asked for, and also when the account holds fewer events
   *  than the window. */
  cutoffBlock?: number | null;
}

/** One row of mv_dolomite_events, exactly as the rails /api/dolomite/timeline
 *  route projects it. numeric/bigint columns arrive as strings from pg. */
export interface DolomiteMvRow {
  block_timestamp: string;
  block_number: string;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  /** The emitting event: deposit | withdraw | transfer | buy | sell | trade |
   *  call | liquidation | vaporization. */
  action: string;
  /** Which BalanceUpdate of that event this row is: self | one | two | taker |
   *  maker | taker_input | taker_output | maker_input | maker_output |
   *  solid_held | solid_owed | liquid_held | liquid_owed | vapor_owed. */
  leg: string;
  leg_seq: number;
  owner: string;
  /** uint256 — STRING, never a JS number. */
  account_number: string;
  /** Dolomite's own numeric market key (a string from pg; null ONLY on
   *  'call', which moves no balance). */
  market_id: string | null;
  /** SIGNED wei delta this leg moved (the BalanceUpdate's deltaWei). */
  delta_wei: string | null;
  /** SIGNED par after (the emitted newPar absolute; negative IS debt). */
  new_par: string | null;
  /** SIGNED par before — lag(new_par); null = first touch = zero. */
  par_before: string | null;
  /** The market's supply / borrow index (1e18) at this row's block and at the
   *  position's previous row. Absent on a payload from before the route sent
   *  them, and on a row without a market. */
  supply_index?: string | null;
  borrow_index?: string | null;
  prev_supply_index?: string | null;
  prev_borrow_index?: string | null;
  /** deposit `from` / withdraw `to` / the other account's owner. */
  counterparty: string | null;
  counterparty_number: string | null;
  caller: string | null;
  /** The solid account's owner — named on ALL liquidation legs. */
  liquidator: string | null;
  /** Unique per row (action:txhash:logindex:leg) — the React render key. */
  event_key: string;
}

const LABELS: Record<DolomiteEventType, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  transfer_in: "Received",
  transfer_out: "Sent",
  trade_taker: "Trade (spent)",
  trade_maker: "Trade (received)",
  liquidation: "Liquidated",
  seize_out: "Collateral seized",
  seize_in: "Seized collateral received",
  liquidation_payout: "Liquidation payout",
  vaporize: "Vaporized",
  call: "Protocol call",
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

const INDEX_BASE = BigInt(10) ** BigInt(18);

/** The core's Interest.parToWei: a positive par × the supply index, a
 *  negative par × the borrow index, each rounded half up in magnitude. */
function parToWei(par: bigint, supplyIndex: bigint, borrowIndex: bigint): bigint {
  const half = INDEX_BASE / BigInt(2);
  if (par >= ZERO) return (par * supplyIndex + half) / INDEX_BASE;
  return -((-par * borrowIndex + half) / INDEX_BASE);
}

const absBig = (v: bigint): bigint => (v < ZERO ? -v : v);

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

// Raw-integer passthrough for ctx.raw (pg NUMERIC → bare integer string);
// null → undefined so the key drops out of the JSON.
function rawVal(v: string | null): string | undefined {
  return v == null || v === "" ? undefined : String(v).split(".")[0];
}

/** Map the backend's (action, leg) pair — the MV's own discrimination — onto
 *  the presentation event type. Trade-family legs classify by the SIGN of the
 *  delta (spent vs received), which also covers the never-fired buy/trade
 *  variants without naming legs that have never occurred on chain. */
function eventTypeOf(action: string, leg: string, deltaWei: bigint): DolomiteEventType {
  switch (action) {
    case "deposit":
      return "deposit";
    case "withdraw":
      return "withdraw";
    case "transfer":
      return deltaWei >= ZERO ? "transfer_in" : "transfer_out";
    case "sell":
    case "buy":
    case "trade":
      return deltaWei < ZERO ? "trade_taker" : "trade_maker";
    case "liquidation":
      switch (leg) {
        case "liquid_owed":
          return "liquidation";
        case "liquid_held":
          return "seize_out";
        case "solid_held":
          return "seize_in";
        default:
          return "liquidation_payout"; // solid_owed
      }
    case "vaporization":
      // vapor_owed is the written-off debt; the solid legs are the
      // vaporizer's payout/receipt (never fired on this deployment).
      return leg === "vapor_owed" ? "vaporize" : leg === "solid_held" ? "seize_in" : "liquidation_payout";
    case "call":
      return "call";
    default:
      return "call";
  }
}

/**
 * Transform raw mv_dolomite_events rows → { owner, accountNumber, events,
 * totalEvents }. The replay lives in the MV (new_par IS the emitted
 * absolute); only presentation lives here. `marketState` is the core's own
 * roster read at head — identity (symbol/decimals) per numeric market id.
 * `totalEvents` defaults to rows.length; the proxy overrides it with the
 * backend's whole-history count when paging.
 */
export function buildDolomiteTimeline(
  rows: DolomiteMvRow[],
  ownerRaw: string,
  accountNumberRaw: string,
  marketState: DolomiteMarketStateMap,
  totalEvents?: number,
): DolomiteTimelineResult {
  const owner = ownerRaw.toLowerCase();
  const accountNumber = accountNumberRaw;

  // Trade-family legs (sell/buy/trade) emit TWO rows for THIS account off the
  // SAME underlying log — one taker leg, one maker leg — sharing
  // (tx_hash, log_index) and differing in market_id and leg (a trade's four
  // legs split 2-per-account, so only this account's own pair ever lands in
  // `rows`). That sibling row IS the swap's other side; group once so each
  // trade leg below can read it without a second pass over `rows`.
  const byTxLog = new Map<string, DolomiteMvRow[]>();
  for (const r of rows) {
    const key = `${r.tx_hash}:${r.log_index}`;
    const group = byTxLog.get(key);
    if (group) group.push(r);
    else byTxLog.set(key, [r]);
  }

  // Each row's previous row on the same market (the row the server's
  // prev_*_index was read at), for the average rate between the two. A row
  // whose predecessor is outside this page gets no rate.
  const posKey = (r: DolomiteMvRow): [number, number, number, string] => [
    Number(r.block_number),
    r.tx_index ?? -1,
    r.log_index,
    r.event_key,
  ];
  const rowOrder = (a: DolomiteMvRow, b: DolomiteMvRow): number => {
    const ka = posKey(a);
    const kb = posKey(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
    return ka[3] < kb[3] ? -1 : ka[3] > kb[3] ? 1 : 0;
  };
  const prevRowOf = new Map<DolomiteMvRow, DolomiteMvRow>();
  const byMarket = new Map<string, DolomiteMvRow[]>();
  for (const r of rows) {
    if (r.market_id == null) continue;
    const list = byMarket.get(r.market_id);
    if (list) list.push(r);
    else byMarket.set(r.market_id, [r]);
  }
  for (const list of byMarket.values()) {
    list.sort(rowOrder);
    for (let i = 1; i < list.length; i++) prevRowOf.set(list[i], list[i - 1]);
  }

  const events: BaseActivityEvent[] = rows.map((r, idx) => {
    const tx = r.tx_hash.startsWith("0x") ? r.tx_hash : `0x${r.tx_hash}`;
    const marketId = r.market_id != null ? Number(r.market_id) : null;
    const st = marketId != null ? marketState.get(marketId) : undefined;
    // No identity → RAW integers (decimals 0), never a guessed scale.
    const symbol = st?.symbol ?? (marketId != null ? `market #${marketId}` : "—");
    const decimals = st?.decimals ?? 0;

    const deltaWei = bigintOf(r.delta_wei);
    const kind = eventTypeOf(r.action, r.leg, deltaWei);

    // The trade's other side: the sibling leg off the same log, moving the
    // other market. Never guessed — a group of one (no sibling captured)
    // leaves it unset rather than naming a market this leg didn't touch.
    const tradeSibling =
      kind === "trade_taker" || kind === "trade_maker"
        ? byTxLog.get(`${r.tx_hash}:${r.log_index}`)?.find((s) => s !== r && s.market_id !== r.market_id)
        : undefined;
    const otherMarketId = tradeSibling?.market_id != null ? Number(tradeSibling.market_id) : null;
    const otherSt = otherMarketId != null ? marketState.get(otherMarketId) : undefined;

    const parAfter = r.new_par != null ? bigintOf(r.new_par) : null;
    // null par_before = the account's first touch of this market = zero.
    const parBefore = r.par_before != null ? bigintOf(r.par_before) : parAfter != null ? ZERO : null;

    // The leg's side of zero AFTER the event; a leg landing exactly on zero
    // takes the side it CAME from (the balance it was closing).
    const side: "supply" | "debt" =
      parAfter != null && parAfter > ZERO
        ? "supply"
        : parAfter != null && parAfter < ZERO
          ? "debt"
          : (parBefore ?? ZERO) < ZERO
            ? "debt"
            : "supply";

    // The balance the core held: par × the market's index at the row's block,
    // which is what getAccountWei reads there. Before is the par before at the
    // same index; the gap from the previous row's after (the same par at that
    // row's index) is the interest accrued between the two.
    const atRow =
      r.supply_index != null && r.borrow_index != null
        ? { s: bigintOf(r.supply_index), b: bigintOf(r.borrow_index) }
        : null;
    const prevIdx =
      r.prev_supply_index != null && r.prev_borrow_index != null
        ? { s: bigintOf(r.prev_supply_index), b: bigintOf(r.prev_borrow_index) }
        : null;
    const weiAfter = atRow && parAfter != null ? parToWei(parAfter, atRow.s, atRow.b) : null;
    const weiBefore = atRow && parBefore != null ? parToWei(parBefore, atRow.s, atRow.b) : null;
    const interestRaw =
      atRow && prevIdx && parBefore != null && parBefore !== ZERO
        ? absBig(parToWei(parBefore, atRow.s, atRow.b)) - absBig(parToWei(parBefore, prevIdx.s, prevIdx.b))
        : null;

    // The average rate since the previous row on this market, from the index
    // at both ends: (index now ÷ index then − 1) ÷ years between. Only where
    // the gap is an hour or more and the interest at least 0.01 of a token;
    // shorter gaps give noisy rates.
    const prevRow = prevRowOf.get(r);
    const gapSec = prevRow != null ? Number(r.block_timestamp) - Number(prevRow.block_timestamp) : 0;
    let interestRate: DolomiteContext["interestRate"];
    if (
      interestRaw != null &&
      atRow &&
      prevIdx &&
      prevRow != null &&
      parBefore != null &&
      gapSec >= 3600 &&
      absBig(interestRaw) * BigInt(100) >= BigInt(10) ** BigInt(Math.max(decimals, 0))
    ) {
      const [now, then] = parBefore < ZERO ? [atRow.b, prevIdx.b] : [atRow.s, prevIdx.s];
      if (then > ZERO) {
        const growth = Number(((now - then) * INDEX_BASE) / then) / Number(INDEX_BASE);
        const apr = growth / (gapSec / (365 * 24 * 3600));
        if (Number.isFinite(apr) && apr > 0) interestRate = { apr, sinceTimestamp: Number(prevRow.block_timestamp) };
      }
    }

    const ctx: DolomiteContext = {
      eventType: kind,
      marketId: marketId ?? -1,
      marketSymbol: symbol,
      ...(st?.token ? { marketToken: st.token.toLowerCase() } : {}),
      decimals,
      side,
      weiDelta: r.delta_wei != null ? fmtUnits(deltaWei, decimals) : undefined,
      parAfter: parAfter != null ? fmtUnits(parAfter, decimals) : undefined,
      parBefore: parBefore != null ? fmtUnits(parBefore, decimals) : undefined,
      ...(weiAfter != null ? { balanceAfter: fmtUnits(weiAfter, decimals) } : {}),
      ...(weiBefore != null ? { balanceBefore: fmtUnits(weiBefore, decimals) } : {}),
      ...(interestRaw != null && interestRaw !== ZERO
        ? { interestSincePrevious: fmtUnits(interestRaw, decimals) }
        : {}),
      ...(interestRate != null ? { interestRate } : {}),
      ...(r.counterparty ? { counterparty: r.counterparty.toLowerCase() } : {}),
      ...(r.counterparty_number != null ? { counterpartyAccountNumber: r.counterparty_number } : {}),
      ...(r.liquidator ? { liquidator: r.liquidator.toLowerCase() } : {}),
      ...(otherMarketId != null ? { otherMarketId } : {}),
      ...(otherMarketId != null ? { otherMarketSymbol: otherSt?.symbol ?? `market #${otherMarketId}` } : {}),
      ...(r.tx_from ? { txFrom: r.tx_from.toLowerCase() } : {}),
      ...(r.caller ? { caller: r.caller.toLowerCase() } : {}),
      raw: {
        weiDelta: rawVal(r.delta_wei),
        parAfter: rawVal(r.new_par),
        parBefore: rawVal(r.par_before),
      },
      isOpen: idx === 0,
    };

    // Token flow: the emitted deltaWei, in the market's own token. Direction
    // is the sign — positive = toward the account. Borrower-side liquidation
    // legs carry NO flow chip: a seizure/write-down is not a send the
    // borrower made.
    const isBorrowerLoss = kind === "liquidation" || kind === "seize_out" || kind === "vaporize";
    const mag = deltaWei < ZERO ? -deltaWei : deltaWei;
    const flows: AssetFlow[] =
      !isBorrowerLoss && mag !== ZERO && st != null
        ? [
            {
              token: st.token,
              tokenSymbol: symbol,
              tokenDecimals: decimals,
              amount: mag.toString(),
              amountFormatted: Number(fmtUnits(mag, decimals)),
              direction: deltaWei > ZERO ? "in" : "out",
            },
          ]
        : [];

    return {
      id: r.event_key || `${tx}-${r.log_index}-${r.leg}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: Number(r.block_timestamp),
      wallet: owner,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
      actionType: kind,
      // A deposit or withdrawal is named by what it did to the balance
      // (Borrow / Repay / Deposit / Withdraw): the core has no Borrow action.
      actionLabel: (() => {
        const act = dolomiteBalanceAction(ctx);
        return act ? DOLOMITE_BALANCE_ACTION_LABELS[act] : (LABELS[kind] ?? kind);
      })(),
      flows,
      context: { protocol: "dolomite" as const, data: ctx },
    };
  });

  return { owner, accountNumber, events, totalEvents: totalEvents ?? events.length };
}
