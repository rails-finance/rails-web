// Moonwell on Base, for the wallet view (decision 0071; SERVER-ONLY). One row
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
  type MoonwellPositionSummary,
  type RawMoonwellWalletRow,
} from "@/lib/sources/api/moonwell-positions";
import { rosterFromMarketState, type RawMoonwellBaseMarketState } from "@/lib/moonwell-base/listing-roster";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { historyBase, plural, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

const USD_SOURCE = "Moonwell Base Comptroller's oracle at the sweep's block";

/** The market roster rails-server ships beside the Base listing's rows. */
async function readRoster(signal: AbortSignal): Promise<RawMoonwellBaseMarketState[]> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  const res = await fetch(`${base}/api/moonwell-base/positions?limit=1`, {
    ...createAuthFetchOptions({ signal }),
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
  async head(open, _address, signal, _apiMs, rows): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const roster = rosterFromMarketState(await readRoster(signal));
    // One summary row per wallet, so each open position finds its row by id.
    const raw = new Map(rows.map((r) => [r.positionId, r.card as RawMoonwellWalletRow]));
    const cards = await buildMoonwellPositionRows(
      open.map((p) => raw.get(p.positionId)!),
      roster,
    );
    return {
      reads: 0,
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
