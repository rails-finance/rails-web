// An Aave V3 Base or Seamless account's e-mode changes and the reserves it
// ever turned on as collateral, from rails-server's
// `/api/at-block/aave-v3/account-switches` (rails-ops decisions/0056): the
// Base Sieve's tables to its checkpoint, the at-block store below its capture,
// the chain past the checkpoint. The answer is `AaveFamilyAccountSwitches`
// (lib/aave-v3/account-switches.ts); the backend's Cache-Control is forwarded.
//
// SERVER-ONLY.

import { NextResponse, type NextRequest } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function proxyAccountSwitches(
  request: NextRequest,
  lane: "aave-v3-base" | "seamless",
): Promise<NextResponse> {
  const base = process.env.RAILS_API_URL;
  if (!base) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error", code: "proxy_error" }, { status: 500 });
  }
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet || !ADDRESS.test(wallet))
    return NextResponse.json({ error: "wallet is required", code: "bad_request" }, { status: 400 });
  try {
    const response = await fetch(
      `${base}/api/at-block/aave-v3/account-switches?lane=${lane}&wallet=${wallet.toLowerCase()}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`account-switches backend ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: "Failed to read the account's switches", code: "proxy_error" },
        { status: 502 },
      );
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error(`Error reading ${lane} account switches from backend:`, error);
    return NextResponse.json({ error: "Failed to read the account's switches", code: "proxy_error" }, { status: 502 });
  }
}
