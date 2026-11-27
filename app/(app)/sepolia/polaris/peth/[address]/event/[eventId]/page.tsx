import type { Metadata } from "next";
import { decodeEventId, eventMetadata, positionMetadata } from "@/lib/shared/page-metadata";
import { polarisPethAccountHref } from "@/lib/polaris/routes";
import { PETH_ACCOUNT_DESCRIPTION, pethAddressForMetadata, pethAddressOf } from "@/lib/polaris/peth-address";
import { isPethRefusal, loadPolarisPeth } from "@/lib/polaris/peth-page-data";
import { pethKindLabel, pethRowId } from "@/lib/polaris/peth-ledger";
import PolarisPethPage from "../../page";

interface Props {
  params: Promise<{ address: string; eventId: string }>;
}

// Restated: the parent route renders per request over a `no-store` read.
export const dynamic = "force-dynamic";

// The row's metadata, from the read the parent page makes in the same
// request (`loadPolarisPeth`, cached).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address: raw, eventId } = await params;
  const address = pethAddressForMetadata(raw);
  const subject = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : decodeURIComponent(raw);
  const named = { session: "polaris", subject, noun: "pETH account" } as const;
  if (!address) return positionMetadata({ ...named, canonicalPath: polarisPethAccountHref(decodeURIComponent(raw)) });
  const decoded = decodeEventId(eventId);
  const data = await loadPolarisPeth(address);
  const row =
    data && !isPethRefusal(data) ? (data.rows ?? []).find((r) => pethRowId(r) === decoded.toLowerCase()) : undefined;
  return eventMetadata({
    ...named,
    canonicalPath: `${polarisPethAccountHref(address)}/event/${encodeURIComponent(decoded)}`,
    event: row ? { actionLabel: pethKindLabel(row.kind), timestamp: Number(row.block_timestamp ?? 0) } : null,
    description: PETH_ACCOUNT_DESCRIPTION,
    image: "explorer",
  });
}

// The parent account page, same params: the view reads `eventId` from the
// route and draws the timeline alone in its pinned mode (rails-ops
// reference/app-anatomy.md, P4).
export default async function PolarisPethEventPage({ params }: Props) {
  const p = await params;
  await pethAddressOf(p.address, `/event/${encodeURIComponent(decodeEventId(p.eventId))}`);
  return PolarisPethPage({ params: Promise.resolve({ address: p.address }) });
}
