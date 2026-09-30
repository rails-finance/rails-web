// The lifetime ledger of a Compound V2-family account (Compound V2, Moonwell on
// Ethereum and on Base) — every flow in and out of each market, in tokens and
// in dollars at the price of the block it happened in, so the flows panel's
// two columns close on their face.
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
// A row with no price makes its leg's dollar figure null; the tower then
// values that leg at today's price and says so. What is still held (and the
// interest built since the last row) is valued at today's price, and the
// "Price change" row carries the difference, so each column reaches the
// figure held now in dollars as it does in tokens.
//
// Pure: runs in the browser over rendered events and on the server over the
// Base replay's rows.

import type { Provenance } from "@/components/shared/provenance";
import type { TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";

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

/** What is held now, per market: the amount and today's price. */
export interface LedgerHeld {
  market: string;
  amount: number;
  /** Today's USD price, null when unread. */
  price: number | null;
}

/** The words the flows panel's receipts use for one explorer. */
export interface LedgerVocabulary {
  /** "Compound" / "Moonwell". */
  brand: string;
  /** "cToken" / "mToken". */
  receipt: string;
  /** Pre-August-2020 Compound V2 blocks priced in ETH: the sentence that says
   *  how they became dollars. */
  priceNote?: string;
}

const flowProv = (v: LedgerVocabulary, what: string, sym: string, atEvents: boolean, formula: string): Provenance => ({
  kind: "chain-derived",
  summary: `${what} (${sym}) over the account's whole history, added up from its rows${
    atEvents
      ? `, each valued at ${v.brand}'s oracle price for ${sym} at that row's block${v.priceNote ? ` ${v.priceNote}` : ""}`
      : `, valued at ${v.brand}'s oracle price for ${sym} today`
  }.`,
  formula,
  inputs: [
    { label: "rows", kind: "chain", note: `the account's ${v.receipt} events` },
    { label: "price", kind: "chain-derived", pclass: "oracle", note: atEvents ? "at each row's block" : "today" },
  ],
});

/** The flows panel's lifetime fields, built from the ledger and what is held
 *  now. `todayPrice` prices a market that is no longer held (a leg without
 *  event prices falls back to it). Returns null when a leg has neither price,
 *  so the caller keeps the panel in tokens. */
