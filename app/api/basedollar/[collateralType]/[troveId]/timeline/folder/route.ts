import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildBasedollarTimeline, type MvRow } from "@/lib/sources/api/basedollar-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { UpstreamFolder } from "@/lib/sources/api/timeline-folder-wire";
import { basedollarServedFolder } from "@/lib/sources/api/basedollar-folder";

// Opening one Basedollar folder — the members behind a header on
// `/timeline?group=1`. The SparkLend twin (app/api/spark/timeline/folder)
// carries the argument: a folder row holds its members' aggregate and never
// its members (decision 0019, evening amendment), an open is an audit and may
// be slow, `?event=` is the durable key and `?folder=` the response-scoped
// one, and a refusal is passed through as its own sentence and code. A folder
// on a segment carries the segment's `?from=`/`?to=`. Members come back in the
// `/timeline` row shape, so `buildBasedollarTimeline` is reused as it is.
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collateralType: string; troveId: string }> },
) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const { collateralType, troveId } = await params;
  const sp = request.nextUrl.searchParams;

  try {
    const qs = new URLSearchParams();
    for (const k of ["event", "folder", "from", "to"]) {
      const v = sp.get(k);
      if (v) qs.set(k, v);
    }
    const response = await fetch(
      `${RAILS_API_URL}/api/basedollar/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/folder?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      return NextResponse.json(
        { error: "Not found", code: body?.code ?? "UNKNOWN_FOLDER", message: body?.message ?? response.statusText },
        { status: response.status },
      );
    }
    const upstream = (await response.json()) as {
      collateralType?: string;
      troveId?: string;
      folder: UpstreamFolder;
      rows: MvRow[];
    };
    const data = buildBasedollarTimeline(
      upstream.rows,
      upstream.collateralType ?? collateralType,
      upstream.troveId ?? troveId,
    );
    const folder = basedollarServedFolder(upstream.folder, collateralType);
    return NextResponse.json(toTimelineWire({ ...data, folder }, BASE_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error opening basedollar timeline folder:", error);
    const message = error instanceof Error ? error.message : "Failed to open folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
