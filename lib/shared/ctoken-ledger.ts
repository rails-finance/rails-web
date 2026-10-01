// The lifetime ledger of a Compound V2-family account (Compound V2, Moonwell on
// Ethereum and on Base) — every flow in and out of each market, in tokens and
// in dollars at the price of the block it happened in. The Base route sends it
// beside a wallet's history (lib/sources/chain/moonwell-events.ts); the
// Lifetime flows panel replays the rows itself (lib/shared/ctoken-flows.ts).
// ----------------------------------------------------------------------------
// Collateral, per market:
//   supplied + received + interest earned − withdrawn − sent − seized = held
// Debt, per market:
//   borrowed + interest charged − repaid − liquidated = owed
//
// Every row of these explorers carries the balance it read before and after it
// (the cToken/mToken balance × the market's exchange rate at the row's block on
// the supply side, the emitted accountBorrows on the debt side), so the
// interest between two rows is the next row's balance before less the
// previous row's balance after, and the amount a transfer or a seizure moved
// is its balance before less its balance after. Nothing is estimated.
//
// Dollars: each row's amount × that market's oracle price at the row's block.
// A row with no price makes its leg's dollar figure null.
//
// Pure: runs in the browser over rendered events and on the server over the
// Base replay's rows.

export type LedgerKind =
  | "mint"
  | "redeem"
  | "borrow"
  | "repay"
  | "liquidation"
  | "transfer_in"
  | "transfer_out"
  /** A seizure leg taken from this account: the liquidator's part. */
  | "seize_liquidator"
  /** A seizure leg taken from this account: the protocol's part. */
  | "seize_protocol"
  /** Collateral this account received as a liquidator. */
  | "seize_in";

/** Oldest first, by block and then by the log index the event id ends with
 *  ("mint:<tx>:3", "<tx>-12"); ties keep the order they arrived in. */
export function sortByLog<T extends { id: string; blockNumber: number }>(events: readonly T[]): T[] {
  const logOf = (id: string) => {
    const m = /[:-](\d+)$/.exec(id);
    return m ? Number(m[1]) : 0;
  };
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.blockNumber - b.e.blockNumber || logOf(a.e.id) - logOf(b.e.id) || a.i - b.i)
    .map((x) => x.e);
}

/** One row as the ledger reads it: underlying amounts, human units. */
export interface LedgerRow {
  market: string;
  symbol: string;
  /** Underlying token address, for the icon and today's price lookup. */
  address?: string;
  kind: LedgerKind;
  /** Underlying amount the row moved (mint, redeem, borrow, repay,
   *  liquidation's repaid debt). Unsigned. */
  amount?: number;
  /** Supply balance before and after the row (balance × exchange rate). */
  supplyBefore?: number;
  supplyAfter?: number;
  /** Debt before and after the row (the emitted accountBorrows lane). */
  debtBefore?: number;
  debtAfter?: number;
  /** USD per underlying token at the row's block; null when unread. */
  price: number | null;
}

/** One leg: a token amount and its dollar value at the events' prices (null
 *  once any row feeding it had no price). */
export interface LedgerLeg {
  amount: number;
  usd: number | null;
}

export interface LedgerMarket {
  market: string;
  symbol: string;
  address?: string;
  supplied: LedgerLeg;
  withdrawn: LedgerLeg;
  /** cTokens sent to other wallets, in underlying. */
  sent: LedgerLeg;
  /** cTokens received from other wallets (and as a liquidator), in underlying. */
  received: LedgerLeg;
  /** Collateral taken by liquidations, the protocol's share included. */
  seized: LedgerLeg;
  /** The protocol's share inside `seized`. */
  seizedProtocol: LedgerLeg;
  /** Interest the supply earned between rows. */
  supplyInterest: LedgerLeg;
  borrowed: LedgerLeg;
  /** Voluntary repayments (a liquidator's repayment is `liquidatedDebt`). */
  repaid: LedgerLeg;
  liquidatedDebt: LedgerLeg;
  /** Interest the debt was charged between rows. */
  debtInterest: LedgerLeg;
  /** The last row's supply and debt after, for the interest since it. */
  lastSupplyAfter: number;
  lastDebtAfter: number;
  /** False when a supply-side row came without its balances (no rate read),
   *  so the supply side cannot close. */
  supplyWhole: boolean;
  debtWhole: boolean;
}

