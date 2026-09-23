// What the vault page's lookup accepts, and what it does with it. SERVER-SIDE.
// ----------------------------------------------------------------------------
// One input, four accepted forms: a 20-byte address, an ENS name resolved on
// Ethereum mainnet, a Basename (`name.base.eth`) resolved on Base, or a
// TRANSACTION — a bare hash or a Basescan `/tx/` URL — from which the holder
// address is found (lib/vaults/resolve-tx-holder.ts). Both the SSR pages and
// /api/chain/morpho-base/{vault,holder-exposure} read the same `?holder=`
// through this module, so none of them can disagree about what counts as valid
// or about which address a name resolved to.
//
// A transaction is classified here but NOT resolved here: it does not name an
// address by itself, it names a receipt whose logs may name none, one or
// several. The page resolves it (and redirects when there is exactly one); the
// API routes refuse it, because they answer questions about one address.
//
// A CATALOGUED VAULT ADDRESS is its own kind, "vault", checked ahead of the
// plain "address" case: a vault can itself hold another vault's shares, but a
// reader who types a vault's own address wants that vault's page, not a
// holder reading of it — the served-vaults test in
// lib/morpho-base/vault-case-study.ts is the membership check, so this module
// and the vault route can never disagree about what counts. Only the DIRECTORY
// page (`/base/morpho/vaults`) acts on "vault" by redirecting; the per-vault page and
// the two API routes leave it as an address to read a holder with, because
// there the question is already "this vault, which holder" and a second
// vault's address typed into that box is a holder like any other.
//
// `.base.eth` is checked AHEAD of the general `.eth` pattern and resolved on a
// different chain, through lib/morpho-base/resolve-basename.ts — a Basenames
// registry lookup, not mainnet's Universal Resolver. Every other `.eth` name
// keeps the existing L1 path, through lib/ens/resolve-ens.ts.
//
// The outcomes are kept SEPARATE on purpose, because they are different
// statements and some of them are about the chain:
//
//   • invalid              — the text is neither an address nor a name of
//                             either kind. A fact about the input; nothing
//                             was looked up.
//   • unresolved           — a well-formed `.eth` name that mainnet has no
//                             address for.
//   • unresolved-basename  — a well-formed `.base.eth` name that Base's
//                             Basenames registry has no address for. Named
//                             separately from `unresolved` because the two
//                             are failures of different registries on
//                             different chains, and the page should be able
//                             to say which one.
//   • resolved             — an address to read the vault with. A name that
//                             resolved rides along so the page can show what
//                             was typed beside what it meant, and `lane` says
//                             which registry answered.
//
// Collapsing failures into one "not found" would state something the read
// never established.

import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { isBasename, resolveBasenameAddress } from "@/lib/morpho-base/resolve-basename";
import { txHashFromInput } from "@/lib/vaults/resolve-tx-holder";
import { isMorphoBaseBakedVault } from "@/lib/morpho-base/vault-case-study";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS_NAME = /^[^\s/]+\.eth$/i;

export type HolderInputKind = "empty" | "address" | "vault" | "ens" | "basename" | "txhash" | "invalid";

/** Which registry actually produced `address`. Null when nothing resolved
 *  (empty input, invalid input, or an unresolved name). */
export type HolderLane = "address" | "ens" | "basename";

export interface HolderLookup {
  /** What the reader typed, trimmed — echoed back beside any message. */
  typed: string;
  /** "vault" is an address-shaped input that is also a catalogued vault; its
   *  `address` field is populated exactly as "address"'s is, so a caller that
   *  only reads a holder need not special-case it — only the directory page
   *  does, to redirect. */
  kind: HolderInputKind;
  /** The address to read the vault at, or null when there is none to read. */
  address: string | null;
  /** The transaction hash a `txhash` input named, lowercased — for the page to
   *  resolve. Null for every other kind. */
  txHash: string | null;
  /** The name that produced `address`, when a name was typed and resolved —
   *  an ENS name or a Basename; `lane` says which. */
  ensName: string | null;
  /** Which registry resolved `address`: typed directly, ENS on mainnet, or
   *  Basenames on Base. Null when nothing resolved. */
  lane: HolderLane | null;
  /** Set when no address could be reached: `"invalid"` (the text is neither
   *  form), `"unresolved"` (a real `.eth` name mainnet has no address for),
   *  or `"unresolved-basename"` (a real `.base.eth` name Basenames has no
   *  address for). */
  error: "invalid" | "unresolved" | "unresolved-basename" | null;
}

/** Classify the input without touching the network. An address-shaped input
 *  that is a member of the vault catalog (case-insensitively) is "vault", not
 *  "address" — checked ahead of the general case, because catalog membership
 *  is decided by the census, not by shape. */
export function holderInputKind(raw: string | null | undefined): HolderInputKind {
  const value = (raw ?? "").trim();
  if (!value) return "empty";
  if (ADDRESS.test(value)) return isMorphoBaseBakedVault(value) ? "vault" : "address";
  // The explorer host the URL form accepts is THIS chain's: an etherscan.io
  // link is not a Base transaction, and reading it as one would answer a
  // question about the wrong chain.
  if (txHashFromInput(value, MORPHO_BASE_CHAIN_ID)) return "txhash";
  if (isBasename(value)) return "basename";
  if (ENS_NAME.test(value)) return "ens";
  return "invalid";
}

/** Resolve a typed `?holder=` to an address, or to the reason there is none.
 *  Never throws: a lookup that fails resolves to `unresolved` /
 *  `unresolved-basename`, which the page states rather than rendering an
 *  empty exposure section. */
export async function resolveHolder(raw: string | null | undefined): Promise<HolderLookup> {
  const typed = (raw ?? "").trim();
  const kind = holderInputKind(typed);
  if (kind === "empty") return { typed, kind, address: null, txHash: null, ensName: null, lane: null, error: null };
  if (kind === "address" || kind === "vault")
    return { typed, kind, address: typed.toLowerCase(), txHash: null, ensName: null, lane: "address", error: null };
  if (kind === "invalid")
    return { typed, kind, address: null, txHash: null, ensName: null, lane: null, error: "invalid" };
  // A transaction names a receipt, not an address: classified here, resolved
  // by the page (lib/vaults/resolve-tx-holder.ts).
  if (kind === "txhash")
    return {
      typed,
      kind,
      address: null,
      txHash: txHashFromInput(typed, MORPHO_BASE_CHAIN_ID),
      ensName: null,
      lane: null,
      error: null,
    };
  if (kind === "basename") {
    const resolved = await resolveBasenameAddress(typed);
    if (!resolved)
      return { typed, kind, address: null, txHash: null, ensName: null, lane: null, error: "unresolved-basename" };
    return {
      typed,
      kind,
      address: resolved.toLowerCase(),
      txHash: null,
      ensName: typed,
      lane: "basename",
      error: null,
    };
  }
  const resolved = await resolveEnsAddress(typed);
  if (!resolved) return { typed, kind, address: null, txHash: null, ensName: null, lane: null, error: "unresolved" };
  return { typed, kind, address: resolved.toLowerCase(), txHash: null, ensName: typed, lane: "ens", error: null };
}
