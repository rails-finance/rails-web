import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { respondWith, routeBoxHop } from "@/lib/shared/proxy-answer";
import { readMakerOpeningBalance } from "@/lib/makerdao/proxy-reads";

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
//
// The read and the shaping live in lib/makerdao/proxy-reads.ts, which the
// position page's loader calls too.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest, { params }: { params: Promise<{ vaultId: string }> }) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const { vaultId } = await params;

  try {
    return respondWith(
      await readMakerOpeningBalance(vaultId, request.nextUrl.searchParams, routeBoxHop(RAILS_API_URL, readerIp)),
    );
  } catch (error) {
    console.error("Error fetching makerdao timeline summary from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch opening balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
