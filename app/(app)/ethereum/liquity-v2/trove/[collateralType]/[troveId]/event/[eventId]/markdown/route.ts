import { NextRequest } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { loadTroveHistory } from "@/lib/liquity/trove-page-data";
import { eventPagePlace, troveHolder } from "@/lib/liquity/event-page";
import { liquityEventPageMarkdown, liquityEventPath } from "@/lib/liquity/event-page-markdown";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { readTroveCollSurplus } from "@/lib/sources/chain/liquity-coll-surplus";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// One Liquity V2 event as raw Markdown (rails-ops TO-DO-ui-jobs 287): the text
// the event menu's Copy for LLM copies, served at `…/event/<eventId>.md`
// (next.config.ts rewrites that path here; an App Router segment cannot be a
// parameter with a suffix). Built per request from the reads the event page
// makes (lib/liquity/event-page-markdown.ts); nothing is stored (rails-ops
// decision 0036). `noindex`, with the HTML page as the canonical.

export const runtime = "nodejs";
// The event page renders per request; so does this.
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface Ctx {
  params: Promise<{ collateralType: string; troveId: string; eventId: string }>;
}

// The page's cache header: each read is per request.
const NO_STORE = "no-store, must-revalidate";

const text = (status: number, body: string) =>
  new Response(`${body}\n`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE },
  });

/** The branch's daily price as the page's hook keeps it: the observations, or
 *  null where the read failed or answered none. */
async function dailyPrices(branch: string, readerIp: string | undefined): Promise<[number, number][] | null> {
  if (!RAILS_API_URL) return null;
  try {
    const res = await fetch(
      `${RAILS_API_URL}/api/liquity-v2/prices/daily?collateralType=${encodeURIComponent(branch)}`,
      createAuthFetchOptions({ cache: "no-store" }, readerIp),
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { obs?: unknown };
    const obs = d?.obs;
    const ok =
      Array.isArray(obs) &&
      obs.length > 0 &&
      obs.every((o) => Array.isArray(o) && o.length === 2 && typeof o[0] === "number" && typeof o[1] === "number");
    return ok ? (obs as [number, number][]) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const { collateralType, troveId, eventId: rawId } = await params;
  const eventId = decodeEventId(rawId);
  const history = await loadTroveHistory(collateralType, troveId);
  if (history.missing) return text(404, "No such Trove.");
  const { trove, events } = history;
  if (!trove || !events) return text(503, "This Trove's history could not be read.");

  const totalEvents = history.hasMore ? history.totalEvents : null;
  const place = eventPagePlace(events, eventId, totalEvents);
  if (!place.event) return text(404, "No such event on this Trove.");

  const readerIp = readerIpFromRequest(request);
  const holder = troveHolder(trove);
  const collSymbol = trove.collateralType ?? collateralType;
  const sym = collSymbol.toLowerCase();
  const dailyBranch = sym === "weth" ? "WETH" : sym === "wsteth" ? "wstETH" : sym === "reth" ? "rETH" : null;
  // The liquidation's surplus at the head, read as the page reads it.
  const lastLiquidation = [...place.events].reverse().find((e) => e.context.data.operation === "liquidate");
  const branch = LIQUITY_V2_BRANCHES[collateralType.toLowerCase()];
  const [dailyColl, surplus] = await Promise.all([
    dailyBranch ? dailyPrices(dailyBranch, readerIp) : Promise.resolve(null),
    trove.status === "liquidated" && holder.address && lastLiquidation && branch
      ? readTroveCollSurplus({
          chainId: MAINNET_CHAIN_ID,
          troveManager: branch.troveManager,
          owner: holder.address,
          liquidationTx: lastLiquidation.txHash,
          decimals: branch.decimals,
          priceFeed: branch.priceFeed,
        })
          .then((d) =>
            d.pool && d.surplusRaw !== "0" ? { creditTx: lastLiquidation.txHash, claimed: d.claimed } : null,
          )
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const origin = request.nextUrl.origin;
  const markdown = liquityEventPageMarkdown({
    collateralType,
    troveId,
    eventId,
    trove,
    events,
    totalEvents,
    prices: history.prices,
    dailyColl,
    surplus,
    now: Date.now() / 1000,
    origin,
  });
  if (markdown == null) return text(404, "No such event on this Trove.");
  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": NO_STORE,
      "X-Robots-Tag": "noindex",
      Link: `<${origin}${liquityEventPath(collateralType, troveId, eventId)}>; rel="canonical"`,
    },
  });
}
