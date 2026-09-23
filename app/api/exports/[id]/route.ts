import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// A queued export's status (rails-ops decision 0029). The token is the receipt;
// rails-server answers 404 to a wrong one exactly as to an unknown id.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!RAILS_API_URL) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  try {
    const upstream = await fetch(
      `${RAILS_API_URL}/api/exports/${id}?token=${token}`,
      createAuthFetchOptions({ cache: "no-store" }, readerIpFromRequest(request)),
    );
    const json = await upstream.json().catch(() => ({ error: upstream.statusText }));
    return NextResponse.json(json, { status: upstream.status, headers: NO_STORE });
  } catch (error) {
    console.error("Error reading a timeline export:", error);
    return NextResponse.json({ error: "The export could not be read" }, { status: 502, headers: NO_STORE });
  }
}
