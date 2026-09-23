import { NextRequest, NextResponse } from "next/server";
import { TransactionTimeline } from "@/types/api/troveHistory";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ collateralType: string; troveId: string }> },
) {
  const readerIp = readerIpFromRequest(request);
  const { collateralType, troveId } = await context.params;

  // API logic
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const url = `${RAILS_API_URL}/api/trove/${collateralType}/${troveId}${
      searchParams.toString() ? `?${searchParams.toString()}` : ""
    }`;

    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }

    const data: TransactionTimeline = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching timeline from backend:", error);
    return NextResponse.json({ error: "Failed to fetch timeline" }, { status: 500 });
  }
}
