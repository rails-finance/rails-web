// Every vault route, formed in one place.
// ----------------------------------------------------------------------------
// A vault lives under the protocol whose factory deployed it (rails-ops
// decision 0028): `/<chain>/<protocol>/vaults/<vault>`, the same grammar a
// market has. The protocol is the door because the factory that made the
// contract is what decides whose vault it is, and that is chain-proven.
//
// Base's MetaMorpho vaults are Morpho Blue's, so they hang off the `vaults`
// sub-page of `/base/morpho`:
//
//   /base/morpho/vaults                      the roster of vaults, read from chain
//   /base/morpho/vaults/positions            every (vault, holder) position, as cards
//   /base/morpho/vaults/info                 how the vault layer is built, in words
//   /base/morpho/vaults/<vault>              one vault's market view
//   /base/morpho/vaults/<vault>/<holder>     one position — card, flows, timeline
//
// Aave's three families are Aave's own deployments, and the door is unstamped
// because savings GHO and the Umbrella stake tokens carry no version:
//
//   /ethereum/aave/vaults                    the roster of vaults, read from chain
//   /ethereum/aave/vaults/positions          every (vault, holder) position, as cards
//   /ethereum/aave/vaults/info               how the vault layer is built, in words
//   /ethereum/aave/vaults/<vault>            one vault's market view
//   /ethereum/aave/vaults/<vault>/<holder>   one position — card, flows, timeline
//
// Yearn V3's whole product is vaults, so its explorer IS the vault layer. It
// keeps the `vaults` segment all the same — one rule everywhere, and the short
// form would buy only an exception (0028 point 1). It has a holder lane and no
// POSITION LISTING: a holder's timeline is one address's own `Transfer` sweep,
// a per-request read, while a listing would need a whole-`Transfer` census per
// vault — the share-ledger job parked at TO-DO-infra-and-backend §5.4.
//
//   /ethereum/yearn/vaults                   the roster of vaults, read from chain
//   /ethereum/yearn/vaults/info              how the roster is built, in words
//   /ethereum/yearn/vaults/<vault>           one vault's factsheet
//   /ethereum/yearn/vaults/<vault>/<holder>  one holding — flows and timeline
//
// The `vaults` segment itself is not spelled here: it is read off the roster
// entry's sub-page, so the path text lives in lib/shared/protocols.ts alone and
// moving the tab moves every href below with it.

import { protocolForHref } from "@/lib/shared/protocols";

/** One explorer's `vaults` sub-page route — the roster, and the parent of every
 *  vault page under it. Throws at load rather than forming a path from a
 *  sub-page that is not there: a silently wrong prefix is a tree of links that
 *  all 404. */
function vaultsSubPageHref(explorerHref: string): string {
  const sub = protocolForHref(explorerHref)?.subPages.find((s) => s.segment === "vaults");
  if (!sub)
    throw new Error(
      `${explorerHref} has no "vaults" sub-page on its roster entry — every vault href is formed from it.`,
    );
  return sub.href;
}

/** Morpho Blue on Base — the vault layer's root. */
const BASE_VAULTS = vaultsSubPageHref("/base/morpho");
/** Aave's vault layer on Ethereum — its explorer's one sub-page. */
const ETHEREUM_VAULTS = vaultsSubPageHref("/ethereum/aave");
/** Yearn V3 on Ethereum — its explorer's one sub-page. */
const YEARN_VAULTS = vaultsSubPageHref("/ethereum/yearn");

/** The roster of MetaMorpho vaults on Base (`/base/morpho/vaults`) — the
 *  Vaults tab of the Morpho Blue Base rail, and the parent of every vault page
 *  under it. */
export function baseVaultRosterHref(): string {
  return BASE_VAULTS;
}

/** One MetaMorpho vault's MARKET VIEW (`/base/morpho/vaults/<vault>`), or —
 *  given a holder — that pair's POSITION PAGE
 *  (`/base/morpho/vaults/<vault>/<holder>`).
 *
 *  A position is the pair `(vault, holder)` and it has a path of its own, the
 *  way a trove does: the holder is a segment, never a query. The vault's own
 *  route without one is the market view — its figures, its allocation, and a
 *  link to the listing filtered to it.
 *
 *  Only addresses catalogued in lib/morpho-base/vault-catalog.ts are served
 *  (lib/morpho-base/vault-case-study.ts is the served test); every other one
 *  404s, so a link built from this helper is not by itself proof the page
 *  exists. The sibling `/base/morpho/<vault>` also resolves for the same
 *  address — to the vault's own Blue positions, which is a true and different
 *  page — and the two link to each other. The holder segment is not gated at
 *  all: an address holding nothing is a reading, not a 404, and an ENS name or
 *  a basename resolves there. */
export function baseVaultHref(vault: string, holder?: string): string {
  const path = `${BASE_VAULTS}/${vault.toLowerCase()}`;
  return holder ? `${path}/${encodeURIComponent(holder.toLowerCase())}` : path;
}

/** The position listing under the Base roster (`/base/morpho/vaults/positions`),
 *  optionally opened on a filter.
 *
 *  It lists every position the census knows, live and closed, as cards. A link
 *  built from this helper always resolves, whatever the filter names: a vault
 *  with no participant answers zero rows and states that reading, and an
 *  address the census has never seen does the same.
 *
 *  The filter keys are the listing's own URL params
 *  (lib/morpho-base/position-list-filter-dimensions.tsx), formed here so a
 *  caller never hand-writes one. There is no `family` key: every catalogued
 *  vault on this chain is MetaMorpho, and a single-valued axis is not a facet. */
