import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";

// The opening balance for a MakerDAO vault — everything BELOW the block that
// `/api/makerdao/vault/:vaultId/timeline?recent=N` opened its window at. The
// model, the exclusive cut and the cost are in
// lib/shared/timeline-opening-balance.ts.
//
// This route exists for the usual reason (the bearer token is server-only) and
// for one more: MakerDAO is the one protocol whose client filter key is the
// COMPOSED label — getEventActionKey keys a frob by "Open Vault" / "Deposit &
// Generate" / …, derived per event from the dink/dart signs. rails-server
// sub-keys frob rows by the same index facts in Maker's own verbs (`frob:lock`
// = collateral in, `frob:draw` = debt up — the DssProxyActions names), and the
// table below maps them 1:1 onto the client's labels, the vault's ilk deciding
// DAI vs USDS for the two single-sided debt labels. Non-frob actions arrive as
// the raw action and map onto the label the transform gives them; `grab` alone
// keys as itself (the client keys a grab "grab", not its label).
//
// The flow buckets pass through untouched — `collateral`/`debt`/`debtDai`
// with their decimals stated (18 / 18 / 45), the reducer's own three spaces.
//
// Node runtime, no edge caching — same as its /timeline twin.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** frob sub-keys → the client's composed labels, modulo the debt symbol. */
const FROB_LABELS: Record<string, string | ((debtSymbol: string) => string)> = {
  "frob:open": "Open Vault",
  "frob:lock-draw": "Deposit & Generate",
  "frob:lock-wipe": "Deposit & Repay",
  "frob:free-draw": "Withdraw & Generate",
  "frob:free-wipe": "Repay & Withdraw",
  "frob:lock": "Deposit",
  "frob:free": "Withdraw",
  "frob:draw": (sym) => `Generate ${sym}`,
  "frob:wipe": (sym) => `Repay ${sym}`,
  "frob:zero": "Adjust Vault",
};

/** Raw non-frob actions → the labels the transform gives them (the client
 *  keys those events by label too — all except `grab`, which keys as itself). */
const ACTION_LABELS: Record<string, string> = {
  "fork-out": "Move to Another Vault",
  "fork-in": "Move from Another Vault",
  give: "Ownership Transferred",
  "lse-kick": "Auction Started",
  "lse-take": "Auction Sale",
  "lse-remove": "Auction Settled",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ vaultId: string }> }) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const { vaultId } = await params;
  const cutoffBlock = request.nextUrl.searchParams.get("cutoffBlock");
  if (!cutoffBlock) return NextResponse.json({ error: "cutoffBlock is required" }, { status: 400 });

  try {
    const url = `${RAILS_API_URL}/api/makerdao/vault/${encodeURIComponent(vaultId)}/timeline/summary?cutoffBlock=${encodeURIComponent(cutoffBlock)}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const upstream = (await response.json()) as UpstreamOpeningBalance & { ilk?: string | null };
    const debtSymbol = ilkDebtSymbol(upstream.ilk ?? "");
    const opening = resolveOpeningAssetKeys(upstream, () => undefined);
    opening.byAction = opening.byAction.map(({ key, count }) => {
      const frob = FROB_LABELS[key];
      const label = frob != null ? (typeof frob === "function" ? frob(debtSymbol) : frob) : ACTION_LABELS[key];
      return { key: label ?? key, count };
    });
    return NextResponse.json(opening, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching makerdao timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
