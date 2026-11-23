// Moonwell on Base and on Ethereum, for the wallet view (decision 0071;
// SERVER-ONLY). Both write the slug 'moonwell', so the modules are per chain.
//
// Base. One row
// per wallet (mig 513): the card is the Base listing row, built from the
// summary row's `card` by the listing's builder against the market roster.
// The roster is what the Base listing resolves its rows against: the
// `marketState` rails-server's /api/moonwell-base/positions ships beside every
// page (each market's exchange rate, the Comptroller's oracle price and both
// rates at the sweep's block), read here once for the wallet's open row, as the
// listing's /api/moonwell-base/markets reads it. No chain is read: every
// figure on the card is the sweep's, at the block the row names, so the open
// position's head is "stored". A closed row holds no balance and needs no
// roster.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import {
  buildMoonwellPositionRows,
  type MoonwellListingRoster,
  type MoonwellPositionSummary,
  type RawMoonwellWalletRow,
} from "@/lib/sources/api/moonwell-positions";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { rosterFromMarketState, type RawMoonwellBaseMarketState } from "@/lib/moonwell-base/listing-roster";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, historyBase, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

const USD_SOURCE = "Moonwell Base Comptroller's oracle at the sweep's block";

/** The market roster rails-server ships beside the Base listing's rows. */
async function readRoster(signal: AbortSignal, readerIp?: string): Promise<RawMoonwellBaseMarketState[]> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  const res = await fetch(`${base}/api/moonwell-base/positions?limit=1`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`/api/moonwell-base/positions answered ${res.status}`);
  const body = (await res.json()) as { marketState?: RawMoonwellBaseMarketState[] | null };
  if (!body.marketState?.length) throw new Error("/api/moonwell-base/positions sent no market state");
  return body.marketState;
}

/** Both sides in dollars at the oracle, or undefined where a leg is unpriced
 *  (no partial total). */
function dollarsOf(s: MoonwellPositionSummary): { collateralUsd?: number; debtUsd?: number } {
  let coll = 0;
  let debt = 0;
  for (const x of s.supplies) {
    const p = s.priceByAddress[x.address];
    if (x.current == null || p == null) return {};
    coll += x.current * p;
  }
  for (const x of s.borrows) {
    const p = s.priceByAddress[x.address];
    if (p == null) return {};
    debt += x.amount * p;
  }
  return { collateralUsd: coll, debtUsd: debt };
}

/** The Comptroller's getAccountLiquidity shortfall at the row's block: above
 *  zero, the account can be liquidated. */
function shortfallOf(raw: RawMoonwellWalletRow | undefined): boolean | undefined {
  if (raw?.shortfallRaw == null) return undefined;
  try {
    return BigInt(raw.shortfallRaw.split(".")[0]) > BigInt(0);
  } catch {
    return undefined;
  }
}

export const moonwellBase: FamilyModule = {
  id: "moonwell-base",
  name: "Moonwell",
  chain: BASE_CHAIN_ID,
  summaryChain: "base",
  summaryFamily: "moonwell",
  async shape(rows) {
    // No roster here: an open card is rebuilt with it in `head`.
    const cards = await buildMoonwellPositionRows(
      rows.map((r) => r.card as RawMoonwellWalletRow),
      new Map(),
    );
    return rows.map((r, i): WalletPosition => {
      const base: WalletPosition = {
        chain: BASE_CHAIN_ID,
        family: "moonwell",
        familyName: "Moonwell",
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "moonwell-base", row: cards[i] },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      // The Base lane records no peaks (mig 513), so the History row states no size.
      return {
        ...base,
        history: {
          ...historyBase(r),
          result: (r.liquidationCount ?? 0) > 0 ? plural(r.liquidationCount!, "liquidation") : undefined,
        },
      };
    });
  },
  async head(open, _address, signal, _apiMs, { rows, readerIp }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const roster = rosterFromMarketState(await readRoster(signal, readerIp));
    // One summary row per wallet, so each open position finds its row by id.
    const raw = new Map(rows.map((r) => [r.positionId, r.card as RawMoonwellWalletRow]));
    const cards = await buildMoonwellPositionRows(
      open.map((p) => raw.get(p.positionId)!),
      roster,
    );
    return {
      // The roster's one call to rails-server; no chain is read.
      reads: 1,
      positions: open.map((p, i): WalletPosition => {
        const s = cards[i];
        const usd = dollarsOf(s);
        return {
          ...p,
          card: { kind: "moonwell-base", row: s },
          ...usd,
          usdSource: USD_SOURCE,
          usdOwnOracle: usd.collateralUsd != null,
          liquidatable: shortfallOf(raw.get(p.positionId)),
          headRead: "stored",
        };
      }),
    };
  },
};

