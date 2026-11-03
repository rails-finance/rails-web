// An Aave V3-family account's e-mode changes and the reserves it ever turned
// on as collateral, from rails-server's `/api/at-block/aave-v3/account-switches`
// (rails-ops decisions/0056): the lane's Sieve tables to its checkpoint, the
// chain past it (Base and Seamless also read the at-block store below its
// capture). The answer is `AaveFamilyAccountSwitches`
// (lib/aave-v3/account-switches.ts) plus the server's toBlock and checkpoint.
//
// Base and Seamless have no fallback: a failed read answers 502 and the
// backend's Cache-Control is forwarded. The Ethereum lanes (Aave V3 Core,
// Prime, EtherFi; SparkLend) pass the Pool-log read
// (lib/sources/chain/aave-family-account-switches.ts) as a fallback, asked
// through route-gate.ts: where rails-server cannot answer, the page reads the
// chain as before.
//
// SERVER-ONLY.

import { NextResponse, type NextRequest } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { routeGate } from "@/lib/sources/api/route-gate";
import type { AaveFamilyAccountSwitches } from "@/lib/aave-v3/account-switches";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** rails-server's lanes for the route. */
export type AccountSwitchesLane =
  | "aave-v3-base"
  | "seamless"
  | "aave-v3-core"
  | "aave-v3-prime"
  | "aave-v3-etherfi"
  | "spark";

/** The chain read a lane falls back to: the Pool-log route's GET. */
export type AccountSwitchesChainRead = (wallet: string | null) => Promise<NextResponse>;

const gate = routeGate();
/** The card asks from the browser, outside a server render's budget, and the
 *  fallback is a whole-range log read on the paid lane: wait longer than the
 *  gate's 3 s before taking it. */
const SERVED_WAIT_MS = 8_000;
/** What rails-server declares on the route. */
const SERVED_CACHE_CONTROL = "public, max-age=60, s-maxage=300";

const servedShape = (b: unknown): b is AaveFamilyAccountSwitches => {
  const x = b as Partial<AaveFamilyAccountSwitches> | null;
  return !!x && typeof x.wallet === "string" && Array.isArray(x.emode) && Array.isArray(x.collateralEnabled);
};

export async function proxyAccountSwitches(
  request: NextRequest,
  lane: AccountSwitchesLane,
  chainRead?: AccountSwitchesChainRead,
): Promise<NextResponse> {
  const base = process.env.RAILS_API_URL;
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (chainRead) {
    if (!wallet || !ADDRESS.test(wallet)) return chainRead(wallet);
    const served = await gate.json<unknown>(
      lane,
      `${base}/api/at-block/aave-v3/account-switches?lane=${lane}&wallet=${wallet.toLowerCase()}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
      { timeoutMs: SERVED_WAIT_MS },
    );
    if (servedShape(served)) return NextResponse.json(served, { headers: { "Cache-Control": SERVED_CACHE_CONTROL } });
    return chainRead(wallet);
  }
  if (!base) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error", code: "proxy_error" }, { status: 500 });
  }
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
