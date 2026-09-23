// One vault EVENT → share-card model. Sibling to `lib/vaults/share-card.ts`,
// which does the same job for a vault POSITION.
// ----------------------------------------------------------------------------
// SERVER-ONLY, and it adds NO CHAIN READ — the promise the position card makes
// in the file beside this one, held here for the same reason: an unfurl must
// not make a second, slower copy of the page's reads on a route scrapers hit
// repeatedly. The vault timeline's own reads are log sweeps plus one archive
// `convertToAssets` per row's block; running them from an image route would be
// the single most expensive thing Rails renders on a free parameter.
//
// So this reads THE STORED TAIL and nothing else. A tail is every row of one
// holder's life in one vault at or below the lane's own `finalized` block,
// written by the position page after its own wei-exact gate passed
// (lib/api/fetch-vault-tail.ts) — which means a row that reaches this function
// is a row that already reconciled. One read, through the same proxy the page
// uses, and the rows arrive as `VaultHolderEvent`s with every figure the card
// draws already on them.
//
// ⚠️ WHAT THE TAIL DOES NOT REACH, and what happens then. Two events fall
// outside it: one ABOVE the cut (the newest ~15 minutes of chain, which the
// store refuses by construction) and one in a position whose page nobody has
// opened yet, which has no tail at all. Both answer null here, and
// `lib/share/event-image.ts` then serves the explorer's static card on the
// SHORT cache — so a scraper that arrives before the store has caught up is
// not stuck behind a year-long "never seen" answer once it has. Neither case
// draws a card from a figure this did not read.
//
// THE TWO LEGS ARE THE ROW'S OWN, in the row's own order. The asset leg leads
// where the contract emitted one — it is what the holder put in or took out,
// in the token they think in — and the share leg follows, signed by the log's
// own delta. Identical to the deltas `components/vaults/vault-timeline-row.tsx`
// builds, so the card and the row a reader lands on state the same two figures
// the same way round. NO USD: the vault timeline prices nothing (rule 2 of that
// file's refusals), so `eventCardModel` is handed unpriced flows and omits the
// "≈ … moved" line rather than inventing a total.

