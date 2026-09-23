// The Frankencoin minting book — index aggregates for the system view.
// ----------------------------------------------------------------------------
// One sweep of the SAME rows the listing pages (the rails-server index at the
// position grain), aggregated per request so the view can never disagree with
// the listing beneath it — a launch state is the most perishable thing a page
// can hardcode, so nothing here is. The roster is small (a few hundred
// Position contracts over the protocol's whole life); the sweep is a handful
// of paged calls run server-side.
//
// UNITS ARE NATIVE. openMintedZchf sums the open rows' latest MintingUpdate
// `minted` absolutes (each equal to the position's stored state at its
// block). There is NO collateral total anywhere in this file — 26
// heterogeneous collateral tokens and no oracle mean no sum exists without
// importing a feed the protocol doesn't have; the book counts tokens instead.
//
// SERVER-ONLY (reads RAILS_API_URL + the bearer token directly — the same
// lane the /api/frankencoin/positions proxy serves, one hop shorter).

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { buildFrankencoinPositionRows, type RawFrankencoinPositionRow } from "./frankencoin-positions";

const PAGE = 100;
/** Matches the route-segment `revalidate` on the system page. The sweep is a
 *  handful of paged calls and it runs on every render, so a `no-store` fetch
 *  here would hold the whole page out of the segment cache and keep the RPC
 *  read behind it running per request too. */
const REVALIDATE_SECONDS = 600;
/** Sanity ceiling on the sweep (the roster is ~220 at head; 20 pages = 2,000
 *  positions — far above any real growth, low enough to bound a bad total). */
const MAX_PAGES = 20;

export interface FrankencoinBook {
  /** Positions ever opened, and the hub split. */
  total: number;
  v1: number;
  v2: number;
  /** Open at head (replayed lifecycle), and their minted ZCHF total. */
  open: number;
  openMintedZchf: number;
  /** Distinct collateral tokens — open rows / the whole book. */
  openCollateralTokens: number;
  allCollateralTokens: number;
  /** Clones — positions reusing an already-vetted original's terms. */
  clones: number;
  /** The enforcement record. */
  denied: number;
  challengesStarted: number;
  challengesSucceeded: number;
  challengedPositions: number;
  forcedSalePositions: number;
  /** True when the sweep failed — the section states that, never zeros. */
  bookStale: boolean;
}

function stub(): FrankencoinBook {
  return {
    total: 0,
    v1: 0,
    v2: 0,
    open: 0,
    openMintedZchf: 0,
    openCollateralTokens: 0,
    allCollateralTokens: 0,
    clones: 0,
    denied: 0,
    challengesStarted: 0,
    challengesSucceeded: 0,
    challengedPositions: 0,
    forcedSalePositions: 0,
    bookStale: true,
  };
}

/** Sweep the whole roster off the live index and reduce it in one pass. */
export async function loadFrankencoinBook(): Promise<FrankencoinBook> {
  const base = process.env.RAILS_API_URL;
  if (!base) return stub();
  try {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${base}/api/frankencoin/positions?limit=${PAGE}&offset=${page * PAGE}&sortOrder=asc`;
      const res = await fetch(url, createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }));
      if (!res.ok) return stub();
      const raw = (await res.json()) as { rows: RawFrankencoinPositionRow[]; total: number };
      rows.push(...buildFrankencoinPositionRows(raw.rows));
      if (rows.length >= raw.total || raw.rows.length === 0) break;
    }
    if (rows.length === 0) return stub();

    const openRows = rows.filter((r) => r.status === "open");
    return {
      total: rows.length,
      v1: rows.filter((r) => r.hub === "v1").length,
      v2: rows.filter((r) => r.hub === "v2").length,
      open: openRows.length,
      openMintedZchf: openRows.reduce((s, r) => s + r.minted, 0),
      openCollateralTokens: new Set(openRows.map((r) => r.collateralToken)).size,
      allCollateralTokens: new Set(rows.map((r) => r.collateralToken)).size,
      clones: rows.filter((r) => r.isClone).length,
      denied: rows.filter((r) => r.status === "denied").length,
      challengesStarted: rows.reduce((s, r) => s + r.challengeCount, 0),
      challengesSucceeded: rows.reduce((s, r) => s + r.challengeSucceededCount, 0),
      challengedPositions: rows.filter((r) => r.everChallenged).length,
      forcedSalePositions: rows.filter((r) => r.everForcedSale).length,
      bookStale: false,
    };
  } catch {
    return stub();
  }
}
