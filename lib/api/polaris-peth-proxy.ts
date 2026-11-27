// The pETH account proxy (app/api/polaris/peth/[address]): forwards the
// route's allowlisted params to rails-server and passes its answer through
// unchanged, a 400's reason and a 404 included (ui-jobs 865). Server-only.

import { NextResponse, type NextRequest } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { publicErrorMessage } from "@/lib/api/public-error";
import { polarisPethQuery } from "@/lib/sources/api/polaris-peth";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function forwardPolarisPeth(request: NextRequest, address: string): Promise<NextResponse> {
  const base = process.env.RAILS_API_URL;
  if (!base) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (!ADDRESS.test(address)) {
    return NextResponse.json({ error: "Validation error", reason: "Not an address." }, { status: 400 });
  }
  try {
    const qs = polarisPethQuery(request.nextUrl.searchParams);
    const res = await fetch(`${base}/api/polaris/peth/${address.toLowerCase()}${qs ? `?${qs}` : ""}`, {
      ...createAuthFetchOptions(undefined, readerIpFromRequest(request)),
      signal: request.signal,
    });
    if (!res.ok) {
      if (res.status !== 404 && res.status !== 400) console.error(`Backend API error: ${res.status} ${res.statusText}`);
      const body = await res.json().catch(() => ({ error: res.statusText }));
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json(await res.json(), { headers: proxyCacheControl(res, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching the polaris pETH account from backend:", error);
    return NextResponse.json({ error: publicErrorMessage(error, "Failed to fetch") }, { status: 500 });
  }
}
