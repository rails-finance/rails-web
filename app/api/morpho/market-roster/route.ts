import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl, ROSTER_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import { marketLabel, parseMarketParams } from "@/lib/morpho/asset-catalog";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import type { MorphoMarketRosterEntry, MorphoMarketRosterResponse } from "@/lib/api/fetch-morpho-market-roster";

// Proxy to rails-server-onboarding's `/api/morpho/market-roster` — every market
// the L1 index holds, with its position counts. rails-server returns the raw
// membership list (market id, the encoded MarketParams tuple, two counts); this
// route does what the positions proxy does for a page slice: decode the params
// and resolve token symbols, so a market reads on a filter chip exactly as it
// reads on a card face.
//
// Assembling it is the expensive part — 1,283 markets carry ~2,566 token
// references. Two things keep that cheap:
//   • the addresses are DEDUPED before the multicall (the same loan tokens
//     recur across hundreds of markets, so the distinct set is a fraction of
//     the references), and resolveErc20Meta caches each for the life of the
//     process;
//   • the assembled response is memoized in-process for ROSTER_TTL_MS and
//     declared cacheable for ten minutes at the edge (ROSTER_CACHE_CONTROL).
//     A market roster changes only when someone creates a market.
//
// Node runtime: the multicall is server-only and RAILS_API_URL must not reach
// the browser bundle.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** In-process memo TTL, matching the edge TTL this route declares. */
const ROSTER_TTL_MS = 10 * 60 * 1000;

interface RawRosterRow {
  market: string;
  market_params: string;
  positions: number | string;
  open_positions: number | string;
}

interface RosterRawResponse {
  rows: RawRosterRow[];
  total: number;
}

let memo: { at: number; body: MorphoMarketRosterResponse } | null = null;

async function buildRoster(raw: RosterRawResponse): Promise<MorphoMarketRosterResponse> {
  const params = raw.rows.map((r) => parseMarketParams(r.market, r.market_params));

  // One multicall over the DISTINCT token addresses, not one per market row.
  const addresses = new Set<string>();
  for (const p of params) {
    if (!p) continue;
    addresses.add(p.loanToken);
    if (!p.isIdle) addresses.add(p.collateralToken);
  }
  const meta = await resolveErc20Meta([...addresses]);
  const symbolOf = (addr: string) => meta.get(addr)?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const markets: MorphoMarketRosterEntry[] = [];
  const tokens: Record<string, string[]> = {};
  const note = (symbol: string, addr: string) => {
    const seen = (tokens[symbol] ??= []);
    if (!seen.includes(addr)) seen.push(addr);
  };

  raw.rows.forEach((row, i) => {
    const p = params[i];
    // A row whose params don't decode can't be named — skip it rather than
    // offer an unnamed chip. Defensive: the backend indexes only real markets.
    if (!p) return;
    const loanSymbol = symbolOf(p.loanToken);
    note(loanSymbol, p.loanToken);
    // An idle / supply-only market's collateral address is the zero address —
    // never a chip, so the collateral side is null rather than "0x0000…0000".
    const collateralSymbol = p.isIdle ? null : symbolOf(p.collateralToken);
    if (collateralSymbol) note(collateralSymbol, p.collateralToken);
    markets.push({
      marketId: p.marketId,
      label: marketLabel(loanSymbol, collateralSymbol ?? "—", p.isIdle),
      loanSymbol,
      collateralSymbol,
      lltvFraction: p.lltvFraction,
      positions: Number(row.positions) || 0,
      openPositions: Number(row.open_positions) || 0,
    });
  });

  return { markets, tokens, total: raw.total ?? markets.length };
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (memo && Date.now() - memo.at < ROSTER_TTL_MS) {
    return NextResponse.json(memo.body, { headers: { "Cache-Control": ROSTER_CACHE_CONTROL } });
  }

  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/morpho/market-roster`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      // Includes the 404 this route answers with until the backend half is
      // deployed. The listing treats any failure as "no roster" and carries on
      // without the Market / Loan / Collateral chips — see the client.
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const body = await buildRoster((await response.json()) as RosterRawResponse);
    memo = { at: Date.now(), body };
    return NextResponse.json(body, { headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching morpho market roster from backend:", error);
    return NextResponse.json({ error: "Failed to fetch market roster" }, { status: 500 });
  }
}
