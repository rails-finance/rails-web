import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import {
  buildMorphoPositionRows,
  type RawMorphoListedMarket,
  type RawMorphoPositionRow,
} from "@/lib/sources/api/morpho-positions";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";

// The Morpho Blue Base positions listing — rails-server's /api/morpho-base/
// positions (mig 173: one row per (market, borrower) that ever held a
// position, joined to that pair's chain read at a pinned Base block, with
// every market on the page read at the same block beside it) shaped by the
// shared Morpho builder in its LISTED custody. Nothing here touches the
// chain beyond resolving token symbols and decimals on Base: every balance,
// total and oracle price on a row was read by the Base sweep at the block the
// row names. Returns the { success, data, pagination, coverage } envelope.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface PositionsRawResponse {
  rows: RawMorphoPositionRow[];
  total: number;
  limit: number;
  offset: number;
  markets?: RawMorphoListedMarket[] | null;
  coverage?: BaseLendingCoverage | null;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    const qs = new URLSearchParams();
    // The shared fetch client says `user` (the Ethereum route's word); the
    // Base route says `wallet`. Both spellings land on the borrower.
    const wallet = sp.get("wallet") ?? sp.get("user");
    if (wallet) qs.set("wallet", wallet.toLowerCase());
    if (sp.get("market")) qs.set("market", sp.get("market")!.toLowerCase());
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    if (sp.get("hasDebt")) qs.set("hasDebt", sp.get("hasDebt")!);
    if (sp.get("noDebt")) qs.set("noDebt", sp.get("noDebt")!);
    if (sp.get("hasLiquidations")) qs.set("hasLiquidations", sp.get("hasLiquidations")!);
    // The shared fetch client says `loan` / `coll` (the Ethereum route's
    // words, lib/api/fetch-morpho-positions.ts); the Base route says
    // `loanTokens` / `collateralTokens`. Both spellings land on the same CSV
    // of ERC-20 addresses.
    const loan = sp.get("loan");
    const coll = sp.get("coll");
    if (loan) qs.set("loanTokens", loan.toLowerCase());
    if (coll) qs.set("collateralTokens", coll.toLowerCase());
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    // debt/coll rank in loan-token raw units (no cross-token USD on this
    // lane — see rails-server baseMorpho.ts), so the backend only honours
    // them when the loan-token facet has narrowed to exactly one address.
    // morphoBaseSortOptions never offers the sort otherwise, but a hand-built
    // URL gets the same silent fallback here rather than an unfiltered
    // ranking that only looks meaningful.
    const sortBy = sp.get("sortBy");
    const loanAddrCount = loan ? loan.split(",").filter(Boolean).length : 0;
    if ((sortBy === "debt" || sortBy === "coll") && loanAddrCount === 1) qs.set("sortBy", sortBy);
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/morpho-base/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const data = await buildMorphoPositionRows(raw.rows, { chainId: MORPHO_BASE_CHAIN_ID, markets: raw.markets ?? [] });
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
        coverage: raw.coverage ?? null,
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching morpho-base positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
