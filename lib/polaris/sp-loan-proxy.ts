// The four deposit and loan proxies (app/api/polaris/{stability-pool,
// reserve-loans}{,/timeline}): forward the route's allowlisted params to
// rails-server with the catalog's deployment, and pass its answer through
// unchanged, 404 included. Server-only.

import { NextResponse, type NextRequest } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { publicErrorMessage } from "@/lib/api/public-error";
import { polarisSpLoanQuery, type PolarisSpLoanRoute } from "@/lib/sources/api/polaris-sp-loans";

export async function forwardPolarisSpLoans(request: NextRequest, route: PolarisSpLoanRoute): Promise<NextResponse> {
  const base = process.env.RAILS_API_URL;
  if (!base) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const qs = polarisSpLoanQuery(route, request.nextUrl.searchParams);
    const res = await fetch(`${base}/api/polaris/${route}?${qs}`, {
      ...createAuthFetchOptions(undefined, readerIpFromRequest(request)),
      signal: request.signal,
    });
    if (!res.ok) {
      if (res.status !== 404) console.error(`Backend API error: ${res.status} ${res.statusText}`);
      const body = await res.json().catch(() => ({ error: res.statusText }));
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json(await res.json(), { headers: proxyCacheControl(res, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error(`Error fetching polaris ${route} from backend:`, error);
    return NextResponse.json({ error: publicErrorMessage(error, "Failed to fetch") }, { status: 500 });
  }
}
