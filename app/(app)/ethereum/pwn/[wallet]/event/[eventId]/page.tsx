import type { Metadata } from "next";
import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { loadPwnPositionTail } from "@/lib/pwn/position-page-data";
import PwnLoanPage from "../../page";

interface Props {
  params: Promise<{ wallet: string; eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Restated (not re-exported — see twitter-image.tsx's own header on why Next
// needs the literal declaration in every file that carries it): the parent
// route renders per request (it also reads `?loan=`, passed through below),
// so this segment does too.
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
// `loadPwnPositionTail` is the same `cache()`-wrapped read the parent page
// and its own opengraph-image already call, so finding the event here costs
// no second backend round trip within one request. `?loan=` is read the same
// way the parent's own `generateMetadata` does — not at all: the subject is
// the wallet, a loan is not named in either title, and every event this
// wallet is party to (any of its loans) is found by id alone below.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet: raw, eventId } = await params;
  const decoded = decodeEventId(eventId);
  const tail = ADDRESS.test(raw) ? await loadPwnPositionTail(raw.toLowerCase()) : null;
  const event = tail?.events?.find((e) => e.id === decoded) ?? null;
  return eventMetadata({
    session: "pwn",
    subject: raw,
    canonicalPath: `/ethereum/pwn/${raw}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: event.actionLabel, timestamp: event.timestamp } : null,
  });
}

// THIN: renders the exact same parent loan page, same params — the nested
// `event/[eventId]` segment sits inside the same `[wallet]` layout, so every
// provider still wraps it, and `PwnLoanView` (this page's client half) never
// learns a new prop. It finds out it is on an event route from
// `useParams().eventId` itself, inside `ChainTruthTimeline` — see that
// component's pinned-mode branch. `searchParams` (`?loan=`) is passed through
// unchanged — the parent still reads it and selects the same loan it would on
// its own path. `params` here carries an extra `eventId` key the parent's own
// `Props` type doesn't declare; passing the same promise through is still
// structurally valid (the parent only reads `wallet` off it).
export default async function PwnEventPage({ params, searchParams }: Props) {
  return PwnLoanPage({ params, searchParams });
}
