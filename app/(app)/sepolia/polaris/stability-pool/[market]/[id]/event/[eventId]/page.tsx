import type { Metadata } from "next";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { normalizeCdpId, normalizeMarket, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { polarisDepositHref } from "@/lib/polaris/routes";
import { loadPolarisDeposit } from "@/lib/polaris/sp-loan-page-data";
import { spEventLabel } from "@/lib/polaris/sp-event-prose";
import { depositEventPageDescription } from "@/lib/polaris/sp-loan-explorer";
import PolarisDepositPage from "../../page";

interface Props {
  params: Promise<{ market: string; id: string; eventId: string }>;
}

// Restated: the parent route renders per request over a `no-store` read.
export const dynamic = "force-dynamic";

// The event's own metadata, from the rows the parent page reads in the same
// request (`loadPolarisDeposit`, cached). An event older than those rows
// keeps the deposit's title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, id: rawId, eventId } = await params;
  const market = normalizeMarket(rawMarket);
  const id = normalizeCdpId(rawId);
  const stable = market ? POLARIS_MARKET_CONFIG[market].stable.symbol : rawMarket;
  const base = `Polaris · ${stable} Stability Pool · Deposit #${id ?? rawId}`;
  if (!market || !id) return { title: base };
  const decoded = decodeEventId(eventId);
  const data = await loadPolarisDeposit(market, id);
  const row = data && data !== "missing" ? data.rows.find((r) => r.event_key === decoded) : undefined;
  return {
    title: row ? `${base} · ${spEventLabel(row)}` : base,
    description: row
      ? depositEventPageDescription(market, id, Number(row.block_timestamp))
      : `A Rails replay of this Polaris stability-pool deposit on Sepolia: every operation from the pool's events, with a receipt on every number. Test tokens only.`,
    alternates: { canonical: `${polarisDepositHref(market, id)}/event/${encodeURIComponent(decoded)}` },
  };
}

// The parent deposit page, same params: the view reads `eventId` from the
// route and draws the timeline alone in its pinned mode, the card on the
// shared event page (rails-ops reference/app-anatomy.md, P4).
export default async function PolarisDepositEventPage({ params }: Props) {
  return PolarisDepositPage({ params });
}
