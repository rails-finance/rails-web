import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { normalizeAccountNumber } from "@/lib/dolomite/asset-catalog";
import { loadDolomitePositionTail } from "@/lib/dolomite/position-page-data";
import DolomitePositionPage from "../../page";

interface Props {
  params: Promise<{ owner: string; accountNumber: string; eventId: string }>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the route
// renders per request over a `no-store` backend read, same as the parent.
export const dynamic = "force-dynamic";

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadDolomitePositionTail` is the same `cache()`-wrapped read the parent
// page and its own opengraph-image already call, so finding the event here
// costs no second backend round trip within one request.
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner: rawOwner, accountNumber: rawAccount, eventId } = await params;
  const shortOwner = ADDRESS.test(rawOwner) ? `${rawOwner.slice(0, 6)}…${rawOwner.slice(-4)}` : rawOwner;
  const acct = rawAccount.length > 12 ? `${rawAccount.slice(0, 8)}…` : rawAccount;
  const decoded = decodeEventId(eventId);
  const accountNumber = normalizeAccountNumber(rawAccount);
  const owner = rawOwner.toLowerCase();
  const tail =
    ADDRESS.test(rawOwner) && accountNumber != null ? await loadDolomitePositionTail(owner, accountNumber) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "dolomite",
    subject: `${shortOwner} #${acct}`,
    canonicalPath: `/ethereum/dolomite/${rawOwner}/${rawAccount}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent position page, same params — the
// nested `event/[eventId]` segment sits inside the same `[accountNumber]`
// layout, so every provider still wraps it, and `DolomitePositionView` (this
// page's client half) never learns a new prop. It finds out it is on an event
// route from `useParams().eventId` itself, inside `ChainTruthTimeline` — see
// that component's pinned-mode branch. `params` here carries an extra
// `eventId` key the parent's own `Props` type doesn't declare; passing the
// same promise through is still structurally valid (the parent only reads
// `owner`/`accountNumber` off it).
export default async function DolomiteEventPage({ params }: Props) {
  return DolomitePositionPage({ params });
}
