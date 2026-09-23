// ONE EVENT — /base/morpho/vaults/<vault>/<holder>/event/<id>.
// ----------------------------------------------------------------------------
// A thin re-render of the position page one segment up, in which
// `ChainTruthTimeline` finds `eventId` on the route params and draws ONE card
// with its detail open, plus "View in timeline →" back to
// `<position>?at=<id>`. See the Ethereum twin of this file
// (app/(app)/ethereum/aave/vaults/…/event/[eventId]/page.tsx) for the full
// statement of the shape; what is Base's own is stated here.
//
// THE ID IS A CHAIN COORDINATE — `txHash:logIndex`, percent-encoded into one
// opaque segment.
//
// ⚠️ THE WEI-EXACT GATE IS NOT BYPASSED. This page draws no timeline of its
// own: the position page states the gate first and renders the shell only
// where the replayed balance equalled `balanceOf` at the page's block, so a
// gate that failed draws no card here either.
//
// ⚠️ AND THE DRAW WINDOW STILL BINDS: an event older than the newest
// `VAULT_TIMELINE_DRAW_ROWS` of a long life is not among the served events,
// and pinned mode states that rather than drawing a card it did not read.

import type { Metadata } from "next";

import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { findVaultTailEvent } from "@/lib/vaults/event-share-card";
import { baseVaultHref } from "@/lib/vaults/routes";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { MORPHO_BASE_VAULT_TAIL_VERSION, KIND_LABEL } from "@/lib/shared/vault-holder-timeline";
import { morphoBaseRosterEntry } from "@/lib/morpho-base/vault-roster";
import { ssrHop } from "@/lib/shared/listing-ssr";
import MorphoBaseVaultPositionPage from "../../page";

interface Props {
  params: Promise<{ vault: string; holder: string; eventId: string }>;
}

// Restated rather than re-exported (Next reads this segment option by static
// analysis of THIS file): the route renders per request, same as the parent.
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// NOT reused from the parent — this segment names the EVENT. It reads the
// STORED TAIL alone, never the chain, and the vault's name comes out of the
// static catalogue, which holds the `name()`/`symbol()` the census read: no
// call is made for either. The tail is the same one `opengraph-image.tsx`
// beside this reads, so a link's title and its card agree about what was
// found.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault, holder, eventId } = await params;
  const address = vault.toLowerCase();
  const who = holder.toLowerCase();
  const decoded = decodeEventId(eventId);
  // A typed name — an ENS name or a Basename — is resolved by the page, on the
  // server, never by metadata; the tail is keyed by address, so a name finds
  // no event here and the title falls back to the position's own.
  const event = ADDRESS.test(who)
    ? await findVaultTailEvent({
        chainId: BASE_CHAIN_ID,
        vault: address,
        holder: who,
        eventId: decoded,
        loaderVersion: MORPHO_BASE_VAULT_TAIL_VERSION,
        ...(await ssrHop()),
      })
    : null;
  return eventMetadata({
    session: "morpho-base",
    subject: ADDRESS.test(who) ? who : decodeURIComponent(holder),
    market: (await morphoBaseRosterEntry(address))?.name,
    canonicalPath: `${baseVaultHref(address, holder)}/event/${encodeURIComponent(decoded)}`,
    event: event ? { actionLabel: KIND_LABEL[event.kind], timestamp: event.timestamp } : null,
  });
}

// THIN: the same parent page, the same params — see the Ethereum twin's own
// note on why passing the promise straight through stays valid.
export default async function MorphoBaseVaultEventPage({ params }: Props) {
  return MorphoBaseVaultPositionPage({ params });
}
