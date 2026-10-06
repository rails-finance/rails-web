import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { readTrovesFromBackend } from "@/lib/sources/api/troves-backend";
import { liquityPositionProse, liquityTroveHistory } from "@/lib/liquity/event-prose-position";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { OraclePricesResponse } from "@/types/api/oracle";

// One Liquity V2 event's prose as data: the generator's template, variant and
// version, every value it read (unrounded), and each sentence with its id, the
// placeholders it read and its text — what the event page's five levels print,
// before rounding. Read through the same path as the test exports
// (lib/liquity/event-prose-position.ts): the trove's whole history, its
// listing row, the branch's daily prices and today's oracle price, from the
// backend.
//
//   GET /api/liquity-v2/event-prose?branch=WETH&troveId=<id>&eventId=<txHash_logIndex>

const RAILS_API_URL = process.env.RAILS_API_URL;
const BRANCHES = ["WETH", "wstETH", "rETH"];

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  const q = request.nextUrl.searchParams;
  const branch = q.get("branch") ?? "";
  const troveId = q.get("troveId") ?? "";
  const eventId = q.get("eventId") ?? "";
  if (!BRANCHES.includes(branch))
    return NextResponse.json({ error: "branch must be WETH, wstETH or rETH" }, { status: 400 });
  if (!/^\d+$/.test(troveId))
    return NextResponse.json({ error: "troveId must be the trove's decimal id" }, { status: 400 });
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const get = async <T>(path: string): Promise<T | null> => {
    const res = await fetch(`${RAILS_API_URL}${path}`, createAuthFetchOptions(undefined, readerIp));
    if (!res.ok) {
      console.error(`Backend API error: ${res.status} ${res.statusText} (${path})`);
      return null;
    }
    return (await res.json()) as T;
  };

  try {
    const seen = new Map<string, BaseActivityEvent>();
    for (let offset = 0; offset <= 20_000; offset += 1_000) {
      const page = await get<{ events?: BaseActivityEvent[]; pagination?: { hasMore: boolean } }>(
        `/api/trove/${branch}/${troveId}/timeline?limit=1000&offset=${offset}`,
      );
      if (!page) return NextResponse.json({ error: "Failed to fetch the trove's history" }, { status: 502 });
      for (const e of page.events ?? []) seen.set(e.id, e);
      if (!page.pagination?.hasMore) break;
    }
    const events = liquityTroveHistory([...seen.values()]);
    if (!events.some((e) => e.id === eventId))
      return NextResponse.json({ error: "No such event on this trove" }, { status: 404 });

    const [troves, daily, oracle] = await Promise.all([
      readTrovesFromBackend(new URLSearchParams({ troveId, collateralType: branch }), readerIp),
      get<{ obs?: [number, number][] }>(`/api/liquity-v2/prices/daily?collateralType=${branch}`),
      get<OraclePricesResponse>("/api/oracle/liquity-v2"),
    ]);
    const priceKey = branch.toLowerCase() as "weth" | "wsteth" | "reth";
    const priceToday = oracle?.data?.[priceKey];
    const rows = liquityPositionProse({
      branch,
      troveId,
      events,
      trove: troves.ok ? (troves.data.data?.[0] ?? null) : null,
      dailyColl: daily?.obs?.length ? daily.obs : null,
      priceToday,
      now: Math.floor(Date.now() / 1000),
      site: request.nextUrl.origin,
    });
    const row = rows.find((r) => r.event.id === eventId)!;
    const { p, c } = row;
    return NextResponse.json({
      protocol: "liquity-v2",
      branch,
      troveId,
      eventId,
      n: c.n,
      total: c.total,
      url: c.url,
      template: p.template,
      title: p.title,
      priceToday: priceToday ?? null,
      values: p.values,
      L1: p.L1,
      L2: p.L2?.lines ?? [],
      sentences: [...p.L4.map((s) => ({ ...s, list: false })), ...p.list.map((s) => ({ ...s, list: true }))].map(
        (s) => ({ sentence_id: s.sentence_id, list: s.list, uses: s.uses, text: s.text }),
      ),
      L5: p.L5.key,
      footer: p.footer,
    });
  } catch (error) {
    console.error("Error building the Liquity V2 event prose:", error);
    return NextResponse.json({ error: "Failed to build the event's prose" }, { status: 500 });
  }
}
