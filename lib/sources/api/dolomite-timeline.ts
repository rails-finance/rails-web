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
  liquidation: "Liquidation",
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

    const ctx: DolomiteContext = {
      eventType: kind,
      marketId: marketId ?? -1,
      marketSymbol: symbol,
      decimals,
      side,
      weiDelta: r.delta_wei != null ? fmtUnits(deltaWei, decimals) : undefined,
      parAfter: parAfter != null ? fmtUnits(parAfter, decimals) : undefined,
      parBefore: parBefore != null ? fmtUnits(parBefore, decimals) : undefined,
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
      actionLabel: LABELS[kind] ?? kind,
      flows,
      context: { protocol: "dolomite" as const, data: ctx },
    };
  });

  return { owner, accountNumber, events, totalEvents: totalEvents ?? events.length };
}
