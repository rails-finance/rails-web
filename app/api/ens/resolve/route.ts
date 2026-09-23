import { NextRequest, NextResponse } from "next/server";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";

/**
 * Forward ENS resolution endpoint: `GET /api/ens/resolve?name=boldlygo.eth`.
 * Returns `{ name, address }` with `address: null` when the name doesn't
 * resolve. Used by the listing pages to hydrate the wallet pill + recents
 * after an ENS search (the proxy routes resolve independently for filtering).
 */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Missing name parameter" }, { status: 400 });
  }

  const lower = name.toLowerCase();
  if (!lower.endsWith(".eth") || lower.length < 7) {
    return NextResponse.json({ error: "Invalid ENS name format" }, { status: 400 });
  }

  const address = await resolveEnsAddress(lower);
  return NextResponse.json(
    { name: lower, address },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
