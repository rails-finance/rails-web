// This event's immutable share card — reads the SAME server tail the
// account page's own `opengraph-image.tsx` reads (`loadDolomitePositionTail`,
// cached per request), finds this id in it, and maps it with the
// family-agnostic `eventCardModel`. No new read path, no per-family card model.
//
// ⚠️ The windowed families (this one included) serve only the newest
// `TIMELINE_WINDOW_EVENTS` rows — an OLDER event than that falls back to the
// static roster card today. A server-side read by (owner, accountNumber,
// event coordinate) rather than by "the served window" is a later phase.

import { normalizeAccountNumber } from "@/lib/dolomite/asset-catalog";
import { loadDolomitePositionTail } from "@/lib/dolomite/position-page-data";
import { decodeEventId } from "@/lib/shared/page-metadata";
import { eventCardModel } from "@/lib/share/event-model";
import { eventImage } from "@/lib/share/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "This event's immutable Dolomite share card";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface Props {
  params: Promise<{ owner: string; accountNumber: string; eventId: string }>;
}

export default async function Image({ params }: Props) {
  const { owner: rawOwner, accountNumber: rawAccount, eventId } = await params;
  return eventImage({
    session: "dolomite",
    load: async () => {
      if (!ADDRESS.test(rawOwner)) return null;
      const accountNumber = normalizeAccountNumber(rawAccount);
      if (accountNumber == null) return null;
      const owner = rawOwner.toLowerCase();
      const decoded = decodeEventId(eventId);
      const tail = await loadDolomitePositionTail(owner, accountNumber);
      const event = tail.events?.find((e) => e.id === decoded);
      if (!event) return null;
      // Same composite truncation the page's own heading states — the
      // address-only `shortSubject` helper doesn't fire on a two-part id.
      const shortOwner = `${rawOwner.slice(0, 6)}…${rawOwner.slice(-4)}`;
      const acct = rawAccount.length > 12 ? `${rawAccount.slice(0, 8)}…` : rawAccount;
      return eventCardModel(event, { session: "dolomite", subject: `${shortOwner} #${acct}` });
    },
  });
}
