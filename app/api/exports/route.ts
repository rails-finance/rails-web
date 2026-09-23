import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// Requests a queued timeline export (rails-ops decision 0029) from rails-server,
// naming the reader as the other proxies do: the box keys its limits — one
// export in progress and ten a day per reader — on X-Rails-Reader-IP.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  if (!RAILS_API_URL) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  const body = (await request.json().catch(() => null)) as { protocol?: unknown; params?: unknown } | null;
  const protocol = typeof body?.protocol === "string" && body.protocol.length <= 40 ? body.protocol : null;
  const params =
    body?.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? Object.fromEntries(
          Object.entries(body.params as Record<string, unknown>)
            .filter(([k, v]) => /^[a-z]{1,20}$/.test(k) && typeof v === "string" && v.length <= 80)
            .slice(0, 8),
        )
      : null;
  if (!protocol || !params)
    return NextResponse.json({ error: "protocol and params are required" }, { status: 400, headers: NO_STORE });
  try {
    const upstream = await fetch(
      `${RAILS_API_URL}/api/exports`,
      createAuthFetchOptions(
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ protocol, params }) },
        readerIpFromRequest(request),
      ),
    );
    const json = await upstream.json().catch(() => ({ error: upstream.statusText }));
    return NextResponse.json(json, { status: upstream.status, headers: NO_STORE });
  } catch (error) {
    console.error("Error requesting a timeline export:", error);
    return NextResponse.json({ error: "The export could not be requested" }, { status: 502, headers: NO_STORE });
  }
}
