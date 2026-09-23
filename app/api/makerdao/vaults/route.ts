import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildMakerVaultRows, type RawMakerVaultRow } from "@/lib/sources/api/makerdao-vaults";

// Proxies the MakerDAO vault listing from the live rails-server index.
// rails-server does the structural filter/sort/paginate over
// mv_makerdao_positions ⋈ maker_ilk_state and returns the page slice as raw
// per-urn rows; we shape the card (buildMakerVaultRows) and return a
// { success, data, pagination } envelope.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface VaultsRawResponse {
  rows: RawMakerVaultRow[];
  total: number;
  limit: number;
  offset: number;
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
    if (sp.get("cdpId")) qs.set("cdpId", sp.get("cdpId")!);
    if (sp.get("urn")) qs.set("urn", sp.get("urn")!);
    if (sp.get("owner")) qs.set("owner", sp.get("owner")!);
    if (sp.get("ilks")) qs.set("ilks", sp.get("ilks")!);
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    if (sp.get("sortBy")) qs.set("sortBy", sp.get("sortBy")!);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/makerdao/vaults?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as VaultsRawResponse;
    const data = buildMakerVaultRows(raw.rows);
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching makerdao vaults from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch vaults";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
