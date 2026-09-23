// ONE EVENT — /ethereum/yearn/vaults/<vault>/<holder>/event/<id>.
// ----------------------------------------------------------------------------
// A thin re-render of the holding page one segment up, in which
// `ChainTruthTimeline` finds `eventId` on the route params and draws ONE card
// with its detail open, plus "View in timeline →" back to
// `<holding>?at=<id>`. See the Ethereum Aave twin of this file for the full
// statement of the shape; what is Yearn's own is stated here.
//
// THE ID IS A CHAIN COORDINATE — `txHash:logIndex`, percent-encoded into one
// opaque segment.
//
// ⚠️ THE WEI-EXACT GATE IS NOT BYPASSED. This page draws no timeline of its
// own: the holding page states the gate first and renders the shell only where
// the replayed balance equalled `balanceOf` at the page's block, so a gate that
// failed draws no card here either.
//
// ── THERE IS NO SHARE IMAGE ON THIS ROUTE, AND IT IS A FACT, NOT AN OMISSION ─
// The other two vault families' event cards are drawn from the STORED TAIL —
// one read through this deployment's own proxy, no chain call — because an
// image route must not run the timeline's own log sweeps on a free parameter
// (lib/vaults/event-share-card.ts). Yearn keeps NO stored tail, deliberately:
// it sweeps the whole life every request (see the "NO STORED TAIL, AND THAT IS
// A CHOICE" block in lib/sources/chain/yearn-ethereum-vault-timeline.ts). So
// there is nothing here an image route could read cheaply, and the half it
// could not read is not invented: a Yearn event link unfurls with Yearn's own
// explorer card, which `eventMetadata`'s `image: "explorer"` asks for.
//
// This is a DIFFERENT absence from the holding page's missing position card.
// That one is about the daily census, which Yearn has none of
// (TO-DO-infra-and-backend §5.4); this one is about the history store, which
// Yearn has none of by choice. The day a Yearn life earns a
// `YEARN_VAULT_TAIL_VERSION`, this route gets the same three files the other
// two carry and nothing else here changes.

import type { Metadata } from "next";

import { eventMetadata, decodeEventId } from "@/lib/shared/page-metadata";
import { yearnVaultHref } from "@/lib/vaults/routes";
import { yearnRosterEntry } from "@/lib/yearn/vault-roster";
import YearnVaultHoldingPage from "../../page";

interface Props {
  params: Promise<{ vault: string; holder: string; eventId: string }>;
}

// Restated rather than re-exported (Next reads this segment option by static
// analysis of THIS file): the route renders per request, same as the parent.
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// The EVENT's own canonical, and the vault's name off the static catalogue —
// no call of any kind. The verb is NOT in the title: naming it would mean
// finding the event, and finding a Yearn event means sweeping its whole life,
// which is not something a title is worth. So this states the holding, on the
// event's own path, which is what `eventMetadata` answers with when no event
// was found — the same words a windowed family's older event gets.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vault, holder, eventId } = await params;
  const address = vault.toLowerCase();
  const decoded = decodeEventId(eventId);
  return eventMetadata({
    session: "yearn",
    subject: ADDRESS.test(holder) ? holder.toLowerCase() : decodeURIComponent(holder),
    market: (await yearnRosterEntry(address))?.name,
    canonicalPath: `${yearnVaultHref(address, holder)}/event/${encodeURIComponent(decoded)}`,
    event: null,
    image: "explorer",
  });
}

// THIN: the same parent page, the same params — see the Aave twin's own note
// on why passing the promise straight through stays valid.
export default async function YearnVaultEventPage({ params }: Props) {
  return YearnVaultHoldingPage({ params });
}