const leg = (): LedgerLeg => ({ amount: 0, usd: 0 });
const add = (l: LedgerLeg, amount: number, price: number | null) => {
  if (!Number.isFinite(amount) || amount === 0) return;
  l.amount += amount;
  l.usd = l.usd == null || price == null ? null : l.usd + amount * price;
};
const sub = (l: LedgerLeg, other: LedgerLeg) => {
  l.amount = Math.max(0, l.amount - other.amount);
  l.usd = l.usd == null || other.usd == null ? null : Math.max(0, l.usd - other.usd);
};

/** Reduce rows (oldest first) into one ledger entry per market. A Moonwell
 *  liquidation's debt leg arrives twice — the liquidation row and the
 *  liquidator's RepayBorrow row — so `repaidIncludesLiquidations` moves the
 *  liquidated debt out of `repaid` once, at the end (Compound V2's index
 *  merged the two into one row, and passes false). */
export function reduceCTokenLedger(
  rows: readonly LedgerRow[],
  opts: { repaidIncludesLiquidations: boolean },
): LedgerMarket[] {
  const out = new Map<string, LedgerMarket>();
  const get = (r: LedgerRow): LedgerMarket => {
    let m = out.get(r.market);
    if (!m) {
      m = {
        market: r.market,
        symbol: r.symbol,
        address: r.address,
        supplied: leg(),
        withdrawn: leg(),
        sent: leg(),
        received: leg(),
        seized: leg(),
        seizedProtocol: leg(),
        supplyInterest: leg(),
        borrowed: leg(),
        repaid: leg(),
        liquidatedDebt: leg(),
        debtInterest: leg(),
        lastSupplyAfter: 0,
        lastDebtAfter: 0,
        supplyWhole: true,
        debtWhole: true,
      };
      out.set(r.market, m);
    }
    return m;
  };

  for (const r of rows) {
    const m = get(r);
    const supplySide =
      r.kind === "mint" ||
      r.kind === "redeem" ||
      r.kind === "transfer_in" ||
      r.kind === "transfer_out" ||
      r.kind === "seize_liquidator" ||
      r.kind === "seize_protocol" ||
      r.kind === "seize_in";
    if (supplySide) {
      if (r.supplyBefore == null || r.supplyAfter == null) {
        m.supplyWhole = false;
      } else {
        const interest = r.supplyBefore - m.lastSupplyAfter;
        // A few base units either way is the exchange rate's flooring.
        if (interest > 0) add(m.supplyInterest, interest, r.price);
        m.lastSupplyAfter = r.supplyAfter;
      }
      const moved =
        r.supplyBefore != null && r.supplyAfter != null ? Math.abs(r.supplyBefore - r.supplyAfter) : undefined;
      switch (r.kind) {
        case "mint":
          add(m.supplied, r.amount ?? 0, r.price);
          break;
        case "redeem":
          add(m.withdrawn, r.amount ?? 0, r.price);
          break;
        case "transfer_out":
          if (moved == null) m.supplyWhole = false;
          else add(m.sent, moved, r.price);
          break;
        case "transfer_in":
        case "seize_in":
          if (moved == null) m.supplyWhole = false;
          else add(m.received, moved, r.price);
          break;
        case "seize_liquidator":
        case "seize_protocol":
          if (moved == null) m.supplyWhole = false;
          else {
            add(m.seized, moved, r.price);
            if (r.kind === "seize_protocol") add(m.seizedProtocol, moved, r.price);
          }
          break;
      }
      continue;
    }
    // Debt side. A liquidation row with no debt lane of its own (Moonwell:
    // the liquidator's RepayBorrow row carries it) books only its amount.
    if (r.kind === "liquidation") add(m.liquidatedDebt, r.amount ?? 0, r.price);
    else if (r.kind === "borrow") add(m.borrowed, r.amount ?? 0, r.price);
    else if (r.kind === "repay") add(m.repaid, r.amount ?? 0, r.price);
    if (r.debtBefore != null && r.debtAfter != null) {
      const interest = r.debtBefore - m.lastDebtAfter;
      if (interest > 0) add(m.debtInterest, interest, r.price);
      m.lastDebtAfter = r.debtAfter;
    } else if (r.kind !== "liquidation") {
      m.debtWhole = false;
    }
  }
  if (opts.repaidIncludesLiquidations) for (const m of out.values()) sub(m.repaid, m.liquidatedDebt);
  return [...out.values()];
}
