// The home hero's strip (rails-ops decision 0051, app anatomy S10): three
// positions under the search, each read from an Ethereum family's listing
// route with that route's own sort, one row each.
//
//   largest open position     Aave V3, open, by collateral in dollars (Aave
//                             oracle); Liquity V2 by collateral in dollars
//                             where the Aave V3 read fails
//   closest to liquidation    Liquity V2, active Troves, by collateral ratio
//   latest liquidation        Liquity V2, liquidated Troves, by last activity
//
// SERVER-ONLY: reads RAILS_API_URL with the bearer token, as the live example
// does (lib/home/live-example-data.ts). Every read carries `next.revalidate`
// of a few minutes; a read that fails or comes back empty leaves its card out.

import type { TroveSummary, TrovesResponse } from "@/types/api/trove";
import type { OraclePricesData, OraclePricesResponse } from "@/types/api/oracle";
import type { AaveV3PositionRow } from "@/lib/api/fetch-aave-v3-positions";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { buildAaveV3PositionRows, type RawV3WalletRow } from "@/lib/sources/api/aave-v3-positions";

/** Matches the route-segment `revalidate` on app/(site)/page.tsx. */
export const STRIP_REVALIDATE_SECONDS = 300;
const TIMEOUT_MS = 8000;

export type StripSlot = "largest" | "closest" | "latest";

interface StripCardBase {
  slot: StripSlot;
  /** The family and the chain, named on the card. */
  family: string;
  chain: string;
  href: string;
}

export type StripCard =
  | (StripCardBase & { kind: "aave-v3"; row: AaveV3PositionRow })
  | (StripCardBase & { kind: "liquity-v2"; row: TroveSummary; prices: OraclePricesData | null });

async function getJson<T>(path: string): Promise<T | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  try {
    // A timeout by race rather than an AbortSignal, which would take the read
    // out of the data cache.
    const res = await Promise.race([
      fetch(`${base}${path}`, createAuthFetchOptions({ next: { revalidate: STRIP_REVALIDATE_SECONDS } })),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS)),
    ]);
    if (!res.ok) {
      console.warn(`front-door strip: ${path} -> ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`front-door strip: ${path} failed`, err);
    return null;
  }
}

const troveHref = (t: TroveSummary) => `/ethereum/liquity-v2/trove/${t.collateralType}/${t.id}`;

async function firstTrove(query: string): Promise<TroveSummary | null> {
  const body = await getJson<TrovesResponse>(`/api/troves?${query}&limit=1`);
  return body?.success && body.data?.[0] ? body.data[0] : null;
}

async function largestAaveV3(): Promise<StripCard | null> {
  const raw = await getJson<{ rows?: RawV3WalletRow[] }>(
    "/api/aave-v3/positions?status=open&sortBy=coll&sortOrder=desc&limit=1",
  );
  if (!raw?.rows?.length) return null;
  try {
    const [row] = await buildAaveV3PositionRows(raw.rows.slice(0, 1));
    if (!row) return null;
    return {
      slot: "largest",
      kind: "aave-v3",
      family: "Aave V3",
      chain: "Ethereum",
      href: `/ethereum/aave-v3/${row.wallet}?market=${row.market}`,
      row,
    };
  } catch (err) {
    console.warn("front-door strip: Aave V3 rows failed", err);
    return null;
  }
}

export async function getFrontDoorStrip(): Promise<StripCard[]> {
  const oracle = getJson<OraclePricesResponse>("/api/oracle/liquity-v2").then((o) =>
    o?.success && o.data ? o.data : null,
  );
  const liquity = async (slot: StripSlot, t: Promise<TroveSummary | null>): Promise<StripCard | null> => {
    const [row, prices] = await Promise.all([t, oracle]);
    if (!row) return null;
    return { slot, kind: "liquity-v2", family: "Liquity V2", chain: "Ethereum", href: troveHref(row), row, prices };
  };

  const [largest, closest, latest] = await Promise.all([
    largestAaveV3().then(
      (card) => card ?? liquity("largest", firstTrove("status=active&sortBy=collUsd&sortOrder=desc")),
    ),
    liquity("closest", firstTrove("status=active&sortBy=ratio&sortOrder=asc")),
    liquity("latest", firstTrove("status=liquidated&sortBy=lastActivity&sortOrder=desc")),
  ]);
  return [largest, closest, latest].filter((c): c is StripCard => c != null);
}