export function ctokenLedgerTower(
  ledger: readonly LedgerMarket[],
  held: { supply: readonly LedgerHeld[]; debt: readonly LedgerHeld[] },
  todayPrice: (market: string) => number | null,
  vocab: LedgerVocabulary,
): {
  collateral: Omit<TowerSideData, "current" | "interest">;
  debt: Omit<TowerSideData, "current" | "interest">;
  flowsPricedAtEvents: boolean;
  valued: boolean;
} {
  let atEvents = true;
  // A market whose rows came without their balances cannot close: the
  // caller keeps its older panel.
  let valued =
    ledger.every((m) => m.supplyWhole && m.debtWhole) &&
    [...held.supply, ...held.debt].every((h) => h.amount <= 0 || h.price != null);
  const legUsd = (l: LedgerLeg, market: string): number | null => {
    if (l.usd != null) return l.usd;
    atEvents = false;
    const p = todayPrice(market);
    if (p == null) {
      valued = false;
      return null;
    }
    return l.amount * p;
  };
  const DUST = 1e-9;
  const line = (
    m: LedgerMarket,
    l: LedgerLeg,
    key: string,
    what: string,
    formula: string,
    flowLabel?: string,
  ): TowerLine | null =>
    l.amount > DUST
      ? {
          key: `${key}-${m.market}`,
          symbol: m.symbol,
          address: m.address,
          amount: l.amount,
          usd: legUsd(l, m.market),
          prov: flowProv(vocab, what, m.symbol, l.usd != null, formula),
          ...(flowLabel ? { flowLabel } : {}),
        }
      : null;
  const lines = (pick: (m: LedgerMarket) => TowerLine | null): TowerLine[] =>
    ledger.flatMap((m) => {
      const l = pick(m);
      return l ? [l] : [];
    });

  const heldOf = (side: readonly LedgerHeld[], market: string) => side.find((h) => h.market === market);
  // Interest since the last row: what is held now less the last row's after,
  // valued at today's price.
  const tail = (m: LedgerMarket, side: "supply" | "debt"): LedgerLeg => {
    const h = heldOf(side === "supply" ? held.supply : held.debt, m.market);
    const last = side === "supply" ? m.lastSupplyAfter : m.lastDebtAfter;
    const gain = (h?.amount ?? 0) - last;
    if (!h || gain <= 0) return { amount: 0, usd: 0 };
    return { amount: gain, usd: h.price == null ? null : gain * h.price };
  };
  const plus = (a: LedgerLeg, b: LedgerLeg): LedgerLeg => ({
    amount: a.amount + b.amount,
    usd: a.usd == null || b.usd == null ? null : a.usd + b.usd,
  });

  const supplied = lines((m) => line(m, m.supplied, "coll-in", "Deposited", "Σ supply amounts"));
  const received = lines((m) =>
    line(
      m,
      m.received,
      "coll-received",
      "Received from other wallets",
      "Σ balance after − before",
      "Received from other wallets",
    ),
  );
  const earned = lines((m) =>
    line(
      m,
      plus(m.supplyInterest, tail(m, "supply")),
      "coll-earned",
      "Interest earned",
      "Σ (balance before a row − balance after the previous row)",
      "Interest earned",
    ),
  );
  const withdrawn = lines((m) => line(m, m.withdrawn, "coll-withdrawn", "Withdrawn", "Σ withdraw amounts"));
  const sent = lines((m) =>
    line(
      m,
      m.sent,
      "coll-sent",
      `${vocab.receipt}s sent to other wallets`,
      "Σ balance before − after",
      "Sent to other wallets",
    ),
  );
  const seized = lines((m) =>
    line(
      m,
      m.seized,
      "coll-seized",
      "Collateral seized by liquidations, the protocol's share included",
      "Σ balance before − after on the seizure rows",
      "Seized by liquidation (incl. protocol share)",
    ),
  );
  const borrowed = lines((m) => line(m, m.borrowed, "debt-in", "Borrowed", "Σ borrow amounts"));
  const charged = lines((m) =>
    line(
      m,
      plus(m.debtInterest, tail(m, "debt")),
      "debt-earned",
      "Interest charged",
      "Σ (debt before a row − debt after the previous row)",
      "Interest charged",
    ),
  );
  const repaid = lines((m) => line(m, m.repaid, "debt-repaid", "Repaid", "Σ repay amounts"));
  const liquidated = lines((m) =>
    line(m, m.liquidatedDebt, "debt-liq", "Debt repaid by liquidators", "Σ liquidation repay amounts"),
  );

  const usdSum = (ls: TowerLine[]) => ls.reduce((s, l) => s + (l.usd ?? 0), 0);
  const heldUsd = (side: readonly LedgerHeld[]) =>
    side.reduce((s, h) => (h.price == null ? s : s + h.amount * h.price), 0);

  // The token columns must close market by market before a price-change row
  // is stated; otherwise the gap would be something other than prices.
  const closes = (side: "supply" | "debt"): boolean =>
    ledger.every((m) => {
      const h = heldOf(side === "supply" ? held.supply : held.debt, m.market)?.amount ?? 0;
      const t = tail(m, side).amount;
      const [inn, out, whole] =
        side === "supply"
          ? [
              m.supplied.amount + m.received.amount + m.supplyInterest.amount + t,
              m.withdrawn.amount + m.sent.amount + m.seized.amount,
              m.supplyWhole,
            ]
          : [m.borrowed.amount + m.debtInterest.amount + t, m.repaid.amount + m.liquidatedDebt.amount, m.debtWhole];
      return whole && Math.abs(inn - out - h) <= Math.max(1e-6, (inn + h) * 1e-5);
    });
  const priceChange = (side: "supply" | "debt", inUsd: number, outUsd: number): TowerLine | null => {
    if (!valued || !closes(side)) return null;
    const change = heldUsd(side === "supply" ? held.supply : held.debt) - (inUsd - outUsd);
    if (Math.abs(change) < 0.5) return null;
    return {
      key: `${side}-price-change`,
      symbol: "",
      amount: change,
      usd: change,
      flowLabel: "Price change",
      prov: {
        kind: "chain-derived",
        summary: `Price change: each flow above is valued at ${vocab.brand}'s oracle price at its block, and what is ${side === "supply" ? "held" : "owed"} now at today's price. This row is the difference, so the column adds up in dollars as it does in tokens.`,
        formula: side === "supply" ? "held now − (in − out)" : "owed now − (in − out)",
      },
    };
  };

  const collIn = usdSum(supplied);
  const debtIn = usdSum(borrowed);
  const collChange = priceChange(
    "supply",
    collIn + usdSum(received) + usdSum(earned),
    usdSum(withdrawn) + usdSum(sent) + usdSum(seized),
  );
  const debtChange = priceChange("debt", debtIn + usdSum(charged), usdSum(repaid) + usdSum(liquidated));
  // Interest or a transfer under half a dollar is a row of "$0": left out
  // once the price change above has counted it.
  const visible = (ls: TowerLine[]) => (valued ? ls.filter((l) => l.usd == null || Math.abs(l.usd) >= 0.5) : ls);
  return {
    collateral: {
      earned: visible(earned),
      received: visible(received),
      exited: [...withdrawn, ...visible(sent)],
      liquidated: seized,
      lifetimeInflow: collIn,
      priceChange: collChange,
    },
    debt: {
      earned: visible(charged),
      exited: repaid,
      liquidated,
      lifetimeInflow: debtIn,
      priceChange: debtChange,
    },
    flowsPricedAtEvents: atEvents,
    valued,
  };
}
