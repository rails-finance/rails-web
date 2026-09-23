// X profile pictures, fetched at request time.
// ----------------------------------------------------------------------------
// Only the team's own images live in public/avatars/x (see ATTRIBUTION.md);
// every other handle the Pulse timeline names is read from unavatar.io here,
// server-side, so the reader's browser only ever talks to this origin. Any
// failure — bad upstream, timeout, no such handle — redirects to a local
// placeholder rather than answering the page with a 5xx.
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const FALLBACK_PATH = "/avatars/x/_fallback.svg";
const UPSTREAM_TIMEOUT_MS = 4_000;
const CACHE_CONTROL = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

function fallback(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL(FALLBACK_PATH, request.url), {
    status: 302,
    headers: { "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  if (!HANDLE.test(handle)) {
    return new NextResponse("Bad handle", { status: 400 });
  }

  try {
    // `fallback=false` makes unavatar answer 404 for an unknown handle instead
    // of its own placeholder, so the local one below is the only placeholder.
    const upstream = await fetch(`https://unavatar.io/x/${handle}?fallback=false`, {
      headers: { accept: "image/*" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate: 86400 },
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !contentType.startsWith("image/")) return fallback(request);

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength === 0) return fallback(request);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(bytes.byteLength),
        "cache-control": CACHE_CONTROL,
      },
    });
  } catch {
    return fallback(request);
  }
}
