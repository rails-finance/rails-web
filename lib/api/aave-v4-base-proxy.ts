// The Aave V4 Base proxies: forward the query to rails-server's /api/aave-v4-base/*
// (or /api/oracle/aave-v4-base) with the bearer token and hand the JSON back
// unchanged. The box answers the Ethereum routes' wire shapes, so there is
// nothing to reshape here.
import { NextResponse, type NextRequest } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

export async function proxyAaveV4Base(request: NextRequest, backendPath: string): Promise<NextResponse> {
  const base = process.env.RAILS_API_URL;
  if (!base) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  const search = request.nextUrl.searchParams.toString();
  try {
    const res = await fetch(
      `${base}${backendPath}${search ? `?${search}` : ""}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    const body = await res.json().catch(() => ({ error: `Backend error: ${res.statusText}` }));
    const cc = res.headers.get("cache-control");
    return NextResponse.json(body, { status: res.status, headers: cc ? { "Cache-Control": cc } : undefined });
  } catch (err) {
    console.error(`aave-v4-base proxy ${backendPath} failed:`, err);
    return NextResponse.json({ error: "Failed to reach the backend" }, { status: 502 });
  }
}