// ── Moonwell, Ethereum ─────────────────────────────────────────────────────
//
// One row per wallet (mig 518): the card is the Ethereum listing row, built
// by the listing's builder against the four-market catalog. A closed row's
// peaks need the catalog alone. The head read is the listing's read of the
// four markets' state (resolveMoonwellMarketState: rails-server's head routes
// first, then its stored snapshot), made once for the wallet's open row: the
// exchange rates turn the stored mTokens into the underlying they are worth,
// and the Comptroller's oracle prices both sides. The debt is the emitted
// accountBorrows at the wallet's last event in each market, as on the
// listing, so the open position's head is "stored".

const ETHEREUM_USD_SOURCE = "Moonwell Comptroller's oracle, debt at the wallet's last event in each market";

/** The four catalog markets with no market state: enough for a closed row's
 *  peaks, which name a market and an amount. */
function catalogRoster(): MoonwellListingRoster {
  const roster: MoonwellListingRoster = new Map();
  for (const m of Object.values(MOONWELL_MARKET_BY_KEY))
    roster.set(m.key, {
      key: m.key,
      symbol: m.symbol,
      mSymbol: m.mSymbol,
      underlying: m.underlying,
      decimals: m.decimals,
      exchangeRate: null,
      priceUsd: null,
      borrowApr: null,
      supplyApr: null,
    });
  return roster;
}

/** "76.1 WETH +2": the largest peak by amount and how many more. */
function peakText(legs: { symbol: string; amount: number }[]): string | undefined {
  const held = legs.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
  if (held.length === 0) return undefined;
  return `${amountText(held[0].amount, held[0].symbol)}${held.length > 1 ? ` +${held.length - 1}` : ""}`;
}

export const moonwellEthereum: FamilyModule = {
  id: "moonwell",
  name: "Moonwell",
  chain: MAINNET_CHAIN_ID,
  summaryChain: "ethereum",
  summaryFamily: "moonwell",
  async shape(rows) {
    // An open card is rebuilt with the market state in `head`.
    const cards = await buildMoonwellPositionRows(
      rows.map((r) => r.card as RawMoonwellWalletRow),
      catalogRoster(),
    );
    return rows.map((r, i): WalletPosition => {
      const s = cards[i];
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "moonwell",
        familyName: "Moonwell",
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "moonwell", row: s },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return base;
      const supply = peakText(s.peakSupplies);
      const debt = peakText(s.peakBorrows);
      return {
        ...base,
        history: {
          ...historyBase(r),
          size: supply || debt ? [supply ?? "nothing supplied", debt].filter(Boolean).join(" / ") : undefined,
          sizeNote: supply || debt ? "peak" : undefined,
          result: (r.liquidationCount ?? 0) > 0 ? plural(r.liquidationCount!, "liquidation") : undefined,
        },
      };
    });
  },
  async head(open, _address, signal, _apiMs, { rows }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    signal.throwIfAborted();
    // No roster passed: the builder reads the four markets' state once.
    const raw = new Map(rows.map((r) => [r.positionId, r.card as RawMoonwellWalletRow]));
    const cards = await buildMoonwellPositionRows(open.map((p) => raw.get(p.positionId)!));
    signal.throwIfAborted();
    const read = cards[0]?.marketRead;
    // The reads that answered: the live read's block and its Multicall, or
    // the stored snapshot's one call.
    const reads = read?.stored ? 1 : read ? 2 : 0;
    if (!read) return { reads, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
    return {
      reads,
      positions: open.map((p, i): WalletPosition => {
        const s = cards[i];
        const usd = dollarsOf(s);
        return {
          ...p,
          card: { kind: "moonwell", row: s },
          ...usd,
          usdSource: ETHEREUM_USD_SOURCE,
          usdOwnOracle: usd.collateralUsd != null,
          // The debt is the store's at the wallet's last event: the card keeps
          // the store's stamp, and a section holding it states no total (rule 743).
          headRead: "stored",
        };
      }),
    };
  },
};
