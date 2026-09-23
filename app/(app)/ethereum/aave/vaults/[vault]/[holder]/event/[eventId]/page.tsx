// ONE EVENT — /ethereum/aave/vaults/<vault>/<holder>/event/<id>.
// ----------------------------------------------------------------------------
// A vault event is a log the vault emitted about one address, and until now it
// was the only kind of event in Rails a reader could not link to. This route is
// the link's other end: a thin re-render of the position page one segment up,
// in which `ChainTruthTimeline` finds `eventId` on the route params and draws
// ONE card with its detail open, plus "View in timeline →" back to
// `<position>?at=<id>`.
//
// THE ID IS A CHAIN COORDINATE. A vault event's id is `txHash:logIndex` — the
// log's own place on chain, which is exactly what a permalink needs and what a
// served folder's `responseId` explicitly is not. It rides the path as one
// opaque, percent-encoded segment.
//
// ⚠️ THE WEI-EXACT GATE IS NOT BYPASSED, AND COULD NOT BE. This page draws no
// timeline of its own: it renders the position page, whose timeline section
// states the gate first and renders `ChainTruthTimeline` only where the
// replayed balance equalled `balanceOf` at the page's block. A gate that failed
// therefore draws no card here either — it states both figures, exactly as the
// list does. A single card still states figures the list would only state after
// the reconcile passed, so a pinned page that answered anyway would be the one
// place in the section where the gate did not hold.
//
// ⚠️ AND THE DRAW WINDOW STILL BINDS. The loader hands the client the newest
// `VAULT_TIMELINE_DRAW_ROWS` rows of a long life. An event OLDER than that cut
// is not among the served events, and pinned mode says so — the same notice a
// fabricated id gets, because from this page's side the two are the same fact:
// the id is not among the events Rails has served for this position. Lifting
// the cut for one card needs an event-by-coordinate read, which is the server
// half the share programme still has open.

import type { Metadata } from "next";

import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { findVaultTailEvent } from "@/lib/vaults/event-share-card";
import { ethereumVaultHref } from "@/lib/vaults/routes";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { AAVE_VAULT_TAIL_VERSION, KIND_LABEL } from "@/lib/shared/vault-holder-timeline";
import { ssrHop } from "@/lib/shared/listing-ssr";
import AaveEthereumVaultPositionPage from "../../page";

interface Props {
  params: Promise<{ vault: string; holder: string; eventId: string }>;
}

// Restated rather than re-exported (Next reads this segment option by static
// analysis of THIS file): the route renders per request, same as the parent.
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// NOT reused from the parent (`../../page`'s own `generateMetadata`) — this
// segment names the EVENT, which the parent's metadata knows nothing about.
//
// It reads the STORED TAIL alone, never the chain: the parent's metadata
// already spends one `loadAaveEthereumVault` on the vault, and a second read
// here would double the cost of every unfurl to name a verb. The tail is the
// same one `opengraph-image.tsx` beside this reads, so a link's title and its
// card agree about what was found. `market` is omitted because Aave's address
// book names vault ADDRESSES, not symbols — there is no name to print without
// a read, and a title is not worth one.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault, holder, eventId } = await params;
  const address = vault.toLowerCase();
  const who = holder.toLowerCase();
  const decoded = decodeEventId(eventId);
  // A typed name is resolved by the page, on the server, never by metadata —
  // and the tail is keyed by address, so a name simply finds no event and the
  // title falls back to the position's own.
  const event =
    ADDRESS.test(address) && ADDRESS.test(who)
      ? await findVaultTailEvent({
          chainId: MAINNET_CHAIN_ID,
          vault: address,
          holder: who,
          eventId: decoded,
          loaderVersion: AAVE_VAULT_TAIL_VERSION,
          ...(await ssrHop()),
        })
      : null;
  return eventMetadata({
    session: "aave-vaults",
    subject: ADDRESS.test(who) ? who : decodeURIComponent(holder),
    canonicalPath: `${ethereumVaultHref(address, holder)}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: KIND_LABEL[event.kind], timestamp: event.timestamp } : null,
  });
}

// THIN: the same parent page, the same params. The nested segment sits inside
// the same `[vault]/[holder]` layout, so every provider still wraps it and no
// component below learns a new prop — `ChainTruthTimeline` finds out it is on
// an event route from `useParams().eventId` itself. `params` carries an extra
// `eventId` key the parent's own type does not declare; passing the same
// promise through stays structurally valid, since the parent reads only
// `vault` and `holder` off it.
export default async function AaveEthereumVaultEventPage({ params }: Props) {
  return AaveEthereumVaultPositionPage({ params });
}
