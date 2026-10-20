// The Compound V3 Arbitrum positions listing draws one card per (wallet,
// Comet): a /positions row's stored `markets` expands into the Comets the
// wallet holds something in (rails-ops reference/arbitrum-position-first-lane.md).
// A row without `markets` stays one card for the wallet.
//
// Pure, and imports nothing through `@/`, so scripts/test/ loads it directly.

import type { CompoundArbitrumVisitCollateral, CompoundArbitrumVisitMarket } from "./api-contract";

/** The roster fields a card needs (lib/compound-arbitrum/asset-catalog.ts). */
export interface CometRosterEntry {
  key: string;
  label: string;
  comet: string;
  baseSymbol: string;
}

/** One Comet of a wallet's row, resolved against the roster. `key` and
 *  `baseSymbol` are null for an address the roster does not hold. */
export interface CometCard {
  market: CompoundArbitrumVisitMarket;
  key: string | null;
  label: string;
  baseSymbol: string | null;
}

/** A listing card: the wallet's row, and the Comet it draws where the row
 *  carries `markets`. */
export interface ListingCard<R> {
  row: R;
  comet?: CometCard;
}

const ADDRESS = /^0x[0-9a-f]{40}$/;
const UINT = /^[0-9]+$/;

const usdOf = (v: unknown): number | null | undefined => {
  if (v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

function readCollateral(raw: unknown): CompoundArbitrumVisitCollateral | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const asset = typeof c.asset === "string" ? c.asset.toLowerCase() : "";
  const usd = usdOf(c.usd ?? null);
  if (!ADDRESS.test(asset) || typeof c.amount !== "string" || !UINT.test(c.amount) || usd === undefined) return null;
  return { asset, amount: c.amount, usd };
}

function readMarket(raw: unknown): CompoundArbitrumVisitMarket | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const comet = typeof m.comet === "string" ? m.comet.toLowerCase() : "";
  if (!ADDRESS.test(comet)) return null;
  if (typeof m.baseSupplied !== "string" || !UINT.test(m.baseSupplied)) return null;
  if (typeof m.baseBorrowed !== "string" || !UINT.test(m.baseBorrowed)) return null;
  if (!Array.isArray(m.collateral) || typeof m.isLiquidatable !== "boolean") return null;
  const collateral: CompoundArbitrumVisitCollateral[] = [];
  for (const c of m.collateral) {
    const read = readCollateral(c);
    if (!read) return null;
    collateral.push(read);
  }
  const supplyUsd = usdOf(m.supplyUsd ?? null);
  const borrowUsd = usdOf(m.borrowUsd ?? null);
  const collateralUsd = usdOf(m.collateralUsd ?? null);
  if (supplyUsd === undefined || borrowUsd === undefined || collateralUsd === undefined) return null;
  return {
    comet,
    baseSupplied: m.baseSupplied,
    baseBorrowed: m.baseBorrowed,
    collateral,
    isLiquidatable: m.isLiquidatable,
    supplyUsd,
    borrowUsd,
    collateralUsd,
  };
}

/** A row's `markets` off the wire: undefined where it is absent or not an
 *  array; a malformed element is dropped. */
export function readCometMarkets(raw: unknown): CompoundArbitrumVisitMarket[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((m) => {
    const read = readMarket(m);
    return read ? [read] : [];
  });
}

const positive = (s: string) => BigInt(s) > BigInt(0);

/** The Comet position is open: base supplied, base borrowed, or any
 *  collateral held. */
export function cometOpen(m: CompoundArbitrumVisitMarket): boolean {
  return positive(m.baseSupplied) || positive(m.baseBorrowed) || m.collateral.some((c) => positive(c.amount));
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The cards the rows draw, in row order and each row's stored order. */
export function expandCards<R extends { markets?: CompoundArbitrumVisitMarket[] }>(
  rows: R[],
  roster: readonly CometRosterEntry[],
): ListingCard<R>[] {
  return rows.flatMap((row): ListingCard<R>[] => {
    if (!row.markets) return [{ row }];
    return row.markets.filter(cometOpen).map((market) => {
      const r = roster.find((x) => x.comet.toLowerCase() === market.comet);
      return {
        row,
        comet: {
          market,
          key: r?.key ?? null,
          label: r?.label ?? short(market.comet),
          baseSymbol: r?.baseSymbol ?? null,
        },
      };
    });
  });
}

/** The footer's figures: the cards, and the distinct wallets behind them. */
export function footerFigures<R extends { wallet: string }>(
  cards: ListingCard<R>[],
): { cards: number; wallets: number } {
  return { cards: cards.length, wallets: new Set(cards.map((c) => c.row.wallet)).size };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The footer's opening words over per-Comet cards, up to "counted on the
 *  chain" (with a census) or the source clause (without). */
export function cometFooterLead(fig: { cards: number; wallets: number }, censusOpen: number | null): string {
  const lead = `Indexed ${plural(fig.cards, "Comet position", "Comet positions")} across ${plural(fig.wallets, "wallet", "wallets")}`;
  return censusOpen == null
    ? lead
    : `${lead}, of ${plural(censusOpen, "wallet", "wallets")} with an open position, counted on the chain`;
}
