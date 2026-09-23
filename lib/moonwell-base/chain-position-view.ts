// A live Comptroller read, in the shape the shared Moonwell economics speak.
// ----------------------------------------------------------------------------
// `computeMoonwellEconomics` (lib/moonwell/economics.ts) takes a
// `MoonwellPositionView` — which on Ethereum is built from a LISTING row,
// because that is where an indexed explorer's per-position figures come from.
// Base has no listing and no index. What it has is the live per-account read
// the position card already renders, and that read carries every field the
// tower touches: each market's exact mToken balance and its current value,
// the live `borrowBalanceStored`, and the Comptroller's own oracle price per
// market.
//
// So this is an adapter, not a second implementation. The plausibility gates
// on the accrued-interest split and the strict per-total pricing guard stay in
// the one place, and the Base tower is the Ethereum tower fed from a different
// source. A fix to the arithmetic lands on both explorers or on neither.
//
// The fields with no Base source are set to their empty values, and the reason
// is here rather than at each one: `peakSupplies` / `peakBorrows` are rendered
// by the shared position card, which the Base page does not use, and `txCount`
// / `lastActivityAt` are the shared card's activity metadata — carried here as
// the sweep's row count and newest dated row, which nothing on the Base page
// renders. If a later change puts any of them on screen they must be computed
// from the replay on the shared card's own definitions, not taken as they are.

import type { MoonwellPositionView } from "@/components/protocol/moonwell/moonwell-position-card";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import { MTOKEN_DECIMALS } from "@/lib/moonwell/asset-catalog";
import type { MoonwellChainTimelineResponse, MoonwellReplayedPosition } from "./chain-timeline";

/**
 * Adapt the live Comptroller read into the shared view.
 *
 * `timeline` (the sweep) is optional and supplies only what the Comptroller
 * cannot: the replayed supply PRINCIPAL beside each market's current value,
 * whether an emptied account was liquidated rather than closed, and the
 * activity metadata. Its absence leaves those at their empty values — never
 * guessed.
 */
export function moonwellViewFromChain(
  chain: MoonwellChainResponse,
  timeline?: MoonwellChainTimelineResponse | null,
  /** True when the sweep read every block of the Comptroller's life (no
   *  holes, from the deployment block). Only then are the peaks and the
   *  transaction count stated: a "highest recorded" over a horizoned history
   *  would name a maximum the wallet may have exceeded before the sweep could
   *  see. The principal beside each supply is still taken from whatever the
   *  sweep read — the page withholds the lifetime layer separately. */
  whole = false,
): MoonwellPositionView {
  const principalOf = (market: string, decimals: number): number => {
    const p = timeline?.positions.find((x) => x.market === market);
    return p ? Number(p.supplyPrincipalRaw) / 10 ** decimals : 0;
  };

  const supplies = chain.markets
    .filter((m) => m.mtokenBalanceRaw !== "0")
    .map((m) => ({
      market: m.market,
      symbol: m.symbol,
      address: m.underlying,
      decimals: m.decimals,
      mTokens: Number(m.mtokenBalanceRaw) / 10 ** MTOKEN_DECIMALS,
      mTokensRaw: m.mtokenBalanceRaw,
      principal: principalOf(m.market, m.decimals),
      current: m.supplyUnderlying,
    }));

  const borrows = chain.markets
    .filter((m) => m.borrowBalanceRaw !== "0")
    .map((m) => ({
      market: m.market,
      symbol: m.symbol,
      address: m.underlying,
      decimals: m.decimals,
      amount: m.borrowUnderlying,
      amountRaw: m.borrowBalanceRaw,
      // Always the live borrowBalanceStored here — there is no emitted-
      // accountBorrows lane to upgrade from.
      live: true,
    }));

  const priceByAddress: Record<string, number> = {};
  const ratesByMarket: MoonwellPositionView["ratesByMarket"] = {};
  for (const m of chain.markets) {
    if (m.priceUsd != null && m.priceUsd > 0) priceByAddress[m.underlying.toLowerCase()] = m.priceUsd;
    ratesByMarket[m.market] = { borrowApr: m.borrowApr, supplyApr: m.supplyApr };
  }

  const open = supplies.length > 0 || borrows.length > 0;
  const liquidationCount = timeline?.liquidationCount ?? 0;

  const peaks = (pick: (p: MoonwellReplayedPosition) => string) =>
    whole && timeline
      ? timeline.positions
          .filter((p) => pick(p) !== "0")
          .map((p) => ({
            market: p.market,
            symbol: p.symbol,
            address: p.underlying,
            decimals: p.decimals,
            amount: Number(pick(p)) / 10 ** p.decimals,
            amountRaw: pick(p),
          }))
          .sort((a, b) => b.amount - a.amount)
      : [];

  return {
    wallet: chain.wallet,
    status: open ? "open" : liquidationCount > 0 ? "liquidated" : "closed",
    supplies,
    borrows,
    peakSupplies: peaks((p) => p.peakSupplyPrincipalRaw),
    peakBorrows: peaks((p) => p.peakDebtRaw),
    liquidationCount,
    txCount: whole ? (timeline?.txCount ?? 0) : 0,
    lastActivityAt: whole ? (timeline?.lastActivityAt ?? 0) : 0,
    priceByAddress,
    ratesByMarket,
  };
}