export function baseVaultsListingHref(filters?: {
  vault?: string;
  status?: "live" | "closed";
  shape?: string;
  q?: string;
}): string {
  const p = new URLSearchParams();
  if (filters?.vault) p.set("vault", filters.vault.toLowerCase());
  if (filters?.status) p.set("status", filters.status);
  if (filters?.shape) p.set("shape", filters.shape);
  if (filters?.q) p.set("q", filters.q.toLowerCase());
  const qs = p.toString();
  const listing = `${BASE_VAULTS}/positions`;
  return qs ? `${listing}?${qs}` : listing;
}

// ── Ethereum: Aave's own vault layer ─────────────────────────────────────────
// Kept BESIDE the Base helpers rather than generalising both into a
// chain-parameterised pair. The two explorers' catalogues are read differently
// and their listings carry different facets, so the helpers stay per explorer
// and only the `vaults` segment is shared, off each roster entry.

/** Aave's vault layer on Ethereum (`/ethereum/aave/vaults`) — the roster, and
 *  the parent of every vault page under it. */
export function ethereumVaultRosterHref(): string {
  return ETHEREUM_VAULTS;
}

/** One Aave vault's MARKET VIEW (`/ethereum/aave/vaults/<vault>`), or — given a
 *  holder — that pair's POSITION PAGE
 *  (`/ethereum/aave/vaults/<vault>/<holder>`).
 *
 *  A position is the pair `(vault, holder)` and it has a path of its own, the
 *  way a trove does: the holder is a segment, never a query. The vault's own
 *  route without one is the market view — its figures, its mechanic and a link
 *  to the listing filtered to it.
 *
 *  The served set is CATALOGUE MEMBERSHIP, and the catalogue is a chain read:
 *  `StataTokenFactory.getStataTokens()` and `Umbrella.getStkTokens()` at the
 *  block the page reads at, plus the one address Aave's address book names for
 *  sGHO (lib/sources/chain/aave-ethereum-vault.ts decides it). Every other
 *  address 404s, so a link built from this helper is not by itself proof the
 *  page exists — but for an address that came OUT of the catalogue read, it
 *  is. The holder segment is not gated at all: an address holding nothing is a
 *  reading, not a 404, and an ENS name resolves there. */
export function ethereumVaultHref(vault: string, holder?: string): string {
  const path = `${ETHEREUM_VAULTS}/${vault.toLowerCase()}`;
  return holder ? `${path}/${encodeURIComponent(holder.toLowerCase())}` : path;
}

/** The position listing under the Ethereum roster
 *  (`/ethereum/aave/vaults/positions`), optionally opened on a filter.
 *
 *  It lists every position the census knows, live and closed, as cards. A link
 *  built from this helper always resolves, whatever the filter names: a vault
 *  with no participant answers zero rows and states that reading, and an
 *  address the census has never seen does the same.
 *
 *  The filter keys are the listing's own URL params
 *  (lib/aave-vaults/position-list-filter-dimensions.tsx), formed here so a
 *  caller never hand-writes one. */
export function ethereumVaultsListingHref(filters?: {
  vault?: string;
  family?: string;
  status?: "live" | "closed";
  shape?: string;
  q?: string;
}): string {
  const p = new URLSearchParams();
  if (filters?.vault) p.set("vault", filters.vault.toLowerCase());
  if (filters?.family) p.set("family", filters.family);
  if (filters?.status) p.set("status", filters.status);
  if (filters?.shape) p.set("shape", filters.shape);
  if (filters?.q) p.set("q", filters.q.toLowerCase());
  const qs = p.toString();
  const listing = `${ETHEREUM_VAULTS}/positions`;
  return qs ? `${listing}?${qs}` : listing;
}

// ── Ethereum: Yearn V3 ───────────────────────────────────────────────────────
// Beside the other two for the same reason they are beside each other: the
// three catalogues are read differently, and only the `vaults` segment is
// shared. There is no LISTING helper here, because there is no position
// listing: every address that has held a Yearn vault is a whole-`Transfer`
// census per vault, which is the share-ledger job parked at
// TO-DO-infra-and-backend §5.4. One address's own holding is a different
// question and has the route below.

/** Yearn V3's roster (`/ethereum/yearn/vaults`) — the explorer's one sub-page,
 *  what `/ethereum/yearn` opens on, and the parent of every vault page under
 *  it. */
export function yearnVaultRosterHref(): string {
  return YEARN_VAULTS;
}

/** One Yearn V3 vault's FACTSHEET (`/ethereum/yearn/vaults/<vault>`), or —
 *  given a holder — that pair's HOLDING PAGE
 *  (`/ethereum/yearn/vaults/<vault>/<holder>`).
 *
 *  A holding is the pair `(vault, holder)` and it has a path of its own, the
 *  way a position does on the other two vault layers: the holder is a segment,
 *  never a query. The vault's own route without one is the factsheet.
 *
 *  The served set is catalogue membership: every vault the five V3 factories
 *  emitted a `NewVault` log for up to the census block
 *  (lib/yearn/vault-catalog.ts). A vault deployed without a factory, or since
 *  that block, is absent from the catalogue and its address 404s — so a link
 *  built from this helper is not by itself proof the page exists, but one built
 *  from an address the catalogue holds is. The holder segment is not gated at
 *  all: an address holding nothing is a reading, not a 404, and an ENS name
 *  resolves there. */
export function yearnVaultHref(vault: string, holder?: string): string {
  const path = `${YEARN_VAULTS}/${vault.toLowerCase()}`;
  return holder ? `${path}/${encodeURIComponent(holder.toLowerCase())}` : path;
}
