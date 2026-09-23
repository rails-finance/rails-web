// Aave V4 spoke position → share-card model. The bridge between
// `loadAaveV4SpokeTail`'s `chain`/`events` legs (the same server tail the
// spoke page itself awaits) and the shared card renderer — no second read.
//
// Unlike the other pooled-lender families in this batch, a V4 spoke card's
// USD headline (`totalSupplyUsd`/`totalDebtUsd`/peak USD in
// components/protocol/aave-v4/aave-v4-spoke-card.tsx) is priced entirely off
// a live on-chain-oracle fetch the position page makes CLIENT-SIDE
// (`useAaveV4OraclePrices`, DefiLlama-backed otherwise) — nothing in this
// server tail carries a price. So this mapper states token amounts instead:
// the largest reserve on each side, live from the spoke contract read
// (`tail.chain`) when open, or the largest per-reserve lifetime peak
// (`calculateAaveEconomics`, run price-free over this spoke's own events)
// when terminal — the same reduction `patchReservesWithChain` /
// `groupBySpoke` run, just without the price multiply neither of them needs
// for the token-unit fields.

import { calculateAaveEconomics } from "@/lib/aave-v4/spoke-cards";
import { scaleChainBalance, type AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import { isAaveV4Event } from "@/lib/shared/types/event-shape";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

/** Neutral HF headline — matches the V3/Spark mappers' identical reading (the
 *  ratio stops meaning anything as a number once it clears 100). */
function hfLabel(hf: number): string {
  return hf >= 100 ? "∞" : hf.toFixed(2);
}

interface Amount {
  symbol: string;
  amount: number;
}

function largest(amounts: Amount[]): Amount | null {
  let best: Amount | null = null;
  for (const a of amounts) {
    if (a.amount > 0 && (!best || a.amount > best.amount)) best = a;
  }
  return best;
}

function chainAmounts(
  chain: AaveV4SpokePositionChainResponse,
  pick: (r: AaveV4SpokePositionChainResponse["reserves"][number]) => string,
): Amount[] {
  return chain.reserves
    .map((r) => ({ symbol: r.symbol, amount: scaleChainBalance(pick(r), r.decimals) }))
    .filter((a) => a.amount > 0);
}

export function aaveV4SpokeShareCardModel(
  tail: { chain: AaveV4SpokePositionChainResponse | null; events: BaseActivityEvent[] | null },
  wallet: string,
  opts: { spokeName: string; market: string },
): PositionCardModel | null {
  const chain = tail.chain && !tail.chain.chainStale ? tail.chain : null;
  const spokeEvents = (tail.events ?? []).filter(
    (e) => isAaveV4Event(e) && (e.context.data.spokeName ?? "Main") === opts.spokeName,
  );
  // Price-free: `calculateAaveEconomics` only needs a `prices` map for its USD
  // fields (peakSupplyUsd/peakDebtUsd, left unused below) — the per-reserve
  // token peaks and the terminal/liquidated read are pure event reductions.
  const economics = calculateAaveEconomics(spokeEvents);

  const chainSupplies = chain ? chainAmounts(chain, (r) => r.supplyBalanceRaw) : [];
  const chainBorrows = chain ? chainAmounts(chain, (r) => r.debtBalanceRaw) : [];
  const chainOpen = chain != null && (chainSupplies.length > 0 || chainBorrows.length > 0);

  // The chain read is the authoritative "right now" (matches
  // `patchSpokeCardWithChain`'s own isClosed rule); without one — a failed or
  // skipped chain fetch — fall back to the event-derived running balance the
  // same way `ReserveStats.currentSupplied`'s own doc comment names:
  // supplied − withdrawn − liquidatedCollateral (and the debt-side mirror).
  const fallbackSupplies: Amount[] = [];
  const fallbackBorrows: Amount[] = [];
  if (!chain && economics) {
    for (const r of economics.reserves) {
      const supply = r.supplied - r.withdrawn - r.liquidatedCollateral;
      const debt = r.borrowed - r.repaid - r.liquidatedDebt;
      if (supply > 0) fallbackSupplies.push({ symbol: r.symbol, amount: supply });
      if (debt > 0) fallbackBorrows.push({ symbol: r.symbol, amount: debt });
    }
  }
  const supplies = chain ? chainSupplies : fallbackSupplies;
  const borrows = chain ? chainBorrows : fallbackBorrows;
  const open = chain ? chainOpen : supplies.length > 0 || borrows.length > 0;

  const peakSupplies: Amount[] = economics
    ? economics.reserves.filter((r) => r.peakSupply > 0).map((r) => ({ symbol: r.symbol, amount: r.peakSupply }))
    : [];
  const peakBorrows: Amount[] = economics
    ? economics.reserves.filter((r) => r.peakDebt > 0).map((r) => ({ symbol: r.symbol, amount: r.peakDebt }))
    : [];

  // A closed spoke and a spoke this wallet never touched both read as zero
  // reserves — a recorded peak (or the spoke's own event history existing at
  // all) is what tells them apart. Without either, this degrades to the
  // static card rather than asserting "Closed" over a spoke never opened.
  if (!open && !economics) return null;

  const stats: PositionCardModel["stats"] = [];
  let status: string;

  if (open) {
    status = "Open";
    const topSupply = largest(supplies);
    if (topSupply)
      stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    const topDebt = largest(borrows);
    if (topDebt) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(topDebt.amount)} ${topDebt.symbol}` });
    if (chain?.healthFactor != null && chain.healthFactor > 0) {
      stats.push({ label: ratioLabel("pooled"), value: hfLabel(chain.healthFactor) });
    }
  } else {
    // Terminal-event rule (matches the live card's `endedByLiquidation`): only
    // a life whose FINAL event is a seizure wears "Liquidated" — a life
    // partially liquidated and later wound down by the owner is "Closed".
    status = economics?.lastAction === "liquidation" ? "Liquidated" : "Closed";
    const topSupply = largest(peakSupplies);
    if (topSupply)
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    const topDebt = largest(peakBorrows);
    if (topDebt)
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(topDebt.amount)} ${topDebt.symbol}` });
  }

  return {
    session: "aave-v4",
    subject: shortSubject(wallet),
    market: opts.market,
    status,
    stats,
    asOf: new Date(),
  };
}
