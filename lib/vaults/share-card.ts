// One vault POSITION → share-card model. The bridge between the section's own
// census row and the shared card renderer.
// ----------------------------------------------------------------------------
// SERVER-ONLY, and it adds NO CHAIN READ. The position page itself reads the
// vault and the holder at one block; an unfurl must not make a second, slower
// copy of those reads on a route scrapers hit repeatedly. So this reads the
// CENSUS row alone, through the same listing proxy the page's card lane uses,
// with `overlay: false` — the flag that tells the proxy to skip its Multicall3
// batch. Every figure on the card is therefore the census's, at the census
// block, and the card names that block rather than implying a live reading.
//
// The Vaults section is not an explorer (rails-ops decision 0017), so the model
// carries an `identity` instead of a `session`: the card's mark is the section's
// own vault glyph, its label is "Vaults", and the noun is "Position".
//
// Null where the census has no row for this pair — an address it has never seen
// has none until the next tick — and `positionImage` then serves the static
// home card rather than an empty one.

import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { vaultPositionStatus, type VaultPositionRow } from "@/lib/aave-vaults/vault-position";
import { shareText } from "@/lib/shared/vault-amount-text";
import { formatDate } from "@/lib/date";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";
import type { ChainId } from "@/lib/shared/chains";

const n = (v: number) => v.toLocaleString("en-US");
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The census row behind one `(vault, holder)` pair, or null where there is
 *  none. `baseUrl` and `headers` are this deployment's self-hop (`ssrHop()`), the same
 *  one the position page passes, so the proxy is called the way the page calls
 *  it rather than through a second code path. */
export async function vaultShareCardModel(opts: {
  chainId: ChainId;
  vault: string;
  /** The holder as the PATH carries it — an address, or the name that was
   *  typed. Nothing is resolved here: metadata and share cards make no network
   *  call of their own beyond the census read below. */
  holder: string;
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}): Promise<PositionCardModel | null> {
  let rows: VaultPositionRow[] = [];
  try {
    const page = await fetchVaultPositions({
      chainId: opts.chainId,
      vault: opts.vault,
      q: opts.holder,
      limit: 1,
      // The whole point: no live overlay, so this image costs no chain read.
      overlay: false,
      baseUrl: opts.baseUrl,
      headers: opts.headers,
    });
    rows = page.data;
  } catch (error) {
    console.error("The vault share card's census row did not answer:", error);
    return null;
  }
  const row = rows.find((r) => r.holder.toLowerCase() === opts.holder.toLowerCase());
  if (!row) return null;

  const status = vaultPositionStatus(row);
  const shareDecimals = row.shareDecimals ?? 18;
  const symbol = row.symbol ?? shortAddr(row.vault);
  // The census's own balance at the census block, printed by the section's one
  // print rule (lib/shared/vault-amount-text.ts) — the same rule the card
  // beside it prints by, so a shared link and the page it opens agree.
  const censusShares = {
    raw: row.census.balance,
    value: Number(row.census.balance) / 10 ** shareDecimals,
  };

  const stats: PositionCardModel["stats"] = [
    { label: `Shares · ${symbol}`, value: shareText(censusShares, shareDecimals) },
    { label: "Transfers", value: n(row.census.transferCount) },
    {
      label: "First seen",
      // The block's own timestamp where the census read one; the block number
      // alone where it did not, rather than a date inferred from a height.
      value: row.firstSeenAt != null ? formatDate(row.firstSeenAt) : `block ${n(row.census.firstBlock)}`,
    },
    { label: "Census block", value: n(row.census.block) },
  ];

  return {
    identity: { label: "Vaults", chainId: opts.chainId, mark: "vaults" },
    subject: ADDRESS.test(opts.holder) ? shortSubject(opts.holder.toLowerCase()) : opts.holder,
    market: symbol,
    // The census's own reading at the census block — the only lane this card
    // draws, and the block is a stat beside it.
    status: status.live ? "Open" : "Closed",
    stats,
    asOf: new Date(),
  };
}
