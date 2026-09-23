import { NextRequest, NextResponse } from "next/server";
import { loadPwnBundleContents } from "@/lib/sources/chain/pwn-bundle";
import { isPwnBundler, PWN_ADDRESSES } from "@/lib/pwn/asset-catalog";

// Chain arm of the PWN bundle read — what the Token Bundler bundle used as a
// loan's collateral wrapped, read at the loan's creation block (`?id=` +
// `?block=`; the bundle is emptied when unwrapped after close, so the head
// state of a closed loan's bundle is empty). Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id");
  const block = Number(sp.get("block"));
  const address = sp.get("address");
  if (!id || !/^\d+$/.test(id))
    return NextResponse.json({ error: "id (bundle token id) is required" }, { status: 400 });
  if (!Number.isInteger(block) || block <= 0)
    return NextResponse.json({ error: "block (loan creation block) is required" }, { status: 400 });
  // Guard: this route reads THE bundler; refuse other addresses rather than
  // silently reading the canonical one for a different contract's token id.
  if (address && !isPwnBundler(address))
    return NextResponse.json({ error: `not the PWN Token Bundler (${PWN_ADDRESSES.TOKEN_BUNDLER})` }, { status: 400 });
  try {
    const data = await loadPwnBundleContents(id, block);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading PWN bundle contents from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load bundle contents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