import { fetchVaultTail } from "@/lib/api/fetch-vault-tail";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { eventCardModel } from "@/lib/share/event-model";
import type { EventCardModel } from "@/lib/share/event-card";
import { shortSubject } from "@/lib/shared/page-metadata";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { AssetFlow, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { KIND_LABEL, type VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";

export interface VaultTailEventKey {
  chainId: ChainId;
  /** Lowercased, and already gated by the route's own served-vault check. */
  vault: string;
  /** Lowercased ADDRESS. A typed name is resolved by the page, never by a
   *  metadata or image route, and the tail is keyed by address. */
  holder: string;
  /** The event id as the URL carried it, already decoded. */
  eventId: string;
  loaderVersion: number;
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

/** This event out of the stored tail, or null — see the header for the two
 *  ways a real event is legitimately not in there. Shared by the event page's
 *  `generateMetadata` (which names the verb) and its `opengraph-image.tsx`
 *  (which draws the card), so one request makes at most one tail read per
 *  surface and both surfaces agree about what was found. */
export async function findVaultTailEvent(key: VaultTailEventKey): Promise<VaultHolderEvent | null> {
  const tail = await fetchVaultTail({
    chainId: key.chainId,
    vault: key.vault,
    holder: key.holder,
    loaderVersion: key.loaderVersion,
    baseUrl: key.baseUrl,
    headers: key.headers,
  });
  return tail?.rows.find((row) => row.id === key.eventId) ?? null;
}

/** The units this vault's figures speak in, from the CENSUS row — the same
 *  `overlay: false` read `vaultShareCardModel` makes for the position card, so
 *  an event card costs what a position card costs and no chain call.
 *
 *  Nulls where the census has never seen the pair, which is a fact about a
 *  daily sweep and not about the event: the card then prints the vault's short
 *  address as the share unit and draws the share leg alone, rather than a
 *  number beside a unit nobody read. */
export async function vaultUnitsFromCensus(opts: {
  chainId: ChainId;
  vault: string;
  /** Lowercased address. */
  holder: string;
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}): Promise<{ shareSymbol: string | null; assetSymbol: string | null; assetAddress?: string }> {
  try {
    const page = await fetchVaultPositions({
      chainId: opts.chainId,
      vault: opts.vault,
      q: opts.holder,
      limit: 1,
      overlay: false,
      baseUrl: opts.baseUrl,
      headers: opts.headers,
    });
    const row = page.data.find((r) => r.holder.toLowerCase() === opts.holder);
    return {
      shareSymbol: row?.symbol ?? null,
      assetSymbol: row?.asset?.symbol ?? null,
      assetAddress: row?.asset?.address,
    };
  } catch (error) {
    console.error("The vault event card's census row did not answer:", error);
    return { shareSymbol: null, assetSymbol: null };
  }
}

/** The row's two legs as the house's flow shape. `valueUsd` is left off every
 *  one of them, deliberately — see the header. */
function vaultEventFlows(
  event: VaultHolderEvent,
  units: { vault: string; shareSymbol: string; assetSymbol: string | null; assetAddress?: string },
): AssetFlow[] {
  const flows: AssetFlow[] = [];
  const isDeposit = event.kind === "deposit";
  const isWithdrawal = event.kind === "withdrawal";

  // The asset leg, where the contract stated one: a deposit's `assets` went IN
  // to the position, a withdrawal's came OUT of it. Omitted where the symbol
  // was never read — an unnamed unit beside a number is worse than one leg.
  if (event.assets && (isDeposit || isWithdrawal) && units.assetSymbol) {
    flows.push({
      token: units.assetAddress ?? "",
      tokenSymbol: units.assetSymbol,
      tokenDecimals: event.assetDecimals,
      amount: event.assets,
      amountFormatted: Number(event.assets) / Math.pow(10, event.assetDecimals),
      direction: isDeposit ? "in" : "out",
    });
  }

  // The share leg. A cooldown moves none, and a self-transfer's delta is zero
  // — neither draws a flow, exactly as neither draws one on the row.
  const delta = BigInt(event.sharesDelta);
  if (delta !== BigInt(0)) {
    flows.push({
      token: units.vault,
      tokenSymbol: units.shareSymbol,
      tokenDecimals: event.shareDecimals,
      amount: event.sharesDelta,
      amountFormatted: Number(event.sharesDelta) / Math.pow(10, event.shareDecimals),
      direction: delta > BigInt(0) ? "in" : "out",
    });
  }
  return flows;
}

/** One vault event as the shared timeline's coordinate record — the same
 *  mapping `lib/aave-vaults/timeline-runs.tsx` makes for the screen, WITH the
 *  flows that file deliberately withholds. It withholds them because the row
 *  beside it already draws the amounts from the vault's own log and a second
 *  statement of them would eventually disagree; a share card has no row beside
 *  it, so the flows are the card. */
function vaultEventToCardEvent(
  event: VaultHolderEvent,
  chainId: ChainId,
  holder: string,
  units: { vault: string; shareSymbol: string; assetSymbol: string | null; assetAddress?: string },
): BaseActivityEvent {
  return {
    id: event.id,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    timestamp: event.timestamp,
    wallet: holder,
    actionType: event.kind,
    actionLabel: KIND_LABEL[event.kind],
    flows: vaultEventFlows(event, units),
    etherscanUrl: explorerUrl(chainId, "tx", event.txHash),
  };
}

/** The card for one vault event, or null where the tail does not reach it.
 *
 *  `shareSymbol`/`assetSymbol` are the caller's, because where a family can
 *  name its own units without a read differs per family: Base and Yearn carry
 *  both in their static catalogues, Aave's book names addresses only and its
 *  route reads the census row it already reads for the position card. A null
 *  share symbol falls back to the vault's short address, which is what every
 *  other surface in the section prints when `symbol()` went unread. */
export async function vaultEventCardModel(
  key: VaultTailEventKey & {
    session: EventCardModel["session"];
    shareSymbol: string | null;
    assetSymbol: string | null;
    assetAddress?: string;
  },
): Promise<EventCardModel | null> {
  const event = await findVaultTailEvent(key);
  if (!event) return null;
  const shareSymbol = key.shareSymbol ?? `${key.vault.slice(0, 6)}…${key.vault.slice(-4)}`;
  return eventCardModel(
    vaultEventToCardEvent(event, key.chainId, key.holder, {
      vault: key.vault,
      shareSymbol,
      assetSymbol: key.assetSymbol,
      assetAddress: key.assetAddress,
    }),
    // The share symbol names the vault on the card's subtitle, which is what
    // `vaultShareCardModel` does on the position card beside it — one vault,
    // one name, whichever card a reader met first.
    { session: key.session, subject: shortSubject(key.holder), market: shareSymbol },
  );
}
