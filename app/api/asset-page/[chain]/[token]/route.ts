// The resolver behind the app's links to a token's page (decision 0069,
// ui-jobs 786; `assetHref`, lib/shared/asset-roster.ts). A link drawn where the
// page cannot tell which explorers list the token (an asset popover, a price
// row) comes here and is sent on with a 307:
//   - to the token's page under the explorer `?via=` names, where it lists it;
//   - else under the first explorer, by the roster's order, that lists it;
//   - else back to `?from=` (or home): no explorer has a page for it.
// It serves the app's own links; the retired /assets URLs are not forwarded.

import { NextRequest, NextResponse } from "next/server";
import { fetchAssetExplorerServer } from "@/lib/api/fetch-asset-explorer-server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { chainOfSlug } from "@/lib/shared/asset-roster";
import { FROM_PARAM, parseVia, safeFrom, VIA_PARAM } from "@/lib/shared/asset-via";
import { ASSETS_SEGMENT, canonicalExplorer, protocolAssetsHref } from "@/lib/shared/assets-by-protocol";
import { PROTOCOLS } from "@/lib/shared/protocols";

const WITH_ASSETS = PROTOCOLS.filter((p) => p.subPages.some((s) => s.segment === ASSETS_SEGMENT));
const ORDER = WITH_ASSETS.map((p) => p.id);

export async function GET(request: NextRequest, { params }: { params: Promise<{ chain: string; token: string }> }) {
  const { chain: slug, token } = await params;
  const sp = request.nextUrl.searchParams;
  const back = new URL(safeFrom(sp.get(FROM_PARAM)) ?? "/", request.nextUrl.origin);
  const chain = chainOfSlug(slug) ?? (Number(slug) || null);
  const t = token.toLowerCase();
  if (chain == null || !/^0x[0-9a-f]{40}$/.test(t)) return NextResponse.redirect(back, 307);
  const data = await fetchAssetExplorerServer(readerIpFromRequest(request)).catch(() => null);
  const card = data?.cards.find((c) => c.chains.some((x) => x.chain === chain && x.token === t));
  const listing = new Set(card?.chips.filter((c) => c.chain === chain && !c.token).map((c) => c.explorer) ?? []);
  const via = parseVia(sp.get(VIA_PARAM))?.id;
  const id = via && listing.has(via) && ORDER.includes(via) ? via : canonicalExplorer(card?.chips ?? [], chain, ORDER);
  const entry = id ? WITH_ASSETS.find((p) => p.id === id) : undefined;
  if (!entry) return NextResponse.redirect(back, 307);
  return NextResponse.redirect(new URL(protocolAssetsHref(entry.href, t), request.nextUrl.origin), 307);
}
