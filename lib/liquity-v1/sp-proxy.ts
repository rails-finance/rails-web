// The Liquity V1 deposit and stake proxies (app/api/liquity-v1/stability-pool
// and /staking, each with /timeline and /flows/daily): forward the route's
// allowlisted params to rails-server and pass its answer through unchanged,
// 404 included. Server-only.

import { NextResponse, type NextRequest } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { publicErrorMessage } from "@/lib/api/public-error";
import { liquityV1SpQuery, type LiquityV1SpRoute } from "@/lib/sources/api/liquity-v1-sp";
import { liquityV1StakingQuery, type LiquityV1StakingRoute } from "@/lib/sources/api/liquity-v1-staking";

export const forwardLiquityV1Sp = (request: NextRequest, route: LiquityV1SpRoute) =>
  forwardLiquityV1(request, route, liquityV1SpQuery(route, request.nextUrl.searchParams));

export const forwardLiquityV1Staking = (request: NextRequest, route: LiquityV1StakingRoute) =>
  forwardLiquityV1(request, route, liquityV1StakingQuery(route, request.nextUrl.searchParams));

async function forwardLiquityV1(request: NextRequest, route: string, qs: string): Promise<NextResponse> {
  const base = process.env.RAILS_API_URL;
  if (!base) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const res = await fetch(`${base}/api/liquity-v1/${route}?${qs}`, {
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
    console.error(`Error fetching liquity-v1 ${route} from backend:`, error);
    return NextResponse.json({ error: publicErrorMessage(error, "Failed to fetch") }, { status: 500 });
  }
}
