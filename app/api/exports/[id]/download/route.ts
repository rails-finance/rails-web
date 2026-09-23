import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { formatQueuedExport, isFormattedFamily } from "@/lib/sources/api/queued-export-format";

// Hands over a queued export (rails-ops decision 0029). rails-server keeps the
// served rows gzipped; this route formats them with the in-browser CSV's own
// transform and columns as it streams (lib/sources/api/queued-export-format.ts),
// so the reader gets the same file a small export gives. A file whose tokens
// cannot be read is refused before a byte is sent, and a stream that cannot
// finish breaks off rather than ending short.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RAILS_API_URL = process.env.RAILS_API_URL;
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!RAILS_API_URL) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  const box = (path: string) =>
    fetch(
      `${RAILS_API_URL}/api/exports/${id}${path}?token=${token}`,
      createAuthFetchOptions({ cache: "no-store" }, readerIpFromRequest(request)),
    ).catch(() => null);

  // The job names its protocol; the download does not.
  const status = await box("");
  if (!status) return NextResponse.json({ error: "The export could not be read" }, { status: 502, headers: NO_STORE });
  const job = (await status.json().catch(() => null)) as { protocol?: string; error?: string } | null;
  if (!status.ok)
    return NextResponse.json(job ?? { error: status.statusText }, { status: status.status, headers: NO_STORE });
  const family = job?.protocol ?? "";
  if (!isFormattedFamily(family)) {
    return NextResponse.json({ error: "This export cannot be formatted here" }, { status: 500, headers: NO_STORE });
  }

  const upstream = await box("/download");
  if (!upstream)
    return NextResponse.json({ error: "The export could not be read" }, { status: 502, headers: NO_STORE });
  if (!upstream.ok || !upstream.body) {
    const json = await upstream.json().catch(() => ({ error: upstream.statusText }));
    return NextResponse.json(json, { status: upstream.status, headers: NO_STORE });
  }
  const fileName = (upstream.headers.get("x-export-file-name") ?? "activity.csv").replace(/[^A-Za-z0-9._-]/g, "_");
  const expectedRows = upstream.headers.get("x-export-rows");
  const gz = new Uint8Array(await upstream.arrayBuffer());

  const formatted = await formatQueuedExport(gz, family);
  if (!formatted.ok)
    return NextResponse.json({ error: formatted.message, code: formatted.code }, { status: 503, headers: NO_STORE });
  if (expectedRows && Number(expectedRows) !== formatted.rows) {
    return NextResponse.json(
      { error: `The file holds ${formatted.rows} rows and the export recorded ${expectedRows}` },
      { status: 502, headers: NO_STORE },
    );
  }
  return new Response(formatted.body, {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Export-Rows": String(formatted.rows),
    },
  });
}
