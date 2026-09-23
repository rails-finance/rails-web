import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { ROSTER_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import { loadPolarisBook } from "@/lib/sources/api/polaris-book";

// api arm of the Polaris market board — the index's replayed book per market
// (CDP counts by status, the open book's collateral and debt, the wider
// counters, the deployment row). The markets page reads the same loader
// directly; this route is its JSON face. A stale book (the index not
// answering) is returned as such with a short cache life, never as an empty
// board. Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const book = await loadPolarisBook(readerIpFromRequest(request));
  return NextResponse.json(book, {
    headers: { "Cache-Control": book.bookStale ? "no-store" : ROSTER_CACHE_CONTROL },
  });
}
